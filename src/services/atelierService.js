const ParametresAtelier = require('../models/ParametresAtelier');
const Cloture = require('../models/Cloture');
const { getTenant, BOUTIQUE_REQUIRED, BOUTIQUE_REQUIRED_MESSAGE } = require('../config/tenantContext');
const { AppError, jourKey, periodeKey } = require('../utils/appError');

// ============================================================
// ✅ Paramètres de la boutique + verrou des périodes clôturées
// ============================================================

const DEFAULTS = {
  modeStock: 'simplifie',
  methodeValorisation: 'CMP',
  prixTTC: true,
  tauxTVA: 19,
  remisesDeduites: true,
  commissionSurSAV: false,
  periodicitePaie: 'mensuelle',
  commerce: {
    raisonSociale: '', matriculeFiscal: '', registreCommerce: '', adresse: '', telephone: '',
    email: '', rib: '', piedPage: '', timbreFiscal: 1, validiteDevisJours: 15, delaiPaiementJours: 0,
    caisseObligatoire: false,
  },
};

/** Boutique active de la requête (obligatoire pour les écritures). */
const requireBoutiqueId = () => {
  const ctx = getTenant() || {};
  const b = ctx.boutique || ((ctx.boutiques || []).length === 1 ? ctx.boutiques[0] : null);
  if (!b) {
    throw new AppError(BOUTIQUE_REQUIRED_MESSAGE, 400, BOUTIQUE_REQUIRED);
  }
  return b;
};

/** Paramètres (objet simple) d'une boutique, avec valeurs par défaut. */
const getParametres = async (boutiqueId, session = null) => {
  const q = ParametresAtelier.findOne({ boutique: boutiqueId }).lean();
  if (session) q.session(session);
  const doc = await q;
  return { ...DEFAULTS, ...(doc || {}), boutique: boutiqueId };
};

/** true si la date appartient à un jour ou un mois clôturé. */
const isPeriodeCloturee = async (boutiqueId, date, session = null) => {
  const q = Cloture.exists({
    boutique: boutiqueId,
    statut: 'cloturee',
    $or: [
      { type: 'journaliere', periode: jourKey(date) },
      { type: 'mensuelle', periode: periodeKey(date) },
    ],
  });
  if (session) q.session(session);
  return !!(await q);
};

/** Refuse toute écriture dans une période clôturée. */
const assertPeriodeOuverte = async (boutiqueId, date = new Date(), session = null) => {
  if (await isPeriodeCloturee(boutiqueId, date, session)) {
    throw new AppError(
      `La période du ${jourKey(date)} est clôturée. Réouverture nécessaire (permission dédiée).`,
      409,
      'PERIODE_CLOTUREE'
    );
  }
};

module.exports = { DEFAULTS, getParametres, requireBoutiqueId, isPeriodeCloturee, assertPeriodeOuverte };
