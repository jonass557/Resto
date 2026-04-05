const express = require('express');
const Product = require('../models/Product');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/products
router.get('/', auth, async (req, res) => {
  try {
    const { category, search, isAvailable, page = 1, limit = 10000 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate('category', 'name color icon')
      .sort({ order: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: products,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category').lean();
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/products
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    await product.populate('category', 'name color icon');

    const io = req.app.get('io');
    io.emit('product:created', product);

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/products/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true
    }).populate('category', 'name color icon');

    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    const io = req.app.get('io');
    io.emit('product:updated', product);

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    const io = req.app.get('io');
    io.emit('product:deleted', req.params.id);

    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', auth, async (req, res) => {
  try {
    const { quantity, operation } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    if (product.stock !== -1) {
      if (operation === 'add') product.stock += quantity;
      else if (operation === 'subtract') product.stock = Math.max(0, product.stock - quantity);
      else product.stock = quantity;
      await product.save();
    }

    const io = req.app.get('io');
    io.emit('product:stock-updated', { id: product._id, stock: product.stock });

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
