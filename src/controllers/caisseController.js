const mongoose = require('mongoose');
const SessionCaisse = require('../models/SessionCaisse');
const caisse = require('../services/caisseService');
const rapportVente = require('../services/rapportVenteService');
const { requireBoutiqueId } = require('../services/atelierService');
const { logAction } = require('../services/historyService');
const { AppError, rangeFromQuery } = require('../utils/appError');

// ============================================================
// ✅ CAISSE JOURNALIÈRE + RAPPORT COMMERCIAL
// ============================================================
const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Identifiant invalide');
  return new mongoose.Types.ObjectId(String(id));
};
const log = (req, entityType, doc, action, comment) =>
  logAction({ entityType, entityId: doc._id, action, userId: req.user._id, req, comment });

// GET /api/caisse/courante → session ouverte (avec calcul en direct) ou proposition d'ouverture
exports.courante = async (req, res) => {
  const boutique = requireBoutiqueId();
  const s = await caisse.sessionOuverte(boutique);
  if (s) return res.json({ success: true, data: await caisse.detail(s) });
  const derniere = await SessionCaisse.findOne({ boutique, statut: 'fermee' }).sort({ fermeLe: -1 })
    .select('numero fermeLe fondLaisse ecart').lean();
  res.json({ success: true, data: null, derniere });
};

exports.list = async (req, res) => {
  const q = {};
  if (req.query.from || req.query.to) {
    const [from, to] = rangeFromQuery(req.query);
    q.ouvertureLe = { $gte: from, $lte: to };
  }
  const data = await SessionCaisse.find(q)
    .populate('ouvertPar fermePar', 'username firstName lastName')
    .sort({ ouvertureLe: -1 }).limit(200).lean();
  res.json({ success: true, data });
};

exports.getOne = async (req, res) => {
  const s = await SessionCaisse.findById(oid(req.params.id)).populate('ouvertPar fermePar', 'username firstName lastName');
  if (!s) throw new AppError('Session introuvable', 404);
  res.json({ success: true, data: await caisse.detail(s) });
};

exports.ouvrir = async (req, res) => {
  const s = await caisse.ouvrir(req.body, req.user._id);
  await log(req, 'SessionCaisse', s, 'CREATE', `Ouverture caisse ${s.numero} — fond ${s.fondInitial} DT`);
  res.status(201).json({ success: true, message: `Caisse ${s.numero} ouverte`, data: s });
};

exports.mouvement = async (req, res) => {
  const m = await caisse.ajouterMouvement(oid(req.params.id), req.body, req.user._id);
  await log(req, 'MouvementCaisse', m, 'CREATE', `${m.type === 'ENTREE' ? 'Entrée' : 'Sortie'} caisse ${m.montant} DT : ${m.motif}`);
  res.status(201).json({ success: true, message: 'Mouvement enregistré', data: m });
};

exports.annulerMouvement = async (req, res) => {
  const m = await caisse.annulerMouvement(oid(req.params.id), String(req.body.motif || '').trim());
  await log(req, 'MouvementCaisse', m, 'CANCEL', `Mouvement annulé : ${m.motifAnnulation}`);
  res.json({ success: true, message: 'Mouvement annulé', data: m });
};

exports.fermer = async (req, res) => {
  const s = await caisse.fermer(oid(req.params.id), req.body, req.user._id);
  await log(req, 'SessionCaisse', s, 'CLOSE', `Fermeture ${s.numero} — compté ${s.montantCompte}, théorique ${s.totaux?.theorique}, écart ${s.ecart}`);
  res.json({ success: true, message: `Caisse ${s.numero} fermée`, data: s });
};

exports.rouvrir = async (req, res) => {
  const s = await caisse.rouvrir(oid(req.params.id), String(req.body.motif || '').trim(), req.user._id);
  await log(req, 'SessionCaisse', s, 'REOPEN', `Réouverture ${s.numero} : ${req.body.motif}`);
  res.json({ success: true, message: `Caisse ${s.numero} rouverte`, data: s });
};

// GET /api/rapport-commercial/tableau-de-bord
exports.tableauDeBord = async (req, res) => {
  res.json({ success: true, data: await rapportVente.tableauDeBord() });
};

// GET /api/rapport-commercial/global?from&to
exports.vueGlobale = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  res.json({ success: true, data: await rapportVente.vueGlobale({ from, to }) });
};

// GET /api/rapport-commercial?from&to[&format=xlsx]
exports.rapport = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const r = await rapportVente.rapport({ from, to });
  if (req.query.format === 'xlsx') {
    const wb = await rapportVente.versExcel(r);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rapport-commercial.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  }
  const { _docs, _reglements, ...data } = r;
  void _docs; void _reglements;
  res.json({ success: true, data });
};
