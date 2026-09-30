const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

// ============================================================
// ✅ CONFIGURATION INACTIVITÉ
// ============================================================
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 1 minute (à ajuster : 10 * 60 * 1000 pour 10 min)
const AUTO_LOGOUT_ROLES = ['COMMERCIAL'];

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

    // ============================================================
    // ✅ CONTRÔLE D'INACTIVITÉ (COMMERCIAL uniquement)
    // ============================================================
    if (AUTO_LOGOUT_ROLES.includes(user.role)) {
      const now = Date.now();

      // Si lastActivity n'existe pas (première connexion), on l'initialise
      if (!user.lastActivity) {
        await User.updateOne(
          { _id: user._id },
          { $set: { lastActivity: new Date(now) } }
        );
      } else {
        const elapsed = now - new Date(user.lastActivity).getTime();

        if (elapsed > INACTIVITY_LIMIT_MS) {
          // ✅ Invalider le refresh token ET réinitialiser lastActivity
          // pour éviter que la prochaine connexion soit immédiatement bloquée
          await User.updateOne(
            { _id: user._id },
            {
              $unset: { refreshToken: 1 },
              $set: { lastActivity: new Date(now) },
            }
          );

          return res.status(401).json({
            success: false,
            message:
              'Session expirée pour inactivité. Veuillez vous reconnecter.',
            code: 'INACTIVITY_TIMEOUT',
          });
        }
      }
    }

    // ✅ Mettre à jour la dernière activité (sans bloquer la requête)
    User.updateOne(
      { _id: user._id },
      { $set: { lastActivity: new Date() } }
    ).catch((err) => logger.error('Erreur update lastActivity:', err));

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
// Middleware de vérification de rôle
// ============================================================
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle requis: ${roles.join(' ou ')}`,
      });
    }

    next();
  };
};

const requireAdmin = requireRole(['ADMIN']);
const requireAdminOrCommercial = requireRole(['ADMIN', 'COMMERCIAL']);
const requireAdminOrReparateur = requireRole(['ADMIN', 'REPARATEUR']);

const requireAdminOrSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.',
    });
  }

  if (req.user.role === 'ADMIN' || req.user.id === req.params.id) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Accès refusé.',
  });
};

// ============================================================
// ✅ EXPORTS
// ============================================================
module.exports = {
  requireAuth,
  requireRefreshToken,
  protect: requireAuth,
  auth: requireAuth,
  requireRole,
  requireAdmin,
  requireAdminOrCommercial,
  requireAdminOrReparateur,
  requireAdminOrSelf,
};