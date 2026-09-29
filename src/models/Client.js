const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
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

// ============================================================
// ✅ Middleware : génération UNIQUEMENT du code client (C001, C002...)
// ❌ PLUS AUCUNE génération de code fidélité
// ============================================================
clientSchema.pre('validate', async function() {
  // Génération du code client (C001, C002, ...)
  if (this.isNew && !this.code) {
    try {
      const count = await this.constructor.countDocuments();
      const padded = String(count + 1).padStart(3, '0');
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
clientSchema.index({ codeFidelite: 1 }, { unique: true, sparse: true });

clientSchema.index({
  nom: 'text',
  phone: 'text',
  phone2: 'text',
  email: 'text',
  code: 'text',
  codeFidelite: 'text',
});

module.exports = mongoose.model('Client', clientSchema);