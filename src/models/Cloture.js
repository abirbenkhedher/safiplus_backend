const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ CLÔTURES JOURNALIÈRES / MENSUELLES (§10)
// Une période clôturée est verrouillée (consommations, déclarations,
// commissions, paiements). Réouverture : permission dédiée + historique.
// ============================================================
const clotureSchema = new mongoose.Schema({
  type: { type: String, enum: ['journaliere', 'mensuelle'], required: true },
  periode: { type: String, required: true },  // YYYY-MM-DD ou YYYY-MM
  statut: { type: String, enum: ['cloturee', 'rouverte'], default: 'cloturee' },
  // Journal figé par réparateur au moment de la clôture
  journal: [{
    reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nom: String,
    consommations: Number,
    coutPieces: Number,
    commissions: Number,
    salaires: Number,
    primes: Number,
    avances: Number,
    paiements: Number,
  }],
  totaux: { type: mongoose.Schema.Types.Mixed, default: {} },
  historique: [{
    action: { type: String, enum: ['cloture', 'reouverture'] },
    date: { type: Date, default: Date.now },
    par: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    motif: { type: String, default: '' },
  }],
  clotureLe: { type: Date, default: Date.now },
  cloturePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

clotureSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
clotureSchema.index({ boutique: 1, type: 1, periode: 1 }, { unique: true });

module.exports = mongoose.model('Cloture', clotureSchema);
