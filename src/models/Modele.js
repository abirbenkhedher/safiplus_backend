const mongoose = require('mongoose');

const modeleSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom du modèle est obligatoire'],
    trim: true,
  },
  marque: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marque',
    required: [true, 'La marque est obligatoire'],
  },
  ordre: {
    type: Number,
    default: 0,
    min: [0, 'L\'ordre ne peut pas être négatif'],
  },
}, {
  timestamps: true,
});

// Index composé : un modèle est unique par marque
modeleSchema.index({ nom: 1, marque: 1 }, { unique: true });

module.exports = mongoose.model('Modele', modeleSchema);