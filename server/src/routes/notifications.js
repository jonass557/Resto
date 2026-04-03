const express = require('express');
const Notification = require('../models/Notification');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications - Get all notifications (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { limit = 50, unreadOnly } = req.query;
    const filter = {};
    if (unreadOnly === 'true') filter.isRead = false;

    const notifications = await Notification.find(filter)
      .populate('agent', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const unreadCount = await Notification.countDocuments({ isRead: false });

    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', auth, adminOnly, async (req, res) => {
  try {
    await Notification.updateMany({ isRead: false }, { isRead: true });
    res.json({ success: true, message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, adminOnly, async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!notif) return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    res.json({ success: true, data: notif });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications/:id - Supprimer une activité individuelle
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const notif = await Notification.findByIdAndDelete(req.params.id);
    if (!notif) return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    res.json({ success: true, message: 'Activité supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications - Supprimer toutes les activités
router.delete('/', auth, adminOnly, async (req, res) => {
  try {
    await Notification.deleteMany({});
    res.json({ success: true, message: 'Toutes les activités supprimées' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
