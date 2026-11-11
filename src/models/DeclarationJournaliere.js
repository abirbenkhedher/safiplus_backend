const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ DÉCLARATION JOURNALIÈRE DE CONSOMMATION (§6.2)
// Une déclaration par réparateur et par jour (et par boutique).
// ============================================================
const ligneSchema = new mongoose.Schema({
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', required: true },
  designation: { type: String, default: '' },
  quantite: { type: Number, required: true, min: [1, 'Quantité invalide'] },
  reparation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reparation', default: null },
  coutManuel: { type: Number, default: null, min: 0 }, // si valorisation manuelle
  // Remplis à la validation
  coutUnitaire: { type: Number, default: null },
  coutTotal: { type: Number, default: null },
  sourceCout: { type: String, default: null },
  prixVenteUnitaire: { type: Number, default: null },
  stockPhysique: { type: Boolean, default: false },
  mouvementId: { type: mongoose.Schema.Types.ObjectId, ref: 'MouvementStock', default: null },
  // Anti-doublon (§6.3) : ligne déjà saisie dans le dossier de réparation
  statut: { type: String, enum: ['active', 'doublon_exclu', 'annulee'], default: 'active' },
  motifExclusion: { type: String, default: '' },
});

const declarationSchema = new mongoose.Schema({
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },        // jour (00:00 UTC)
  jour: { type: String, required: true },      // YYYY-MM-DD
  lignes: { type: [ligneSchema], default: [] },
  statut: {
    type: String,
    enum: ['brouillon', 'validee', 'cloturee', 'annulee'],
    default: 'brouillon',
    index: true,
  },
  observation: { type: String, trim: true, default: '' },
  coutTotal: { type: Number, default: 0 },
  valideeLe: { type: Date, default: null },
  valideePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  annuleeLe: { type: Date, default: null },
  annuleePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  motifAnnulation: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

declarationSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
// Une seule déclaration active par réparateur / jour / boutique
declarationSchema.index(
  { boutique: 1, reparateur: 1, jour: 1 },
  { unique: true, partialFilterExpression: { statut: { $in: ['brouillon', 'validee', 'cloturee'] } } }
);
declarationSchema.index({ boutique: 1, date: -1 });

module.exports = mongoose.model('DeclarationJournaliere', declarationSchema);
