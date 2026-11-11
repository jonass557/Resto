const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true, default: '' },
  country: { type: String, required: true, default: 'CI' },
  countryName: { type: String, default: '' },
  dialCode: { type: String, required: true, default: '+225' },
  phone: { type: String, required: true, trim: true },
  fullPhone: { type: String, required: true, unique: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  currency: { type: String, default: 'XOF' },
  isActive: { type: Boolean, default: true },
  subscription: {
    status: {
      type: String,
      enum: ['trial', 'active', 'expired', 'lifetime', 'deactivated'],
      default: 'trial'
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    planName: { type: String, default: 'Essai Gratuit (30 jours)' },
    planDuration: {
      type: String,
      enum: ['trial', 'mensuel', 'trimestre', 'semestriel', 'annuel', 'a_vie'],
      default: 'trial'
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    trialEndsAt: { type: Date },
    isLifetime: { type: Boolean, default: false },
    activatedBy: {
      type: String,
      enum: ['system', 'superadmin', 'ikeepay'],
      default: 'system'
    }
  }
}, { timestamps: true });

restaurantSchema.methods.getSubscriptionState = function() {
  const sub = this.subscription || {};
  const now = new Date();

  if (sub.status === 'deactivated') {
    return { status: 'deactivated', isValid: false, daysRemaining: 0, isLifetime: false };
  }
  if (sub.isLifetime || sub.status === 'lifetime') {
    return { status: 'lifetime', isValid: true, daysRemaining: null, isLifetime: true };
  }
  const expiryDate = sub.status === 'trial' ? (sub.trialEndsAt || sub.endDate) : sub.endDate;
  if (!expiryDate) {
    return { status: 'expired', isValid: false, daysRemaining: 0, isLifetime: false };
  }
  const diffMs = new Date(expiryDate).getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  if (diffMs <= 0) {
    return { status: 'expired', isValid: false, daysRemaining: 0, isLifetime: false, endDate: expiryDate };
  }
  return {
    status: sub.status === 'trial' ? 'trial' : 'active',
    isValid: true,
    daysRemaining,
    isLifetime: false,
    endDate: expiryDate
  };
};

module.exports = mongoose.model('Restaurant', restaurantSchema);
