const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  platformName: { type: String, default: 'RestoManager SaaS' },
  trialDays: { type: Number, default: 30 },
  ikeepayApiKey: { type: String, default: '' },
  ikeepayWebhookSecret: { type: String, default: '' },
  ikeepayBaseUrl: { type: String, default: 'https://api.ikeepay.com' },
  defaultCurrency: { type: String, default: 'XOF' },
  payoutSettings: {
    defaultPhone: { type: String, default: '' },
    defaultOperator: { type: String, default: 'ORANGE' },
    defaultCountry: { type: String, default: 'CI' }
  }
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
