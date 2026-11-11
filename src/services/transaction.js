const mongoose = require('mongoose');
const logger = require('../config/logger');

// ============================================================
// ✅ Transactions MongoDB
// Utilisées si le serveur est un replica set / cluster.
// Sinon : exécution sans session (les gardes atomiques des services
// — findOneAndUpdate sur statut, index uniques — restent actives).
// ============================================================
let supported = null;

const supportsTransactions = async () => {
  if (supported !== null) return supported;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    supported = !!(hello.setName || hello.msg === 'isdbgrid');
  } catch (err) {
    supported = false;
  }
  if (!supported) {
    logger.warn('⚠️ MongoDB sans replica set : transactions désactivées (mode dégradé).');
  }
  return supported;
};

/**
 * Exécute fn(session) dans une transaction (session = null si non supporté).
 * fn peut être rejouée en cas d'erreur transitoire : elle doit être idempotente.
 */
const withTransaction = async (fn) => {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

/** Options mongoose avec session (si présente). */
const so = (session, extra = {}) => (session ? { ...extra, session } : extra);

module.exports = { withTransaction, supportsTransactions, so };
