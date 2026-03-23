/**
 * Script to create or promote an admin user.
 * Usage:
 *   node scripts/createAdmin.js                    → promotes first user to admin
 *   node scripts/createAdmin.js email@example.com  → promotes specific user to admin
 *   node scripts/createAdmin.js --create           → creates a new admin from .env vars
 *
 * Required .env: MONGODB_URI
 * Optional .env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI not set in .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅  MongoDB connecté');

  const args = process.argv.slice(2);
  const shouldCreate = args.includes('--create');
  const targetEmail = args.find(a => a.includes('@'));

  // ── 1. Check if an admin already exists ──────────────────────────────────
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log(`ℹ️   Un administrateur existe déjà : ${existingAdmin.email} (${existingAdmin.firstName} ${existingAdmin.lastName})`);
    if (!targetEmail && !shouldCreate) {
      console.log('✅  Aucune action nécessaire. Si vous voulez changer le rôle d\'un utilisateur spécifique, passez son email en argument.');
      await mongoose.disconnect();
      return;
    }
  }

  // ── 2. Promote a specific user by email ──────────────────────────────────
  if (targetEmail) {
    const user = await User.findOne({ email: targetEmail.toLowerCase() });
    if (!user) {
      console.error(`❌  Aucun utilisateur trouvé avec l'email : ${targetEmail}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    user.role = 'admin';
    await user.save();
    console.log(`✅  ${user.firstName} ${user.lastName} (${user.email}) promu(e) administrateur`);
    await mongoose.disconnect();
    return;
  }

  // ── 3. Create a new admin from .env vars ─────────────────────────────────
  if (shouldCreate) {
    const email = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const lastName = process.env.ADMIN_LAST_NAME || 'Principal';

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      existing.role = 'admin';
      await existing.save();
      console.log(`✅  Utilisateur ${email} mis à jour → rôle admin`);
    } else {
      const admin = new User({ firstName, lastName, email, password, role: 'admin' });
      await admin.save();
      console.log(`✅  Administrateur créé : ${email} / ${password}`);
      console.log('⚠️   Changez ce mot de passe dès la première connexion !');
    }
    await mongoose.disconnect();
    return;
  }

  // ── 4. Promote the first user (fallback) ─────────────────────────────────
  const firstUser = await User.findOne().sort({ createdAt: 1 });
  if (!firstUser) {
    console.log('ℹ️   Aucun utilisateur trouvé. Création d\'un admin par défaut...');
    const email = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const admin = new User({
      firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
      lastName: process.env.ADMIN_LAST_NAME || 'Principal',
      email, password, role: 'admin'
    });
    await admin.save();
    console.log(`✅  Admin créé : ${email} / ${password}`);
  } else {
    firstUser.role = 'admin';
    await firstUser.save();
    console.log(`✅  Premier utilisateur promu admin : ${firstUser.email}`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌  Erreur :', err.message);
  mongoose.disconnect();
  process.exit(1);
});
