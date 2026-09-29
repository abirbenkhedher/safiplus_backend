const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

// ============================================================
// Middleware d'authentification
// ============================================================
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé. Token manquant.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Récupérer l'utilisateur complet avec permissions
    const user = await User.findById(decoded.id).select(
      '-password -refreshToken'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé.',
      });
    }

    // ✅ S'assurer que permissions est un tableau
    if (!user.permissions || !Array.isArray(user.permissions)) {
      user.permissions = User.DEFAULT_PERMISSIONS?.[user.role] || [];
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide.',
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré. Veuillez vous reconnecter.',
      });
    }

    logger.error("Erreur d'authentification:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'authentification.",
    });
  }
};

// ============================================================
// Middleware pour rafraîchir le token
// ============================================================
const requireRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token manquant.',
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalide.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalide ou expiré.',
      });
    }

    logger.error('Erreur refresh token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du rafraîchissement du token.',
    });
  }
};

// ============================================================
// ✅ EXPORTS
// - requireAuth : nom officiel
// - protect : ALIAS pour compatibilité avec les routes existantes
// ============================================================
module.exports = {
  requireAuth,
  requireRefreshToken,
  protect: requireAuth, // ✅ AJOUT : alias
  auth: requireAuth,    // ✅ alias optionnel
};