const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const stockSchema = new mongoose.Schema({
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categorie',
    required: [true, 'La catégorie est obligatoire'],
  },
  objet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objet',
    default: null,
  },
  typeArticle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypeArticle',
    required: [true, "Le type d'article est obligatoire"],
  },
  marque: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marque',
    default: null,
  },
  modele: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Modele',
    default: null,
  },
  quantite: {
    type: Number,
    default: 0,
    min: [0, 'La quantité ne peut pas être négative'],
  },
  seuilAlerte: {
    type: Number,
    default: 2,
    min: 0,
  },
  prixIndicatif: {
    type: Number,
    default: 0,
    min: 0,
  },
  observation: { type: String, trim: true, default: '' },

  // ============================================================
  // ✅ FICHE ARTICLE (cahier des charges §4.1) — champs additionnels
  // ============================================================
  code: { type: String, trim: true, uppercase: true, default: null },
  unite: { type: String, trim: true, default: 'pièce' },
  cmp: { type: Number, default: null, min: 0 },             // coût moyen pondéré courant
  cmpQuantiteBase: { type: Number, default: 0, min: 0 },    // Q de référence en mode stock désactivé
  dernierCoutAchat: { type: Number, default: null, min: 0 },
  coutManuel: { type: Number, default: null, min: 0 },      // valorisation "coût manuel"
  commissionActive: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
stockSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

// ⚠️ Unicité par combinaison complète
stockSchema.index(
  { boutique: 1, categorie: 1, objet: 1, typeArticle: 1, marque: 1, modele: 1 },
  { unique: true }
);
// ✅ Code article unique dans la boutique (si renseigné)
stockSchema.index(
  { boutique: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
stockSchema.index({ quantite: 1 });
stockSchema.index({ categorie: 1 });
stockSchema.index({ typeArticle: 1 });

module.exports = mongoose.model('Stock', stockSchema);