const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organisation = require('../models/Organisation');
const Boutique = require('../models/Boutique');
const logger = require('../config/logger');
const { runWithTenant } = require('../config/tenantContext');

// ============================================================
// ✅ MULTI-TENANT : calcul du contexte (organisation + boutiques)
// ------------------------------------------------------------
// - SUPER_ADMIN : contexte "system" (gestion de la plateforme)
// - Propriétaire (isOwner) : toutes les boutiques actives de son organisation
// - Autres : uniquement les boutiques qui lui sont affectées
// - En-tête "X-Boutique-Id" : boutique active (ou "all" = toutes)
// ============================================================
const buildTenantContext = async (user, req) => {
  if (user.role === 'SUPER_ADMIN') {
    // Sans boutique choisie → backoffice (contexte "system")
    const header = String(req.headers['x-boutique-id'] || '').trim();
    if (!header || header === 'all') {
      return { ok: true, ctx: { system: true, superAdmin: true } };
    }
    // Boutique choisie → le super admin entre dans la boutique comme son propriétaire
    const shop = mongoose.isValidObjectId(header)
      ? await Boutique.findById(header).select('organisation').lean()
      : null;
    if (!shop) {
      return {
        ok: false,
        status: 403,
        message: 'Boutique introuvable.',
        code: 'BOUTIQUE_FORBIDDEN',
      };
    }
    const siblings = await Boutique.find({ organisation: shop.organisation }).select('_id').lean();
    return {
      ok: true,
      ctx: {
        organisation: shop.organisation,
        boutiques: [shop._id],
        boutique: shop._id,
        allowed: siblings.map((b) => b._id),
        isOwner: true,
        superAdmin: true,
      },
    };
  }

  if (!user.organisation) {
    return { ok: false, status: 403, message: 'Aucune organisation associée à ce compte.' };
  }

  const org = await Organisation.findById(user.organisation).select('isActive').lean();
  if (!org || !org.isActive) {
    return { ok: false, status: 403, message: 'Organisation désactivée. Contactez le support.' };
  }

  const query = { organisation: user.organisation, isActive: true };
  if (!user.isOwner) query._id = { $in: user.boutiques || [] };

  const boutiques = await Boutique.find(query).select('_id').lean();
  const allowed = boutiques.map((b) => b._id);

  if (allowed.length === 0) {
    return {
      ok: false,
      status: 403,
      message: "Aucune boutique active n'est affectée à votre compte.",
      code: 'NO_BOUTIQUE',
    };
  }

  const header = String(req.headers['x-boutique-id'] || '').trim();
  let active = null;
  let visible = allowed;

  if (header && header !== 'all') {
    active = allowed.find((b) => String(b) === header);
    if (!active) {
      return {
        ok: false,
        status: 403,
        message: "Vous n'avez pas accès à cette boutique.",
        code: 'BOUTIQUE_FORBIDDEN',
      };
    }
    visible = [active];
  } else if (allowed.length === 1) {
    active = allowed[0];
  }

  return {
    ok: true,
    ctx: {
      organisation: new mongoose.Types.ObjectId(String(user.organisation)),
      boutiques: visible,
      boutique: active,
      allowed,
      isOwner: !!user.isOwner,
    },
  };
};

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

    // ✅ Contexte multi-tenant
    const tenant = await buildTenantContext(user, req);
    if (!tenant.ok) {
      return res.status(tenant.status).json({
        success: false,
        message: tenant.message,
        code: tenant.code,
      });
    }
    req.tenant = tenant.ctx;

    // Toute la suite de la requête s'exécute dans ce contexte :
    // les modèles filtrent automatiquement par organisation / boutique.
    return runWithTenant(req.tenant, () => next());
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

    // ✅ Le SUPER_ADMIN passe tous les contrôles de rôle
    if (req.user.role !== 'SUPER_ADMIN' && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle requis: ${roles.join(' ou ')}`,
      });
    }

    next();
  };
};

const requireAdmin = requireRole(['ADMIN']);
const requireSuperAdmin = requireRole(['SUPER_ADMIN']);

// Propriétaire de l'organisation (ADMIN + isOwner) ou SUPER_ADMIN
const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Utilisateur non authentifié.' });
  }
  if (req.user.role === 'SUPER_ADMIN' || (req.user.role === 'ADMIN' && req.user.isOwner)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Accès réservé au propriétaire de l'organisation.",
  });
};
const requireAdminOrCommercial = requireRole(['ADMIN', 'COMMERCIAL']);
const requireAdminOrReparateur = requireRole(['ADMIN', 'REPARATEUR']);

const requireAdminOrSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.',
    });
  }

  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) || req.user.id === req.params.id) {
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
  requireSuperAdmin,
  requireOwner,
  buildTenantContext,
  requireAdminOrCommercial,
  requireAdminOrReparateur,
  requireAdminOrSelf,
};