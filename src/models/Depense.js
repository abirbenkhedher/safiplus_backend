const mongoose = require('mongoose');

const depenseSchema = new mongoose.Schema({
  numero: {
    type: String,
    unique: true,
    trim: true,
    sparse: true,
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

// Index
depenseSchema.index({ type: 1, dateDepense: -1 });
depenseSchema.index({ numero: 1 }, { unique: true });

// Génération numéro
depenseSchema.pre('validate', async function () {
  if (this.isNew && !this.numero) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    const padded = String(count + 1).padStart(4, '0');
    this.numero = `DEP-${year}-${padded}`;
  }
});

module.exports = mongoose.model('Depense', depenseSchema);