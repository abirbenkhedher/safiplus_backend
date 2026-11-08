const mongoose = require('mongoose');

// ============================================================
// ✅ ORGANISATION (tenant) : le propriétaire / franchisé
// Une organisation possède une ou plusieurs boutiques.
// ============================================================
const organisationSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, "Le nom de l'organisation est obligatoire"],
    trim: true,
    unique: true,
  },
  telephone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  adresse: { type: String, trim: true, default: '' },
  // Nombre maximum de boutiques autorisées (0 = illimité)
  maxBoutiques: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Organisation', organisationSchema);
