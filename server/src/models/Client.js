const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, default: '', lowercase: true, trim: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  type: { type: String, enum: ['individual', 'corporate'], default: 'individual' },
  category: { type: String, default: 'standard' },
  group: { type: String, default: '' },
  loyaltyPoints: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  visitCount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  attributes: { type: Map, of: String, default: {} },
  syncedToCloud: { type: Boolean, default: false }
}, { timestamps: true });

clientSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

module.exports = mongoose.model('Client', clientSchema);
