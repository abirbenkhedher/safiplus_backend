const mongoose = require('mongoose');

const familleSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de la famille est obligatoire'],
    unique: true,
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Famille', familleSchema);