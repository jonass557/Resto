const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true }
});

const optionGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  maxSelections: { type: Number, default: 1 },
  options: [optionSchema]
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  costPrice: { type: Number, default: 0, min: 0 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: false, default: null },
  image: { type: String, default: '' },
  sku: { type: String, default: '' },
  barcode: { type: String, default: '' },
  stock: { type: Number, default: -1 }, // -1 = unlimited
  minStock: { type: Number, default: 0 },
  unit: { type: String, default: 'pièce' },
  taxRate: { type: Number, default: 0 },
  optionGroups: [optionGroupSchema],
  tags: [{ type: String }],
  isAvailable: { type: Boolean, default: true },
  isComposite: { type: Boolean, default: false },
  components: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
  }],
  preparationTime: { type: Number, default: 0 },
  order: { type: Number, default: 0 }
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, isAvailable: 1 });

module.exports = mongoose.model('Product', productSchema);
