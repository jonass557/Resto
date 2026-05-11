const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  name: { type: String, default: '' },
  capacity: { type: Number, default: 4 },
  zone: { type: String, default: 'Salle principale' },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'cleaning'],
    default: 'available'
  },
  currentOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  isActive: { type: Boolean, default: true },
  syncedToCloud: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Table', tableSchema);
