const express = require('express');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - List all users (admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { role, isActive, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users - Create user (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });
    }

    const user = new User({ firstName, lastName, email, password, role: role || 'agent', phone });
    await user.save();

    const io = req.app.get('io');
    io.emit('user:created', user.toJSON());

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users/:id
router.get('/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { firstName, lastName, email, role, phone, isActive, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (role) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = password;

    await user.save();

    const io = req.app.get('io');
    io.emit('user:updated', user.toJSON());

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    await User.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    io.emit('user:deleted', req.params.id);

    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
