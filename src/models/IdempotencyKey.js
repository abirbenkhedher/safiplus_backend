const mongoose = require('mongoose');

// ============================================================
// ✅ Clés d'idempotence (évite les doubles validations réseau)
// Pas de tenantPlugin : la clé inclut l'organisation et l'utilisateur.
// ============================================================
const idempotencySchema = new mongoose.Schema({
  _id: { type: String }, // org:user:method:path:key
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  statusCode: { type: Number, default: null },
  body: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

module.exports = mongoose.model('IdempotencyKey', idempotencySchema);
