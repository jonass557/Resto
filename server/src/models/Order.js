const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  category: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  options: [{
    groupName: String,
    optionName: String,
    price: Number
  }],
  notes: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'served', 'cancelled'],
    default: 'pending'
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  orderType: {
    type: String,
    enum: ['dine_in', 'takeaway', 'delivery'],
    default: 'dine_in'
  },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  deliveryInfo: {
    clientName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'fixed' },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'ready', 'served', 'paid', 'cancelled'],
    default: 'pending'
  },
  notes: { type: String, default: '' },
  ticketPrinted: { type: Boolean, default: false },
  ticketNumber: { type: String, default: '' },
  syncedToCloud: { type: Boolean, default: false }
}, { timestamps: true });

orderSchema.index({ table: 1, status: 1 });
orderSchema.index({ agent: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
