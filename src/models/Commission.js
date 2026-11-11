const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ COMMISSION CALCULÉE (§3.3, §11.1)
// Contient un INSTANTANÉ de la règle appliquée : une modification
// ultérieure d'une règle ne change jamais une commission existante.
// cleSource unique → aucune double commission.
// ============================================================
const commissionSchema = new mongoose.Schema({
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Source
  sourceType: {
    type: String,
    enum: ['PIECE_REPARATION', 'INTERVENTION', 'LIGNE_DECLARATION', 'AJUSTEMENT'],
    required: true,
  },
  reparation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reparation', default: null },
  declaration: { type: mongoose.Schema.Types.ObjectId, ref: 'DeclarationJournaliere', default: null },
  sourceLigneId: { type: mongoose.Schema.Types.ObjectId, default: null },
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', default: null },
  panne: { type: String, default: null },
  cleBase: { type: String, required: true },    // identifie la source (ex: PIECE:<rep>:<piece>:<user>)
  cleSource: { type: String, required: true },  // cleBase#n (version) ou cleBase#n:annul
  dateSource: { type: Date, required: true },   // date de l'opération (période)
  periode: { type: String, required: true },    // YYYY-MM

  quantite: { type: Number, default: 1 },
  partPourcentage: { type: Number, default: 100 }, // intervention partagée

  // Instantané de la règle
  regle: { type: mongoose.Schema.Types.ObjectId, ref: 'RegleCommission', default: null },
  regleSnapshot: {
    typeCalcul: String,
    base: String,
    taux: Number,
    montantFixe: Number,
    paliers: mongoose.Schema.Types.Mixed,
    version: Number,
    niveau: String,
  },
  baseMontant: { type: Number, default: 0 },
  montant: { type: Number, required: true },

  statut: {
    type: String,
    enum: ['calculee', 'validee', 'annulee'],
    default: 'calculee',
    index: true,
  },
  // Contre-écriture : référence vers la commission annulée
  annule: { type: mongoose.Schema.Types.ObjectId, ref: 'Commission', default: null },
  motif: { type: String, default: '' },
  valideeLe: { type: Date, default: null },
  valideePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

commissionSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
commissionSchema.index({ boutique: 1, cleSource: 1 }, { unique: true });
commissionSchema.index({ boutique: 1, cleBase: 1 });
commissionSchema.index({ boutique: 1, reparateur: 1, periode: 1, statut: 1 });
commissionSchema.index({ boutique: 1, dateSource: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
