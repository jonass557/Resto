const mongoose = require('mongoose');

const subscriptionTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['payin', 'payout'], required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'XOF' },
  country: { type: String, default: 'CI' },
  phoneNumber: { type: String, required: true },
  operator: { type: String, required: true },
  externalReference: { type: String, required: true, unique: true },
  providerReference: { type: String, default: '' },
  paymentLink: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  failureReason: { type: String, default: '' },
  rawResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
  completedAt: { type: Date }
}, { timestamps: true });

subscriptionTransactionSchema.index({ restaurant: 1, createdAt: -1 });
subscriptionTransactionSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionTransaction', subscriptionTransactionSchema);
