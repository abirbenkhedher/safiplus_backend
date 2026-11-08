const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');
const Counter = require('./Counter');

const depenseSchema = new mongoose.Schema({
  numero: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['REPARATION', 'DIVERSE'],
    required: true,
    index: true,
  },

  montant: {
    type: Number,
    required: [true, 'Le montant est obligatoire'],
    min: [0, 'Le montant ne peut pas être négatif'],
  },

  // Catégorie libre uniquement pour DIVERSE
  categorieDiverse: {
    type: String,
    enum: ['Transport', 'Nettoyage', 'Fourniture', 'Loyer', 'Salaire', 'Autre', ''],
    default: '',
  },
  motifDiverse: {
    type: String,
    trim: true,
    default: '',
  },

  // Métadonnées (communes)
  fournisseur: { type: String, trim: true, default: '' },
  factureNumero: { type: String, trim: true, default: '' },
  dateDepense: { type: Date, default: Date.now, index: true },

  modePaiement: {
    type: String,
    enum: ['ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE'],
    default: 'ESPECES',
  },

  observation: { type: String, trim: true, default: '' },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
depenseSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

// Index
depenseSchema.index({ type: 1, dateDepense: -1 });
// ✅ Numéro unique par boutique
depenseSchema.index(
  { boutique: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);

// Génération numéro
depenseSchema.pre('validate', async function () {
  if (this.isNew && !this.numero) {
    const year = new Date().getFullYear();
    const boutiqueId = this.boutique;
    const seq = await Counter.next(`depense:${boutiqueId}:${year}`, () =>
      this.constructor.countDocuments({ boutique: boutiqueId, numero: new RegExp(`^DEP-${year}-`) })
    );
    const padded = String(seq).padStart(4, '0');
    this.numero = `DEP-${year}-${padded}`;
  }
});

module.exports = mongoose.model('Depense', depenseSchema);