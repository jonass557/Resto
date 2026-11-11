const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');

const auth = async (req, res, next) => {
  try {
    // Internal bypass: local server calling its own endpoints (e.g. print agent)
    const internalKey = req.header('X-Internal-Key');
    const fromLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (fromLocalhost && internalKey && internalKey === process.env.JWT_SECRET) {
      req.user = { _id: 'internal', role: 'admin', firstName: 'Agent', lastName: 'Impression', isActive: true };
      req.restaurantId = null;
      req.restaurant = null;
      req.tenantFilter = { $or: [{ restaurant: null }, { restaurant: { $exists: false } }] };
      return next();
    }

    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Accès non autorisé' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Utilisateur non trouvé ou désactivé' });
    }

    req.user = user;
    req.token = token;

    if (user.restaurant) {
      req.restaurantId = user.restaurant;
      req.tenantFilter = { restaurant: user.restaurant };
      req.restaurant = await Restaurant.findById(user.restaurant);
    } else {
      req.restaurantId = null;
      req.restaurant = null;
      req.tenantFilter = { $or: [{ restaurant: null }, { restaurant: { $exists: false } }] };
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: 'Accès réservé au Super Administrateur' });
  }
  next();
};

const adminOnly = (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
  }
  next();
};

const agentOrAdmin = (req, res, next) => {
  if (!['superadmin', 'admin', 'agent'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Accès non autorisé' });
  }
  next();
};

const caissierOnly = (req, res, next) => {
  if (req.user.role !== 'caissier') {
    return res.status(403).json({ success: false, message: 'Accès réservé aux caissiers' });
  }
  next();
};

const caissierOrAdmin = (req, res, next) => {
  if (!['superadmin', 'admin', 'caissier'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Accès réservé aux caissiers et administrateurs' });
  }
  next();
};

const requireActiveSubscription = (req, res, next) => {
  if (req.user.role === 'superadmin' || !req.restaurant) {
    return next();
  }
  if (!req.restaurant.isActive) {
    return res.status(403).json({
      success: false,
      subscriptionExpired: true,
      message: 'Ce compte restaurant est actuellement suspendu.'
    });
  }
  const state = req.restaurant.getSubscriptionState();
  if (!state.isValid) {
    return res.status(403).json({
      success: false,
      subscriptionExpired: true,
      message: 'Votre essai gratuit de 30 jours ou abonnement a expiré. Veuillez activer un plan dans "Abonnement & Plans".'
    });
  }
  next();
};

module.exports = {
  auth,
  superAdminOnly,
  adminOnly,
  agentOrAdmin,
  caissierOnly,
  caissierOrAdmin,
  requireActiveSubscription
};
