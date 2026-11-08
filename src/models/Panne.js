const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

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

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
panneSchema.plugin(tenantPlugin, { scope: 'organisation' });

// ============================================================
// ✅ Index composé unique (nom + catégorie) avec collation
// Insensible à la casse et aux accents pour éviter les doublons
// type "Écran cassé" / "ecran casse"
// ============================================================
panneSchema.index(
  { organisation: 1, nom: 1, categorie: 1 },
  {
    unique: true,
    collation: { locale: 'fr', strength: 2 },
  }
);

module.exports = mongoose.model('Panne', panneSchema);