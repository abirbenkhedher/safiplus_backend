const ExcelJS = require('exceljs');
const DocumentVente = require('../models/DocumentVente');
const Depense = require('../models/Depense');
const SessionCaisse = require('../models/SessionCaisse');
const venteService = require('./venteService');
const { toM, fromM } = require('../utils/money');
const { jourKey } = require('../utils/appError');

// ============================================================
// ✅ RAPPORT COMMERCIAL : CA, TVA collectée / déductible, encaissements,
//    marge sur articles, meilleures ventes, créances, écarts de caisse.
// ============================================================
const LIB = { FACTURE: 'Facture', TICKET: 'Ticket', AVOIR: 'Avoir' };

const rapport = async ({ from, to }) => {
  const [docs, achats, sessions, synthese, journal, creances] = await Promise.all([
    DocumentVente.find({ type: { $in: ['FACTURE', 'TICKET', 'AVOIR'] }, statut: 'valide', isDeleted: false, date: { $gte: from, $lte: to } })
      .select('type numero date clientSnapshot totalHT totalTVA totalTTC timbreFiscal netAPayer tvaParTaux lignes').sort({ date: 1 }).lean(),
    Depense.find({ type: 'ACHAT', statut: 'validee', isDeleted: false, dateDepense: { $gte: from, $lte: to } })
      .select('numero dateDepense fournisseur montantHT montantTVA montant lignes').lean(),
    SessionCaisse.find({ statut: 'fermee', fermeLe: { $gte: from, $lte: to } })
      .select('numero ouvertureLe fermeLe fondInitial montantCompte ecart totaux remiseBanque').sort({ fermeLe: 1 }).lean(),
    venteService.synthese({ from, to }),
    venteService.journal({ from, to }),
    venteService.creances(),
  ]);

  // TVA collectée (factures + tickets − avoirs) et déductible (achats validés), par taux
  const tva = new Map();
  const get = (t) => { if (!tva.has(t)) tva.set(t, { taux: t, baseCollecteeM: 0, collecteeM: 0, baseDeductibleM: 0, deductibleM: 0 }); return tva.get(t); };
  docs.forEach((d) => (d.tvaParTaux || []).forEach((x) => {
    const s = d.type === 'AVOIR' ? -1 : 1;
    const e = get(Number(x.taux) || 0);
    e.baseCollecteeM += s * toM(x.base);
    e.collecteeM += s * toM(x.montant);
  }));
  achats.forEach((a) => (a.lignes || []).forEach((l) => {
    const e = get(Number(l.tauxTVA) || 0);
    e.baseDeductibleM += toM(l.montantHT);
    e.deductibleM += toM(l.montantTVA);
  }));
  const tvaParTaux = [...tva.values()].sort((a, b) => a.taux - b.taux).map((e) => ({
    taux: e.taux, baseCollectee: fromM(e.baseCollecteeM), collectee: fromM(e.collecteeM),
    baseDeductible: fromM(e.baseDeductibleM), deductible: fromM(e.deductibleM), nette: fromM(e.collecteeM - e.deductibleM),
  }));
  const sumK = (k) => fromM(tvaParTaux.reduce((s, x) => s + toM(x[k]), 0));

  // Ventes par jour
  const jours = new Map();
  docs.forEach((d) => {
    const k = jourKey(d.date);
    const j = jours.get(k) || { jour: k, htM: 0, ttcM: 0, nb: 0 };
    const s = d.type === 'AVOIR' ? -1 : 1;
    j.htM += s * toM(d.totalHT); j.ttcM += s * toM(d.netAPayer); j.nb += 1;
    jours.set(k, j);
  });
  const encJour = new Map();
  (journal.reglements || []).filter((r) => r.statut === 'valide').forEach((r) => {
    const k = jourKey(r.date);
    encJour.set(k, (encJour.get(k) || 0) + (r.sens === 'REMBOURSEMENT' ? -1 : 1) * toM(r.montant));
  });
  const parJour = [...new Set([...jours.keys(), ...encJour.keys()])].sort().map((k) => ({
    jour: k, nombre: jours.get(k)?.nb || 0, ht: fromM(jours.get(k)?.htM || 0), ttc: fromM(jours.get(k)?.ttcM || 0), encaisse: fromM(encJour.get(k) || 0),
  }));

  // Meilleures ventes (articles du stock)
  const arts = new Map();
  docs.forEach((d) => d.lignes.forEach((l) => {
    if (l.type !== 'article' || !l.stock) return;
    if (d.type === 'AVOIR' && !l.retourStock) return;
    const s = d.type === 'AVOIR' ? -1 : 1;
    const a = arts.get(String(l.stock)) || { designation: l.designation, code: l.code, quantite: 0, htM: 0, coutM: 0 };
    a.quantite += s * l.quantite;
    a.htM += s * toM(l.montantHT);
    a.coutM += s * Math.round(toM(l.coutUnitaire || 0) * l.quantite);
    arts.set(String(l.stock), a);
  }));
  const articles = [...arts.values()].map((a) => ({
    designation: a.designation, code: a.code, quantite: a.quantite, ht: fromM(a.htM), cout: fromM(a.coutM), marge: fromM(a.htM - a.coutM),
  })).sort((a, b) => b.ht - a.ht);

  const caisse = {
    sessions: sessions.map((s) => ({
      numero: s.numero, ouvertureLe: s.ouvertureLe, fermeLe: s.fermeLe, fondInitial: s.fondInitial,
      theorique: s.totaux?.theorique ?? null, compte: s.montantCompte, ecart: s.ecart, remiseBanque: s.remiseBanque,
    })),
    totalEcarts: fromM(sessions.reduce((t, s) => t + toM(s.ecart), 0)),
  };

  return {
    periode: { from, to },
    ca: {
      factures: synthese.factures, tickets: synthese.tickets, avoirs: synthese.avoirs,
      netHT: synthese.caNetHT,
      netTTC: fromM(toM(synthese.factures.ttc) + toM(synthese.tickets.ttc) - toM(synthese.avoirs.ttc)),
      timbres: fromM(docs.filter((d) => d.type === 'FACTURE').reduce((t, d) => t + toM(d.timbreFiscal), 0)),
    },
    tva: {
      parTaux: tvaParTaux, collectee: sumK('collectee'), deductible: sumK('deductible'), nette: sumK('nette'),
      achats: { nombre: achats.length, ht: fromM(achats.reduce((t, a) => t + toM(a.montantHT), 0)), tva: fromM(achats.reduce((t, a) => t + toM(a.montantTVA), 0)) },
    },
    encaissements: journal.totaux,
    articles: { ...synthese.articles, top: articles.slice(0, 15) },
    creances: {
      total: fromM(creances.filter((c) => c.solde > 0).reduce((t, c) => t + toM(c.solde), 0)),
      clients: creances.filter((c) => c.solde > 0).slice(0, 15).map((c) => ({ nom: c.clientInfo?.nom || '—', phone: c.clientInfo?.phone || '', solde: c.solde, nbImpayees: c.nbImpayees })),
    },
    caisse,
    parJour,
    _docs: docs,
    _reglements: journal.reglements,
  };
};

