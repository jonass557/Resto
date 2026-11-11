const express = require('express');
const Category = require('../models/Category');
const { auth, adminOnly, requireActiveSubscription } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', auth, async (req, res) => {
  try {
    const categories = await Category.find({ ...req.tenantFilter, isActive: true }).sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/categories
router.post('/', auth, adminOnly, requireActiveSubscription, async (req, res) => {
  try {
    const category = new Category({ ...req.body, restaurant: req.restaurantId || null });
    await category.save();
    const io = req.app.get('io');
    io.emit('category:created', category);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/categories/:id
router.put('/:id', auth, adminOnly, requireActiveSubscription, async (req, res) => {
  try {
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, ...req.tenantFilter },
      req.body,
      { new: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    const io = req.app.get('io');
    io.emit('category:updated', category);
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', auth, adminOnly, requireActiveSubscription, async (req, res) => {
  try {
    const deleted = await Category.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!deleted) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    const io = req.app.get('io');
    io.emit('category:deleted', req.params.id);
    res.json({ success: true, message: 'Catégorie supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
