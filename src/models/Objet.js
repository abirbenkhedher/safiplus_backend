const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const objetSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de l\'objet est obligatoire'],
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

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
objetSchema.plugin(tenantPlugin, { scope: 'organisation' });

// ✅ Nom unique par organisation
objetSchema.index({ organisation: 1, nom: 1 }, { unique: true });

module.exports = mongoose.model('Objet', objetSchema);