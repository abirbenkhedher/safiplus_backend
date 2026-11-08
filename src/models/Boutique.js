const mongoose = require('mongoose');

// ============================================================
// ✅ BOUTIQUE : un point de vente / atelier d'une organisation
// ============================================================
const boutiqueSchema = new mongoose.Schema({
  organisation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organisation',
    required: [true, "L'organisation est obligatoire"],
    index: true,
  },
  nom: {
    type: String,
    required: [true, 'Le nom de la boutique est obligatoire'],
    trim: true,
  },
  // Code court utilisé comme préfixe des numéros (ex: "TUN1" → TUN1-R20260001)
  code: {
    type: String,
    required: [true, 'Le code de la boutique est obligatoire'],
    trim: true,
    uppercase: true,
    unique: true,
    match: [/^[A-Z0-9]{2,8}$/, 'Code : 2 à 8 caractères (lettres/chiffres)'],
  },
  adresse: { type: String, trim: true, default: '' },
  telephone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

boutiqueSchema.index({ organisation: 1, nom: 1 }, { unique: true });

module.exports = mongoose.model('Boutique', boutiqueSchema);
