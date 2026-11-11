const express = require('express');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Order = require('../models/Order');
const PlatformSettings = require('../models/PlatformSettings');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');
const { auth, superAdminOnly } = require('../middleware/auth');
const {
  activateRestaurantSubscription,
  initiatePayout,
  verifyIkeepayTransaction,
  processTransactionUpdate
} = require('../utils/ikeepay');

const router = express.Router();

// Protect all super-admin routes
router.use(auth, superAdminOnly);

// GET /api/super-admin/dashboard — Platform overview metrics
router.get('/dashboard', async (req, res) => {
  try {
    const [restaurants, totalUsers, payinTxs, payoutTxs, recentRestaurants, recentTransactions] = await Promise.all([
      Restaurant.find().lean(),
      User.countDocuments({ role: { $ne: 'superadmin' } }),
      SubscriptionTransaction.find({ type: 'payin', status: 'completed' }).lean(),
      SubscriptionTransaction.find({ type: 'payout', status: 'completed' }).lean(),
      Restaurant.find().sort({ createdAt: -1 }).limit(5).lean(),
      SubscriptionTransaction.find()
        .populate('restaurant', 'name fullPhone')
        .populate('plan', 'name duration')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
    ]);

    const now = new Date();
    let activeCount = 0;
    let trialCount = 0;
    let expiredCount = 0;
    let lifetimeCount = 0;
    let deactivatedCount = 0;

    for (const r of restaurants) {
      const sub = r.subscription || {};
      if (sub.status === 'deactivated') {
        deactivatedCount++;
      } else if (sub.isLifetime || sub.status === 'lifetime') {
        lifetimeCount++;
      } else if (sub.status === 'trial') {
        const end = sub.trialEndsAt || sub.endDate;
        if (end && new Date(end) > now) trialCount++;
        else expiredCount++;
      } else if (sub.status === 'active') {
        if (sub.endDate && new Date(sub.endDate) > now) activeCount++;
        else expiredCount++;
      } else {
        expiredCount++;
      }
    }

    const totalRevenue = payinTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const totalPayouts = payoutTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const pendingPayouts = await SubscriptionTransaction.aggregate([
      { $match: { type: 'payout', status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingPayoutAmount = pendingPayouts[0]?.total || 0;
    const availableBalance = Math.max(0, totalRevenue - totalPayouts - pendingPayoutAmount);

    res.json({
      success: true,
      data: {
        stats: {
          totalRestaurants: restaurants.length,
          activeSubscriptions: activeCount + lifetimeCount,
          lifetimeCount,
          trialCount,
          expiredCount,
          deactivatedCount,
          totalUsers,
          totalRevenue,
          totalPayouts,
          availableBalance
        },
        recentRestaurants,
        recentTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/super-admin/restaurants — List all registered restaurants with usage stats
router.get('/restaurants', async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { fullPhone: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }

    const restaurants = await Restaurant.find(filter)
      .populate('owner', 'firstName lastName email phone lastLogin')
      .populate('subscription.plan', 'name duration price')
      .sort({ createdAt: -1 });

    // Aggregate user counts and order counts per restaurant
    const [userCounts, orderCounts] = await Promise.all([
      User.aggregate([
        { $match: { restaurant: { $ne: null } } },
        { $group: { _id: '$restaurant', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { restaurant: { $ne: null } } },
        { $group: { _id: '$restaurant', count: { $sum: 1 } } }
      ])
    ]);

    const userMap = new Map(userCounts.map(u => [String(u._id), u.count]));
    const orderMap = new Map(orderCounts.map(o => [String(o._id), o.count]));

    let enriched = restaurants.map(r => {
      const subState = r.getSubscriptionState();
      return {
        ...r.toObject(),
        effectiveStatus: subState.status,
        isValid: subState.isValid,
        daysRemaining: subState.daysRemaining,
        staffCount: userMap.get(String(r._id)) || 0,
        orderCount: orderMap.get(String(r._id)) || 0
      };
    });

    if (status && status !== 'all') {
      enriched = enriched.filter(r => r.effectiveStatus === status);
    }

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/super-admin/restaurants/:id/subscription — Activate or deactivate subscription
router.put('/restaurants/:id/subscription', async (req, res) => {
  try {
    const { action, planId, customDays } = req.body;
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant introuvable' });
    }

    if (action === 'deactivate') {
      restaurant.subscription.status = 'deactivated';
      restaurant.subscription.isLifetime = false;
      restaurant.subscription.endDate = new Date();
      restaurant.subscription.activatedBy = 'superadmin';
      await restaurant.save();
    } else if (action === 'extend_trial') {
      const days = Number(customDays) || 30;
      const now = new Date();
      const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      restaurant.subscription.status = 'trial';
      restaurant.subscription.planName = `Essai Prolongé (${days} jours)`;
      restaurant.subscription.planDuration = 'trial';
      restaurant.subscription.startDate = now;
      restaurant.subscription.endDate = end;
      restaurant.subscription.trialEndsAt = end;
      restaurant.subscription.isLifetime = false;
      restaurant.subscription.activatedBy = 'superadmin';
      await restaurant.save();
    } else {
      const durationMap = {
        activate_lifetime: 'a_vie',
        a_vie: 'a_vie',
        activate_annuel: 'annuel',
        annuel: 'annuel',
        activate_semestriel: 'semestriel',
        semestriel: 'semestriel',
        activate_trimestre: 'trimestre',
        trimestre: 'trimestre',
        activate_mensuel: 'mensuel',
        mensuel: 'mensuel'
      };
      const plan = planId ? await Plan.findById(planId) : null;
      const duration = plan?.duration || durationMap[action] || 'mensuel';
      const labelMap = {
        mensuel: 'Abonnement Mensuel',
        trimestre: 'Abonnement Trimestriel',
        semestriel: 'Abonnement Semestriel',
        annuel: 'Abonnement Annuel',
        a_vie: 'Abonnement À Vie'
      };
      await activateRestaurantSubscription(restaurant._id, {
        plan,
        duration,
        planName: plan?.name || labelMap[duration] || 'Abonnement Actif',
        activatedBy: 'superadmin'
      });
    }

    const updated = await Restaurant.findById(req.params.id).populate('owner', 'firstName lastName email phone');
    const subState = updated.getSubscriptionState();

    const io = req.app.get('io');
    if (io) {
      io.emit('subscription:updated', {
        restaurantId: updated._id,
        subscription: updated.subscription
      });
    }

    res.json({
      success: true,
      message: action === 'deactivate' ? 'Abonnement désactivé' : 'Abonnement mis à jour avec succès',
      data: {
        ...updated.toObject(),
        effectiveStatus: subState.status,
        isValid: subState.isValid,
        daysRemaining: subState.daysRemaining
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/super-admin/restaurants/:id/status — Suspend / Reactivate restaurant account
router.put('/restaurants/:id/status', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant introuvable' });
    }
    restaurant.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !restaurant.isActive;
    await restaurant.save();
    res.json({
      success: true,
      message: restaurant.isActive ? 'Restaurant activé' : 'Restaurant suspendu',
      data: restaurant
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/super-admin/restaurants/:id — Delete restaurant
router.delete('/restaurants/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant introuvable' });
    }
    res.json({ success: true, message: 'Restaurant supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Plans Management ──────────────────────────────────────────────────────────

// GET /api/super-admin/plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find().sort({ order: 1, price: 1 }).lean();
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/super-admin/plans
router.post('/plans', async (req, res) => {
  try {
    const { name, description, duration, durationDays, price, currency, features, isPopular, isActive, order } = req.body;
    if (!name || !duration || price === undefined) {
      return res.status(400).json({ success: false, message: 'Nom, durée et prix requis' });
    }

    const defaultDaysMap = {
      mensuel: 30,
      trimestre: 90,
      semestriel: 180,
      annuel: 365,
      a_vie: 36500
    };

    const plan = await Plan.create({
      name,
      description: description || '',
      duration,
      durationDays: Number(durationDays) || defaultDaysMap[duration] || 30,
      price: Number(price),
      currency: currency || 'XOF',
      features: Array.isArray(features) ? features : [],
      isPopular: Boolean(isPopular),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: Number(order) || 0
    });

    res.status(201).json({ success: true, message: 'Plan créé avec succès', data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/super-admin/plans/:id
router.put('/plans/:id', async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan introuvable' });

    const { name, description, duration, durationDays, price, currency, features, isPopular, isActive, order } = req.body;
    if (name !== undefined) plan.name = name;
    if (description !== undefined) plan.description = description;
    if (duration !== undefined) plan.duration = duration;
    if (durationDays !== undefined) plan.durationDays = Number(durationDays);
    if (price !== undefined) plan.price = Number(price);
    if (currency !== undefined) plan.currency = currency;
    if (features !== undefined) plan.features = features;
    if (isPopular !== undefined) plan.isPopular = Boolean(isPopular);
    if (isActive !== undefined) plan.isActive = Boolean(isActive);
    if (order !== undefined) plan.order = Number(order);

    await plan.save();
    res.json({ success: true, message: 'Plan mis à jour', data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/super-admin/plans/:id
router.delete('/plans/:id', async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan introuvable' });
    res.json({ success: true, message: 'Plan supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Platform & iKeepay Settings ───────────────────────────────────────────────

// GET /api/super-admin/settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = await PlatformSettings.create({});
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/super-admin/settings
router.put('/settings', async (req, res) => {
  try {
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = new PlatformSettings(req.body);
    } else {
      const {
        platformName,
        trialDays,
        ikeepayApiKey,
        ikeepayWebhookSecret,
        ikeepayBaseUrl,
        defaultCurrency,
        payoutSettings
      } = req.body;
      if (platformName !== undefined) settings.platformName = platformName;
      if (trialDays !== undefined) settings.trialDays = Number(trialDays);
      if (ikeepayApiKey !== undefined) settings.ikeepayApiKey = ikeepayApiKey.trim();
      if (ikeepayWebhookSecret !== undefined) settings.ikeepayWebhookSecret = ikeepayWebhookSecret.trim();
      if (ikeepayBaseUrl !== undefined) settings.ikeepayBaseUrl = ikeepayBaseUrl.trim();
      if (defaultCurrency !== undefined) settings.defaultCurrency = defaultCurrency;
      if (payoutSettings !== undefined) settings.payoutSettings = { ...settings.payoutSettings, ...payoutSettings };
    }
    await settings.save();
    res.json({ success: true, message: 'Paramètres plateforme sauvegardés', data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Payments & Payouts (iKeepay) ──────────────────────────────────────────────

// GET /api/super-admin/transactions
router.get('/transactions', async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (status && status !== 'all') filter.status = status;

    const transactions = await SubscriptionTransaction.find(filter)
      .populate('restaurant', 'name fullPhone country')
      .populate('plan', 'name duration price')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const [completedPayins, completedPayouts, pendingPayouts] = await Promise.all([
      SubscriptionTransaction.aggregate([
        { $match: { type: 'payin', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      SubscriptionTransaction.aggregate([
        { $match: { type: 'payout', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      SubscriptionTransaction.aggregate([
        { $match: { type: 'payout', status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalRevenue = completedPayins[0]?.total || 0;
    const totalPayouts = completedPayouts[0]?.total || 0;
    const pendingPayoutAmount = pendingPayouts[0]?.total || 0;
    const availableBalance = Math.max(0, totalRevenue - totalPayouts - pendingPayoutAmount);

    res.json({
      success: true,
      data: {
        transactions,
        summary: {
          totalRevenue,
          totalPayouts,
          pendingPayoutAmount,
          availableBalance
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/super-admin/payout — Super Admin withdraws platform earnings via iKeepay
router.post('/payout', async (req, res) => {
  try {
    const { amount, currency, country, phoneNumber, operator } = req.body;
    if (!amount || Number(amount) <= 0 || !phoneNumber || !operator) {
      return res.status(400).json({
        success: false,
        message: 'Montant, numéro de téléphone et opérateur requis pour le retrait'
      });
    }

    const cleanPhone = String(phoneNumber).replace(/\D/g, '');
    const externalReference = `PAYOUT_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const tx = new SubscriptionTransaction({
      type: 'payout',
      user: req.user._id,
      amount: Number(amount),
      currency: currency || 'XOF',
      country: (country || 'CI').toUpperCase(),
      phoneNumber: cleanPhone,
      operator: operator.toUpperCase(),
      externalReference,
      status: 'pending'
    });
    await tx.save();

    try {
      const ikeepayRes = await initiatePayout({
        amount: tx.amount,
        currency: tx.currency,
        country: tx.country,
        phoneNumber: cleanPhone,
        operator: tx.operator,
        externalReference
      });

      const resData = ikeepayRes?.data || ikeepayRes || {};
      const providerRef = resData.provider_reference || resData.reference || '';
      const remoteStatus = (resData.status || '').toLowerCase();

      tx.providerReference = providerRef;
      tx.rawResponse = ikeepayRes;

      if (remoteStatus === 'completed' || remoteStatus === 'success') {
        await processTransactionUpdate(tx, 'completed', providerRef, ikeepayRes);
      } else if (remoteStatus === 'failed') {
        await processTransactionUpdate(tx, 'failed', providerRef, ikeepayRes);
      } else {
        await tx.save();
      }

      res.json({
        success: true,
        message: tx.status === 'completed'
          ? 'Retrait effectué avec succès !'
          : 'Demande de retrait soumise à iKeepay (en attente de confirmation).',
        data: tx
      });
    } catch (apiErr) {
      const errMsg = apiErr.response?.data?.message || apiErr.response?.data?.error || apiErr.message;
      tx.status = 'failed';
      tx.failureReason = errMsg;
      tx.rawResponse = apiErr.response?.data || { error: errMsg };
      await tx.save();

      return res.status(apiErr.response?.status || 502).json({
        success: false,
        message: `Erreur retrait iKeepay: ${errMsg}`,
        data: tx
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/super-admin/verify/:reference — Manually verify an iKeepay transaction
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const tx = await SubscriptionTransaction.findOne({
      $or: [{ externalReference: reference }, { providerReference: reference }]
    });
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction introuvable' });
    }

    const verifyRes = await verifyIkeepayTransaction(reference);
    const remoteStatus = (verifyRes?.data?.status || '').toLowerCase();
    const providerRef = verifyRes?.data?.provider_reference || tx.providerReference;

    if (['completed', 'success'].includes(remoteStatus)) {
      await processTransactionUpdate(tx, 'completed', providerRef, verifyRes, req.app.get('io'));
    } else if (remoteStatus === 'failed') {
      await processTransactionUpdate(tx, 'failed', providerRef, verifyRes, req.app.get('io'));
    }

    res.json({ success: true, data: tx });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message
    });
  }
});

module.exports = router;
