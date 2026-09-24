const mongoose = require('mongoose');

const categorieSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de la catégorie est obligatoire'],
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères']
  },
  famille: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Famille',
    required: [true, 'La famille est obligatoire']
  },
  ordre: {
    type: Number,
    default: 0,
    min: [0, 'L\'ordre ne peut pas être négatif'],
  },
}, {
  timestamps: true
});

// Index composé unique pour éviter les doublons par famille
categorieSchema.index({ famille: 1, nom: 1 }, { unique: true });

module.exports = mongoose.model('Categorie', categorieSchema);