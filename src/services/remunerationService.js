const mongoose = require('mongoose');
const Commission = require('../models/Commission');
const EcritureRemuneration = require('../models/EcritureRemuneration');
const PaiementReparateur = require('../models/PaiementReparateur');
const ContratReparateur = require('../models/ContratReparateur');
const DeclarationJournaliere = require('../models/DeclarationJournaliere');
const Reparation = require('../models/Reparation');
const Cloture = require('../models/Cloture');
const User = require('../models/User');
const money = require('../utils/money');
const commissionService = require('./commissionService');
const { requireBoutiqueId } = require('./atelierService');
const { AppError, jourBounds, moisBounds, isJour, isPeriode } = require('../utils/appError');

// ============================================================
// ✅ RÉMUNÉRATIONS : soldes, salaires, clôtures (§9, §10)
// Gains bruts = commissions validées + salaires + primes + ajustements
// Solde dû    = gains bruts − avances − paiements (cumul)
// ============================================================

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sid = (v) => (v ? String(v._id || v) : null);

const sumBy = async (Model, match, groupKey, field = '$montant') => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: groupKey, total: { $sum: field }, count: { $sum: 1 } } },
  ]);
  return rows;
};

/**
 * Soldes par réparateur.
 * @param {{ from: Date, to: Date, reparateurs?: string[] }} opts
 */
const soldes = async ({ from, to, reparateurs = null }) => {
  const repF = reparateurs ? { reparateur: { $in: reparateurs.map(oid) } } : {};
  const inP = (field) => ({ [field]: { $gte: from, $lte: to } });

  const [comP, comG, ecrP, ecrG, payP, payG] = await Promise.all([
    sumBy(Commission, { ...repF, ...inP('dateSource'), statut: { $in: ['calculee', 'validee'] } }, { r: '$reparateur', s: '$statut' }),
    sumBy(Commission, { ...repF, statut: 'validee' }, { r: '$reparateur' }),
    sumBy(EcritureRemuneration, { ...repF, ...inP('date'), statut: 'validee' }, { r: '$reparateur', t: '$type' }),
    sumBy(EcritureRemuneration, { ...repF, statut: 'validee' }, { r: '$reparateur' }),
    sumBy(PaiementReparateur, { ...repF, ...inP('date'), statut: 'validee' }, { r: '$reparateur', t: '$type' }),
    sumBy(PaiementReparateur, { ...repF, statut: 'validee' }, { r: '$reparateur', t: '$type' }),
  ]);

  const map = new Map();
  const get = (r) => {
    const k = sid(r);
    if (!map.has(k)) {
      map.set(k, {
        reparateur: k,
        periode: { commissionsValidees: 0, commissionsEnAttente: 0, salaires: 0, primes: 0, ajustements: 0, gainsBruts: 0, avances: 0, paiements: 0 },
        cumul: { gainsBruts: 0, avances: 0, paiements: 0, soldeDu: 0 },
      });
    }
    return map.get(k);
  };
  const add = (o, k, v) => { o[k] = money.sum([o[k], v]); };

  comP.forEach((x) => add(get(x._id.r).periode, x._id.s === 'validee' ? 'commissionsValidees' : 'commissionsEnAttente', x.total));
  comG.forEach((x) => add(get(x._id.r).cumul, 'gainsBruts', x.total));
  ecrP.forEach((x) => add(get(x._id.r).periode, { salaire: 'salaires', prime: 'primes', ajustement: 'ajustements' }[x._id.t], x.total));
  ecrG.forEach((x) => add(get(x._id.r).cumul, 'gainsBruts', x.total));
  payP.forEach((x) => add(get(x._id.r).periode, x._id.t === 'avance' ? 'avances' : 'paiements', x.total));
  payG.forEach((x) => add(get(x._id.r).cumul, x._id.t === 'avance' ? 'avances' : 'paiements', x.total));

  const ids = [...map.keys()];
  const users = await User.find({ _id: { $in: ids } }).select('firstName lastName username role').lean();
  const names = new Map(users.map((u) => [sid(u._id), `${u.firstName} ${u.lastName}`.trim() || u.username]));

  return [...map.values()].map((r) => {
    const p = r.periode;
    p.gainsBruts = money.sum([p.commissionsValidees, p.salaires, p.primes, p.ajustements]);
    r.cumul.soldeDu = money.sub(r.cumul.gainsBruts, money.sum([r.cumul.avances, r.cumul.paiements]));
    return { ...r, nom: names.get(r.reparateur) || '—' };
  }).sort((a, b) => a.nom.localeCompare(b.nom));
};

