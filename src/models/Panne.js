const mongoose = require('mongoose');

const panneSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de la panne est obligatoire'],
    trim: true,
  },
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categorie',
    required: [true, 'La catégorie est obligatoire'],
  },
  ordre: {
    type: Number,
    default: 0,
    min: [0, 'L\'ordre ne peut pas être négatif'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Index composé : une panne est unique par catégorie
panneSchema.index({ nom: 1, categorie: 1 }, { unique: true });

module.exports = mongoose.model('Panne', panneSchema);