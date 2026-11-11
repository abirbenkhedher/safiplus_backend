const IdempotencyKey = require('../models/IdempotencyKey');
const logger = require('../config/logger');

// ============================================================
// ✅ Middleware d'idempotence
// Si l'en-tête "Idempotency-Key" est présent :
//  - 1re requête : exécutée, réponse mémorisée (24 h)
//  - requête rejouée : même réponse renvoyée, sans ré-exécution
//  - requête simultanée : 409
// Sans en-tête : comportement normal.
// ============================================================
const idempotent = async (req, res, next) => {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (!key) return next();
  if (key.length > 100) {
    return res.status(400).json({ success: false, message: 'Idempotency-Key invalide' });
  }

  const org = req.tenant?.organisation || 'system';
  const id = `${org}:${req.user?._id}:${req.method}:${req.baseUrl}${req.path}:${key}`;

  try {
    await IdempotencyKey.create({ _id: id });
  } catch (err) {
    if (err.code !== 11000) return next(err);
    const existing = await IdempotencyKey.findById(id).lean();
    if (existing?.status === 'done') {
      res.set('Idempotent-Replay', 'true');
      return res.status(existing.statusCode || 200).json(existing.body);
    }
    return res.status(409).json({
      success: false,
      message: 'Requête identique déjà en cours de traitement.',
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const code = res.statusCode;
    // Les erreurs serveur ne sont pas mémorisées : la requête pourra être rejouée
    const op = code >= 500
      ? IdempotencyKey.deleteOne({ _id: id })
      : IdempotencyKey.updateOne({ _id: id }, { status: 'done', statusCode: code, body });
    op.catch((e) => logger.error('Idempotency save error:', e));
    return originalJson(body);
  };
  return next();
};

module.exports = { idempotent };
