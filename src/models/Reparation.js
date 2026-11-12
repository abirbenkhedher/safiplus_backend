const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');
const Counter = require('./Counter');

const reparationSchema = new mongoose.Schema({
  numero: {
    type: String,
    unique: true,
    trim: true,
    sparse: true,
    default: null
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Le client est obligatoire']
  },
  categorie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categorie',
    required: [true, 'La catégorie est obligatoire']
  },
  objet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Objet',
    required: [true, 'L\'objet est obligatoire']
  },
  marque: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marque',
    required: [true, 'La marque est obligatoire']
  },
  modele: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Modele',
  },

  accessoires: {
    type: String,
    trim: true
  },
  panneType: {
    type: [String],
    required: [true, 'Le type de panne est obligatoire'],
    validate: {
      validator: function (arr) {
        return Array.isArray(arr) && arr.length > 0;
      },
      message: 'Au moins une panne est obligatoire'
    },
    default: []
  },
  problemeDeclare: {
    type: String,
    trim: true,
    default: ''
  },
  note: {
    type: String,
    trim: true
  },
  observation: {
    type: String,
    trim: true
  },
  observations: [{
    text: { type: String, trim: true },
    date: { type: Date, default: Date.now }
  }],
  diagnostic: {
    type: String,
    trim: true
  },
  travauxEffectues: {
    type: String,
    trim: true
  },
  piecesUtilisees: {
    type: String,
    trim: true
  },
  prix: {
    type: Number,
    default: 0,
    min: [0, 'Le prix ne peut pas être négatif']
  },
  acompte: {
    type: Number,
    default: 0,
    min: [0, 'L\'acompte ne peut pas être négatif']
  },
  paymentType: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid'
  },
  status: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Status',
    required: [true, 'Le statut est obligatoire']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le créateur est obligatoire']
  },
  representant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reparateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reparateurSAV: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  dateReception: {
    type: Date,
    default: Date.now
  },
  datePrevisionnelle: {
    type: Date
  },
  dateFinReelle: {
    type: Date
  },
  dateLivraison: {
    type: Date
  },
    dateCloture: {
    type: Date,
    default: null,
    index: true, // ✅ pour accélérer les filtres
  },
  isReparable: {
    type: Boolean,
    default: true
  },
  isNotified: {
    type: Boolean,
    default: false
  },

  // ✅ Tracking SAV
  savOrigine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reparation',
    default: null,
  },
  isSAV: {
    type: Boolean,
    default: false,
    index: true,
  },

  // ============================================================
  // ✅ GESTION DES DIAGNOSTICS ET IMPRÉVUS
  // ============================================================
  diagnosticImprevus: {
    constat: {
      type: String,
      trim: true,
      default: ''
    },
    imprevus: [{
      description: {
        type: String,
        trim: true,
        required: true
      },
      prixSupplementaire: {
        type: Number,
        default: 0,
        min: [0, 'Le prix supplémentaire ne peut pas être négatif']
      },
      accepte: {
        type: Boolean,
        default: null
      },
      dateDecision: {
        type: Date,
        default: null
      },
      decisionPar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      noteDecision: {
        type: String,
        trim: true,
        default: ''
      }
    }],
    decisionClient: {
      statut: {
        type: String,
        enum: ['en_attente', 'accepte', 'refuse', 'annule'],
        default: 'en_attente'
      },
      date: {
        type: Date,
        default: null
      },
      note: {
        type: String,
        trim: true,
        default: ''
      },
      enregistrePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      }
    }
  },

  // ============================================================
  // ✅ HISTORIQUE DES SMS ENVOYÉS
  // ============================================================
  smsEnvoyes: [{
    statut: {
      type: String,
      required: true,
    },
    statutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Status',
    },
    message: {
      type: String,
      required: true,
    },
    telephone: {
      type: String,
      required: true,
    },
    clientNom: {
      type: String,
    },
    envoyePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    envoyeLe: {
      type: Date,
      default: Date.now,
    },
    statutEnvoi: {
      type: String,
      enum: ['succes', 'echec'],
      default: 'succes',
    },
    erreur: {
      type: String,
      default: null,
    },
  }],

  isDeleted: {
    type: Boolean,
    default: false
  },

  // ============================================================
  // ✅ PIÈCES DU STOCK CONSOMMÉES (avec cycle de vie complet)
  // ============================================================
  piecesStock: [{
    stock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stock',
      required: true,
    },
    snapshot: {
      categorie: { type: String, default: '' },
      objet: { type: String, default: '' },
      typeArticle: { type: String, default: '' },
      marque: { type: String, default: '' },
      modele: { type: String, default: '' },
    },
    quantite: {
      type: Number,
      required: true,
      min: 1,
    },
    statut: {
      type: String,
      enum: ['consomme', 'restaure', 'annule'],
      default: 'consomme',
      index: true,
    },
    dateConsommation: {
      type: Date,
      default: Date.now,
    },
    consommePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dateRestauration: {
      type: Date,
      default: null,
    },
    restaurePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    motifRestauration: {
      type: String,
      trim: true,
      default: '',
    },
    dateAnnulation: {
      type: Date,
      default: null,
    },
    annulePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    motifAnnulation: {
      type: String,
      trim: true,
      default: '',
    },
    mouvementStockId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MouvementStock',
      default: null,
    },
    mouvementRestaurationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MouvementStock',
      default: null,
    },
    mouvementAnnulationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MouvementStock',
      default: null,
    },
    // ✅ Valorisation figée au moment de la consommation (cahier des charges §7)
    coutUnitaire: { type: Number, default: null },
    coutTotal: { type: Number, default: null },
    sourceCout: { type: String, enum: ['CMP', 'FIFO', 'MANUEL', 'ESTIME', null], default: null },
    prixVenteUnitaire: { type: Number, default: null },
    // false = mode stock désactivé (aucune sortie physique)
    stockPhysique: { type: Boolean, default: true },
    reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  }],

  // ✅ Intervention partagée : répartition explicite des commissions (%)
  // Vide = 100 % au réparateur (ou réparateur SAV pour un SAV)
  repartitionCommission: [{
    reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pourcentage: { type: Number, required: true, min: 0, max: 100 },
  }],

  modifications: [{
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    modifiedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ============================================================
// ✅ HELPER : Calcul du prix total (prix de base + imprévus acceptés)
// ============================================================
function computePrixTotal(doc) {
  const imprevusAcceptes = (doc.diagnosticImprevus?.imprevus || [])
    .filter((i) => i.accepte === true)
    .reduce((sum, i) => sum + (Number(i.prixSupplementaire) || 0), 0);
  return (Number(doc.prix) || 0) + imprevusAcceptes;
}

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
reparationSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

// ============================================================
// ✅ Dates de fin / de livraison renseignées au changement de statut
//    (tableaux de bord : réparations terminées, délai moyen, livrées)
// ============================================================
reparationSchema.pre('save', async function () {
  if (!this.isModified('status') || !this.status) return;
  const { etapeReparation } = require('../utils/etapeReparation');
  const st = await mongoose.model('Status').findById(this.status).select('label').lean();
  const etape = etapeReparation(st?.label);
  if (etape === 'en_cours') {
    // Réouverture : la réparation n'est plus terminée
    this.dateFinReelle = null;
    return;
  }
  if (!this.dateFinReelle) this.dateFinReelle = new Date();
  if (etape === 'livree' && !this.dateLivraison) this.dateLivraison = new Date();
});

// ============================================================
// VIRTUALS
// ============================================================
reparationSchema.virtual('prixTotal').get(function () {
  return computePrixTotal(this);
});

reparationSchema.virtual('reste').get(function () {
  return Math.max(0, computePrixTotal(this) - (Number(this.acompte) || 0));
});

reparationSchema.virtual('resteTotal').get(function () {
  return Math.max(0, computePrixTotal(this) - (Number(this.acompte) || 0));
});

reparationSchema.virtual('piecesActives').get(function () {
  return (this.piecesStock || []).filter((p) => p.statut === 'consomme');
});

reparationSchema.virtual('totalPiecesConsommees').get(function () {
  return (this.piecesStock || [])
    .filter((p) => p.statut === 'consomme')
    .reduce((sum, p) => sum + (Number(p.quantite) || 0), 0);
});

// ============================================================
// MIDDLEWARE : Génération du numéro de réparation
// ============================================================
reparationSchema.pre('validate', async function () {
  if (this.isNew && !this.numero) {
    try {
      // ✅ Numéro préfixé par le code boutique : TUN1-R20260001
      // (compteur propre à chaque boutique, numéro unique au niveau global)
      const year = new Date().getFullYear();
      const Boutique = mongoose.model('Boutique');
      const boutique = await Boutique.findById(this.boutique).select('code').lean();
      const prefix = boutique?.code ? `${boutique.code}-` : '';
      const seq = await Counter.next(`reparation:${this.boutique}:${year}`, () => 0);
      const padded = String(seq).padStart(4, '0');
      this.numero = `${prefix}R${year}${padded}`;
    } catch (error) {
      console.error('❌ Erreur génération numéro:', error);
      const year = new Date().getFullYear();
      this.numero = `R${year}${Date.now().toString().slice(-4)}`;
    }
  }
});

// ✅ Répartition des commissions : total = 100 %
reparationSchema.pre('validate', function () {
  const rep = this.repartitionCommission || [];
  if (rep.length === 0) return;
  const total = rep.reduce((s, r) => s + (Number(r.pourcentage) || 0), 0);
  if (Math.abs(total - 100) > 0.001) {
    this.invalidate('repartitionCommission', 'La répartition des commissions doit totaliser 100 %');
  }
});

// ============================================================
// ✅ VALIDATION : l'acompte ne dépasse pas le PRIX TOTAL
// ============================================================
reparationSchema.pre('validate', function () {
  const prixTotal = computePrixTotal(this);
  const acompte = Number(this.acompte) || 0;

  if (acompte > prixTotal) {
    throw new Error(
      `L'acompte (${acompte.toFixed(2)} DT) ne peut pas dépasser le prix total (${prixTotal.toFixed(2)} DT)`
    );
  }
});

// ============================================================
// ✅ VALIDATION AUTO : synchronisation du paymentType
// ============================================================
reparationSchema.pre('validate', function () {
  const prixTotal = computePrixTotal(this);
  const acompte = Number(this.acompte) || 0;

  if (acompte <= 0) {
    this.paymentType = 'unpaid';
  } else if (prixTotal > 0 && acompte >= prixTotal) {
    this.paymentType = 'paid';
  } else {
    this.paymentType = 'partial';
  }
});

// ============================================================
// ✅ INDEX (complets pour performance)
// ============================================================

// ✅ Index unique sur numéro
// (index unique sur numero déclaré directement sur le champ : unique + sparse)

// ✅ Index composés pour pagination + filtres (les plus utilisés)
reparationSchema.index({ boutique: 1, isDeleted: 1, createdAt: -1 });
// ✅ Statistiques par période (filtre dateReception, à défaut createdAt)
reparationSchema.index({ boutique: 1, isDeleted: 1, dateReception: 1, createdAt: 1 });
reparationSchema.index({ isDeleted: 1, createdAt: -1 });
reparationSchema.index({ isDeleted: 1, status: 1 });
reparationSchema.index({ isDeleted: 1, categorie: 1 });
reparationSchema.index({ isDeleted: 1, reparateur: 1 });
reparationSchema.index({ isDeleted: 1, createdBy: 1 });
reparationSchema.index({ isDeleted: 1, client: 1 });
reparationSchema.index({ isDeleted: 1, numero: 1 });

// ✅ Index simples (pour compatibilité)
reparationSchema.index({ client: 1 });
reparationSchema.index({ status: 1 });
reparationSchema.index({ createdAt: -1 });
reparationSchema.index({ reparateur: 1 });

// ✅ Index de recherche (regex-friendly, sans conflit TEXT)
// Ces index accélèrent les requêtes { $regex: ... } sur ces champs
reparationSchema.index({ numero: 1, isDeleted: 1 });
reparationSchema.index({ problemeDeclare: 1, isDeleted: 1 });
reparationSchema.index({ note: 1, isDeleted: 1 });
reparationSchema.index({ panneType: 1, isDeleted: 1 });

// ✅ Index pièces stock
reparationSchema.index({ 'piecesStock.stock': 1 });
reparationSchema.index({ 'piecesStock.statut': 1 });

// ✅ Index SAV
reparationSchema.index({ isSAV: 1, savOrigine: 1 });

module.exports = mongoose.model('Reparation', reparationSchema);