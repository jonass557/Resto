const express = require('express');
const multer = require('multer');
const { auth, adminOnly } = require('../middleware/auth');
const { isCloudinaryConfigured, uploadBufferToCloudinary } = require('../utils/cloudinary');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées (JPEG, PNG, WEBP...)'));
    }
  }
});

// POST /api/upload/image — Upload menu item or logo image to Cloudinary
router.post('/image', auth, adminOnly, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier image envoyé' });
    }
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary n\'est pas configuré sur le serveur. Veuillez renseigner CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans .env.'
      });
    }

    try {
      const folder = req.restaurantId
        ? `restaurant-menus/${req.restaurantId}`
        : 'restaurant-menus';
      const result = await uploadBufferToCloudinary(req.file.buffer, folder);
      res.json({
        success: true,
        data: {
          url: result.secure_url,
          publicId: result.public_id
        }
      });
    } catch (uploadErr) {
      console.error('Cloudinary upload error:', uploadErr);
      res.status(500).json({
        success: false,
        message: `Échec de l'envoi vers Cloudinary: ${uploadErr.message}`
      });
    }
  });
});

module.exports = router;
