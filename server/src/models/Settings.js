const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  restaurantName: { type: String, default: 'Mon Restaurant' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  logo: { type: String, default: '' },
  currency: { type: String, default: 'XAF' },
  currencySymbol: { type: String, default: 'FCFA' },
  taxRate: { type: Number, default: 0 },
  taxLabel: { type: String, default: 'TVA' },
  language: { type: String, enum: ['fr', 'en'], default: 'fr' },
  timezone: { type: String, default: 'Africa/Douala' },
  receiptHeader: { type: String, default: '' },
  receiptFooter: { type: String, default: 'Merci de votre visite!' },
  printerConfig: {
    type: { type: String, enum: ['usb', 'network', 'bluetooth', 'none'], default: 'none' },
    address: { type: String, default: '' },
    port: { type: Number, default: 9100 },
    paperWidth: { type: Number, default: 80 },
    autoPrint: { type: Boolean, default: true }
  },
  mobileMoneyConfig: {
    mtnMomoEnabled: { type: Boolean, default: false },
    mtnMomoApiKey: { type: String, default: '' },
    mtnMomoCode: { type: String, default: '' },
    mtnMomoName: { type: String, default: '' },
    orangeMoneyEnabled: { type: Boolean, default: false },
    orangeMoneyApiKey: { type: String, default: '' },
    orangeMoneyCode: { type: String, default: '' },
    orangeMoneyName: { type: String, default: '' }
  },
  features: {
    verificationCagnotteClient: { type: Boolean, default: false },
    autoriserCashBank: { type: Boolean, default: false },
    autoriserPouvoirs: { type: Boolean, default: false },
    verificationSoldeDebiteur: { type: Boolean, default: false },
    recuperationBaseClient: { type: Boolean, default: false },
    gestionDemarques: { type: Boolean, default: false },
    limiteursUtilisationTitres: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
