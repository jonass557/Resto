const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Compte désactivé' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    // Use updateOne to bypass bcrypt pre-save hook (avoids ~800ms re-hash)
    const loginTime = new Date();
    User.updateOne({ _id: user._id }, { $set: { lastLogin: loginTime } }).catch(() => {});

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    // Send response immediately, then notify admin asynchronously
    const userData = user.toJSON();
    userData.lastLogin = loginTime;
    res.json({ success: true, data: { user: userData, token } });

    // Fire-and-forget notification (does not block response)
    if (user.role === 'agent') {
      Notification.create({
        type: 'agent_login',
        title: 'Connexion agent',
        message: `${user.firstName} ${user.lastName} s'est connecté(e)`,
        agent: user._id,
        data: { loginTime }
      }).then(notif => {
        req.app.get('io').emit('notification:new', notif);
      }).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    res.json({ success: true, data: req.user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/profile — admin only (agents cannot modify their own profile)
router.put('/profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Seul l\'administrateur peut modifier les profils' });
    }

    const { firstName, lastName, phone, avatar, settings } = req.body;
    const user = await User.findById(req.user._id);

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;
    if (settings) user.settings = { ...user.settings, ...settings };

    await user.save();
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/password — admin only (agents cannot change passwords)
router.put('/password', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Seul l\'administrateur peut modifier les mots de passe' });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 4 chiffres' });
    }
    if (!/^\d+$/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir uniquement des chiffres' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/password/:userId — admin changes any user's password
router.put('/password/:userId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Seul l\'administrateur peut modifier les mots de passe' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 4 chiffres' });
    }
    if (!/^\d+$/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir uniquement des chiffres' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: `Mot de passe de ${user.firstName} ${user.lastName} mis à jour` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
