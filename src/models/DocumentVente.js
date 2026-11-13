const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');
const { toM, fromM } = require('../utils/money');

// ============================================================
// ✅ DOCUMENTS DE VENTE (gestion commerciale simplifiée)
// ------------------------------------------------------------
// Un seul modèle pour : DEVIS, BL (bon de livraison), FACTURE, AVOIR.
// - brouillon : modifiable, sans numéro (aucun trou dans la numérotation)
// - valide    : numéroté, figé (une facture ne se modifie plus : avoir)
// - Stock : sortie à la validation d'un BL ou d'une facture directe ;
//   les lignes « réparation » ne bougent jamais le stock (pièces déjà
//   consommées dans le dossier de réparation).
// ============================================================
// TICKET = vente comptoir (validée et encaissée immédiatement, pas de timbre)
const TYPES = ['DEVIS', 'BL', 'FACTURE', 'AVOIR', 'TICKET'];
const PREFIXES = { DEVIS: 'DV', BL: 'BL', FACTURE: 'FA', AVOIR: 'AV', TICKET: 'TK' };
const STATUTS = ['brouillon', 'valide', 'accepte', 'refuse', 'transforme', 'annule'];
const TYPES_LIGNE = ['article', 'libre', 'reparation'];

const ligneSchema = new mongoose.Schema({
  type: { type: String, enum: TYPES_LIGNE, default: 'libre' },
  stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', default: null },
  reparation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reparation', default: null },
  code: { type: String, trim: true, default: '' },
  designation: { type: String, trim: true, required: [true, 'Désignation obligatoire'] },
  quantite: { type: Number, required: true, min: [0.001, 'Quantité invalide'] },
  unite: { type: String, trim: true, default: '' },
  prixUnitaire: { type: Number, required: true, min: [0, 'Prix invalide'] }, // HT ou TTC selon le document
  remisePct: { type: Number, default: 0, min: 0, max: 100 },
  tauxTVA: { type: Number, default: 0, min: 0, max: 100 },
  // Calculés
  montantHT: { type: Number, default: 0 },
  montantTVA: { type: Number, default: 0 },
  montantTTC: { type: Number, default: 0 },
  // Stock
  stockSorti: { type: Boolean, default: false },   // sortie déjà faite (BL d'origine ou validation)
  retourStock: { type: Boolean, default: false },  // avoir : remettre en stock
  coutUnitaire: { type: Number, default: null },   // coût figé à la sortie (marge)
  mouvementStock: { type: mongoose.Schema.Types.ObjectId, ref: 'MouvementStock', default: null },
  origineDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVente', default: null },
}, { _id: true });

const documentVenteSchema = new mongoose.Schema({
  type: { type: String, enum: TYPES, required: true, index: true },
  numero: { type: String, trim: true, default: null },
  statut: { type: String, enum: STATUTS, default: 'brouillon', index: true },
  date: { type: Date, default: Date.now, index: true },
  dateEcheance: { type: Date, default: null },
  dateValidite: { type: Date, default: null }, // devis

  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: [true, 'Le client est obligatoire'], index: true },
  // Copie figée à la validation (le document ne change pas si la fiche client change)
  clientSnapshot: {
    code: String, nom: String, phone: String, email: String, adresse: String, matriculeFiscal: String,
  },
  vendeurSnapshot: {
    raisonSociale: String, matriculeFiscal: String, registreCommerce: String, adresse: String,
    telephone: String, email: String, rib: String, piedPage: String, boutique: String,
  },

  prixSaisis: { type: String, enum: ['HT', 'TTC'], default: 'TTC' },
  lignes: { type: [ligneSchema], default: [] },

  // Totaux (calculés)
  totalHT: { type: Number, default: 0 },
  totalTVA: { type: Number, default: 0 },
  totalTTC: { type: Number, default: 0 },
  tvaParTaux: [{ _id: false, taux: Number, base: Number, montant: Number }],
  appliquerTimbre: { type: Boolean, default: true },
  timbreFiscal: { type: Number, default: 0, min: 0 },
  netAPayer: { type: Number, default: 0 },

  // Liens
  origines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVente' }], // devis / BL d'origine
  factureOrigine: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVente', default: null, index: true }, // avoir
  reparations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reparation', index: true }],

  // Paiement (factures) : agrégats maintenus par les règlements / avoirs
  montantRegleDirect: { type: Number, default: 0 }, // règlements non reportés sur les réparations
  montantAvoirs: { type: Number, default: 0 },

  conditionsPaiement: { type: String, trim: true, default: '' },
  observation: { type: String, trim: true, default: '' },
  motifAnnulation: { type: String, trim: true, default: '' },

  modeStockApplique: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  valideLe: { type: Date, default: null },
  validePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  annuleLe: { type: Date, default: null },
  annulePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

documentVenteSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });

documentVenteSchema.index(
  { organisation: 1, boutique: 1, type: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);
documentVenteSchema.index({ client: 1, type: 1, statut: 1 });

/** Calcule les montants des lignes et les totaux (au millime). */
documentVenteSchema.methods.calculer = function () {
  const ttcMode = this.prixSaisis === 'TTC';
  let tHT = 0; let tTVA = 0;
  const parTaux = new Map();
  for (const l of this.lignes || []) {
    const t = Number(l.tauxTVA) || 0;
    const r = Number(l.remisePct) || 0;
    const brut = Math.round(toM(l.prixUnitaire) * Number(l.quantite));
    const net = Math.round(brut * (1 - r / 100));
    let ht; let tva;
    if (ttcMode) {
      ht = Math.round(net / (1 + t / 100));
      tva = net - ht;
    } else {
      ht = net;
      tva = Math.round((ht * t) / 100);
    }
    l.montantHT = fromM(ht);
    l.montantTVA = fromM(tva);
    l.montantTTC = fromM(ht + tva);
    tHT += ht; tTVA += tva;
    const p = parTaux.get(t) || { base: 0, montant: 0 };
    p.base += ht; p.montant += tva;
    parTaux.set(t, p);
  }
  this.totalHT = fromM(tHT);
  this.totalTVA = fromM(tTVA);
  this.totalTTC = fromM(tHT + tTVA);
  this.tvaParTaux = [...parTaux.entries()].sort((a, b) => a[0] - b[0])
    .map(([taux, p]) => ({ taux, base: fromM(p.base), montant: fromM(p.montant) }));
  const timbre = this.type === 'FACTURE' && this.appliquerTimbre ? toM(this.timbreFiscal) : 0;
  if (this.type !== 'FACTURE') this.timbreFiscal = 0;
  this.netAPayer = fromM(tHT + tTVA + timbre);
};

documentVenteSchema.pre('validate', function () {
  if (this.statut === 'brouillon') this.calculer();
});

const DocumentVente = mongoose.model('DocumentVente', documentVenteSchema);
DocumentVente.TYPES = TYPES;
DocumentVente.PREFIXES = PREFIXES;
DocumentVente.STATUTS = STATUTS;

module.exports = DocumentVente;
