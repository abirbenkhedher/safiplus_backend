const Reparation = require('../models/Reparation');
const Commission = require('../models/Commission');
const DeclarationJournaliere = require('../models/DeclarationJournaliere');
const EcritureRemuneration = require('../models/EcritureRemuneration');
const Depense = require('../models/Depense');
const Stock = require('../models/Stock');
const money = require('../utils/money');
const { getParametres } = require('./atelierService');
const { coutReference } = require('./valorisationService');
const { prixTotalReparation, toHT } = require('./commissionService');

// ============================================================
// ✅ RENTABILITÉ (§8.2)
// Coût pièces = Σ quantités × coût unitaire figé
// Marge avant commission = CA HT − coûts directs attribués
// Résultat après commission = marge − commissions liées
// Charges générales : jamais réparties artificiellement sur les dossiers.
// ============================================================

const sid = (v) => (v ? String(v._id || v) : null);

/** Rentabilité d'un dossier de réparation. */
const reparation = async (repOrId) => {
  const rep = repOrId?._id ? repOrId : await Reparation.findById(repOrId).lean();
  if (!rep) return null;
  const params = await getParametres(rep.boutique);
  const caTTC = prixTotalReparation(rep);
  const caHT = toHT(params, caTTC);

  let estime = false;
  const lignes = [];
  for (const p of (rep.piecesStock || []).filter((x) => x.statut === 'consomme')) {
    let cout = p.coutTotal;
    if (cout === null || cout === undefined) {
      const st = await Stock.findById(p.stock).select('cmp coutManuel').lean();
      cout = money.mul(st ? coutReference(st).cout : 0, p.quantite);
      estime = true;
    }
    if (p.sourceCout === 'ESTIME') estime = true;
    lignes.push({ source: 'reparation', designation: [p.snapshot?.typeArticle, p.snapshot?.marque, p.snapshot?.modele].filter(Boolean).join(' '), quantite: p.quantite, coutUnitaire: p.coutUnitaire, coutTotal: cout, sourceCout: p.sourceCout || 'ESTIME' });
  }
  // Lignes de déclarations journalières rattachées au dossier
  const decls = await DeclarationJournaliere.find({
    statut: { $in: ['validee', 'cloturee'] }, 'lignes.reparation': rep._id,
  }).select('lignes').lean();
  for (const d of decls) {
    for (const l of d.lignes.filter((x) => x.statut === 'active' && sid(x.reparation) === sid(rep._id))) {
      if (l.sourceCout === 'ESTIME') estime = true;
      lignes.push({ source: 'declaration', designation: l.designation, quantite: l.quantite, coutUnitaire: l.coutUnitaire, coutTotal: l.coutTotal || 0, sourceCout: l.sourceCout });
    }
  }
  const coutPieces = money.sum(lignes.map((l) => l.coutTotal));
  const autresCouts = 0; // les dépenses ne sont pas rattachées à un dossier dans l'existant

  const coms = await Commission.find({ reparation: rep._id, statut: { $in: ['calculee', 'validee'] } })
    .select('montant statut reparateur sourceType').populate('reparateur', 'firstName lastName').lean();
  const commissions = money.sum(coms.map((c) => c.montant));
  const coutsDirects = money.sum([coutPieces, autresCouts]);
  const margeAvantCommission = money.sub(caHT, coutsDirects);

  return {
    reparation: rep._id,
    numero: rep.numero,
    caTTC, caHT, coutPieces, autresCouts, coutsDirects,
    margeAvantCommission,
    commissions,
    commissionsEnAttente: money.sum(coms.filter((c) => c.statut === 'calculee').map((c) => c.montant)),
    resultatApresCommission: money.sub(margeAvantCommission, commissions),
    tauxMarge: caHT > 0 ? Math.round((margeAvantCommission / caHT) * 10000) / 100 : null,
    coutEstime: estime,
    lignes,
    detailCommissions: coms,
  };
};

