const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ✅ Entrées / sorties d'espèces hors ventes (apport, retrait banque, petite dépense…)
const CATEGORIES = ['apport', 'retrait_banque', 'depense', 'autre'];

const mouvementCaisseSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'SessionCaisse', required: true, index: true },
  type: { type: String, enum: ['ENTREE', 'SORTIE'], required: true },
  categorie: { type: String, enum: CATEGORIES, default: 'autre' },
  montant: { type: Number, required: true, min: [0.001, 'Montant invalide'] },
  motif: { type: String, trim: true, required: [true, 'Le motif est obligatoire'] },
  depense: { type: mongoose.Schema.Types.ObjectId, ref: 'Depense', default: null },
  statut: { type: String, enum: ['valide', 'annule'], default: 'valide' },
  motifAnnulation: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

mouvementCaisseSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

const MouvementCaisse = mongoose.model('MouvementCaisse', mouvementCaisseSchema);
MouvementCaisse.CATEGORIES = CATEGORIES;
module.exports = MouvementCaisse;
