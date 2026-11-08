const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

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
  // ============================================================
  // ✅ NOUVEAU : Réparateurs autorisés pour cette catégorie
  //    - [] (vide) = aucune restriction → tous les réparateurs
  //    - [id1, id2] = uniquement ces réparateurs
  // ============================================================
  reparateurs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: [],
  }],
}, {
  timestamps: true
});

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
categorieSchema.plugin(tenantPlugin, { scope: 'organisation' });

// Index composé unique pour éviter les doublons par famille
categorieSchema.index({ organisation: 1, famille: 1, nom: 1 }, { unique: true });

module.exports = mongoose.model('Categorie', categorieSchema);