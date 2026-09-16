// Vérifier que l'utilisateur a un rôle spécifique
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié.'
      });
    }

    const userRole = req.user.role;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôle requis: ${roles.join(' ou ')}`
      });
    }

    next();
  };
};

// Vérifier que l'utilisateur est ADMIN
const requireAdmin = requireRole(['ADMIN']);

// Vérifier que l'utilisateur est ADMIN ou COMMERCIAL
const requireAdminOrCommercial = requireRole(['ADMIN', 'COMMERCIAL']);

// Vérifier que l'utilisateur est ADMIN ou REPARATEUR
const requireAdminOrReparateur = requireRole(['ADMIN', 'REPARATEUR']);

// Vérifier que l'utilisateur est ADMIN ou c'est son propre compte
const requireAdminOrSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Utilisateur non authentifié.'
    });
  }

  if (req.user.role === 'ADMIN' || req.user.id === req.params.id) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Accès refusé.'
  });
};

module.exports = {
  requireRole,
  requireAdmin,
  requireAdminOrCommercial,
  requireAdminOrReparateur,
  requireAdminOrSelf
};