const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ✅ Fournisseurs : partagés par toutes les boutiques d'une organisation
const fournisseurSchema = new mongoose.Schema({
  nom: { type: String, required: [true, 'Le nom est obligatoire'], trim: true },
  telephone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  adresse: { type: String, trim: true, default: '' },
  matriculeFiscal: { type: String, trim: true, default: '' },
  observation: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

fournisseurSchema.plugin(tenantPlugin, { scope: 'organisation' });
fournisseurSchema.index(
  { organisation: 1, nom: 1 },
  { unique: true, collation: { locale: 'fr', strength: 2 } }
);

module.exports = mongoose.model('Fournisseur', fournisseurSchema);
