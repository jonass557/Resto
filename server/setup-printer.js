/**
 * Script de configuration de l'imprimante WiFi
 * Configure directement dans MongoDB la config imprimante
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

const SettingsSchema = new mongoose.Schema({}, { strict: false });
const Settings = mongoose.model('Settings', SettingsSchema);

async function setupPrinter() {
  try {
    console.log('Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connecté');

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
      console.log('Création nouveaux settings...');
    }

    settings.set('printerConfig', {
      type: 'network',
      address: '192.168.1.158',
      port: 9100,
      paperWidth: 80,
      autoPrint: true,
    });

    await settings.save();
    console.log('✅ Imprimante configurée avec succès :');
    console.log('   Type    : network (WiFi)');
    console.log('   IP      : 192.168.1.158');
    console.log('   Port    : 9100');
    console.log('   autoPrint : true');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

setupPrinter();