/** Salaires d'un mois, calculés depuis les contrats (prorata calendaire). Idempotent. */
const genererSalaires = async (periode, userId) => {
  if (!isPeriode(periode)) throw new AppError('Période invalide (YYYY-MM)');
  const boutique = requireBoutiqueId();
  const [start, end] = moisBounds(periode);
  const contrats = await ContratReparateur.find({
    boutique, mode: { $in: ['salaire', 'mixte'] }, validFrom: { $lte: end },
    $or: [{ validTo: null }, { validTo: { $gte: start } }],
  }).lean();

  const DAY = 86400000;
  const daysInMonth = end.getDate();
  let crees = 0;
  for (const c of contrats) {
    const s = new Date(Math.max(start, new Date(c.validFrom)));
    const e = new Date(Math.min(end, c.validTo ? new Date(c.validTo) : end));
    const jours = Math.floor((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / DAY) + 1;
    if (jours <= 0) continue;
    let montant;
    if (c.periodicite === 'hebdomadaire') montant = money.fromM(Math.round((money.toM(c.salaire) * jours) / 7));
    else if (c.periodicite === 'journaliere') montant = money.mul(c.salaire, jours);
    else montant = money.fromM(Math.round((money.toM(c.salaire) * jours) / daysInMonth));
    if (montant <= 0) continue;
    try {
      await EcritureRemuneration.create({
        boutique, reparateur: c.reparateur, type: 'salaire', periode, date: end, montant,
        libelle: `Salaire ${periode}${jours < daysInMonth && c.periodicite === 'mensuelle' ? ` (prorata ${jours}/${daysInMonth} j)` : ''}`,
        contrat: c._id, cle: `salaire:${sid(c.reparateur)}:${periode}:${sid(c._id)}`, createdBy: userId,
      });
      crees++;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return crees;
};

/** Journal par réparateur sur une plage (figé dans la clôture). */
const journal = async (from, to) => {
  const pieces = await Reparation.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $unwind: '$piecesStock' },
    { $match: { 'piecesStock.statut': 'consomme', 'piecesStock.dateConsommation': { $gte: from, $lte: to } } },
    { $group: {
      _id: { $ifNull: ['$piecesStock.reparateur', '$reparateur'] },
      q: { $sum: '$piecesStock.quantite' }, c: { $sum: { $ifNull: ['$piecesStock.coutTotal', 0] } },
    } },
  ]);
  const decl = await DeclarationJournaliere.aggregate([
    { $match: { date: { $gte: from, $lte: to }, statut: { $in: ['validee', 'cloturee'] } } },
    { $unwind: '$lignes' },
    { $match: { 'lignes.statut': 'active' } },
    { $group: { _id: '$reparateur', q: { $sum: '$lignes.quantite' }, c: { $sum: { $ifNull: ['$lignes.coutTotal', 0] } } } },
  ]);
  const sold = await soldes({ from, to });
  const rows = new Map();
  const row = (id) => {
    const k = sid(id);
    if (!k) return null;
    if (!rows.has(k)) rows.set(k, { reparateur: k, consommations: 0, coutPieces: 0, commissions: 0, salaires: 0, primes: 0, avances: 0, paiements: 0 });
    return rows.get(k);
  };
  for (const p of [...pieces, ...decl]) {
    const r = row(p._id);
    if (!r) continue;
    r.consommations += p.q;
    r.coutPieces = money.sum([r.coutPieces, p.c]);
  }
  for (const s of sold) {
    const r = row(s.reparateur);
    r.nom = s.nom;
    Object.assign(r, {
      commissions: s.periode.commissionsValidees, salaires: s.periode.salaires,
      primes: money.sum([s.periode.primes, s.periode.ajustements]),
      avances: s.periode.avances, paiements: s.periode.paiements,
    });
  }
  const users = await User.find({ _id: { $in: [...rows.keys()] } }).select('firstName lastName username').lean();
  const names = new Map(users.map((u) => [sid(u._id), `${u.firstName} ${u.lastName}`.trim() || u.username]));
  const list = [...rows.values()].map((r) => ({ ...r, nom: r.nom || names.get(r.reparateur) || '—' }));
  const totaux = list.reduce((t, r) => {
    for (const k of ['consommations', 'coutPieces', 'commissions', 'salaires', 'primes', 'avances', 'paiements']) {
      t[k] = k === 'consommations' ? (t[k] || 0) + r[k] : money.sum([t[k] || 0, r[k]]);
    }
    return t;
  }, {});
  return { journal: list, totaux };
};

const enregistrerCloture = async ({ type, periode, data, userId, motif = '' }) => {
  const boutique = requireBoutiqueId();
  const existing = await Cloture.findOne({ boutique, type, periode });
  if (existing && existing.statut === 'cloturee') throw new AppError('Période déjà clôturée', 409, 'DEJA_CLOTUREE');
  if (existing) {
    existing.set({ statut: 'cloturee', journal: data.journal, totaux: data.totaux, clotureLe: new Date(), cloturePar: userId });
    existing.historique.push({ action: 'cloture', par: userId, motif });
    return existing.save();
  }
  return Cloture.create({
    boutique, type, periode, journal: data.journal, totaux: data.totaux, cloturePar: userId,
    historique: [{ action: 'cloture', par: userId, motif }],
  });
};

