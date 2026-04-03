const express = require('express');
const Category = require('../models/Category');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', auth, async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/categories
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const category = new Category(req.body);
    await category.save();
    const io = req.app.get('io');
    io.emit('category:created', category);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/categories/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    const io = req.app.get('io');
    io.emit('category:updated', category);
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    const io = req.app.get('io');
    io.emit('category:deleted', req.params.id);
    res.json({ success: true, message: 'Catégorie supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
