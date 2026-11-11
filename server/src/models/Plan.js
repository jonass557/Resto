const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  duration: {
    type: String,
    enum: ['mensuel', 'trimestre', 'semestriel', 'annuel', 'a_vie'],
    required: true
  },
  durationDays: { type: Number, required: true }, // 30, 90, 180, 365, 36500
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'XOF' },
  features: [{ type: String }],
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