const dateFr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

/** Classeur Excel (plusieurs feuilles). */
const versExcel = async (r) => {
  const wb = new ExcelJS.Workbook();
  const titre = `du ${dateFr(r.periode.from)} au ${dateFr(r.periode.to)}`;
  const feuille = (nom, entetes, lignes) => {
    const ws = wb.addWorksheet(nom);
    ws.addRow([`${nom} — ${titre}`]).font = { bold: true };
    ws.addRow([]);
    ws.addRow(entetes).font = { bold: true };
    lignes.forEach((l) => ws.addRow(l));
    ws.columns.forEach((c) => { c.width = 18; });
    return ws;
  };
  feuille('Synthèse', ['Indicateur', 'Valeur'], [
    ['Factures (nombre)', r.ca.factures.nombre], ['Factures TTC', r.ca.factures.ttc],
    ['Tickets comptoir (nombre)', r.ca.tickets.nombre], ['Tickets TTC', r.ca.tickets.ttc],
    ['Avoirs TTC', r.ca.avoirs.ttc], ['CA net HT', r.ca.netHT], ['CA net TTC', r.ca.netTTC], ['Timbres fiscaux', r.ca.timbres],
    ['TVA collectée', r.tva.collectee], ['TVA déductible (achats)', r.tva.deductible], ['TVA nette à payer', r.tva.nette],
    ['Encaissé', r.encaissements.encaisse], ['Remboursé', r.encaissements.rembourse],
    ...Object.entries(r.encaissements.parMode || {}).map(([m, v]) => [`  dont ${m}`, v]),
    ['Ventes articles HT', r.articles.venteHT], ['Coût articles', r.articles.cout], ['Marge articles', r.articles.marge],
    ['Créances clients (total)', r.creances.total], ['Écarts de caisse (total)', r.caisse.totalEcarts],
  ]);
  feuille('TVA', ['Taux %', 'Base collectée HT', 'TVA collectée', 'Base déductible HT', 'TVA déductible', 'TVA nette'],
    r.tva.parTaux.map((t) => [t.taux, t.baseCollectee, t.collectee, t.baseDeductible, t.deductible, t.nette]));
  feuille('Documents', ['Type', 'N°', 'Date', 'Client', 'HT', 'TVA', 'Timbre', 'Net TTC'],
    r._docs.map((d) => {
      const s = d.type === 'AVOIR' ? -1 : 1;
      return [LIB[d.type], d.numero, dateFr(d.date), d.clientSnapshot?.nom || '', s * d.totalHT, s * d.totalTVA, d.timbreFiscal || 0, s * d.netAPayer];
    }));
  feuille('Règlements', ['N°', 'Date', 'Client', 'Sens', 'Mode', 'Référence', 'Montant', 'Statut'],
    (r._reglements || []).map((g) => [g.numero, dateFr(g.date), g.client?.nom || '', g.sens, g.mode, g.reference || '', g.montant, g.statut]));
  feuille('Articles', ['Code', 'Désignation', 'Quantité', 'Vente HT', 'Coût', 'Marge'],
    r.articles.top.map((a) => [a.code, a.designation, a.quantite, a.ht, a.cout, a.marge]));
  feuille('Par jour', ['Jour', 'Documents', 'HT', 'TTC', 'Encaissé'], r.parJour.map((j) => [j.jour, j.nombre, j.ht, j.ttc, j.encaisse]));
  feuille('Caisse', ['Session', 'Ouverture', 'Fermeture', 'Fond', 'Théorique', 'Compté', 'Écart', 'Remise banque'],
    r.caisse.sessions.map((s) => [s.numero, dateFr(s.ouvertureLe), dateFr(s.fermeLe), s.fondInitial, s.theorique, s.compte, s.ecart, s.remiseBanque]));
  return wb;
};

