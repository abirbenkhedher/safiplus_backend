// ============================================================
// ✅ Calculs monétaires au millime (TND)
// Tous les calculs se font en millimes ENTIERS, puis sont reconvertis
// en dinars arrondis à 3 décimales (règle d'arrondi uniforme).
// ============================================================

const toM = (v) => Math.round((Number(v) || 0) * 1000);
const fromM = (m) => Math.round(Number(m) || 0) / 1000;

/** Arrondi au millime. */
const round3 = (v) => fromM(toM(v));

/** Montant × quantité (ou coefficient). */
const mul = (amount, qty) => fromM(Math.round(toM(amount) * (Number(qty) || 0)));

/** base × taux / 100. */
const pct = (base, rate) => fromM(Math.round((toM(base) * (Number(rate) || 0)) / 100));

/** Somme d'une liste de montants. */
const sum = (list) => fromM((list || []).reduce((s, v) => s + toM(v), 0));

/** a − b. */
const sub = (a, b) => fromM(toM(a) - toM(b));

/** Montant HT depuis TTC selon un taux de TVA (%). */
const ht = (ttc, tva) => {
  const t = Number(tva) || 0;
  if (!t) return round3(ttc);
  return fromM(Math.round(toM(ttc) / (1 + t / 100)));
};

/**
 * Coût moyen pondéré.
 * CMP = (Qp × CMPp + Qe × Ce) / (Qp + Qe)
 */
const cmp = (qPrev, cmpPrev, qIn, costIn) => {
  const qp = Math.max(0, Number(qPrev) || 0);
  const qi = Number(qIn) || 0;
  const total = qp + qi;
  if (total <= 0) return round3(costIn);
  return fromM(Math.round((qp * toM(cmpPrev) + qi * toM(costIn)) / total));
};

/** Retrait d'une entrée du CMP (annulation d'achat). */
const cmpRemove = (qPrev, cmpPrev, qOut, costOut) => {
  const qp = Number(qPrev) || 0;
  const qo = Number(qOut) || 0;
  const rest = qp - qo;
  if (rest <= 0) return round3(cmpPrev);
  const val = qp * toM(cmpPrev) - qo * toM(costOut);
  if (val <= 0) return round3(cmpPrev);
  return fromM(Math.round(val / rest));
};

module.exports = { toM, fromM, round3, mul, pct, sum, sub, ht, cmp, cmpRemove };
