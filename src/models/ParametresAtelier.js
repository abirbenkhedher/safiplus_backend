const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ PARAMÈTRES DE FONCTIONNEMENT D'UNE BOUTIQUE (atelier)
// Un document par boutique. Les choix d'une boutique n'impactent
// jamais les autres.
// ============================================================
const MODES_STOCK = ['desactive', 'simplifie', 'detaille'];
const MODES_SAISIE = ['reparation', 'journaliere', 'les_deux'];
const LIENS_DECLARATION = ['obligatoire', 'facultatif', 'desactive'];
const VALORISATIONS = ['CMP', 'FIFO', 'MANUEL'];

const parametresSchema = new mongoose.Schema({
  modeStock: { type: String, enum: MODES_STOCK, default: 'simplifie' },
  modeSaisieConsommation: { type: String, enum: MODES_SAISIE, default: 'les_deux' },
  lienDeclarationReparation: { type: String, enum: LIENS_DECLARATION, default: 'facultatif' },
  methodeValorisation: { type: String, enum: VALORISATIONS, default: 'CMP' },

  // Bases de calcul (documentées, cf. §8.1 / §12)
  prixTTC: { type: Boolean, default: true },      // les prix saisis sont TTC
  tauxTVA: { type: Number, default: 19, min: 0, max: 100 },
  remisesDeduites: { type: Boolean, default: true }, // les remises réduisent la base

  // Garantie / SAV : éviter les doubles commissions
  commissionSurSAV: { type: Boolean, default: false },

  // Paie
  periodicitePaie: { type: String, enum: ['mensuelle', 'hebdomadaire'], default: 'mensuelle' },

  // Historique des changements de mode de stock (§5 : validation explicite)
  historiqueModeStock: [{
    ancien: String,
    nouveau: String,
    date: { type: Date, default: Date.now },
    par: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    motif: { type: String, default: '' },
  }],

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

parametresSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
parametresSchema.index({ boutique: 1 }, { unique: true });

const ParametresAtelier = mongoose.model('ParametresAtelier', parametresSchema);
ParametresAtelier.MODES_STOCK = MODES_STOCK;
ParametresAtelier.MODES_SAISIE = MODES_SAISIE;
ParametresAtelier.LIENS_DECLARATION = LIENS_DECLARATION;
ParametresAtelier.VALORISATIONS = VALORISATIONS;

module.exports = ParametresAtelier;