/** Clôture journalière : calcul + validation des commissions du jour, journal figé. */
const cloturerJour = async (jour, userId) => {
  if (!isJour(jour)) throw new AppError('Jour invalide (YYYY-MM-DD)');
  const boutique = requireBoutiqueId();
  const already = await Cloture.exists({ boutique, type: 'journaliere', periode: jour, statut: 'cloturee' });
  if (already) throw new AppError('Journée déjà clôturée', 409, 'DEJA_CLOTUREE');
  const brouillons = await DeclarationJournaliere.countDocuments({ boutique, jour, statut: 'brouillon' });
  if (brouillons > 0) {
    throw new AppError(`${brouillons} déclaration(s) en brouillon pour ce jour : validez-les ou annulez-les avant la clôture.`, 409);
  }
  const [d0, d1] = jourBounds(jour);
  const calcul = await commissionService.calculerPeriode({ from: d0, to: d1, userId });
  const validees = await commissionService.valider({ boutique, dateSource: { $gte: d0, $lte: d1 } }, userId);
  await DeclarationJournaliere.updateMany({ boutique, jour, statut: 'validee' }, { $set: { statut: 'cloturee' } });
  const data = await journal(d0, d1);
  data.totaux = { ...data.totaux, commissionsValidees: validees, alertes: calcul.alertes.length };
  const cloture = await enregistrerCloture({ type: 'journaliere', periode: jour, data, userId });
  return { cloture, calcul, validees };
};

/** Clôture mensuelle : salaires + commissions du mois, journal figé. */
const cloturerMois = async (periode, userId) => {
  if (!isPeriode(periode)) throw new AppError('Période invalide (YYYY-MM)');
  const boutique = requireBoutiqueId();
  const already = await Cloture.exists({ boutique, type: 'mensuelle', periode, statut: 'cloturee' });
  if (already) throw new AppError('Mois déjà clôturé', 409, 'DEJA_CLOTUREE');
  const [d0, d1] = moisBounds(periode);
  const brouillons = await DeclarationJournaliere.countDocuments({ boutique, date: { $gte: d0, $lte: d1 }, statut: 'brouillon' });
  if (brouillons > 0) throw new AppError(`${brouillons} déclaration(s) en brouillon dans le mois.`, 409);
  const salaires = await genererSalaires(periode, userId);
  const calcul = await commissionService.calculerPeriode({ from: d0, to: d1, userId });
  const validees = await commissionService.valider({ boutique, dateSource: { $gte: d0, $lte: d1 } }, userId);
  await DeclarationJournaliere.updateMany(
    { boutique, date: { $gte: d0, $lte: d1 }, statut: 'validee' },
    { $set: { statut: 'cloturee' } }
  );
  const data = await journal(d0, d1);
  data.totaux = { ...data.totaux, salairesGeneres: salaires, commissionsValidees: validees, alertes: calcul.alertes.length };
  const cloture = await enregistrerCloture({ type: 'mensuelle', periode, data, userId });
  return { cloture, calcul, validees, salaires };
};

const rouvrir = async (id, motif, userId) => {
  if (!motif || !String(motif).trim()) throw new AppError('Motif de réouverture obligatoire');
  const c = await Cloture.findById(id);
  if (!c) throw new AppError('Clôture introuvable', 404);
  if (c.statut !== 'cloturee') throw new AppError('Clôture déjà rouverte', 409);
  c.statut = 'rouverte';
  c.historique.push({ action: 'reouverture', par: userId, motif });
  await c.save();
  // Les déclarations figées par cette clôture redeviennent « validées » (annulables / corrigeables),
  // sauf si la période reste couverte par une autre clôture active (jour dans un mois clôturé, etc.).
  const [d0, d1] = c.type === 'journaliere' ? jourBounds(c.periode) : moisBounds(c.periode);
  const decls = await DeclarationJournaliere.find({ boutique: c.boutique, date: { $gte: d0, $lte: d1 }, statut: 'cloturee' })
    .select('date').lean();
  const { isPeriodeCloturee } = require('./atelierService');
  const aRouvrir = [];
  for (const d of decls) if (!(await isPeriodeCloturee(c.boutique, d.date))) aRouvrir.push(d._id);
  if (aRouvrir.length) await DeclarationJournaliere.updateMany({ _id: { $in: aRouvrir } }, { $set: { statut: 'validee' } });
  return c;
};

module.exports = { soldes, genererSalaires, journal, cloturerJour, cloturerMois, rouvrir };