// ============================================================
// ✅ TABLEAU DE BORD de l'espace Commerce (aujourd'hui + mois en cours)
// ============================================================
const tableauDeBord = async () => {
  const Stock = require('../models/Stock');
  const caisseService = require('./caisseService');
  const { getTenant } = require('../config/tenantContext');
  const { jourBounds, moisBounds, periodeKey } = require('../utils/appError');
  const now = new Date();
  const [jF, jT] = jourBounds(jourKey(now));
  const [mF, mT] = moisBounds(periodeKey(now));
  const [jour, mois, devis, echues, dernieres, alertesStock] = await Promise.all([
    venteService.synthese({ from: jF, to: jT }),
    venteService.synthese({ from: mF, to: mT }),
    DocumentVente.find({ type: 'DEVIS', statut: { $in: ['valide', 'accepte'] }, isDeleted: false }).select('netAPayer statut').lean(),
    DocumentVente.find({ type: 'FACTURE', statut: 'valide', isDeleted: false, dateEcheance: { $lt: now } })
      .select('type statut netAPayer montantAvoirs montantRegleDirect reparations').lean(),
    DocumentVente.find({ type: { $in: ['FACTURE', 'TICKET'] }, statut: 'valide', isDeleted: false })
      .select('type numero date clientSnapshot netAPayer').sort({ date: -1 }).limit(8).lean(),
    Stock.countDocuments({ isActive: { $ne: false }, $expr: { $lte: ['$quantite', '$seuilAlerte'] } }),
  ]);
  const infos = await venteService.infosPaiementMany(echues);
  const enRetard = echues.map((f) => infos.get(String(f._id))).filter((i) => i && i.reste > 0);
  const ctx = getTenant() || {};
  let caisse = null;
  if (ctx.boutique) {
    const s = await caisseService.sessionOuverte(ctx.boutique);
    caisse = s ? { ouverte: true, numero: s.numero, theorique: (await caisseService.calculer(s)).theorique } : { ouverte: false };
  }
  return {
    jour, mois, caisse, alertesStock,
    devisEnCours: { nombre: devis.length, montant: fromM(devis.reduce((t, d) => t + toM(d.netAPayer), 0)), acceptes: devis.filter((d) => d.statut === 'accepte').length },
    facturesEnRetard: { nombre: enRetard.length, montant: fromM(enRetard.reduce((t, i) => t + toM(i.reste), 0)) },
    dernieresVentes: dernieres,
  };
};

