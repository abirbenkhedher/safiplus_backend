const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');
const Counter = require('./Counter');

const depenseSchema = new mongoose.Schema({
  numero: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['REPARATION', 'DIVERSE', 'ACHAT'], // ✅ ACHAT = facture d'achat à lignes
    required: true,
    index: true,
  },

  // ============================================================
  // ✅ FACTURE D'ACHAT (cahier des charges §4.2)
  // ============================================================
  fournisseurRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', default: null },
  lignes: [{
    stock: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock', default: null }, // null = ligne libre
    designation: { type: String, trim: true, default: '' },
    quantite: { type: Number, required: true, min: [0.001, 'Quantité invalide'] },
    prixUnitaire: { type: Number, required: true, min: 0 },
    remise: { type: Number, default: 0, min: 0 },           // montant de remise sur la ligne
    fraisImputables: { type: Number, default: 0, min: 0 },  // transport, douane...
    montant: { type: Number, default: 0 },                  // calculé
    coutUnitaireRevient: { type: Number, default: 0 },      // (PU×Q − remise + frais) / Q
  }],
  // Statut : les dépenses simples sont validées à la saisie (comportement existant)
  statut: {
    type: String,
    enum: ['brouillon', 'validee', 'annulee'],
    default: function () { return this.type === 'ACHAT' ? 'brouillon' : 'validee'; },
    index: true,
  },
  valideeLe: { type: Date, default: null },
  valideePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  annuleeLe: { type: Date, default: null },
  annuleePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  motifAnnulation: { type: String, trim: true, default: '' },
  // Mode de stock appliqué lors de la validation (traçabilité)
  modeStockApplique: { type: String, default: null },
  piecesJointes: [{
    nom: String,
    fichier: String,     // nom du fichier stocké
    mimetype: String,
    taille: Number,
    ajouteLe: { type: Date, default: Date.now },
  }],

  montant: {
    type: Number,
    required: [true, 'Le montant est obligatoire'],
    min: [0, 'Le montant ne peut pas être négatif'],
  },

  // Catégorie libre uniquement pour DIVERSE
  categorieDiverse: {
    type: String,
    enum: ['Transport', 'Nettoyage', 'Fourniture', 'Loyer', 'Salaire', 'Autre', ''],
    default: '',
  },
  motifDiverse: {
    type: String,
    trim: true,
    default: '',
  },

  // Métadonnées (communes)
  fournisseur: { type: String, trim: true, default: '' },
  factureNumero: { type: String, trim: true, default: '' },
  dateDepense: { type: Date, default: Date.now, index: true },

  modePaiement: {
    type: String,
    enum: ['ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE'],
    default: 'ESPECES',
  },

  observation: { type: String, trim: true, default: '' },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// ✅ Multi-tenant (doit être déclaré AVANT les autres hooks)
// boutique = null → dépense ADMINISTRATIVE (globale à l'organisation),
// visible uniquement par l'admin en vue « Toutes les boutiques »
depenseSchema.plugin(tenantPlugin, { scope: 'boutique', globalDocs: true });

// Index
depenseSchema.index({ type: 1, dateDepense: -1 });
// ✅ Numéro unique par boutique (dépenses administratives : par organisation)
// ⚠️ Remplace l'ancien index { boutique, numero } : `npm run migrate:multiboutique -- --apply`
depenseSchema.index(
  { organisation: 1, boutique: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);

// ✅ Facture d'achat : montant = somme des lignes (au millime)
depenseSchema.pre('validate', function () {
  if (this.type !== 'ACHAT') return;
  const { toM, fromM } = require('../utils/money');
  let total = 0;
  for (const l of this.lignes || []) {
    const m = Math.round(toM(l.prixUnitaire) * Number(l.quantite)) - toM(l.remise) + toM(l.fraisImputables);
    if (m < 0) this.invalidate('lignes', 'La remise ne peut pas dépasser le montant de la ligne');
    l.montant = fromM(m);
    l.coutUnitaireRevient = Number(l.quantite) > 0 ? fromM(Math.round(m / Number(l.quantite))) : 0;
    total += m;
  }
  if ((this.lignes || []).length > 0) this.montant = fromM(total);
});

// Génération numéro
depenseSchema.pre('validate', async function () {
  if (this.isNew && !this.numero) {
    const year = new Date().getFullYear();
    const boutiqueId = this.boutique;
    if (!boutiqueId) {
      // Dépense administrative : ADM-2026-0001 (compteur par organisation)
      const seq = await Counter.next(`depense:adm:${this.organisation}:${year}`, () => 0);
      this.numero = `ADM-${year}-${String(seq).padStart(4, '0')}`;
      return;
    }
    const seq = await Counter.next(`depense:${boutiqueId}:${year}`, () =>
      this.constructor.countDocuments({ boutique: boutiqueId, numero: new RegExp(`^DEP-${year}-`) })
    );
    const padded = String(seq).padStart(4, '0');
    this.numero = `DEP-${year}-${padded}`;
  }
});

module.exports = mongoose.model('Depense', depenseSchema);