const mongoose = require('mongoose');

const cashRegisterSchema = new mongoose.Schema({
  sessionNumber: { type: String, required: true, unique: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openingAmount: { type: Number, required: true, default: 0 },
  closingAmount: { type: Number, default: 0 },
  expectedAmount: { type: Number, default: 0 },
  difference: { type: Number, default: 0 },
  totalCash: { type: Number, default: 0 },
  totalCard: { type: Number, default: 0 },
  totalMobileMoney: { type: Number, default: 0 },
  totalGiftCard: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  totalRefunds: { type: Number, default: 0 },
  transactionCount: { type: Number, default: 0 },
  payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }],
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  notes: { type: String, default: '' }
}, { timestamps: true });

cashRegisterSchema.index({ agent: 1, status: 1 });

module.exports = mongoose.model('CashRegister', cashRegisterSchema);
