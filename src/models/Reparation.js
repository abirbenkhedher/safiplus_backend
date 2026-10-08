const mongoose = require('mongoose');

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
    // Optionnel : required si vous voulez forcer
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
  isReparable: {
    type: Boolean,
    default: true
  },
  isNotified: {
    type: Boolean,
    default: false
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
  // ✅ NOUVEAU : HISTORIQUE DES SMS ENVOYÉS
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

// ============================================================
// VIRTUALS
// ============================================================

// ✅ Virtual : prix total (initial + imprévus acceptés)
reparationSchema.virtual('prixTotal').get(function () {
  return computePrixTotal(this);
});

// ✅ Virtual : reste à payer (sur PRIX TOTAL)
reparationSchema.virtual('reste').get(function () {
  return Math.max(0, computePrixTotal(this) - (Number(this.acompte) || 0));
});

// ✅ Virtual (alias) : reste total (pour compatibilité)
reparationSchema.virtual('resteTotal').get(function () {
  return Math.max(0, computePrixTotal(this) - (Number(this.acompte) || 0));
});

// ============================================================
// MIDDLEWARE : Génération du numéro de réparation
// ============================================================
reparationSchema.pre('validate', async function () {
  if (this.isNew && !this.numero) {
    try {
      const year = new Date().getFullYear();
      const count = await this.constructor.countDocuments();
      const padded = String(count + 1).padStart(4, '0');
      this.numero = `R${year}${padded}`;
      console.log(`📝 Numéro de réparation généré: ${this.numero}`);
    } catch (error) {
      console.error('❌ Erreur génération numéro:', error);
      const year = new Date().getFullYear();
      this.numero = `R${year}${Date.now().toString().slice(-4)}`;
    }
  }
});

// ============================================================
// ✅ VALIDATION CORRIGÉE : l'acompte ne dépasse pas le PRIX TOTAL
//    (prix de base + imprévus acceptés)
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
//    (au cas où le frontend ne l'envoie pas correctement)
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

// ==============================================
// INDEX
// ==============================================
reparationSchema.index({ numero: 1 }, { unique: true });
reparationSchema.index({ client: 1 });
reparationSchema.index({ status: 1 });
reparationSchema.index({ createdAt: -1 });
reparationSchema.index({ reparateur: 1 });
reparationSchema.index({ marque: 'text' });

module.exports = mongoose.model('Reparation', reparationSchema);