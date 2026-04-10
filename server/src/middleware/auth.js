const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Internal bypass: local server calling its own endpoints (e.g. print agent)
    const internalKey = req.header('X-Internal-Key');
    const fromLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (fromLocalhost && internalKey && internalKey === process.env.JWT_SECRET) {
      req.user = { _id: 'internal', role: 'admin', firstName: 'Agent', lastName: 'Impression', isActive: true };
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
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
  }
  next();
};

const agentOrAdmin = (req, res, next) => {
  if (!['admin', 'agent'].includes(req.user.role)) {
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
  if (!['admin', 'caissier'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Accès réservé aux caissiers et administrateurs' });
  }
  next();
};

module.exports = { auth, adminOnly, agentOrAdmin, caissierOnly, caissierOrAdmin };
