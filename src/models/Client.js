const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');
const Counter = require('./Counter');
const { getTenant } = require('../config/tenantContext');

const clientSchema = new mongoose.Schema({
  code: {
    type: String,
    trim: true,
    sparse: true,
    default: null
  },

  // ✅ Code fidélité — FACULTATIF, AUCUNE génération automatique
  codeFidelite: {
    type: String,
    sparse: true,
    uppercase: true,
    trim: true,
    default: undefined,
  },

  nom: {
    type: String,
    required: [true, 'Le nom est obligatoire'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Le téléphone est obligatoire'],
    trim: true,
  },
  phone2: {
    type: String,
    trim: true,
    default: null,
    sparse: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    default: null,
    validate: {
      validator: function(value) {
        if (!value) return true;
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value);
      },
      message: 'Email invalide'
    }
  },
  adresse: {
    type: String,
    trim: true
  },
  zone: {
    type: String,
    trim: true,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
// ✅ Clients COMMUNS à toutes les boutiques de l'organisation
clientSchema.plugin(tenantPlugin, { scope: 'organisation' });

// Boutique où le client a été créé (information uniquement, aucun filtrage)
clientSchema.add({
  boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', default: null },
});

/** Plus grand numéro de code client (Cxxx) de l'organisation. */
clientSchema.statics.maxCodeNumber = async function (organisationId) {
  const res = await this.collection.aggregate([
    { $match: { organisation: organisationId, code: { $regex: '^C[0-9]+$' } } },
    { $project: { n: { $toInt: { $substrCP: ['$code', 1, 20] } } } },
    { $group: { _id: null, max: { $max: '$n' } } },
  ]).toArray();
  return res[0]?.max || 0;
};

// ============================================================
// ✅ Middleware : génération UNIQUEMENT du code client (C001, C002...)
// ❌ PLUS AUCUNE génération de code fidélité
// ============================================================
clientSchema.pre('validate', async function() {
  if (this.isNew && !this.boutique) {
    const ctx = getTenant();
    if (ctx && !ctx.system && ctx.boutique) this.boutique = ctx.boutique;
  }

  // Génération du code client (C001, C002, ...)
  if (this.isNew && !this.code) {
    try {
      // ✅ Compteur par organisation (codes uniques dans toutes les boutiques)
      const orgId = this.organisation;
      const seq = await Counter.next(`client:o:${orgId}`, () =>
        this.constructor.maxCodeNumber(orgId)
      );
      const padded = String(seq).padStart(3, '0');
      this.code = `C${padded}`;
      console.log(`📝 Code client généré: ${this.code}`);
    } catch (error) {
      console.error('❌ Erreur génération code:', error);
      this.code = `C${Date.now().toString().slice(-4)}`;
    }
  }

  // ✅ Nettoyage : si codeFidelite est vide ("" ou null), on le retire complètement
  if (this.codeFidelite === '' || this.codeFidelite === null) {
    this.codeFidelite = undefined;
  }
});

// ============================================================
// ✅ Index
// ============================================================
// ✅ Unicité par organisation (clients communs aux boutiques)
// ⚠️ Données existantes : lancer `npm run migrate:multiboutique` (codes en double + index)
clientSchema.index(
  { organisation: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
clientSchema.index(
  { organisation: 1, codeFidelite: 1 },
  { unique: true, partialFilterExpression: { codeFidelite: { $type: 'string' } } }
);

// ✅ Recherche par téléphone (formulaire de réparation, doublons)
clientSchema.index({ organisation: 1, phone: 1 });
clientSchema.index({ organisation: 1, phone2: 1 });

clientSchema.index({
  nom: 'text',
  phone: 'text',
  phone2: 'text',
  email: 'text',
  code: 'text',
  codeFidelite: 'text',
});


module.exports = mongoose.model('Client', clientSchema);