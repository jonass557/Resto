// One-shot migration: convert String _ids → ObjectId _ids in the local DB.
//
// Why this exists: docs synced from the cloud were inserted with their _id
// stored as a String. Mongoose schemas declare _id (and references like
// `agent`, `category`) as ObjectId, so auto-casting fails to match those
// String _ids → routes like /auth/me, /cash-register/open-service return
// "Utilisateur non trouvé" / "Agent non trouvé" even though the doc exists.
//
// Usage:
//   Local DB:  node scripts/migrate-string-ids.js
//   Cloud DB:  MONGODB_URI="mongodb+srv://..." node scripts/migrate-string-ids.js
//
// Safe to run multiple times — only touches docs whose _id / refs / dates
// are currently strings.

// Load .env.local only if MONGODB_URI is not already provided via the shell —
// this lets us point the script at any DB (cloud or local) by exporting
// MONGODB_URI before running.
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
}
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const HEX_24 = /^[0-9a-f]{24}$/i;

// Collections whose _id should be ObjectId.
// Includes all collections that participate in sync push/pull — covers both
// the local DB (after pull-all from cloud) and the cloud DB (after receive
// from local) where Model.collection.insertOne stored String _ids.
const ID_COLLECTIONS = [
  'users', 'categories', 'products', 'tables',
  'orders', 'tickets', 'payments', 'cashregisters',
  'expenses', 'clients',
];

// Fields in other collections that reference these _ids and should also
// be cast from String → ObjectId when they look like a 24-hex string.
const REFERENCE_FIELDS = [
  { collection: 'products',      field: 'category' },
  { collection: 'cashregisters', field: 'agent' },
  { collection: 'cashregisters', field: 'openedBy' },
  { collection: 'cashregisters', field: 'closedBy' },
  { collection: 'notifications', field: 'agent' },
  { collection: 'orders',        field: 'agent' },
  { collection: 'orders',        field: 'table' },
  { collection: 'orders',        field: 'user' },
  { collection: 'orders',        field: 'client' },
  { collection: 'tickets',       field: 'agent' },
  { collection: 'tickets',       field: 'order' },
  { collection: 'tickets',       field: 'cashRegister' },
  { collection: 'tickets',       field: 'client' },
  { collection: 'payments',      field: 'agent' },
  { collection: 'payments',      field: 'user' },
  { collection: 'payments',      field: 'order' },
  { collection: 'payments',      field: 'ticket' },
  { collection: 'payments',      field: 'cashRegister' },
  { collection: 'expenses',      field: 'createdBy' },
  { collection: 'expenses',      field: 'user' },
];

// Date fields that arrived as ISO strings via JSON and were stored as strings
// (Model.collection.insertOne bypasses Mongoose's auto-cast). Convert them
// back to Date so $gte/$lte queries and sort by date work in admin views.
const DATE_FIELDS_BY_COLLECTION = {
  orders:        ['createdAt', 'updatedAt'],
  tickets:       ['createdAt', 'updatedAt', 'paidAt'],
  payments:      ['createdAt', 'updatedAt'],
  cashregisters: ['createdAt', 'updatedAt', 'openedAt', 'closedAt'],
  expenses:      ['createdAt', 'updatedAt', 'date'],
  users:         ['createdAt', 'updatedAt', 'lastLogin'],
  notifications: ['createdAt', 'updatedAt'],
};

async function migrateCollection(db, name) {
  const exists = (await db.listCollections({ name }).toArray()).length;
  if (!exists) {
    console.log(`  · ${name}: skipped (collection does not exist)`);
    return 0;
  }
  const col = db.collection(name);
  const stringDocs = await col.find({ _id: { $type: 'string' } }).toArray();
  if (stringDocs.length === 0) {
    console.log(`  · ${name}: nothing to migrate`);
    return 0;
  }

  let migrated = 0;
  for (const doc of stringDocs) {
    const oldId = doc._id;
    if (!HEX_24.test(oldId)) {
      console.warn(`    ! ${name}: skipping non-hex _id "${oldId}"`);
      continue;
    }
    const newId = new ObjectId(oldId);
    const newDoc = { ...doc, _id: newId };
    // Delete-then-insert (server is stopped, no concurrent reads). Insert-first
    // would fail on collections with unique indexes (e.g. users.email).
    await col.deleteOne({ _id: oldId });
    try {
      await col.insertOne(newDoc);
      migrated++;
    } catch (err) {
      // Rollback: re-insert the original to keep the DB consistent
      await col.insertOne(doc);
      throw err;
    }
  }
  console.log(`  ✓ ${name}: migrated ${migrated} doc(s)`);
  return migrated;
}

async function fixDateFields(db, collectionName, fields) {
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length;
  if (!exists) return 0;
  const col = db.collection(collectionName);
  let total = 0;
  for (const field of fields) {
    const cursor = col.find({ [field]: { $type: 'string' } });
    let fixed = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const d = new Date(doc[field]);
      if (isNaN(d.getTime())) continue;
      await col.updateOne({ _id: doc._id }, { $set: { [field]: d } });
      fixed++;
    }
    if (fixed > 0) console.log(`  ✓ ${collectionName}.${field}: fixed ${fixed} date(s)`);
    total += fixed;
  }
  return total;
}

async function fixReferenceField(db, { collection, field }) {
  const exists = (await db.listCollections({ name: collection }).toArray()).length;
  if (!exists) return 0;
  const col = db.collection(collection);
  const cursor = col.find({ [field]: { $type: 'string' } });
  let fixed = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const val = doc[field];
    if (!HEX_24.test(val)) continue;
    await col.updateOne({ _id: doc._id }, { $set: { [field]: new ObjectId(val) } });
    fixed++;
  }
  if (fixed > 0) console.log(`  ✓ ${collection}.${field}: fixed ${fixed} ref(s)`);
  return fixed;
}

(async () => {
  console.log('Connecting to', process.env.MONGODB_URI);
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('\n[1/3] Migrating String _id → ObjectId _id');
  for (const name of ID_COLLECTIONS) {
    await migrateCollection(db, name);
  }

  console.log('\n[2/3] Fixing references to migrated _ids');
  for (const ref of REFERENCE_FIELDS) {
    await fixReferenceField(db, ref);
  }

  console.log('\n[3/3] Fixing date fields stored as strings');
  for (const [name, fields] of Object.entries(DATE_FIELDS_BY_COLLECTION)) {
    await fixDateFields(db, name, fields);
  }

  console.log('\n✅ Migration complete');
  await mongoose.disconnect();
})().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
