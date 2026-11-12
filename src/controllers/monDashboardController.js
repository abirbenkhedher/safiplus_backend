const mongoose = require('mongoose');
const Reparation = require('../models/Reparation');
const Status = require('../models/Status');
const User = require('../models/User');
const PaiementReparateur = require('../models/PaiementReparateur');
const remuneration = require('../services/remunerationService');
const { prixTotalReparation } = require('../services/commissionService');
const { userScopeFilter } = require('../services/tenantService');
const { etapeReparation } = require('../utils/etapeReparation');
const { AppError, rangeFromQuery } = require('../utils/appError');
const money = require('../utils/money');

// ============================================================
// ✅ MON TABLEAU DE BORD (réparateur / commercial)
// GET /api/dashboard/me?from&to[&user=<id> pour l'admin]
// Uniquement les dossiers de l'utilisateur, dans la boutique active :
//   - atelier : dossiers qui lui sont affectés (reparateur)
//   - accueil : dossiers qu'il a créés (createdBy)
// Aucun chiffre global de la boutique (CA, bénéfice).
// ============================================================
const RETARD_HEURES = 48;
const LIST_MAX = 50;
const sid = (v) => (v ? String(v._id || v) : null);
const isAdmin = (u) => ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
const heuresDepuis = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
const jourISO = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const ligne = (r, statuses) => {
  const st = statuses.get(sid(r.status));
  const depuis = r.dateReception || r.createdAt;
  const h = heuresDepuis(depuis);
  return {
    _id: r._id,
    numero: r.numero,
    client: r.client?.nom || '—',
    telephone: r.client?.phone || '',
    appareil: [r.marque?.nom, r.modele?.nom].filter(Boolean).join(' ') || '—',
    statut: st?.label || '—',
    couleur: st?.color || '#6c757d',
    dateReception: depuis,
    heures: h,
    enRetard: h >= RETARD_HEURES,
    reste: money.round3(Math.max(0, prixTotalReparation(r) - (Number(r.acompte) || 0))),
  };
};

