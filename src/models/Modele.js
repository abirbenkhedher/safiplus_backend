const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

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

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
modeleSchema.plugin(tenantPlugin, { scope: 'organisation' });

// Index composé : un modèle est unique par marque
modeleSchema.index({ organisation: 1, nom: 1, marque: 1 }, { unique: true });

module.exports = mongoose.model('Modele', modeleSchema);