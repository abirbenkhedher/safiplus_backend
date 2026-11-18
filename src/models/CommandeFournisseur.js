const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ BON DE COMMANDE FOURNISSEUR
// Ne touche ni au stock ni à l'argent. Cycle :
//   brouillon → valide (envoyé au fournisseur) → recue (transformé en
//   facture d'achat brouillon : c'est elle qui fait l'entrée en stock) | annulee
// Prix unitaires HT (comme les factures d'achat), TVA par ligne.
// ============================================================
const STATUTS = ['brouillon', 'valide', 'recue', 'annulee'];

const ligneSchema = new mongoose.Schema({
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', default: null }, // null = ligne libre
  designation: { type: String, trim: true, required: [true, 'Désignation obligatoire'] },
  quantite: { type: Number, required: true, min: [0.001, 'Quantité invalide'] },
  prixUnitaire: { type: Number, required: true, min: [0, 'Prix invalide'] }, // HT
  tauxTVA: { type: Number, default: 0, min: 0, max: 100 },
  montantHT: { type: Number, default: 0 },
  montantTVA: { type: Number, default: 0 },
  montantTTC: { type: Number, default: 0 },
}, { _id: true });

const commandeSchema = new mongoose.Schema({
  numero: { type: String, trim: true, default: null },
  statut: { type: String, enum: STATUTS, default: 'brouillon', index: true },
  date: { type: Date, default: Date.now, index: true },
  dateLivraisonPrevue: { type: Date, default: null },
  fournisseurRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', default: null },
  fournisseur: { type: String, trim: true, default: '' }, // nom libre (si pas de fiche)
  lignes: { type: [ligneSchema], default: [] },
  totalHT: { type: Number, default: 0 },
  totalTVA: { type: Number, default: 0 },
  totalTTC: { type: Number, default: 0 },
  observation: { type: String, trim: true, default: '' },
  depense: { type: mongoose.Schema.Types.ObjectId, ref: 'Depense', default: null }, // facture d'achat créée
  motifAnnulation: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  validePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  valideLe: { type: Date, default: null },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

commandeSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
commandeSchema.index(
  { organisation: 1, boutique: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);

const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

/** Montants des lignes et totaux (HT → TVA → TTC, au millime). */
commandeSchema.methods.calculer = function () {
  let ht = 0; let tva = 0;
  for (const l of this.lignes || []) {
    l.montantHT = r3(Number(l.prixUnitaire) * Number(l.quantite));
    l.montantTVA = r3((l.montantHT * (Number(l.tauxTVA) || 0)) / 100);
    l.montantTTC = r3(l.montantHT + l.montantTVA);
    ht += l.montantHT; tva += l.montantTVA;
  }
  this.totalHT = r3(ht);
  this.totalTVA = r3(tva);
  this.totalTTC = r3(ht + tva);
};

commandeSchema.pre('validate', function () { this.calculer(); });

const CommandeFournisseur = mongoose.model('CommandeFournisseur', commandeSchema);
CommandeFournisseur.STATUTS = STATUTS;
module.exports = CommandeFournisseur;
