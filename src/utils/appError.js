// ✅ Erreur métier avec code HTTP (gérée par middleware/errorHandler)
class AppError extends Error {
  constructor(message, statusCode = 400, code = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** Jour local YYYY-MM-DD. */
const jourKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Période mensuelle YYYY-MM. */
const periodeKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
};

/** Bornes [début, fin] d'un jour YYYY-MM-DD (heure locale). */
const jourBounds = (jour) => {
  const [y, m, d] = String(jour).split('-').map(Number);
  return [new Date(y, m - 1, d, 0, 0, 0, 0), new Date(y, m - 1, d, 23, 59, 59, 999)];
};

/** Bornes [début, fin] d'un mois YYYY-MM. */
const moisBounds = (periode) => {
  const [y, m] = String(periode).split('-').map(Number);
  return [new Date(y, m - 1, 1, 0, 0, 0, 0), new Date(y, m, 0, 23, 59, 59, 999)];
};

/** Bornes depuis query ?from&to (YYYY-MM-DD), défaut = mois courant. */
const rangeFromQuery = (q = {}) => {
  const [defFrom, defTo] = moisBounds(periodeKey());
  const from = q.from ? jourBounds(q.from)[0] : defFrom;
  const to = q.to ? jourBounds(q.to)[1] : defTo;
  if (isNaN(from) || isNaN(to)) throw new AppError('Période invalide');
  return [from, to];
};

const isJour = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isPeriode = (s) => /^\d{4}-\d{2}$/.test(String(s || ''));

module.exports = { AppError, jourKey, periodeKey, jourBounds, moisBounds, rangeFromQuery, isJour, isPeriode };
