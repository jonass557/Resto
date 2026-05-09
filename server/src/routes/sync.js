const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const Payment = require('../models/Payment');
const CashRegister = require('../models/CashRegister');
const Expense = require('../models/Expense');
const Client = require('../models/Client');
const User = require('../models/User');

const router = express.Router();

// Collections to sync — order matters (users first so FKs resolve)
const SYNC_COLLECTIONS = [
  { name: 'users',         Model: User },
  { name: 'clients',       Model: Client },
  { name: 'orders',        Model: Order },
  { name: 'tickets',       Model: Ticket },
  { name: 'payments',      Model: Payment },
  { name: 'cashRegisters', Model: CashRegister },
  { name: 'expenses',      Model: Expense },
];

// ── GET /api/sync/status — How many documents are pending sync ──────────────
router.get('/status', auth, async (req, res) => {
  // On the cloud server, there's nothing to push — we ARE the cloud
  if (!process.env.CLOUD_API_URL) {
    return res.json({ success: true, data: { counts: {}, total: 0, isCloud: true } });
  }
  try {
    const counts = {};
    let total = 0;
    for (const { name, Model } of SYNC_COLLECTIONS) {
      const count = await Model.countDocuments({ syncedToCloud: { $ne: true } });
      counts[name] = count;
      total += count;
    }
    res.json({ success: true, data: { counts, total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/sync/push — Collect unsynced data and send to cloud server ────
// Called from the tablet when internet is available
router.post('/push', auth, async (req, res) => {
  const cloudUrl = process.env.CLOUD_API_URL;
  if (!cloudUrl) {
    // We ARE the cloud — nothing to push
    return res.json({
      success: true,
      message: 'Ce serveur est le serveur cloud — rien à synchroniser',
      data: { synced: {}, errors: {}, totalSynced: 0, totalErrors: 0, isCloud: true },
    });
  }

  // Vérifier la connectivité vers le cloud avant de tenter le push
  try {
    await axios.get(`${cloudUrl}/api/health`, { timeout: 5000 });
  } catch {
    return res.status(503).json({
      success: false,
      message: 'Pas de connexion internet — synchronisation cloud impossible. Réessayez quand vous êtes connecté.',
      data: { synced: {}, errors: {}, totalSynced: 0, totalErrors: 0, noInternet: true },
    });
  }

  const token = req.headers.authorization;
  const results = { synced: {}, errors: {}, totalSynced: 0, totalErrors: 0 };

  for (const { name, Model } of SYNC_COLLECTIONS) {
    try {
      // Get unsynced documents (batch of 200 max per collection)
      const docs = await Model.find({ syncedToCloud: { $ne: true } })
        .sort({ createdAt: 1 })
        .limit(200)
        .lean();

      if (docs.length === 0) {
        results.synced[name] = 0;
        continue;
      }

      // Send to cloud
      const response = await axios.post(
        `${cloudUrl}/api/sync/receive`,
        { collection: name, documents: docs },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: token,
          },
          timeout: 30000,
        }
      );

      if (response.data?.success) {
        // Mark as synced locally
        const ids = docs.map(d => d._id);
        await Model.updateMany(
          { _id: { $in: ids } },
          { $set: { syncedToCloud: true } }
        );
        results.synced[name] = docs.length;
        results.totalSynced += docs.length;
      } else {
        results.errors[name] = response.data?.message || 'Erreur inconnue';
        results.totalErrors++;
      }
    } catch (error) {
      results.errors[name] = error.response?.data?.message || error.message;
      results.totalErrors++;
    }
  }

  const success = results.totalErrors === 0;
  res.json({
    success,
    message: success
      ? `${results.totalSynced} document(s) synchronisé(s) vers le cloud`
      : `Synchronisation partielle — ${results.totalSynced} réussi(s), ${results.totalErrors} erreur(s)`,
    data: results,
  });
});

// ── POST /api/sync/receive — Receive data from tablet (runs on cloud server) ─
// Upserts documents so duplicates are handled gracefully
router.post('/receive', auth, async (req, res) => {
  try {
    const { collection, documents } = req.body;
    if (!collection || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, message: 'collection et documents requis' });
    }

    // Map collection name to model
    const modelMap = {};
    for (const { name, Model } of SYNC_COLLECTIONS) {
      modelMap[name] = Model;
    }

    const Model = modelMap[collection];
    if (!Model) {
      return res.status(400).json({ success: false, message: `Collection inconnue: ${collection}` });
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const doc of documents) {
      try {
        const localId = doc._id;
        // Remove fields that shouldn't be overwritten on the cloud
        delete doc.__v;
        doc.syncedToCloud = true;

        // Upsert: if _id exists, update; otherwise insert
        const existing = await Model.findById(localId);
        if (existing) {
          // Update only if cloud version is older
          if (!existing.updatedAt || new Date(doc.updatedAt) >= existing.updatedAt) {
            await Model.findByIdAndUpdate(localId, { $set: doc }, { upsert: true });
            updated++;
          }
        } else {
          // Use raw insertOne to bypass pre-save hooks (avoids double-hashing passwords)
          await Model.collection.insertOne(doc);
          inserted++;
        }
      } catch (err) {
        // Duplicate key or validation error — skip and continue
        console.error(`Sync receive error for ${collection}:`, err.message);
        errors++;
      }
    }

    res.json({
      success: true,
      message: `${collection}: ${inserted} inséré(s), ${updated} mis à jour, ${errors} erreur(s)`,
      data: { inserted, updated, errors },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/sync/export-users — Cloud exports users for local pull ──────────
// Only callable on cloud server (no CLOUD_API_URL = we ARE the cloud)
router.get('/export-users', auth, async (req, res) => {
  try {
    // Return all users WITH hashed passwords so local can authenticate them
    const users = await User.find({}).lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /api/sync/pull-users — Local pulls users from cloud ─────────────────
// Called from local server to fetch users created on cloud
router.post('/pull-users', auth, async (req, res) => {
  const cloudUrl = process.env.CLOUD_API_URL;
  if (!cloudUrl) {
    return res.json({ success: true, message: 'Ce serveur est le cloud — rien à tirer', data: { upserted: 0 } });
  }

  const token = req.headers.authorization;
  try {
    const response = await axios.get(`${cloudUrl}/api/sync/export-users`, {
      headers: { Authorization: token },
      timeout: 15000,
    });

    const cloudUsers = response.data?.data || [];
    let upserted = 0;
    let errors = 0;

    for (const doc of cloudUsers) {
      try {
        const existing = await User.findById(doc._id);
        if (existing) {
          // Mettre à jour seulement si la version cloud est plus récente
          if (!existing.updatedAt || new Date(doc.updatedAt) >= existing.updatedAt) {
            // Ne pas écraser le mot de passe local si inchangé côté cloud
            const update = { ...doc, syncedToCloud: true };
            delete update.__v;
            await User.findByIdAndUpdate(doc._id, { $set: update }, { upsert: false });
            upserted++;
          }
        } else {
          // Nouvel utilisateur du cloud — insérer directement (mot de passe déjà hashé)
          const newUser = new User({ ...doc, syncedToCloud: true });
          newUser.isNew = true;
          // Bypass pre-save hook (password already hashed)
          await User.collection.insertOne({ ...doc, syncedToCloud: true });
          upserted++;
        }
      } catch (err) {
        console.error('pull-users upsert error:', err.message);
        errors++;
      }
    }

    res.json({
      success: true,
      message: `${upserted} utilisateur(s) synchronisé(s) depuis le cloud`,
      data: { upserted, errors, total: cloudUsers.length },
    });
  } catch (error) {
    const noInternet = !error.response;
    res.status(noInternet ? 503 : 500).json({
      success: false,
      message: noInternet
        ? 'Pas de connexion internet — impossible de tirer les utilisateurs du cloud'
        : error.response?.data?.message || error.message,
      data: { noInternet },
    });
  }
});

module.exports = router;
