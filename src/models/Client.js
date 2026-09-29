const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    trim: true,
    sparse: true,
    default: null
  },
  // ✅ NOUVEAU : Code fidélité (unique, généré automatiquement)
  codeFidelite: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true,
    sparse: true,
    default: null
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
// ✅ Middleware : génération du code client + code fidélité
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

  // ✅ Génération du code fidélité (FID-XXXXXX)
  if (this.isNew && !this.codeFidelite) {
    try {
      // Générer un code unique basé sur un compteur + timestamp
      let code;
      let exists = true;
      let attempts = 0;

      while (exists && attempts < 10) {
        const count = await this.constructor.countDocuments();
        const randomPart = Math.floor(Math.random() * 9000 + 1000); // 1000-9999
        code = `FID-${String(count + 1).padStart(3, '0')}${randomPart}`;

        // Vérifier unicité
        const existing = await this.constructor.findOne({ codeFidelite: code });
        exists = Boolean(existing);
        attempts++;
      }

      this.codeFidelite = code;
      console.log(`🎁 Code fidélité généré: ${this.codeFidelite}`);
    } catch (error) {
      console.error('❌ Erreur génération code fidélité:', error);
      // Fallback : code basé sur le timestamp
      this.codeFidelite = `FID-${Date.now().toString().slice(-6)}`;
    }
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
  codeFidelite: 'text',    // ✅ AJOUT
});

module.exports = mongoose.model('Client', clientSchema);