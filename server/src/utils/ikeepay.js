const axios = require('axios');
const crypto = require('crypto');
const PlatformSettings = require('../models/PlatformSettings');
const Restaurant = require('../models/Restaurant');
const Plan = require('../models/Plan');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');

async function getIkeepayConfig() {
  const settings = await PlatformSettings.findOne();
  const apiKey = settings?.ikeepayApiKey || process.env.IKEEPAY_SECRET_KEY || '';
  const webhookSecret = settings?.ikeepayWebhookSecret || apiKey;
  const baseUrl = (settings?.ikeepayBaseUrl || 'https://api.ikeepay.com').replace(/\/+$/, '');
  return { apiKey, webhookSecret, baseUrl, settings };
}

function getDurationDays(duration, customDays) {
  if (customDays && Number(customDays) > 0) return Number(customDays);
  switch (duration) {
    case 'mensuel': return 30;
    case 'trimestre': return 90;
    case 'semestriel': return 180;
    case 'annuel': return 365;
    case 'a_vie': return 36500;
    default: return 30;
  }
}

async function activateRestaurantSubscription(restaurantId, { plan = null, duration, planName, activatedBy = 'ikeepay' }) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error('Restaurant introuvable');

  const resolvedDuration = plan?.duration || duration || 'mensuel';
  const isLifetime = resolvedDuration === 'a_vie';
  const days = getDurationDays(resolvedDuration, plan?.durationDays);

  const now = new Date();
  // If currently active and not expired, extend from current endDate
  let baseDate = now;
  if (
    !isLifetime &&
    restaurant.subscription?.status === 'active' &&
    restaurant.subscription?.endDate &&
    new Date(restaurant.subscription.endDate) > now
  ) {
    baseDate = new Date(restaurant.subscription.endDate);
  }

  const endDate = isLifetime
    ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000)
    : new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

  restaurant.subscription = {
    status: isLifetime ? 'lifetime' : 'active',
    plan: plan?._id || restaurant.subscription?.plan || null,
    planName: plan?.name || planName || `Abonnement ${resolvedDuration}`,
    planDuration: resolvedDuration,
    startDate: now,
    endDate,
    trialEndsAt: restaurant.subscription?.trialEndsAt || now,
    isLifetime,
    activatedBy
  };

  await restaurant.save();
  return restaurant;
}

async function initiatePayin({ amount, currency, country, phoneNumber, operator, externalReference, customerEmail, otp }) {
  const { apiKey, baseUrl } = await getIkeepayConfig();
  if (!apiKey) {
    throw new Error('Clé API iKeepay non configurée par le Super Administrateur');
  }

  const payload = {
    amount: Number(amount),
    currency: currency || 'XOF',
    country: (country || 'CI').toUpperCase(),
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    operator: (operator || 'ORANGE').toUpperCase(),
    external_reference: externalReference,
    customer_email: customerEmail || 'client@restaurant.com'
  };
  if (otp && String(otp).trim()) {
    payload.otp = String(otp).trim();
  }

  const response = await axios.post(`${baseUrl}/h2h-payin`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    timeout: 30000
  });
  return response.data;
}

async function initiatePayout({ amount, currency, country, phoneNumber, operator, externalReference }) {
  const { apiKey, baseUrl } = await getIkeepayConfig();
  if (!apiKey) {
    throw new Error('Clé API iKeepay non configurée par le Super Administrateur');
  }

  const payload = {
    amount: Number(amount),
    currency: currency || 'XOF',
    country: (country || 'CI').toUpperCase(),
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    operator: (operator || 'ORANGE').toUpperCase(),
    external_reference: externalReference
  };

  const response = await axios.post(`${baseUrl}/h2h-payout`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    timeout: 30000
  });
  return response.data;
}

async function verifyIkeepayTransaction(reference) {
  const { apiKey, baseUrl } = await getIkeepayConfig();
  if (!apiKey) {
    throw new Error('Clé API iKeepay non configurée');
  }

  const response = await axios.get(`${baseUrl}/h2h-verify/${encodeURIComponent(reference)}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 20000
  });
  return response.data;
}

async function verifyWebhookSignature(rawBody, signatureHeader) {
  const { webhookSecret } = await getIkeepayConfig();
  if (!webhookSecret || !signatureHeader || !rawBody) return false;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(String(signatureHeader), 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function processTransactionUpdate(tx, newStatus, providerRef, rawData, io = null) {
  const wasCompleted = tx.status === 'completed';
  tx.status = newStatus;
  if (providerRef) tx.providerReference = providerRef;
  if (rawData) tx.rawResponse = rawData;
  if (newStatus === 'completed' && !tx.completedAt) {
    tx.completedAt = new Date();
  }
  await tx.save();

  if (newStatus === 'completed' && !wasCompleted && tx.type === 'payin' && tx.restaurant) {
    const plan = tx.plan ? await Plan.findById(tx.plan) : null;
    const restaurant = await activateRestaurantSubscription(tx.restaurant, {
      plan,
      activatedBy: 'ikeepay'
    });
    if (io) {
      io.emit('subscription:updated', {
        restaurantId: restaurant._id,
        subscription: restaurant.subscription
      });
    }
  }
  return tx;
}

module.exports = {
  getIkeepayConfig,
  getDurationDays,
  activateRestaurantSubscription,
  initiatePayin,
  initiatePayout,
  verifyIkeepayTransaction,
  verifyWebhookSignature,
  processTransactionUpdate
};
