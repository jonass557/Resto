const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: {
    type: String,
    enum: ['food', 'supplies', 'utilities', 'rent', 'salary', 'maintenance', 'marketing', 'other'],
    default: 'other'
  },
  date: { type: Date, default: Date.now },
  reference: { type: String, default: '' },
  paymentMethod: { type: String, enum: ['cash', 'card', 'transfer', 'other'], default: 'cash' },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receipt: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
