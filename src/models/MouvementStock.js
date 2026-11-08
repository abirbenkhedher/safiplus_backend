const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

const mouvementStockSchema = new mongoose.Schema({
  stock: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stock',
    required: true,
    index: true,
  },

  // models/MouvementStock.js
type: {
  type: String,
  enum: [
    'AJOUT_MANUEL',
    'RETRAIT_MANUEL',
    'RETRAIT_REPARATION',
    'RESTAURATION_REPARATION',   // ✅ NOUVEAU
    'ANNULATION_CONSOMMATION',   // ✅ NOUVEAU
    'AJUSTEMENT',
    'CREATION',
  ],
  required: true,
  index: true,
},

  quantite: {
    type: Number,
    required: true,
  },
  quantiteAvant: { type: Number, required: true },
  quantiteApres: { type: Number, required: true },

  reparationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reparation',
    default: null,
    index: true,
  },

  motif: { type: String, trim: true, default: '' },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
mouvementStockSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

mouvementStockSchema.index({ createdAt: -1 });
mouvementStockSchema.index({ stock: 1, createdAt: -1 });

module.exports = mongoose.model('MouvementStock', mouvementStockSchema);