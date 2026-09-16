const logger = require('../config/logger');

/**
 * ✅ Vérifier une permission COMPLÈTE (écriture + lecture)
 * L'ADMIN a toujours accès.
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié.'
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    const permissions = req.user.permissions || [];

    if (!permissions.includes(permission)) {
      logger.warn(`❌ Accès refusé: ${req.user.username} (${req.user.role}) n'a pas "${permission}"`);
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Permission "${permission}" requise.`
      });
    }

    next();
  };
};

/**
 * ✅ Vérifier une permission OU sa version :read
 * Utilisé pour les routes de LECTURE (GET)
 */
const requirePermissionOrRead = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié.'
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    const permissions = req.user.permissions || [];
    const hasFullAccess = permissions.includes(permission);
    const hasReadAccess = permissions.includes(`${permission}:read`);

    if (!hasFullAccess && !hasReadAccess) {
      logger.warn(`❌ Accès refusé (lecture): ${req.user.username} n'a ni "${permission}" ni "${permission}:read"`);
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Permission "${permission}" ou "${permission}:read" requise.`
      });
    }

    next();
  };
};

/**
 * ✅ Vérifier au moins une permission parmi une liste
 */
const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié.'
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAccess = permissions.some(p => userPermissions.includes(p));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Au moins une permission requise: ${permissions.join(', ')}`
      });
    }

    next();
  };
};

module.exports = {
  requirePermission,
  requirePermissionOrRead,
  requireAnyPermission,
};