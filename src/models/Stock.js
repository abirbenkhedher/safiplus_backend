const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categorie',
    required: [true, 'La catégorie est obligatoire'],
  },
  objet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objet',
    default: null,
  },
  typeArticle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypeArticle',
    required: [true, "Le type d'article est obligatoire"],
  },
  marque: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marque',
    default: null,
  },
  modele: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Modele',
    default: null,
  },
  quantite: {
    type: Number,
    default: 0,
    min: [0, 'La quantité ne peut pas être négative'],
  },
  seuilAlerte: {
    type: Number,
    default: 2,
    min: 0,
  },
  prixIndicatif: {
    type: Number,
    default: 0,
    min: 0,
  },
  observation: { type: String, trim: true, default: '' },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// ⚠️ Unicité par combinaison complète
stockSchema.index(
  { categorie: 1, objet: 1, typeArticle: 1, marque: 1, modele: 1 },
  { unique: true }
);
stockSchema.index({ quantite: 1 });
stockSchema.index({ categorie: 1 });
stockSchema.index({ typeArticle: 1 });

module.exports = mongoose.model('Stock', stockSchema);