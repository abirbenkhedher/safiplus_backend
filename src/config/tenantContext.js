const { AsyncLocalStorage } = require('async_hooks');

// ============================================================
// ✅ CONTEXTE TENANT (par requête)
// ------------------------------------------------------------
// store = {
//   organisation: ObjectId,       // organisation de l'utilisateur
//   boutiques:    [ObjectId],     // boutiques visibles pour CETTE requête
//   boutique:     ObjectId|null,  // boutique active (écritures) ; null = "toutes"
//   allowed:      [ObjectId],     // toutes les boutiques autorisées à l'utilisateur
//   system:       Boolean,        // true = pas de filtrage (scripts, routes publiques)
// }
// ============================================================
const storage = new AsyncLocalStorage();

const getTenant = () => storage.getStore();

const runWithTenant = (ctx, fn) => storage.run(ctx, fn);

/** Exécute fn sans aucun filtrage tenant (scripts, routes publiques, super admin). */
const runAsSystem = (fn) => storage.run({ system: true }, fn);

/** Middleware Express : exécute la suite de la requête sans filtrage tenant. */
const systemContext = (req, res, next) => storage.run({ system: true }, () => next());

/**
 * Middleware Express : ré-applique le contexte de req.tenant.
 * Utile après un middleware qui casse la chaîne asynchrone (ex: multer).
 */
const restoreTenant = (req, res, next) => {
  if (!req.tenant) return next();
  return storage.run(req.tenant, () => next());
};

class TenantError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TenantError';
    this.statusCode = statusCode;
  }
}

module.exports = {
  storage,
  getTenant,
  runWithTenant,
  runAsSystem,
  systemContext,
  restoreTenant,
  TenantError,
};
