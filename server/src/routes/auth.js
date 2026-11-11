const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Settings = require('../models/Settings');
const Table = require('../models/Table');
const PlatformSettings = require('../models/PlatformSettings');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

const router = express.Router();

const XOF_COUNTRIES = new Set(['CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'NE', 'GW']);
const XAF_COUNTRIES = new Set(['CM', 'GA', 'CG', 'TD', 'CF', 'GQ']);
const EUR_COUNTRIES = new Set(['FR', 'BE', 'DE', 'ES', 'IT', 'PT', 'NL', 'LU', 'AT', 'IE', 'FI', 'GR']);

function getDefaultCurrencyForCountry(countryCode) {
  const code = (countryCode || '').toUpperCase();
  if (XOF_COUNTRIES.has(code)) return { currency: 'XOF', symbol: 'FCFA' };
  if (XAF_COUNTRIES.has(code)) return { currency: 'XAF', symbol: 'FCFA' };
  if (EUR_COUNTRIES.has(code)) return { currency: 'EUR', symbol: '€' };
  if (code === 'CD') return { currency: 'CDF', symbol: 'FC' };
  if (code === 'GN') return { currency: 'GNF', symbol: 'GNF' };
  if (code === 'MA') return { currency: 'MAD', symbol: 'DH' };
  if (code === 'DZ') return { currency: 'DZD', symbol: 'DA' };
  if (code === 'TN') return { currency: 'TND', symbol: 'DT' };
  if (code === 'CA') return { currency: 'CAD', symbol: '$' };
  if (code === 'US') return { currency: 'USD', symbol: '$' };
  if (code === 'GB') return { currency: 'GBP', symbol: '£' };
  return { currency: 'XOF', symbol: 'FCFA' };
}

function normalizePhoneDigits(val) {
  return (val || '').replace(/\D/g, '');
}

async function formatUserResponse(user) {
  const userData = user.toJSON ? user.toJSON() : { ...user };
  delete userData.password;
  if (user.restaurant) {
    const rest = await Restaurant.findById(user.restaurant).populate('subscription.plan');
    if (rest) {
      const subState = rest.getSubscriptionState();
      userData.restaurantData = {
        _id: rest._id,
        name: rest.name,
        country: rest.country,
        countryName: rest.countryName,
        dialCode: rest.dialCode,
        phone: rest.phone,
        fullPhone: rest.fullPhone,
        email: rest.email,
        currency: rest.currency,
        isActive: rest.isActive,
        subscription: {
          ...rest.subscription.toObject(),
          effectiveStatus: subState.status,
          isValid: subState.isValid,
          daysRemaining: subState.daysRemaining,
          isLifetime: subState.isLifetime
        }
      };
    }
  }
  return userData;
}

// POST /api/auth/register - Register a new restaurant with 30-day free trial
router.post('/register', async (req, res) => {
  try {
    const {
      restaurantName,
      email,
      country = 'CI',
      countryName = '',
      dialCode = '+225',
      phone,
      password
    } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });
    }
    if (!password || password.length < 5 || password.length > 12) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe (code) doit contenir entre 5 et 6 chiffres (ou au moins 5 caractères)'
      });
    }

    const cleanLocalPhone = normalizePhoneDigits(phone);
    const cleanDial = normalizePhoneDigits(dialCode);
    if (!cleanLocalPhone || cleanLocalPhone.length < 6) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });
    }
    const fullPhone = `${cleanDial}${cleanLocalPhone}`;

    // Check existing restaurant/user by fullPhone
    const existingRest = await Restaurant.findOne({ fullPhone });
    if (existingRest) {
      return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà associé à un restaurant' });
    }

    // Check email uniqueness if provided
    const cleanEmail = email && email.trim() ? email.toLowerCase().trim() : undefined;
    if (cleanEmail) {
      const existingEmailUser = await User.findOne({ email: cleanEmail });
      if (existingEmailUser) {
        return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });
      }
    }

    // Determine trial duration (default 30 days)
    const platformSettings = await PlatformSettings.findOne();
    const trialDays = platformSettings?.trialDays || 30;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const { currency, symbol } = getDefaultCurrencyForCountry(country);

    const restTitle = (restaurantName && restaurantName.trim())
      ? restaurantName.trim()
      : `Restaurant ${cleanLocalPhone.slice(-4)}`;

    // Create Restaurant
    const restaurant = new Restaurant({
      name: restTitle,
      email: cleanEmail || '',
      country: (country || 'CI').toUpperCase(),
      countryName,
      dialCode: dialCode.startsWith('+') ? dialCode : `+${cleanDial}`,
      phone: cleanLocalPhone,
      fullPhone,
      currency,
      isActive: true,
      subscription: {
        status: 'trial',
        planName: `Essai Gratuit (${trialDays} jours)`,
        planDuration: 'trial',
        startDate: now,
        endDate: trialEndsAt,
        trialEndsAt,
        isLifetime: false,
        activatedBy: 'system'
      }
    });
    await restaurant.save();

    // Create Admin user for this restaurant
    const userPayload = {
      firstName: restTitle,
      lastName: 'Admin',
      password,
      role: 'admin',
      restaurant: restaurant._id,
      phone: cleanLocalPhone,
      country: (country || 'CI').toUpperCase(),
      dialCode: restaurant.dialCode,
      fullPhone,
      isActive: true
    };
    if (cleanEmail) userPayload.email = cleanEmail;

    const user = new User(userPayload);
    await user.save();

    restaurant.owner = user._id;
    await restaurant.save();

    // Initialize default settings & starter tables for this restaurant
    await Settings.create({
      restaurant: restaurant._id,
      restaurantName: restTitle,
      phone: `${restaurant.dialCode} ${cleanLocalPhone}`,
      email: cleanEmail || '',
      currency,
      currencySymbol: symbol
    });

    const starterTables = [1, 2, 3, 4, 5].map(n => ({
      restaurant: restaurant._id,
      number: n,
      name: `Table ${n}`,
      capacity: 4,
      zone: 'Salle principale'
    }));
    await Table.insertMany(starterTables).catch(() => {});

    const token = jwt.sign({ id: user._id, role: user.role, restaurant: restaurant._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const userData = await formatUserResponse(user);

    res.status(201).json({
      success: true,
      message: `Bienvenue ! Votre restaurant dispose de ${trialDays} jours d'essai gratuit.`,
      data: { user: userData, token }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Mot de passe requis' });
    }

    const loginId = (identifier || email || phone || '').trim();
    let user = null;

    if (loginId) {
      if (loginId.includes('@')) {
        // Login par email
        user = await User.findOne({ email: loginId.toLowerCase() });
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
      } else {
        // Login par numéro de téléphone (avec ou sans indicatif)
        const digits = normalizePhoneDigits(loginId);
        const candidates = await User.find({
          isActive: true,
          $or: [
            { fullPhone: digits },
            { phone: digits },
            { phone: loginId },
            ...(digits.length >= 6 ? [{ fullPhone: new RegExp(`${digits}$`) }] : [])
          ]
        });
        for (const u of candidates) {
          const matches = await u.comparePassword(password);
          if (matches) { user = u; break; }
        }
        if (!user) {
          return res.status(401).json({ success: false, message: 'Identifiants invalides' });
        }
      }
    } else {
      // Login par mot de passe/PIN seul (email optionnel) — jamais superadmin par PIN seul
      const activeUsers = await User.find({ isActive: true, role: { $ne: 'superadmin' } }).sort({ updatedAt: -1 });
      for (const u of activeUsers) {
        const matches = await u.comparePassword(password);
        if (matches) { user = u; break; }
      }
      if (!user) {
        return res.status(401).json({ success: false, message: 'Identifiants invalides' });
      }
    }

    // Use updateOne to bypass bcrypt pre-save hook (avoids ~800ms re-hash)
    const loginTime = new Date();
    User.updateOne({ _id: user._id }, { $set: { lastLogin: loginTime } }).catch(() => {});

    const token = jwt.sign(
      { id: user._id, role: user.role, restaurant: user.restaurant || null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const userData = await formatUserResponse(user);
    userData.lastLogin = loginTime;
    res.json({ success: true, data: { user: userData, token } });

    // Fire-and-forget notification (does not block response)
    if (user.role === 'agent') {
      Notification.create({
        restaurant: user.restaurant || null,
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
    const userData = await formatUserResponse(req.user);
    res.json({ success: true, data: userData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/profile — admin / superadmin
router.put('/profile', auth, async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
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

// PUT /api/auth/password — admin / superadmin
router.put('/password', auth, async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Seul l\'administrateur peut modifier les mots de passe' });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 4 caractères' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/password/:userId — admin changes any user's password in same restaurant
router.put('/password/:userId', auth, async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Seul l\'administrateur peut modifier les mots de passe' });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 4 caractères' });
    }

    const query = req.user.role === 'superadmin'
      ? { _id: req.params.userId }
      : { _id: req.params.userId, ...req.tenantFilter };
    const user = await User.findOne(query);
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
