const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ RÈGLE DE COMMISSION (versionnée, commune à la société ; exception par boutique possible)
// Ciblage : réparateur (null = tous) × [article | catégorie | type
// d'article | panne/intervention] (tous null = règle générale).
// Une règle déjà utilisée n'est jamais modifiée : nouvelle version.
// ============================================================
const CALC_TYPES = ['pourcentage', 'fixe_unite', 'forfait_intervention', 'palier'];
const BASES = ['prix_vente', 'main_oeuvre', 'marge', 'cout_achat'];

const palierSchema = new mongoose.Schema({
  de: { type: Number, required: true, min: 0 },      // quantité / nb interventions (inclus)
  a: { type: Number, default: null },                // inclus ; null = illimité
  taux: { type: Number, default: null, min: 0 },     // % (si renseigné)
  montant: { type: Number, default: null, min: 0 },  // montant fixe par unité
}, { _id: false });

const regleSchema = new mongoose.Schema({
  nom: { type: String, trim: true, default: '' },
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', default: null },
  categorie: { type: mongoose.Schema.Types.ObjectId, ref: 'Categorie', default: null },
  typeArticle: { type: mongoose.Schema.Types.ObjectId, ref: 'TypeArticle', default: null },
  panne: { type: String, trim: true, default: null }, // type d'intervention (nom de panne)

  typeCalcul: { type: String, enum: CALC_TYPES, required: true },
  base: { type: String, enum: BASES, default: 'prix_vente' },
  taux: { type: Number, default: 0, min: 0, max: 100 },
  montantFixe: { type: Number, default: 0, min: 0 },
  paliers: { type: [palierSchema], default: [] },

  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  priorite: { type: Number, default: 0 },
  actif: { type: Boolean, default: true },

  version: { type: Number, default: 1 },
  remplace: { type: mongoose.Schema.Types.ObjectId, ref: 'RegleCommission', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// ✅ Règles communes à la société ; boutiqueCible = exception pour une seule boutique
regleSchema.plugin(tenantPlugin, { scope: 'organisation' });
regleSchema.add({ boutiqueCible: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', default: null } });
regleSchema.index({ organisation: 1, actif: 1, validFrom: 1 });

regleSchema.pre('validate', function () {
  const targets = [this.article, this.categorie, this.typeArticle, this.panne].filter(Boolean);
  if (targets.length > 1) {
    this.invalidate('article', 'Une règle cible un seul élément : article, catégorie, type ou intervention');
  }
  if (this.typeCalcul === 'forfait_intervention' && (this.article || this.categorie || this.typeArticle)) {
    this.invalidate('typeCalcul', 'Un forfait par intervention cible une panne/intervention ou est général');
  }
  if (this.typeCalcul === 'palier' && (!this.paliers || this.paliers.length === 0)) {
    this.invalidate('paliers', 'Au moins un palier est requis');
  }
  if (this.validTo && this.validFrom && this.validTo < this.validFrom) {
    this.invalidate('validTo', 'La date de fin doit être postérieure à la date de début');
  }
});

const RegleCommission = mongoose.model('RegleCommission', regleSchema);
RegleCommission.CALC_TYPES = CALC_TYPES;
RegleCommission.BASES = BASES;
module.exports = RegleCommission;
