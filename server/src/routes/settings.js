const express = require('express');
const Settings = require('../models/Settings');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings
router.get('/', auth, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/settings
router.put('/', auth, adminOnly, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();

    const io = req.app.get('io');
    io.emit('settings:updated', settings);

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