// ============================================================
// ✅ VUE GLOBALE de l'entreprise : atelier + commerce sans double comptage
// Règle : une réparation est comptée UNE fois, depuis son dossier (même
// définition que les Statistiques : prix + imprévus acceptés des réparations
// reçues dans la période ; encaissé = acomptes). Le commerce n'ajoute que les
// lignes hors réparation (articles, services, tickets), nettes des avoirs, et
// les règlements hors part reportée sur les acomptes des réparations.
// Montants sur la base de saisie de chaque boutique (TTC ou HT, paramètre).
// ============================================================
const vueGlobale = async ({ from, to }) => {
  const Reparation = require('../models/Reparation');
  const Boutique = require('../models/Boutique');
  const Reglement = require('../models/Reglement');
  const { getParametres } = require('./atelierService');
  const { getTenant } = require('../config/tenantContext');
  const { prixTotalReparation } = require('../utils/statutReparation');
  const ctx = getTenant() || {};
  const ids = ctx.boutiques || [];
  const boutiques = await Boutique.find({ _id: { $in: ids } }).select('nom code').lean();

  const lignes = [];
  for (const b of boutiques) {
    const params = await getParametres(b._id);
    const base = params.prixTTC === false ? 'HT' : 'TTC';
    const [reps, docs, regs] = await Promise.all([
      Reparation.find({
        boutique: b._id, isDeleted: false,
        $or: [{ dateReception: { $gte: from, $lte: to } }, { dateReception: null, createdAt: { $gte: from, $lte: to } }],
      }).select('prix acompte diagnosticImprevus').lean(),
      DocumentVente.find({ boutique: b._id, type: { $in: ['FACTURE', 'TICKET', 'AVOIR'] }, statut: 'valide', isDeleted: false, date: { $gte: from, $lte: to } })
        .select('type lignes').lean(),
      Reglement.find({ boutique: b._id, statut: 'valide', date: { $gte: from, $lte: to } }).select('sens montant affectations').lean(),
    ]);
    const repCaM = reps.reduce((t, r) => t + toM(prixTotalReparation(r)), 0);
    const repEncM = reps.reduce((t, r) => t + toM(r.acompte), 0);
    let comCaM = 0; let repFactureeM = 0; let nbDocs = 0;
    for (const d of docs) {
      const s = d.type === 'AVOIR' ? -1 : 1;
      let hors = 0;
      for (const l of d.lignes) {
        const m = toM(base === 'TTC' ? l.montantTTC : l.montantHT);
        if (l.type === 'reparation') repFactureeM += s * m;
        else hors += m;
      }
      if (hors) nbDocs += 1;
      comCaM += s * hors;
    }
    let comEncM = 0;
    for (const r of regs) {
      if (r.sens === 'REMBOURSEMENT') { comEncM -= toM(r.montant); continue; }
      const reporte = (r.affectations || []).reduce((t, a) => t + (a.reparations || []).reduce((u, x) => u + toM(x.montant), 0), 0);
      comEncM += toM(r.montant) - reporte;
    }
    lignes.push({
      boutique: { _id: b._id, nom: b.nom, code: b.code }, base,
      reparations: { nombre: reps.length, ca: fromM(repCaM), encaisse: fromM(repEncM), facturees: fromM(repFactureeM) },
      commerce: { documents: nbDocs, ca: fromM(comCaM), encaisse: fromM(comEncM) },
      total: { ca: fromM(repCaM + comCaM), encaisse: fromM(repEncM + comEncM) },
    });
  }
  const somme = (f) => fromM(lignes.reduce((t, l) => t + toM(f(l)), 0));
  return {
    periode: { from, to },
    basesMixtes: new Set(lignes.map((l) => l.base)).size > 1,
    boutiques: lignes,
    totaux: {
      reparations: { nombre: lignes.reduce((t, l) => t + l.reparations.nombre, 0), ca: somme((l) => l.reparations.ca), encaisse: somme((l) => l.reparations.encaisse), facturees: somme((l) => l.reparations.facturees) },
      commerce: { documents: lignes.reduce((t, l) => t + l.commerce.documents, 0), ca: somme((l) => l.commerce.ca), encaisse: somme((l) => l.commerce.encaisse) },
      total: { ca: somme((l) => l.total.ca), encaisse: somme((l) => l.total.encaisse) },
    },
  };
};

module.exports = { rapport, versExcel, tableauDeBord, vueGlobale };
