const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, unique: true },
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  amount: { type: Number, required: true },
  amountReceived: { type: Number, default: 0 },
  change: { type: Number, default: 0 },
  method: {
    type: String,
    enum: ['cash', 'card', 'mobile_money', 'mixed', 'gift_card'],
    required: true
  },
  mobileMoneyProvider: {
    type: String,
    enum: ['mtn_momo', 'orange_money', 'none'],
    default: 'none'
  },
  mobileMoneyNumber: { type: String, default: '' },
  transactionRef: { type: String, default: '' },
  mixedPayments: [{
    method: String,
    amount: Number,
    reference: String
  }],
  cashRegister: { type: mongoose.Schema.Types.ObjectId, ref: 'CashRegister' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'refunded', 'cancelled'],
    default: 'completed'
  },
  notes: { type: String, default: '' },
  syncedToCloud: { type: Boolean, default: false }
}, { timestamps: true });

paymentSchema.index({ agent: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ agent: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
