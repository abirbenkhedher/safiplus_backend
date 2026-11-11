const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const historySchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: [
      'Reparation', 'Client', 'User', 'Status', 'Famille', 'Categorie', 'Objet',
      // ✅ Module atelier (cahier des charges)
      'Depense', 'Stock', 'Fournisseur', 'ParametresAtelier', 'DeclarationJournaliere',
      'RegleCommission', 'ContratReparateur', 'Commission', 'EcritureRemuneration',
      'PaiementReparateur', 'Cloture',
    ],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  action: {
    type: String,
    enum: [
      'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'ASSIGN', 'PAYMENT', 'LOGIN', 'LOGOUT',
      'VALIDATE', 'CANCEL', 'CLOSE', 'REOPEN', 'ADJUST', 'CALCULATE', 'TRANSFER', 'INVENTORY',
    ],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed
  },
  comment: {
    type: String,
    trim: true
  },
  oldStatus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Status'
  },
  newStatus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Status'
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
historySchema.plugin(tenantPlugin, { scope: 'boutique' });

// Index pour les recherches
historySchema.index({ entityId: 1, entityType: 1 });
historySchema.index({ user: 1 });
historySchema.index({ action: 1 });
historySchema.index({ createdAt: -1 });

module.exports = mongoose.model('History', historySchema);