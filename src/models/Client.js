const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    trim: true,
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
    unique: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    default: null,
    validate: {
      validator: function(value) {
        // Si la valeur est null ou undefined ou vide, on ignore la validation
        if (!value) return true;
        // Sinon, valider le format email
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value);
      },
      message: 'Email invalide'
    }
  },
  adresse: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Middleware pour générer le code client
clientSchema.pre('validate', async function() {
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
});

// Index pour la recherche textuelle
clientSchema.index({ nom: 'text', phone: 'text', email: 'text', code: 'text' });

module.exports = mongoose.model('Client', clientSchema);