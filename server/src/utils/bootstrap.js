const User = require('../models/User');
const Plan = require('../models/Plan');
const PlatformSettings = require('../models/PlatformSettings');
const Table = require('../models/Table');

async function ensurePlatformSettingsExist() {
  const existing = await PlatformSettings.findOne();
  if (!existing) {
    await PlatformSettings.create({
      platformName: 'Restaurant Manager',
      trialDays: 30,
      ikeepayApiKey: process.env.IKEEPAY_SECRET_KEY || '',
      ikeepayWebhookSecret: process.env.IKEEPAY_WEBHOOK_SECRET || '',
      ikeepayBaseUrl: process.env.IKEEPAY_BASE_URL || 'https://api.ikeepay.com',
      defaultCurrency: 'XOF',
    });
    console.log('⚙️  Paramètres plateforme initialisés');
  }
}

async function ensureDefaultPlansExist() {
  const count = await Plan.countDocuments();
  if (count === 0) {
    await Plan.insertMany([
      {
        name: 'Starter Mensuel',
        description: 'Idéal pour démarrer avec toutes les fonctionnalités du restaurant',
        duration: 'mensuel',
        durationDays: 30,
        price: 15000,
        currency: 'XOF',
        features: ['Commandes & Tables illimitées', 'Serveuses & Caissier illimités', 'Impression WiFi & Bluetooth', 'Rapports et Comptabilité'],
        isPopular: false,
        isActive: true,
        order: 1,
      },
      {
        name: 'Pro Trimestriel',
        description: 'Formule 3 mois avantageuse pour une gestion continue',
        duration: 'trimestre',
        durationDays: 90,
        price: 40000,
        currency: 'XOF',
        features: ['Toutes les fonctionnalités Starter', 'Economisez 11% sur le trimestre', 'Support prioritaire', 'Synchronisation cloud & hors-ligne'],
        isPopular: true,
        isActive: true,
        order: 2,
      },
      {
        name: 'Business Semestriel',
        description: 'Abonnement 6 mois avec tarif préférentiel',
        duration: 'semestriel',
        durationDays: 180,
        price: 75000,
        currency: 'XOF',
        features: ['Toutes les fonctionnalités Pro', 'Economisez 17% sur 6 mois', 'Sauvegardes cloud automatiques'],
        isPopular: false,
        isActive: true,
        order: 3,
      },
      {
        name: 'Enterprise Annuel',
        description: 'Un an complet de gestion optimale sans interruption',
        duration: 'annuel',
        durationDays: 365,
        price: 130000,
        currency: 'XOF',
        features: ['Toutes les fonctionnalités Business', '2 mois offerts sur l\'année', 'Assistance dédiée 7j/7'],
        isPopular: false,
        isActive: true,
        order: 4,
      },
    ]);
    console.log('💳 Plans d\'abonnement par défaut créés');
  }
}

async function ensureSuperAdminExists() {
  const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@resto.com').toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2026';

  const existing = await User.findOne({ role: 'superadmin' });
  if (!existing) {
    await User.create({
      firstName: 'Super',
      lastName: 'Administrateur',
      email,
      password,
      role: 'superadmin',
      isActive: true,
      restaurant: null,
    });
    console.log(`👑 Super Admin créé: ${email}`);
  }
}

async function syncMultiTenantIndexes() {
  try {
    // Drop legacy single-field unique index on Table.number so multiple restaurants can each have Table 1..N
    await Table.collection.dropIndex('number_1').catch(() => {});
    await Table.syncIndexes().catch(() => {});
  } catch {
    // Safe fallback if collection does not exist yet
  }
}

async function bootstrapPlatform() {
  await syncMultiTenantIndexes();
  await ensurePlatformSettingsExist();
  await ensureDefaultPlansExist();
  await ensureSuperAdminExists();
}

module.exports = { bootstrapPlatform };
