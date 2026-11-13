const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ PARAMÈTRES DE FONCTIONNEMENT D'UNE BOUTIQUE (atelier)
// Un document par boutique. Les choix d'une boutique n'impactent
// jamais les autres.
// ============================================================
const MODES_STOCK = ['desactive', 'simplifie', 'detaille'];
const VALORISATIONS = ['CMP', 'FIFO', 'MANUEL'];

const parametresSchema = new mongoose.Schema({
  modeStock: { type: String, enum: MODES_STOCK, default: 'simplifie' },
  // ✅ Consommation du stock : uniquement dans le dossier de réparation
  methodeValorisation: { type: String, enum: VALORISATIONS, default: 'CMP' },

  // Bases de calcul (documentées, cf. §8.1 / §12)
  prixTTC: { type: Boolean, default: true },      // les prix saisis sont TTC
  tauxTVA: { type: Number, default: 19, min: 0, max: 100 },
  remisesDeduites: { type: Boolean, default: true }, // les remises réduisent la base

  // Garantie / SAV : éviter les doubles commissions
  commissionSurSAV: { type: Boolean, default: false },

  // Paie
  periodicitePaie: { type: String, enum: ['mensuelle', 'hebdomadaire'], default: 'mensuelle' },

  // ✅ Gestion commerciale : en-tête des documents de vente (par boutique)
  commerce: {
    raisonSociale: { type: String, trim: true, default: '' },
    matriculeFiscal: { type: String, trim: true, default: '' },
    registreCommerce: { type: String, trim: true, default: '' },
    adresse: { type: String, trim: true, default: '' },
    telephone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    rib: { type: String, trim: true, default: '' },
    piedPage: { type: String, trim: true, default: '' },
    timbreFiscal: { type: Number, default: 1, min: 0 },
    validiteDevisJours: { type: Number, default: 15, min: 0 },
    delaiPaiementJours: { type: Number, default: 0, min: 0 },
    // Espèces refusées tant qu'aucune caisse n'est ouverte
    caisseObligatoire: { type: Boolean, default: false },
  },

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
ParametresAtelier.VALORISATIONS = VALORISATIONS;

module.exports = ParametresAtelier;
