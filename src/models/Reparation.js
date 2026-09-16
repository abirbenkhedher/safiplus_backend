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
    type: String,
    required: [true, 'La marque est obligatoire'],
    trim: true
  },
  modele: {
    type: String,
    trim: true
  },
  numeroSerie: {
    type: String,
    trim: true
  },
  accessoires: {
    type: String,
    trim: true
  },
    // ✅ Type de panne (obligatoire, choisi dans la liste)
  panneType: {
    type: String,
    required: [true, 'Le type de panne est obligatoire'],
    trim: true
  },
  // ✅ Description du problème (optionnel, texte libre)
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

  
  isDeleted: {
    type: Boolean,
    default: false
  },
  // ✅ Traçabilité des modifications
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

// Virtual pour le reste à payer
reparationSchema.virtual('reste').get(function() {
  return Math.max(0, this.prix - this.acompte);
});

// Middleware pour générer le numéro de réparation
reparationSchema.pre('validate', async function() {
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

// Validation que l'acompte ne dépasse pas le prix
reparationSchema.pre('validate', function() {
  if (this.acompte > this.prix) {
    throw new Error('L\'acompte ne peut pas dépasser le prix');
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