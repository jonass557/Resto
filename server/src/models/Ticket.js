const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['order', 'invoice', 'refund'],
    default: 'order'
  },
  orderType: {
    type: String,
    enum: ['dine_in', 'takeaway', 'delivery'],
    default: 'dine_in'
  },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  deliveryInfo: {
    clientName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  items: [{
    name: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    options: [{ name: String, price: Number }]
  }],
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  isPaid: { type: Boolean, default: false },
  isPrinted: { type: Boolean, default: false },
  printedAt: { type: Date },
  notes: { type: String, default: '' }
}, { timestamps: true });

ticketSchema.index({ table: 1, type: 1 });
ticketSchema.index({ agent: 1, createdAt: -1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ type: 1, isPaid: 1, createdAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);
