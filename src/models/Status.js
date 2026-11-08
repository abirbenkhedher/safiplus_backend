const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const statusSchema = new mongoose.Schema({
  label: {
    type: String,
    required: [true, 'Le libellé du statut est obligatoire'],
    trim: true
  },
  parDefault: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    default: '#6c757d',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Couleur hexadécimale invalide']
  },
  isTerminal: {
    type: Boolean,
    default: false
  },
  isEditableByReparateur: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
statusSchema.plugin(tenantPlugin, { scope: 'organisation' });

// Middleware pour gérer le statut par défaut - VERSION SANS next
statusSchema.pre('save', async function() {
  if (this.parDefault) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, parDefault: true, organisation: this.organisation },
      { parDefault: false }
    );
  }
});

// Méthode statique pour obtenir le statut par défaut
statusSchema.statics.getDefault = async function() {
  const status = await this.findOne({ parDefault: true });
  if (!status) {
    const defaultStatus = await this.create({
      label: 'En attente',
      parDefault: true,
      order: 0,
      color: '#ffc107',
      isTerminal: false,
      isEditableByReparateur: true
    });
    return defaultStatus;
  }
  return status;
};

// ✅ Libellé unique par organisation
statusSchema.index({ organisation: 1, label: 1 }, { unique: true });

module.exports = mongoose.model('Status', statusSchema);