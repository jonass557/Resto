const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  initialBalance: { type: Number, required: true },
  currentBalance: { type: Number, required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactions: [{
    amount: Number,
    type: { type: String, enum: ['credit', 'debit'] },
    date: { type: Date, default: Date.now },
    reference: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('GiftCard', giftCardSchema);
