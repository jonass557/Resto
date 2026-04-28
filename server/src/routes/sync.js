const express = require('express');
const axios = require('axios');
const { auth } = require('../middleware/auth');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const Payment = require('../models/Payment');
const CashRegister = require('../models/CashRegister');
const Expense = require('../models/Expense');
const Client = require('../models/Client');

const router = express.Router();

// Collections to sync — order matters (clients first, then orders, tickets, payments…)
const SYNC_COLLECTIONS = [
  { name: 'clients',       Model: Client },
  { name: 'orders',        Model: Order },
  { name: 'tickets',       Model: Ticket },
  { name: 'payments',      Model: Payment },
  { name: 'cashRegisters', Model: CashRegister },
  { name: 'expenses',      Model: Expense },
];

// ── GET /api/sync/status — How many documents are pending sync ──────────────
router.get('/status', auth, async (req, res) => {
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
    return res.status(400).json({
      success: false,
      message: 'CLOUD_API_URL non configuré dans .env — impossible de synchroniser'
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
          await Model.create(doc);
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

module.exports = router;
