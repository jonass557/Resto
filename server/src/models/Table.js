const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
  number: { type: Number, required: true },
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

tableSchema.index({ restaurant: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Table', tableSchema);
