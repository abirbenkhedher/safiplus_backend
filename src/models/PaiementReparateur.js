const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ AVANCES ET PAIEMENTS DES RÉPARATEURS (§9)
// Ne modifient jamais le gain brut : ils réduisent le solde dû.
// ============================================================
const paiementSchema = new mongoose.Schema({
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['avance', 'paiement'], required: true },
  montant: { type: Number, required: true, min: [0.001, 'Montant invalide'] },
  date: { type: Date, default: Date.now },
  periode: { type: String, required: true },   // YYYY-MM
  modePaiement: { type: String, enum: ['ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE'], default: 'ESPECES' },
  reference: { type: String, trim: true, default: '' },
  observation: { type: String, trim: true, default: '' },
  statut: { type: String, enum: ['validee', 'annulee'], default: 'validee' },
  annuleLe: { type: Date, default: null },
  annulePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  motifAnnulation: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

paiementSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
paiementSchema.index({ boutique: 1, reparateur: 1, date: -1 });

module.exports = mongoose.model('PaiementReparateur', paiementSchema);
