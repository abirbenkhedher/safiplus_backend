// ============================================================
// ✅ Modules souscrits par l'organisation (formule SaaS)
// Le contexte tenant (middleware/auth) porte ctx.modules.
// Backoffice super admin (contexte système) : non concerné.
// ============================================================
const LIBELLES = { commercial: 'Gestion commerciale' };

const requireModule = (nom) => (req, res, next) => {
  const ctx = req.tenant || {};
  if (ctx.system) return next();
  if (ctx.modules && ctx.modules[nom] === false) {
    return res.status(403).json({
      success: false,
      code: 'MODULE_INACTIF',
      message: `Le module « ${LIBELLES[nom] || nom} » n'est pas activé pour votre société.`,
    });
  }
  return next();
};

module.exports = { requireModule };
