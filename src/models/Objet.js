const mongoose = require('mongoose');

const objetSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de l\'objet est obligatoire'],
    unique: true,
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères']
  },
  ordre: {
    type: Number,
    default: 0,
    min: [0, 'L\'ordre ne peut pas être négatif'],
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('Objet', objetSchema);