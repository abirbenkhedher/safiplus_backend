const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenantPlugin');

// ============================================================
// ✅ RÈGLEMENTS CLIENTS (encaissements / remboursements)
// ------------------------------------------------------------
// Un règlement peut être affecté à une ou plusieurs factures.
// Pour une facture issue de réparations, la part affectée est d'abord
// reportée sur l'acompte des réparations (statistiques et clôture
// existantes inchangées), le reste est « direct » sur la facture.
// La partie non affectée = avance / crédit du client.
// Jamais supprimé : annulation (contre-écriture) avec motif.
// ============================================================
const MODES = ['ESPECES', 'CHEQUE', 'VIREMENT', 'CARTE', 'AUTRE'];

const reglementSchema = new mongoose.Schema({
  numero: { type: String, trim: true, default: null },
  sens: { type: String, enum: ['ENCAISSEMENT', 'REMBOURSEMENT'], default: 'ENCAISSEMENT', index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: [true, 'Le client est obligatoire'], index: true },
  date: { type: Date, default: Date.now, index: true },
  mode: { type: String, enum: MODES, required: true },
  montant: { type: Number, required: true, min: [0.001, 'Montant invalide'] },
  reference: { type: String, trim: true, default: '' }, // n° chèque, virement...
  banque: { type: String, trim: true, default: '' },
  dateEcheance: { type: Date, default: null },          // chèque
  etatCheque: { type: String, enum: ['en_portefeuille', 'encaisse', 'impaye', null], default: null },
  // Espèces : session de caisse ouverte au moment du règlement
  sessionCaisse: { type: mongoose.Schema.Types.ObjectId, ref: 'SessionCaisse', default: null, index: true },

  affectations: [{
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentVente', required: true },
    montant: { type: Number, required: true, min: 0 },
    direct: { type: Number, default: 0 }, // part portée sur la facture (hors acomptes réparations)
    reparations: [{
      _id: false,
      reparation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reparation' },
      montant: Number,
    }],
  }],
  montantAffecte: { type: Number, default: 0 },

  statut: { type: String, enum: ['valide', 'annule'], default: 'valide', index: true },
  motifAnnulation: { type: String, trim: true, default: '' },
  annuleLe: { type: Date, default: null },
  annulePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  observation: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

reglementSchema.plugin(tenantPlugin, { scope: 'boutique', requireBoutique: true });
reglementSchema.index(
  { organisation: 1, boutique: 1, numero: 1 },
  { unique: true, partialFilterExpression: { numero: { $type: 'string' } } }
);
reglementSchema.index({ 'affectations.document': 1 });

const Reglement = mongoose.model('Reglement', reglementSchema);
Reglement.MODES = MODES;
module.exports = Reglement;
