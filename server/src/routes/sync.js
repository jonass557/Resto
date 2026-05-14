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
const Product = require('../models/Product');
const Category = require('../models/Category');
const Table = require('../models/Table');
const Settings = require('../models/Settings');

const router = express.Router();

// Collections à PUSH (local → cloud) : données opérationnelles créées par les agents
const SYNC_COLLECTIONS = [
  { name: 'users',         Model: User },
  { name: 'clients',       Model: Client },
  { name: 'categories',    Model: Category },
  { name: 'products',      Model: Product },
  { name: 'tables',        Model: Table },
  { name: 'orders',        Model: Order },
  { name: 'tickets',       Model: Ticket },
  { name: 'payments',      Model: Payment },
  { name: 'cashRegisters', Model: CashRegister },
  { name: 'expenses',      Model: Expense },
];

// Collections à PULL (cloud → local) : données de référence (menu, config)
const PULL_COLLECTIONS = [
  { name: 'users',      Model: User },
  { name: 'categories', Model: Category },
  { name: 'products',   Model: Product },
  { name: 'tables',     Model: Table },
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

  // Authentifier au cloud avec les identifiants admin du cloud (pas le token local)
  let cloudToken;
  try {
    cloudToken = await getCloudToken();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: `Authentification cloud impossible: ${err.message}`,
      data: { synced: {}, errors: {}, totalSynced: 0, totalErrors: 0 },
    });
  }
  const token = `Bearer ${cloudToken}`;
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
        // Remove fields that shouldn't be overwritten on the cloud
        delete doc.__v;
        doc.syncedToCloud = true;
        // Cast _id, references and dates from JSON strings → proper BSON types.
        // Without this, Model.collection.insertOne stores strings → Mongoose's
        // findById/populate/sort on the cloud admin side fails to match them.
        castSyncedDocIds(Model, doc);

        // Upsert: if _id exists, update; otherwise insert
        const existing = await Model.findById(doc._id);
        if (existing) {
          // Update only if cloud version is older
          if (!existing.updatedAt || new Date(doc.updatedAt) >= existing.updatedAt) {
            await Model.collection.updateOne({ _id: doc._id }, { $set: doc });
            updated++;
          }
        } else {
          // Raw insertOne to bypass pre-save hooks (avoids double-hashing passwords)
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

// ── GET /api/sync/export/:collection — Cloud exports collection for local pull
// Only used by local server pulling reference data from cloud (admin token required)
router.get('/export/:collection', auth, async (req, res) => {
  try {
    const { collection } = req.params;
    const entry = PULL_COLLECTIONS.find(c => c.name === collection);
    if (!entry) {
      return res.status(400).json({ success: false, message: `Collection inconnue: ${collection}` });
    }
    const docs = await entry.Model.find({}).lean();
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /api/sync/export-settings — Cloud exports the singleton settings doc ─
router.get('/export-settings', auth, async (req, res) => {
  try {
    const settings = await Settings.findOne({}).lean();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cache du token cloud (re-login si expiré ou absent)
let cachedCloudToken = null;
let cachedCloudTokenExpiry = 0;

async function getCloudToken() {
  const now = Date.now();
  if (cachedCloudToken && now < cachedCloudTokenExpiry) {
    return cachedCloudToken;
  }
  const cloudUrl = process.env.CLOUD_API_URL;
  const email = process.env.CLOUD_ADMIN_EMAIL;
  const password = process.env.CLOUD_ADMIN_PASSWORD;
  if (!cloudUrl || !email || !password) {
    throw new Error('CLOUD_API_URL, CLOUD_ADMIN_EMAIL et CLOUD_ADMIN_PASSWORD doivent être définis dans .env.local');
  }
  const response = await axios.post(
    `${cloudUrl}/api/auth/login`,
    { email, password },
    { timeout: 15000 }
  );
  const token = response.data?.data?.token;
  if (!token) throw new Error('Login cloud échoué : pas de token reçu');
  cachedCloudToken = token;
  // Re-login chaque 6 jours (tokens valides 7j)
  cachedCloudTokenExpiry = now + 6 * 24 * 60 * 60 * 1000;
  return token;
}

// Per-model reference fields that arrive as strings over JSON and must be
// cast back to ObjectId before raw insert/update — otherwise Mongoose's
// auto-cast on read won't match them (e.g. findById(stringId) returns null).
const REF_FIELDS_BY_MODEL = {
  Product:      ['category'],
  CashRegister: ['agent', 'openedBy', 'closedBy', 'payments'],
  Order:        ['agent', 'table', 'user', 'client'],
  Ticket:      ['agent', 'order', 'cashRegister', 'client'],
  Payment:      ['agent', 'user', 'order', 'ticket', 'cashRegister'],
  Notification: ['agent'],
  Expense:      ['createdBy', 'user'],
  Client:       [],
};

// Date fields arrive as ISO strings over JSON. Raw insert/update bypasses
// Mongoose's auto-cast → they stay as strings, breaking date sorting and
// $gte/$lte queries on the receiving DB.
const DATE_FIELDS = ['createdAt', 'updatedAt', 'openedAt', 'closedAt', 'lastLogin', 'date', 'paidAt'];

function castSyncedDocIds(Model, doc) {
  const { Types } = require('mongoose');
  // Cast _id (arrives as 24-hex string from JSON)
  if (typeof doc._id === 'string' && /^[0-9a-f]{24}$/i.test(doc._id)) {
    doc._id = new Types.ObjectId(doc._id);
  }
  const refs = REF_FIELDS_BY_MODEL[Model.modelName] || [];
  for (const f of refs) {
    const v = doc[f];
    if (typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v)) {
      doc[f] = new Types.ObjectId(v);
    } else if (Array.isArray(v)) {
      doc[f] = v.map(x =>
        typeof x === 'string' && /^[0-9a-f]{24}$/i.test(x) ? new Types.ObjectId(x) : x
      );
    }
  }
  // Cast date fields
  for (const f of DATE_FIELDS) {
    if (typeof doc[f] === 'string') {
      const d = new Date(doc[f]);
      if (!isNaN(d.getTime())) doc[f] = d;
    }
  }
}

// Helper: upsert a document into a collection, bypassing hooks (for sync)
// Handles unique-field collisions (email for User, number for Table, name for Category):
// if a local doc with the same unique field exists but different _id (e.g. local default admin),
// it gets replaced by the cloud version so cloud is the source of truth.
async function upsertSyncedDoc(Model, doc) {
  delete doc.__v;
  doc.syncedToCloud = true;
  castSyncedDocIds(Model, doc);

  // 1) Match by _id (normal case)
  let existing = await Model.findById(doc._id);

  // 2) If not found by _id, look for a document with the same unique field and delete it
  //    so the cloud version can be inserted with its original _id.
  if (!existing) {
    const collectionName = Model.modelName;
    let conflictQuery = null;
    if (collectionName === 'User' && doc.email) conflictQuery = { email: doc.email };
    else if (collectionName === 'Table' && typeof doc.number === 'number') conflictQuery = { number: doc.number };
    else if (collectionName === 'Category' && doc.name) conflictQuery = { name: doc.name };

    if (conflictQuery) {
      const conflict = await Model.findOne(conflictQuery);
      if (conflict) {
        await Model.collection.deleteOne({ _id: conflict._id });
      }
    }
    await Model.collection.insertOne(doc);
    return 'inserted';
  }

  if (!existing.updatedAt || new Date(doc.updatedAt) >= existing.updatedAt) {
    await Model.collection.updateOne({ _id: existing._id }, { $set: doc });
    return 'updated';
  }
  return 'skipped';
}

// ── POST /api/sync/pull-all — Local pulls all reference data from cloud ──────
// Pulls users, products, categories, tables, settings from cloud and upserts locally
router.post('/pull-all', auth, async (req, res) => {
  const cloudUrl = process.env.CLOUD_API_URL;
  if (!cloudUrl) {
    return res.json({ success: true, message: 'Ce serveur est le cloud — rien à tirer', data: {} });
  }

  // Authentifier au cloud (token JWT cloud-valide)
  let cloudToken;
  try {
    cloudToken = await getCloudToken();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: `Authentification cloud impossible: ${err.message}`,
      data: {},
    });
  }
  const token = `Bearer ${cloudToken}`;
  const summary = {};
  let totalUpserted = 0;

  try {
    // Vérifier d'abord la connectivité au cloud
    await axios.get(`${cloudUrl}/api/health`, { timeout: 5000 });
  } catch {
    return res.status(503).json({
      success: false,
      message: 'Pas de connexion internet — sync impossible',
      data: { noInternet: true },
    });
  }

  for (const { name, Model } of PULL_COLLECTIONS) {
    try {
      const response = await axios.get(`${cloudUrl}/api/sync/export/${name}`, {
        headers: { Authorization: token },
        timeout: 30000,
      });
      const cloudDocs = response.data?.data || [];
      let upserted = 0;
      let errors = 0;
      for (const doc of cloudDocs) {
        try {
          const result = await upsertSyncedDoc(Model, { ...doc });
          if (result !== 'skipped') upserted++;
        } catch (err) {
          errors++;
        }
      }
      summary[name] = { upserted, errors, total: cloudDocs.length };
      totalUpserted += upserted;
    } catch (err) {
      summary[name] = { error: err.response?.data?.message || err.message };
    }
  }

  // Pull settings (singleton)
  try {
    const response = await axios.get(`${cloudUrl}/api/sync/export-settings`, {
      headers: { Authorization: token },
      timeout: 15000,
    });
    const cloudSettings = response.data?.data;
    if (cloudSettings) {
      delete cloudSettings.__v;
      delete cloudSettings._id;
      await Settings.findOneAndUpdate({}, { $set: cloudSettings }, { upsert: true, new: true });
      summary.settings = { upserted: 1 };
      totalUpserted++;
    }
  } catch (err) {
    summary.settings = { error: err.response?.data?.message || err.message };
  }

  res.json({
    success: true,
    message: `${totalUpserted} document(s) synchronisé(s) depuis le cloud`,
    data: { summary, totalUpserted },
  });
});

// Backwards-compatible alias: pull-users (legacy clients still call this)
router.post('/pull-users', auth, async (req, res, next) => {
  req.url = '/pull-all';
  router.handle(req, res, next);
});

module.exports = router;
