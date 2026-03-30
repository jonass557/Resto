const express = require('express');
const Table = require('../models/Table');
const Order = require('../models/Order');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/tables
router.get('/', auth, async (req, res) => {
  try {
    const { status, zone } = req.query;
    const filter = { isActive: true };
    if (status) filter.status = status;
    if (zone) filter.zone = zone;

    const tables = await Table.find(filter)
      .populate({ path: 'currentOrders', populate: { path: 'items.product', select: 'name' } })
      .sort({ number: 1 });

    // Auto-nettoyage : libérer les tables occupées sans commandes actives
    const toFree = tables.filter(t => {
      if (t.status !== 'occupied') return false;
      const hasActive = t.currentOrders?.some(o => !['cancelled', 'paid'].includes(o.status));
      return !hasActive;
    });

    if (toFree.length > 0) {
      const ids = toFree.map(t => t._id);
      await Table.updateMany({ _id: { $in: ids } }, { status: 'available', currentOrders: [] });
      const io = req.app.get('io');
      ids.forEach(id => io.emit('table:updated', { tableId: id.toString(), status: 'available' }));
      toFree.forEach(t => { t.status = 'available'; t.currentOrders = []; });
    }

    res.json({ success: true, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tables (agents and admins can create)
router.post('/', auth, async (req, res) => {
  try {
    const table = new Table(req.body);
    await table.save();
    const io = req.app.get('io');
    io.emit('table:created', table);
    res.status(201).json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/tables/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table non trouvée' });
    const io = req.app.get('io');
    io.emit('table:updated', table);
    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/tables/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const table = await Table.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table non trouvée' });
    const io = req.app.get('io');
    io.emit('table:status-changed', { id: table._id, status });
    res.json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/tables/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await Table.findByIdAndDelete(req.params.id);
    const io = req.app.get('io');
    io.emit('table:deleted', req.params.id);
    res.json({ success: true, message: 'Table supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
