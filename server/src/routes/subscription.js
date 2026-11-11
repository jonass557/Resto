const express = require('express');
const Plan = require('../models/Plan');
const Restaurant = require('../models/Restaurant');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');
const { auth, adminOnly } = require('../middleware/auth');
const {
  initiatePayin,
  verifyIkeepayTransaction,
  verifyWebhookSignature,
  processTransactionUpdate
} = require('../utils/ikeepay');

const router = express.Router();

// GET /api/subscription/plans — Available plans (only accessible after login!)
router.get('/plans', auth, async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ order: 1, price: 1 }).lean();
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/subscription/status — Current restaurant subscription status & payment history
router.get('/status', auth, async (req, res) => {
  try {
    if (!req.restaurantId) {
      return res.json({
        success: true,
        data: {
          isLegacy: true,
          subscription: { status: 'lifetime', isLifetime: true, isValid: true, planName: 'Licence Locale' },
          transactions: []
        }
      });
    }

    const restaurant = await Restaurant.findById(req.restaurantId).populate('subscription.plan');
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant introuvable' });
    }

    const state = restaurant.getSubscriptionState();
    const transactions = await SubscriptionTransaction.find({
      restaurant: restaurant._id,
      type: 'payin'
    })
      .populate('plan', 'name duration price currency')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          country: restaurant.country,
          dialCode: restaurant.dialCode,
          phone: restaurant.phone,
          fullPhone: restaurant.fullPhone,
          email: restaurant.email,
          currency: restaurant.currency
        },
        subscription: {
          ...restaurant.subscription.toObject(),
          effectiveStatus: state.status,
          isValid: state.isValid,
          daysRemaining: state.daysRemaining,
          isLifetime: state.isLifetime
        },
        transactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/subscription/pay — Initiate iKeepay Payin for a plan
router.post('/pay', auth, adminOnly, async (req, res) => {
  try {
    if (!req.restaurantId) {
      return res.status(400).json({ success: false, message: 'Aucun restaurant associé à ce compte' });
    }

    const { planId, country, phoneNumber, operator, customerEmail, otp } = req.body;
    if (!planId || !phoneNumber || !operator) {
      return res.status(400).json({
        success: false,
        message: 'Plan, numéro de téléphone et opérateur requis'
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, message: 'Plan d\'abonnement introuvable ou inactif' });
    }

    const restaurant = await Restaurant.findById(req.restaurantId);
    const cleanPhone = String(phoneNumber).replace(/\D/g, '');
    const externalReference = `SUB_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const tx = new SubscriptionTransaction({
      type: 'payin',
      restaurant: restaurant._id,
      plan: plan._id,
      user: req.user._id,
      amount: plan.price,
      currency: plan.currency || 'XOF',
      country: (country || restaurant.country || 'CI').toUpperCase(),
      phoneNumber: cleanPhone,
      operator: operator.toUpperCase(),
      externalReference,
      status: 'pending'
    });
    await tx.save();

    try {
      const ikeepayRes = await initiatePayin({
        amount: plan.price,
        currency: plan.currency || 'XOF',
        country: tx.country,
        phoneNumber: cleanPhone,
        operator: tx.operator,
        externalReference,
        customerEmail: customerEmail || restaurant.email || req.user.email || 'client@restaurant.com',
        otp
      });

      const resData = ikeepayRes?.data || ikeepayRes || {};
      const providerRef = resData.provider_reference || resData.reference || '';
      const paymentLink = resData.payment_link || ikeepayRes?.payment_link || '';
      const remoteStatus = (resData.status || '').toLowerCase();

      tx.providerReference = providerRef;
      tx.paymentLink = paymentLink;
      tx.rawResponse = ikeepayRes;

      if (remoteStatus === 'completed' || remoteStatus === 'success') {
        await processTransactionUpdate(tx, 'completed', providerRef, ikeepayRes, req.app.get('io'));
      } else if (remoteStatus === 'failed') {
        await processTransactionUpdate(tx, 'failed', providerRef, ikeepayRes, req.app.get('io'));
      } else {
        await tx.save();
      }

      res.json({
        success: true,
        message: tx.status === 'completed'
          ? 'Paiement confirmé ! Votre abonnement est maintenant actif.'
          : paymentLink
            ? 'Veuillez finaliser le paiement via le lien de redirection.'
            : 'Demande de paiement envoyée. Veuillez valider sur votre téléphone.',
        data: {
          transaction: tx,
          external_reference: externalReference,
          provider_reference: providerRef,
          payment_link: paymentLink,
          status: tx.status
        }
      });
    } catch (apiErr) {
      const errMsg = apiErr.response?.data?.message || apiErr.response?.data?.error || apiErr.message;
      tx.status = 'failed';
      tx.failureReason = errMsg;
      tx.rawResponse = apiErr.response?.data || { error: errMsg };
      await tx.save();

      return res.status(apiErr.response?.status || 502).json({
        success: false,
        message: `Erreur iKeepay: ${errMsg}`,
        data: { transaction: tx }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/subscription/verify/:reference — Verify payment status on iKeepay
router.get('/verify/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;
    const tx = await SubscriptionTransaction.findOne({
      $or: [{ externalReference: reference }, { providerReference: reference }]
    });

    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction introuvable' });
    }

    if (tx.status === 'completed') {
      return res.json({ success: true, data: { transaction: tx, status: 'completed' } });
    }

    const verifyRes = await verifyIkeepayTransaction(reference);
    const remoteStatus = (verifyRes?.data?.status || '').toLowerCase();
    const providerRef = verifyRes?.data?.provider_reference || tx.providerReference;

    if (remoteStatus === 'completed' || remoteStatus === 'success') {
      await processTransactionUpdate(tx, 'completed', providerRef, verifyRes, req.app.get('io'));
    } else if (remoteStatus === 'failed') {
      await processTransactionUpdate(tx, 'failed', providerRef, verifyRes, req.app.get('io'));
    }

    res.json({
      success: true,
      data: {
        transaction: tx,
        status: tx.status,
        remoteData: verifyRes?.data
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message
    });
  }
});

// POST /api/subscription/webhook/ikeepay — iKeepay async webhook (HMAC SHA-256)
router.post('/webhook/ikeepay', async (req, res) => {
  try {
    const signature = req.headers['x-ikeepay-signature'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    const valid = await verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      console.warn('Webhook iKeepay: signature invalide');
      return res.status(401).send('Signature invalide');
    }

    const eventData = req.body;
    const txData = eventData?.data;
    if (!txData) {
      return res.status(400).json({ received: false, message: 'Payload invalide' });
    }

    const ref = txData.external_reference || txData.provider_reference;
    const tx = await SubscriptionTransaction.findOne({
      $or: [
        { externalReference: txData.external_reference },
        { providerReference: txData.provider_reference }
      ]
    });

    if (tx) {
      const normalizedStatus = (txData.status || '').toLowerCase();
      if (['completed', 'pending', 'failed'].includes(normalizedStatus)) {
        await processTransactionUpdate(
          tx,
          normalizedStatus,
          txData.provider_reference,
          eventData,
          req.app.get('io')
        );
      }
    } else {
      console.warn(`Webhook iKeepay: transaction non trouvée (${ref})`);
    }

    res.status(200).send({ received: true });
  } catch (error) {
    console.error('Webhook iKeepay error:', error);
    res.status(500).json({ received: false, message: error.message });
  }
});

module.exports = router;
