const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const typeArticleSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, "Le nom du type d'article est obligatoire"],
    trim: true,
  },
  ordre: {
    type: Number,
    default: 999,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
typeArticleSchema.plugin(tenantPlugin, { scope: 'organisation' });

// ✅ Unicité insensible à la casse
typeArticleSchema.index(
  { organisation: 1, nom: 1 },
  { unique: true, collation: { locale: 'fr', strength: 2 } }
);
typeArticleSchema.index({ ordre: 1 });

module.exports = mongoose.model('TypeArticle', typeArticleSchema);