/** Rentabilité globale de la (des) boutique(s) visible(s) sur une période. */
const boutique = async ({ from, to }) => {
  const reps = await Reparation.find({ isDeleted: { $ne: true }, dateCloture: { $gte: from, $lte: to } })
    .select('prix diagnosticImprevus boutique piecesStock').lean();
  const paramsCache = new Map();
  const params = async (b) => {
    if (!paramsCache.has(sid(b))) paramsCache.set(sid(b), await getParametres(b));
    return paramsCache.get(sid(b));
  };

  let caHTm = 0;
  for (const r of reps) caHTm += money.toM(toHT(await params(r.boutique), prixTotalReparation(r)));
  const caHT = money.fromM(caHTm);

  // Coût des pièces consommées dans la période (dossiers + déclarations, liées ou non)
  const [piecesAgg] = await Reparation.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $unwind: '$piecesStock' },
    { $match: { 'piecesStock.statut': 'consomme', 'piecesStock.dateConsommation': { $gte: from, $lte: to } } },
    { $group: { _id: null, c: { $sum: { $ifNull: ['$piecesStock.coutTotal', 0] } } } },
  ]);
  const declAgg = await DeclarationJournaliere.aggregate([
    { $match: { date: { $gte: from, $lte: to }, statut: { $in: ['validee', 'cloturee'] } } },
    { $unwind: '$lignes' },
    { $match: { 'lignes.statut': 'active' } },
    { $group: { _id: { lie: { $ne: ['$lignes.reparation', null] } }, c: { $sum: { $ifNull: ['$lignes.coutTotal', 0] } } } },
  ]);
  const declLiees = declAgg.find((d) => d._id.lie)?.c || 0;
  const declNonLiees = declAgg.find((d) => !d._id.lie)?.c || 0;
  const coutPieces = money.sum([piecesAgg?.c || 0, declLiees, declNonLiees]);

  const depAgg = await Depense.aggregate([
    { $match: { isDeleted: false, statut: { $nin: ['annulee', 'brouillon'] }, dateDepense: { $gte: from, $lte: to } } },
    { $group: { _id: '$type', total: { $sum: '$montant' } } },
  ]);
  const dep = (t) => depAgg.find((d) => d._id === t)?.total || 0;

  const [comAgg] = await Commission.aggregate([
    { $match: { statut: 'validee', dateSource: { $gte: from, $lte: to } } },
    { $group: { _id: null, t: { $sum: '$montant' } } },
  ]);
  const ecrAgg = await EcritureRemuneration.aggregate([
    { $match: { statut: 'validee', date: { $gte: from, $lte: to } } },
    { $group: { _id: '$type', t: { $sum: '$montant' } } },
  ]);
  const commissions = money.round3(comAgg?.t || 0);
  const salaires = money.round3(ecrAgg.find((e) => e._id === 'salaire')?.t || 0);
  const primes = money.sum(ecrAgg.filter((e) => e._id !== 'salaire').map((e) => e.t));

  const coutsDirects = money.sum([coutPieces, dep('REPARATION')]);
  const margeBrute = money.sub(caHT, coutsDirects);
  const remunerations = money.sum([commissions, salaires, primes]);
  const chargesGenerales = money.round3(dep('DIVERSE'));
  const resultatNet = money.sub(margeBrute, money.sum([remunerations, chargesGenerales]));

  return {
    periode: { from, to },
    nbReparations: reps.length,
    caHT,
    coutsDirects: { total: coutsDirects, pieces: coutPieces, piecesNonRattachees: money.round3(declNonLiees), depensesReparation: money.round3(dep('REPARATION')) },
    margeBrute,
    remunerations: { total: remunerations, commissions, salaires, primesAjustements: primes },
    chargesGenerales,
    resultatNet,
    achatsStock: money.round3(dep('ACHAT')), // information : valorisés via les consommations
  };
};

module.exports = { reparation, boutique };
