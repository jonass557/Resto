const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['cash_opened', 'cash_closed', 'agent_login', 'payment_received', 'invoice_created', 'invoice_deleted', 'ticket_deleted'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
