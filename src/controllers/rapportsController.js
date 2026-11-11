const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Depense = require('../models/Depense');
const Reparation = require('../models/Reparation');
const DeclarationJournaliere = require('../models/DeclarationJournaliere');
const Commission = require('../models/Commission');
const Stock = require('../models/Stock');
const User = require('../models/User');
const remuneration = require('../services/remunerationService');
const rentabilite = require('../services/rentabiliteService');
const { prixTotalReparation, toHT } = require('../services/commissionService');
const { getParametres } = require('../services/atelierService');
const { AppError, rangeFromQuery } = require('../utils/appError');
const money = require('../utils/money');

// ============================================================
// ✅ RAPPORTS & INDICATEURS (§15) — JSON ou Excel (?format=xlsx)
// Chaque rapport renvoie { colonnes, lignes, totaux }.
// ============================================================

const sid = (v) => (v ? String(v._id || v) : null);
const nomUser = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username : '—');
const r3 = money.round3;

const usersMap = async (ids) => {
  const list = await User.find({ _id: { $in: ids.filter(Boolean) } }).select('firstName lastName username').lean();
  return new Map(list.map((u) => [sid(u._id), nomUser(u)]));
};

const RAPPORTS = {
  // Dépenses par période / catégorie / fournisseur / type
  async depenses(q, [from, to]) {
    const groupBy = q.groupBy || 'type';
    const key = {
      type: '$type',
      categorie: { $ifNull: [{ $cond: [{ $eq: ['$categorieDiverse', ''] }, null, '$categorieDiverse'] }, '$type'] },
      fournisseur: { $ifNull: ['$fournisseurRef', '$fournisseur'] },
      mois: { $dateToString: { format: '%Y-%m', date: '$dateDepense' } },
    }[groupBy];
    if (!key) throw new AppError('groupBy invalide');
    const rows = await Depense.aggregate([
      { $match: { isDeleted: false, statut: { $nin: ['annulee', 'brouillon'] }, dateDepense: { $gte: from, $lte: to } } },
      { $group: { _id: key, total: { $sum: '$montant' }, nombre: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    if (groupBy === 'fournisseur') {
      const F = mongoose.model('Fournisseur');
      const ids = rows.map((r) => r._id).filter((x) => mongoose.isValidObjectId(x) && typeof x !== 'string');
      const fs = await F.find({ _id: { $in: ids } }).select('nom').lean();
      const m = new Map(fs.map((f) => [sid(f._id), f.nom]));
      rows.forEach((r) => { r._id = m.get(sid(r._id)) || r._id || '(sans fournisseur)'; });
    }
    return {
      colonnes: [{ key: 'cle', label: groupBy }, { key: 'nombre', label: 'Nombre' }, { key: 'total', label: 'Total (TND)', money: true }],
      lignes: rows.map((r) => ({ cle: r._id || '—', nombre: r.nombre, total: r3(r.total) })),
      totaux: { total: money.sum(rows.map((r) => r.total)), nombre: rows.reduce((s, r) => s + r.nombre, 0) },
    };
  },

  // Achats et coûts moyens par article
  async achats(q, [from, to]) {
    const rows = await Depense.aggregate([
      { $match: { isDeleted: false, type: 'ACHAT', statut: 'validee', dateDepense: { $gte: from, $lte: to } } },
      { $unwind: '$lignes' },
      { $group: { _id: { stock: '$lignes.stock', designation: '$lignes.designation' }, quantite: { $sum: '$lignes.quantite' }, total: { $sum: '$lignes.montant' } } },
      { $sort: { total: -1 } },
    ]);
    const stocks = await Stock.find({ _id: { $in: rows.map((r) => r._id.stock).filter(Boolean) } }).select('code cmp quantite').lean();
    const sm = new Map(stocks.map((s) => [sid(s._id), s]));
    return {
      colonnes: [
        { key: 'code', label: 'Code' }, { key: 'designation', label: 'Article' }, { key: 'quantite', label: 'Qté achetée' },
        { key: 'total', label: 'Total (TND)', money: true }, { key: 'coutMoyen', label: 'Coût moyen achat', money: true },
        { key: 'cmp', label: 'CMP actuel', money: true }, { key: 'stock', label: 'Stock' },
      ],
      lignes: rows.map((r) => {
        const s = sm.get(sid(r._id.stock));
        return {
          code: s?.code || '', designation: r._id.designation, quantite: r.quantite, total: r3(r.total),
          coutMoyen: r.quantite ? money.fromM(Math.round(money.toM(r.total) / r.quantite)) : 0,
          cmp: s?.cmp ?? null, stock: s?.quantite ?? null,
        };
      }),
      totaux: { total: money.sum(rows.map((r) => r.total)) },
    };
  },

  // Consommations par article / réparateur / jour
  async consommations(q, [from, to]) {
    const groupBy = q.groupBy || 'article';
    const keyRep = { article: '$piecesStock.stock', reparateur: { $ifNull: ['$piecesStock.reparateur', '$reparateur'] }, jour: { $dateToString: { format: '%Y-%m-%d', date: '$piecesStock.dateConsommation' } } }[groupBy];
    const keyDecl = { article: '$lignes.stock', reparateur: '$reparateur', jour: '$jour' }[groupBy];
    if (!keyRep) throw new AppError('groupBy invalide');
    const [a, b] = await Promise.all([
      Reparation.aggregate([
        { $match: { isDeleted: { $ne: true } } }, { $unwind: '$piecesStock' },
        { $match: { 'piecesStock.statut': 'consomme', 'piecesStock.dateConsommation': { $gte: from, $lte: to } } },
        { $group: { _id: keyRep, quantite: { $sum: '$piecesStock.quantite' }, cout: { $sum: { $ifNull: ['$piecesStock.coutTotal', 0] } } } },
      ]),
      DeclarationJournaliere.aggregate([
        { $match: { date: { $gte: from, $lte: to }, statut: { $in: ['validee', 'cloturee'] } } }, { $unwind: '$lignes' },
        { $match: { 'lignes.statut': 'active' } },
        { $group: { _id: keyDecl, quantite: { $sum: '$lignes.quantite' }, cout: { $sum: { $ifNull: ['$lignes.coutTotal', 0] } } } },
      ]),
    ]);
    const m = new Map();
    for (const [src, list] of [['dossier', a], ['declaration', b]]) {
      for (const r of list) {
        const k = sid(r._id) || String(r._id);
        const row = m.get(k) || { id: r._id, quantiteDossiers: 0, quantiteDeclarations: 0, cout: 0 };
        row[src === 'dossier' ? 'quantiteDossiers' : 'quantiteDeclarations'] += r.quantite;
        row.cout = money.sum([row.cout, r.cout]);
        m.set(k, row);
      }
    }
    const rows = [...m.values()];
    let label = (r) => String(r.id);
    if (groupBy === 'reparateur') {
      const names = await usersMap(rows.map((r) => sid(r.id)));
      label = (r) => names.get(sid(r.id)) || '—';
    } else if (groupBy === 'article') {
      const st = await Stock.find({ _id: { $in: rows.map((r) => r.id) } }).populate('typeArticle marque modele', 'nom').lean();
      const sm = new Map(st.map((s) => [sid(s._id), [s.code, s.typeArticle?.nom, s.marque?.nom, s.modele?.nom].filter(Boolean).join(' ')]));
      label = (r) => sm.get(sid(r.id)) || '—';
    }
    return {
      colonnes: [{ key: 'cle', label: groupBy }, { key: 'quantiteDossiers', label: 'Qté (dossiers)' }, { key: 'quantiteDeclarations', label: 'Qté (déclarations)' }, { key: 'cout', label: 'Coût (TND)', money: true }],
      lignes: rows.map((r) => ({ cle: label(r), quantiteDossiers: r.quantiteDossiers, quantiteDeclarations: r.quantiteDeclarations, cout: r.cout })).sort((x, y) => y.cout - x.cout),
      totaux: { cout: money.sum(rows.map((r) => r.cout)) },
    };
  },

  // Réparations terminées et CA par réparateur
  async reparateurs(q, [from, to]) {
    const reps = await Reparation.find({ isDeleted: { $ne: true }, dateCloture: { $gte: from, $lte: to } })
      .select('reparateur prix diagnosticImprevus boutique').lean();
    const pc = new Map();
    const m = new Map();
    for (const r of reps) {
      if (!pc.has(sid(r.boutique))) pc.set(sid(r.boutique), await getParametres(r.boutique));
      const k = sid(r.reparateur) || 'aucun';
      const row = m.get(k) || { id: k, nombre: 0, caHT: 0 };
      row.nombre++;
      row.caHT = money.sum([row.caHT, toHT(pc.get(sid(r.boutique)), prixTotalReparation(r))]);
      m.set(k, row);
    }
    const names = await usersMap([...m.keys()].filter((k) => k !== 'aucun'));
    const rows = [...m.values()];
    return {
      colonnes: [{ key: 'reparateur', label: 'Réparateur' }, { key: 'nombre', label: 'Réparations terminées' }, { key: 'caHT', label: 'CA HT (TND)', money: true }],
      lignes: rows.map((r) => ({ reparateur: names.get(r.id) || '(non assigné)', nombre: r.nombre, caHT: r.caHT })).sort((a, b) => b.caHT - a.caHT),
      totaux: { nombre: reps.length, caHT: money.sum(rows.map((r) => r.caHT)) },
    };
  },

  // Commissions journalières / mensuelles
  async commissions(q, [from, to]) {
    const fmt = q.groupBy === 'mois' ? '%Y-%m' : '%Y-%m-%d';
    const rows = await Commission.aggregate([
      { $match: { dateSource: { $gte: from, $lte: to }, statut: { $in: ['calculee', 'validee'] } } },
      { $group: { _id: { p: { $dateToString: { format: fmt, date: '$dateSource' } }, r: '$reparateur', s: '$statut' }, total: { $sum: '$montant' } } },
    ]);
    const m = new Map();
    for (const x of rows) {
      const k = `${x._id.p}|${sid(x._id.r)}`;
      const row = m.get(k) || { periode: x._id.p, rep: sid(x._id.r), validees: 0, enAttente: 0 };
      row[x._id.s === 'validee' ? 'validees' : 'enAttente'] = money.sum([row[x._id.s === 'validee' ? 'validees' : 'enAttente'], x.total]);
      m.set(k, row);
    }
    const names = await usersMap([...m.values()].map((r) => r.rep));
    const list = [...m.values()].sort((a, b) => a.periode.localeCompare(b.periode));
    return {
      colonnes: [{ key: 'periode', label: 'Période' }, { key: 'reparateur', label: 'Réparateur' }, { key: 'validees', label: 'Validées', money: true }, { key: 'enAttente', label: 'En attente', money: true }],
      lignes: list.map((r) => ({ periode: r.periode, reparateur: names.get(r.rep) || '—', validees: r.validees, enAttente: r.enAttente })),
      totaux: { validees: money.sum(list.map((r) => r.validees)), enAttente: money.sum(list.map((r) => r.enAttente)) },
    };
  },

  // Salaires, avances, paiements, soldes
  async soldes(q, range) {
    const rows = await remuneration.soldes({ from: range[0], to: range[1] });
    return {
      colonnes: [
        { key: 'nom', label: 'Réparateur' }, { key: 'salaires', label: 'Salaires', money: true },
        { key: 'commissions', label: 'Commissions validées', money: true }, { key: 'primes', label: 'Primes / ajust.', money: true },
        { key: 'gains', label: 'Gains bruts (période)', money: true }, { key: 'avances', label: 'Avances', money: true },
        { key: 'paiements', label: 'Paiements', money: true }, { key: 'soldeDu', label: 'Solde dû (cumul)', money: true },
      ],
      lignes: rows.map((r) => ({
        nom: r.nom, salaires: r.periode.salaires, commissions: r.periode.commissionsValidees,
        primes: money.sum([r.periode.primes, r.periode.ajustements]), gains: r.periode.gainsBruts,
        avances: r.periode.avances, paiements: r.periode.paiements, soldeDu: r.cumul.soldeDu,
      })),
      totaux: { soldeDu: money.sum(rows.map((r) => r.cumul.soldeDu)), gains: money.sum(rows.map((r) => r.periode.gainsBruts)) },
    };
  },

  // Rentabilité par réparation (dossiers clôturés)
  async 'rentabilite-reparations'(q, [from, to]) {
    const reps = await Reparation.find({ isDeleted: { $ne: true }, dateCloture: { $gte: from, $lte: to } }).sort({ dateCloture: -1 }).limit(1000).lean();
    const lignes = [];
    for (const rep of reps) {
      const x = await rentabilite.reparation(rep);
      lignes.push({
        numero: x.numero, caHT: x.caHT, coutPieces: x.coutPieces, marge: x.margeAvantCommission,
        commissions: x.commissions, resultat: x.resultatApresCommission, tauxMarge: x.tauxMarge, estime: x.coutEstime ? 'oui' : '',
      });
    }
    return {
      colonnes: [
        { key: 'numero', label: 'Dossier' }, { key: 'caHT', label: 'CA HT', money: true }, { key: 'coutPieces', label: 'Coût pièces', money: true },
        { key: 'marge', label: 'Marge', money: true }, { key: 'commissions', label: 'Commissions', money: true },
        { key: 'resultat', label: 'Résultat', money: true }, { key: 'tauxMarge', label: 'Marge %' }, { key: 'estime', label: 'Coût estimé' },
      ],
      lignes,
      totaux: { caHT: money.sum(lignes.map((l) => l.caHT)), resultat: money.sum(lignes.map((l) => l.resultat)) },
    };
  },
};

const sendXlsx = async (res, nom, rapport, [from, to]) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nom.slice(0, 31));
  ws.addRow([`Rapport ${nom}`, `du ${from.toLocaleDateString('fr-FR')} au ${to.toLocaleDateString('fr-FR')}`]);
  ws.addRow([]);
  const header = ws.addRow(rapport.colonnes.map((c) => c.label));
  header.font = { bold: true };
  for (const l of rapport.lignes) ws.addRow(rapport.colonnes.map((c) => l[c.key]));
  rapport.colonnes.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, c.label.length + 2);
    if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.000';
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="rapport-${nom}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};

exports.rapport = async (req, res) => {
  const fn = RAPPORTS[req.params.nom];
  if (!fn) throw new AppError('Rapport inconnu', 404);
  const range = rangeFromQuery(req.query);
  const data = await fn(req.query, range);
  if (req.query.format === 'xlsx') return sendXlsx(res, req.params.nom, data, range);
  res.json({ success: true, data, periode: { from: range[0], to: range[1] } });
};

exports.liste = (req, res) => res.json({ success: true, data: Object.keys(RAPPORTS) });

exports.rentabiliteBoutique = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  res.json({ success: true, data: await rentabilite.boutique({ from, to }) });
};

exports.rentabiliteReparation = async (req, res) => {
  const data = await rentabilite.reparation(req.params.id);
  if (!data) throw new AppError('Réparation introuvable', 404);
  res.json({ success: true, data });
};

// Dashboard atelier : indicateurs synthétiques de la période
exports.dashboard = async (req, res) => {
  const range = rangeFromQuery(req.query);
  const [rent, soldes, dep, conso] = await Promise.all([
    rentabilite.boutique({ from: range[0], to: range[1] }),
    remuneration.soldes({ from: range[0], to: range[1] }),
    RAPPORTS.depenses({ groupBy: 'type' }, range),
    RAPPORTS.consommations({ groupBy: 'reparateur' }, range),
  ]);
  const enAttente = await Commission.aggregate([
    { $match: { statut: 'calculee' } }, { $group: { _id: null, t: { $sum: '$montant' }, n: { $sum: 1 } } },
  ]);
  res.json({
    success: true,
    data: {
      rentabilite: rent,
      depenses: dep,
      consommations: conso,
      remunerations: {
        soldeDuTotal: money.sum(soldes.map((s) => s.cumul.soldeDu)),
        commissionsEnAttente: r3(enAttente[0]?.t || 0),
        nbCommissionsEnAttente: enAttente[0]?.n || 0,
        parReparateur: soldes,
      },
    },
  });
};
