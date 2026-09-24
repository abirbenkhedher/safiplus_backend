const mongoose = require('mongoose');

const marqueSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de la marque est obligatoire'],
    trim: true,
  },
  objet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objet',
    required: [true, 'L\'objet est obligatoire'],
  },
  ordre: {
    type: Number,
    default: 0,
    min: [0, 'L\'ordre ne peut pas être négatif'],
  },
}, {
  timestamps: true,
});

// Index composé : une marque est unique par objet
marqueSchema.index({ nom: 1, objet: 1 }, { unique: true });

module.exports = mongoose.model('Marque', marqueSchema);