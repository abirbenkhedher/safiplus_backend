const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ CONTRAT / MODE DE RÉMUNÉRATION D'UN RÉPARATEUR (un par employé pour toute la société)
// Versionné : une modification crée une nouvelle version et clôt
// la précédente (validTo). Les périodes passées restent intactes.
// ============================================================
const contratSchema = new mongoose.Schema({
  reparateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mode: {
    type: String,
    enum: ['salaire', 'commission', 'mixte'],
    required: true,
  },
  // Salaire fixe (modes salaire / mixte)
  salaire: { type: Number, default: 0, min: 0 },
  periodicite: { type: String, enum: ['mensuelle', 'hebdomadaire', 'journaliere'], default: 'mensuelle' },

  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
  observation: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// ✅ Un contrat par employé pour TOUTE la société (toutes les boutiques)
contratSchema.plugin(tenantPlugin, { scope: 'organisation' });
// Boutique qui porte le coût du salaire fixe (salaire généré à SA clôture mensuelle)
contratSchema.add({ boutiqueRattachement: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', default: null } });
contratSchema.index({ organisation: 1, reparateur: 1, validFrom: -1 });

module.exports = mongoose.model('ContratReparateur', contratSchema);
