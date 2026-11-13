const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ CAISSE JOURNALIÈRE (espèces) — une session ouverte max. par boutique
// Théorique = fond + règlements espèces − remboursements espèces
//           + entrées − sorties + acomptes saisis dans les dossiers de réparation
// Écart = compté − théorique (figé à la fermeture).
// ============================================================
const sessionCaisseSchema = new mongoose.Schema({
  numero: { type: String, trim: true, default: null },
  statut: { type: String, enum: ['ouverte', 'fermee'], default: 'ouverte', index: true },

  ouvertureLe: { type: Date, default: Date.now, index: true },
  ouvertPar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fondInitial: { type: Number, default: 0, min: 0 },
  fondPropose: { type: Number, default: null },      // fond laissé par la session précédente
  observationOuverture: { type: String, trim: true, default: '' },

  fermeLe: { type: Date, default: null },
  fermePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  comptage: [{ _id: false, valeur: Number, quantite: Number }], // billets / pièces (facultatif)
  montantCompte: { type: Number, default: null },
  fondLaisse: { type: Number, default: null },       // reste en caisse pour le lendemain
  remiseBanque: { type: Number, default: null },     // compté − fond laissé
  observationFermeture: { type: String, trim: true, default: '' },

  // Détail figé à la fermeture
  totaux: {
    encaissementsEspeces: Number,
    remboursementsEspeces: Number,
    entrees: Number,
    sorties: Number,
    acomptesReparations: Number,
    theorique: Number,
    autresModes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  ecart: { type: Number, default: null },

  rouvertures: [{ _id: false, date: Date, par: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, motif: String }],
}, { timestamps: true });

sessionCaisseSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
sessionCaisseSchema.index({ boutique: 1 }, { unique: true, partialFilterExpression: { statut: 'ouverte' } });
sessionCaisseSchema.index(
  { organisation: 1, boutique: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);

module.exports = mongoose.model('SessionCaisse', sessionCaisseSchema);
