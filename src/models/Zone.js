const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const zoneSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom de la zone est obligatoire'],
      trim: true,
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
  },
  { timestamps: true }
);

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
zoneSchema.plugin(tenantPlugin, { scope: 'organisation' });

// ✅ Unique insensible à la casse/accents (comme Panne)
zoneSchema.index(
  { organisation: 1, nom: 1 },
  { unique: true, collation: { locale: 'fr', strength: 2 } }
);

module.exports = mongoose.model('Zone', zoneSchema);