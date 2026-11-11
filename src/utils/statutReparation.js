// ============================================================
// ✅ Reconnaissance des statuts de réparation (libellés libres)
// ------------------------------------------------------------
// Les statuts sont saisis par chaque organisation : « Sortie réparée »,
// « SORTIE - RÉPARÉ », « Sortie Réparé(e) »... On normalise avant de comparer.
// ============================================================

/** "Sortie - Réparée" → "SORTIE REPARE" */
const normalizeStatusLabel = (label) =>
  String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')                       // ponctuation, tirets, (e)
    .replace(/\bREPAREES?\b|\bREPARES\b|\bREPARE E\b/g, 'REPARE')
    .replace(/\bSORTIES?\b|\bSORTI\b/g, 'SORTIE')
    .replace(/\s+/g, ' ')
    .trim();

const STATUTS_NON_REPARE = ['NON REPARE', 'SAV NON REPARE', 'SORTIE NON REPARE', 'SAV SORTIE NON REPARE'];
const STATUTS_CLOTURE = ['REPARE', 'SAV REPARE', 'SORTIE REPARE', 'SAV SORTIE REPARE'];

const tokens = (label) => normalizeStatusLabel(label).split(' ');

/** Statut « non réparé » (déclenche la restauration du stock). */
const isStatutNonRepare = (label) => {
  const n = normalizeStatusLabel(label);
  if (STATUTS_NON_REPARE.includes(n)) return true;
  const t = tokens(label);
  return t.includes('NON') && t.includes('REPARE');
};

/** Statut qui clôture la réparation quand le reste à payer est 0. */
const isStatutCloture = (label) => {
  const n = normalizeStatusLabel(label);
  if (STATUTS_CLOTURE.includes(n)) return true;
  // Variante « sortie ... réparé » (ex : « Sortie client réparé »), jamais « non réparé »
  const t = tokens(label);
  return t.includes('SORTIE') && t.includes('REPARE') && !t.includes('NON');
};

/** Prix total = prix + imprévus acceptés. */
const prixTotalReparation = (r) => {
  const imprevus = (r?.diagnosticImprevus?.imprevus || [])
    .filter((i) => i.accepte === true)
    .reduce((s, i) => s + (Number(i.prixSupplementaire) || 0), 0);
  return (Number(r?.prix) || 0) + imprevus;
};

/** Reste à payer (au millime). */
const resteAPayer = (r) =>
  Math.max(0, Math.round((prixTotalReparation(r) - (Number(r?.acompte) || 0)) * 1000) / 1000);

/**
 * ✅ Règle de clôture : statut « réparé / sortie réparé » ET reste à payer = 0
 * (y compris une réparation gratuite, prix 0).
 */
const doitEtreCloturee = (reparation, statusLabel) =>
  isStatutCloture(statusLabel) && resteAPayer(reparation) === 0;

module.exports = {
  normalizeStatusLabel,
  isStatutNonRepare,
  isStatutCloture,
  prixTotalReparation,
  resteAPayer,
  doitEtreCloturee,
  STATUTS_NON_REPARE,
  STATUTS_CLOTURE,
};
