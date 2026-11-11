const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ LOTS D'ENTRÉE (valorisation FIFO)
// Chaque entrée valorisée (achat, transfert, retour) crée un lot.
// Les sorties consomment les lots les plus anciens.
// ============================================================
const lotSchema = new mongoose.Schema({
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', required: true },
  quantiteInitiale: { type: Number, required: true, min: 0 },
  quantiteRestante: { type: Number, required: true, min: 0 },
  coutUnitaire: { type: Number, required: true, min: 0 },
  dateEntree: { type: Date, default: Date.now },
  source: { type: String, default: '' },         // ex: ACHAT:<depenseId>:<ligneId>
  isAnnule: { type: Boolean, default: false },
}, { timestamps: true });

lotSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
lotSchema.index({ stock: 1, dateEntree: 1, _id: 1 });
lotSchema.index({ boutique: 1, source: 1 });

module.exports = mongoose.model('LotStock', lotSchema);
