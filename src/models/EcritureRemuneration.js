const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ ÉCRITURES DE RÉMUNÉRATION HORS COMMISSIONS (§9, §11.1)
// salaire : généré à la clôture de période (clé unique)
// prime / ajustement : saisie manuelle (montant signé pour ajustement)
// Jamais supprimées : annulation = contre-écriture.
// ============================================================
const ecritureSchema = new mongoose.Schema({
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['salaire', 'prime', 'ajustement'], required: true },
  periode: { type: String, required: true },   // YYYY-MM
  date: { type: Date, default: Date.now },
  montant: { type: Number, required: true },   // brut (signé)
  libelle: { type: String, trim: true, default: '' },
  contrat: { type: mongoose.Schema.Types.ObjectId, ref: 'ContratReparateur', default: null },
  cle: { type: String, default: null },        // idempotence (ex: salaire:<user>:<periode>)
  statut: { type: String, enum: ['validee', 'annulee'], default: 'validee' },
  annule: { type: mongoose.Schema.Types.ObjectId, ref: 'EcritureRemuneration', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

ecritureSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
ecritureSchema.index(
  { boutique: 1, cle: 1 },
  { unique: true, partialFilterExpression: { cle: { $type: 'string' } } }
);
ecritureSchema.index({ boutique: 1, reparateur: 1, periode: 1 });

module.exports = mongoose.model('EcritureRemuneration', ecritureSchema);