exports.getMe = async (req, res) => {
  // Utilisateur concerné : soi-même, ou un employé choisi par l'admin
  let cible = req.user;
  if (req.query.user && sid(req.query.user) !== sid(req.user._id)) {
    if (!isAdmin(req.user)) throw new AppError("Accès refusé au tableau de bord d'un autre utilisateur", 403);
    if (!mongoose.isValidObjectId(req.query.user)) throw new AppError('Utilisateur invalide');
    cible = await User.findOne({ _id: req.query.user, ...userScopeFilter(req) })
      .select('firstName lastName username role').lean();
    if (!cible) throw new AppError('Utilisateur introuvable', 404);
  }
  const me = new mongoose.Types.ObjectId(sid(cible._id));
  const [from, to] = rangeFromQuery(req.query);

  const statuses = new Map((await Status.find().select('label color').lean()).map((s) => [sid(s._id), s]));
  const etape = (r) => etapeReparation(statuses.get(sid(r.status))?.label);
  const pop = (q) => q.populate('client', 'nom phone').populate('marque', 'nom').populate('modele', 'nom')
    .select('numero client marque modele status dateReception createdAt dateFinReelle dateLivraison prix acompte diagnosticImprevus piecesStock reparateur createdBy isSAV savOrigine categorie')
    .lean();

  // ---------- Atelier : dossiers affectés ----------
  const affectees = await pop(Reparation.find({ reparateur: me, isDeleted: { $ne: true } }));
  const enCours = affectees.filter((r) => etape(r) === 'en_cours');
  const pretes = affectees.filter((r) => etape(r) === 'terminee');
  const aTraiter = enCours.map((r) => ligne(r, statuses))
    .sort((a, b) => (b.enRetard - a.enRetard) || (b.heures - a.heures));
  const pretesListe = pretes.map((r) => ligne(r, statuses)).sort((a, b) => b.heures - a.heures);

  const dansPeriode = (d) => d && new Date(d) >= from && new Date(d) <= to;
  const terminees = affectees.filter((r) => dansPeriode(r.dateFinReelle));
  const aujourdhui = jourISO(new Date());
  const termineesAujourdhui = affectees.filter((r) => r.dateFinReelle && jourISO(r.dateFinReelle) === aujourdhui).length;
  const delais = terminees
    .map((r) => (new Date(r.dateFinReelle) - new Date(r.dateReception || r.createdAt)) / 3600000)
    .filter((h) => h >= 0);
  const delaiMoyenHeures = delais.length ? Math.round(delais.reduce((s, h) => s + h, 0) / delais.length) : null;

  // Retours SAV de la période sur ses réparations
  const mesIds = affectees.map((r) => r._id);
  const savRetours = mesIds.length
    ? await Reparation.countDocuments({
        isDeleted: { $ne: true }, isSAV: true, savOrigine: { $in: mesIds },
        $or: [{ dateReception: { $gte: from, $lte: to } }, { dateReception: null, createdAt: { $gte: from, $lte: to } }],
      })
    : 0;

  // Pièces consommées par lui sur la période (tous dossiers)
  const piecesAgg = await Reparation.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $unwind: '$piecesStock' },
    {
      $match: {
        'piecesStock.statut': 'consomme',
        'piecesStock.dateConsommation': { $gte: from, $lte: to },
        $expr: { $eq: [{ $ifNull: ['$piecesStock.reparateur', '$reparateur'] }, me] },
      },
    },
    { $group: { _id: null, q: { $sum: '$piecesStock.quantite' } } },
  ]);

  // ---------- Accueil : dossiers créés ----------
  const creees = await pop(Reparation.find({
    createdBy: me, isDeleted: { $ne: true },
    $or: [{ dateReception: { $gte: from, $lte: to } }, { dateReception: null, createdAt: { $gte: from, $lte: to } }],
  }));
  const ouvertesCreees = await pop(Reparation.find({ createdBy: me, isDeleted: { $ne: true } }));
  const resteAEncaisser = ouvertesCreees
    .map((r) => Math.max(0, prixTotalReparation(r) - (Number(r.acompte) || 0)))
    .reduce((s, v) => s + v, 0);
  const aEncaisser = ouvertesCreees
    .map((r) => ligne(r, statuses))
    .filter((l) => l.reste > 0)
    .sort((a, b) => b.reste - a.reste);

  // ---------- Rémunération ----------
  const [sold] = await remuneration.soldes({ from, to, reparateurs: [sid(me)] });
  const dernierPaiement = await PaiementReparateur.findOne({ reparateur: me, statut: { $ne: 'annulee' } })
    .sort({ date: -1 }).select('type montant date').lean();

  // ---------- Graphiques ----------
  const parJour = {};
  for (const r of terminees) {
    const j = jourISO(r.dateFinReelle);
    parJour[j] = (parJour[j] || 0) + 1;
  }
  const familleAgg = await Reparation.aggregate([
    {
      $match: {
        reparateur: me, isDeleted: { $ne: true },
        $or: [{ dateReception: { $gte: from, $lte: to } }, { dateReception: null, createdAt: { $gte: from, $lte: to } }],
      },
    },
    { $lookup: { from: 'categories', localField: 'categorie', foreignField: '_id', as: 'cat' } },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'familles', localField: 'cat.famille', foreignField: '_id', as: 'fam' } },
    { $unwind: { path: '$fam', preserveNullAndEmptyArrays: true } },
    { $group: { _id: { $ifNull: ['$fam.nom', 'Non classé'] }, nb: { $sum: 1 } } },
    { $sort: { nb: -1 } },
  ]);

  const role = cible.role;
  res.json({
    success: true,
    data: {
      utilisateur: { _id: cible._id, nom: [cible.firstName, cible.lastName].filter(Boolean).join(' ') || cible.username, role },
      periode: { from, to },
      // Sections affichées : atelier pour les réparateurs (commerciaux inclus), accueil pour les commerciaux
      sections: {
        atelier: User.ROLES_REPARATEUR.includes(role) || isAdmin(cible) || affectees.length > 0,
        accueil: role !== 'REPARATEUR' || creees.length > 0,
      },
      compteurs: {
        aTraiter: aTraiter.length,
        enRetard: aTraiter.filter((l) => l.enRetard).length,
        termineesAujourdhui,
        pretesALivrer: pretesListe.length,
      },
      aTraiter: aTraiter.slice(0, LIST_MAX),
      pretes: pretesListe.slice(0, LIST_MAX),
      atelier: {
        terminees: terminees.length,
        delaiMoyenHeures,
        savRetours,
        piecesConsommees: piecesAgg[0]?.q || 0,
      },
      accueil: {
        receptionnees: creees.length,
        clientsServis: new Set(creees.map((r) => sid(r.client))).size,
        encaisse: money.round3(creees.reduce((s, r) => s + (Number(r.acompte) || 0), 0)),
        resteAEncaisser: money.round3(resteAEncaisser),
        aEncaisser: aEncaisser.slice(0, LIST_MAX),
      },
      remuneration: {
        commissionsValidees: sold?.periode.commissionsValidees || 0,
        commissionsEnAttente: sold?.periode.commissionsEnAttente || 0,
        gainsBruts: sold?.periode.gainsBruts || 0,
        soldeDu: sold?.cumul.soldeDu || 0,
        dernierPaiement: dernierPaiement || null,
      },
      graphiques: {
        termineesParJour: Object.entries(parJour).sort(([a], [b]) => a.localeCompare(b)).map(([date, nb]) => ({ date, nb })),
        parFamille: familleAgg.map((f) => ({ famille: f._id, nb: f.nb })),
      },
    },
  });
};
