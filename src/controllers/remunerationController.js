const mongoose = require('mongoose');
const RegleCommission = require('../models/RegleCommission');
const ContratReparateur = require('../models/ContratReparateur');
const Commission = require('../models/Commission');
const EcritureRemuneration = require('../models/EcritureRemuneration');
const PaiementReparateur = require('../models/PaiementReparateur');
const Cloture = require('../models/Cloture');
const User = require('../models/User');
const Boutique = require('../models/Boutique');
const { getTenant, runAsSystem } = require('../config/tenantContext');
const commissionService = require('../services/commissionService');
const remuneration = require('../services/remunerationService');
const { requireBoutiqueId, assertPeriodeOuverte } = require('../services/atelierService');
const { logAction } = require('../services/historyService');
const { AppError, rangeFromQuery, periodeKey, isPeriode, isJour, jourBounds } = require('../utils/appError');
const money = require('../utils/money');

// ============================================================
// ✅ RÉMUNÉRATION DES RÉPARATEURS (§3, §8, §9, §10)
// ============================================================

const sid = (v) => (v ? String(v._id || v) : null);
const isAdmin = (u) => ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
const can = (req, p) => isAdmin(req.user) || (req.user.permissions || []).includes(p);
const userPop = 'firstName lastName username';

/** Restreint au réparateur courant sans la permission "remuneration_autrui". */
const scopeReparateur = (req, requested) => {
  if (can(req, 'remuneration_autrui')) return requested || null;
  if (requested && sid(requested) !== sid(req.user._id)) throw new AppError('Accès refusé aux rémunérations d\'autrui', 403);
  return sid(req.user._id);
};

// ✅ Rémunération = niveau SOCIÉTÉ : tout employé de la société (quelle que soit sa boutique)
const societe = () => getTenant()?.organisation;
const assertReparateur = async (req, id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Réparateur invalide');
  const u = await User.findOne({ _id: id, organisation: societe() }).select('_id').lean();
  if (!u) throw new AppError('Réparateur introuvable dans cette société', 404);
};
/** Boutique de la société (contrat : rattachement ; règle : exception). null autorisé. */
const boutiqueSociete = async (id, label) => {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} invalide`);
  const b = await Boutique.findOne({ _id: id, organisation: societe() }).select('_id').lean();
  if (!b) throw new AppError(`${label} : boutique introuvable dans cette société`);
  return b._id;
};

// ------------------------------------------------------------
// Réparateurs (fiche + contrat courant)
// ------------------------------------------------------------
exports.listReparateurs = async (req, res) => {
  const users = await User.find({ organisation: societe(), isActive: true, role: { $in: [...User.ROLES_REPARATEUR, 'ADMIN'] } }) // ✅ commerciaux inclus, toute la société
    .select('firstName lastName username role').sort({ firstName: 1 }).lean();
  const now = new Date();
  const contrats = await ContratReparateur.find({ validFrom: { $lte: now }, $or: [{ validTo: null }, { validTo: { $gte: now } }] }).lean();
  const byUser = new Map(contrats.map((c) => [sid(c.reparateur), c]));
  res.json({ success: true, data: users.map((u) => ({ ...u, contrat: byUser.get(sid(u._id)) || null })) });
};

// ------------------------------------------------------------
// Règles de commission (versionnées)
// ------------------------------------------------------------
const RULE_FIELDS = ['nom', 'reparateur', 'boutiqueCible', 'article', 'categorie', 'typeArticle', 'panne', 'typeCalcul', 'base', 'taux', 'montantFixe', 'paliers', 'validFrom', 'validTo', 'priorite'];
const pickRule = (b) => {
  const o = {};
  for (const k of RULE_FIELDS) if (b[k] !== undefined) o[k] = b[k] === '' ? null : b[k];
  if (isJour(o.validFrom)) o.validFrom = jourBounds(o.validFrom)[0];
  if (isJour(o.validTo)) o.validTo = jourBounds(o.validTo)[1];
  return o;
};

exports.listRegles = async (req, res) => {
  const q = {};
  if (req.query.actif !== 'all') q.actif = true;
  if (req.query.reparateur) q.reparateur = req.query.reparateur;
  const data = await RegleCommission.find(q)
    .populate('reparateur', userPop).populate('categorie', 'nom').populate('typeArticle', 'nom').populate('boutiqueCible', 'nom code')
    .populate({ path: 'article', select: 'code typeArticle marque modele', populate: [{ path: 'typeArticle', select: 'nom' }, { path: 'marque', select: 'nom' }, { path: 'modele', select: 'nom' }] })
    .sort({ actif: -1, validFrom: -1 }).lean();
  const now = new Date();
  res.json({
    success: true,
    data: data.map((r) => ({
      ...r,
      niveau: commissionService.NIVEAUX[commissionService.specificite(r)],
      portee: commissionService.niveauRegle(r),
      enVigueur: r.actif && new Date(r.validFrom) <= now && (!r.validTo || new Date(r.validTo) >= now),
    })),
  });
};

exports.createRegle = async (req, res) => {
  if (req.body.boutiqueCible !== undefined) req.body.boutiqueCible = await boutiqueSociete(req.body.boutiqueCible, 'Boutique de la règle');
  const data = pickRule(req.body);
  if (!data.validFrom) data.validFrom = new Date();
  if (data.reparateur) await assertReparateur(req, data.reparateur);
  const regle = await RegleCommission.create({ ...data, createdBy: req.user._id });
  await logAction({ entityType: 'RegleCommission', entityId: regle._id, action: 'CREATE', userId: req.user._id, newValue: data, req });
  res.status(201).json({ success: true, data: regle });
};

/** Une règle déjà utilisée n'est jamais modifiée : nouvelle version + clôture de l'ancienne. */
exports.updateRegle = async (req, res) => {
  if (req.body.boutiqueCible !== undefined) req.body.boutiqueCible = await boutiqueSociete(req.body.boutiqueCible, 'Boutique de la règle');
  const old = await RegleCommission.findById(req.params.id);
  if (!old) throw new AppError('Règle introuvable', 404);
  if (!old.actif) throw new AppError('Règle désactivée : créez une nouvelle règle', 409);
  const data = pickRule(req.body);
  const used = await Commission.exists({ regle: old._id });

  // ✅ Date seule (formulaire) = aujourd'hui → prise d'effet MAINTENANT :
  //    les commissions déjà calculées gardent l'ancienne version, les suivantes prennent la nouvelle.
  //    (Avant : "aujourd'hui" = 00:00, refusé si la règle avait été créée le jour même.)
  const now = new Date();
  const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const brut = String(req.body.validFrom || ''); // valeur saisie (pickRule l'a déjà convertie en Date)

  if (!used) {
    // Version non encore utilisée qui remplace une version précédente :
    // elle ne peut pas commencer avant celle-ci (sinon deux versions se chevauchent).
    if (old.remplace && data.validFrom) {
      const prev = await RegleCommission.findById(old.remplace);
      // « aujourd'hui » sur une version qui commence déjà aujourd'hui → on garde son début
      if (brut === jourLocal(now) && jourLocal(old.validFrom) === brut) data.validFrom = old.validFrom;
      if (prev && data.validFrom <= prev.validFrom) {
        throw new AppError(
          `Cette version doit commencer après la version précédente (${prev.validFrom.toLocaleString('fr-FR')}).`
        );
      }
      if (prev) {
        prev.validTo = new Date(new Date(data.validFrom).getTime() - 1);
        await prev.save();
      }
    }
    old.set(data);
    await old.save();
    await logAction({ entityType: 'RegleCommission', entityId: old._id, action: 'UPDATE', userId: req.user._id, newValue: data, req });
    return res.json({ success: true, message: 'Règle modifiée', data: old });
  }

  let effet = data.validFrom ? new Date(data.validFrom) : now;
  if (brut === jourLocal(now)) effet = now;
  if (effet <= old.validFrom) {
    throw new AppError(
      `La nouvelle version doit prendre effet après le début de la version actuelle (${old.validFrom.toLocaleString('fr-FR')}). Choisissez aujourd'hui ou une date ultérieure.`
    );
  }
  const base = old.toObject();
  delete base._id; delete base.createdAt; delete base.updatedAt; delete base.__v;
  const nouvelle = new RegleCommission({
    ...base, ...data, validFrom: effet, validTo: data.validTo ?? old.validTo,
    version: (old.version || 1) + 1, remplace: old._id, createdBy: req.user._id,
  });
  await nouvelle.validate();
  old.validTo = new Date(effet.getTime() - 1);
  await old.save();
  await nouvelle.save();
  await logAction({ entityType: 'RegleCommission', entityId: nouvelle._id, action: 'UPDATE', userId: req.user._id, comment: `Version ${nouvelle.version} (remplace ${old._id})`, newValue: data, req });
  res.json({ success: true, message: `Nouvelle version ${nouvelle.version} créée ; l'historique validé est inchangé`, data: nouvelle });
};

exports.deleteRegle = async (req, res) => {
  const r = await RegleCommission.findById(req.params.id);
  if (!r) throw new AppError('Règle introuvable', 404);
  r.actif = false;
  if (!r.validTo || r.validTo > new Date()) r.validTo = new Date();
  await r.save();
  await logAction({ entityType: 'RegleCommission', entityId: r._id, action: 'DELETE', userId: req.user._id, req });
  res.json({ success: true, message: 'Règle désactivée' });
};

// ------------------------------------------------------------
// Contrats (mode de rémunération, versionnés)
// ------------------------------------------------------------
exports.listContrats = async (req, res) => {
  const q = {};
  const rep = scopeReparateur(req, req.query.reparateur);
  if (rep) q.reparateur = rep;
  const data = await ContratReparateur.find(q).populate('reparateur', userPop).populate('createdBy', userPop)
    .populate('boutiqueRattachement', 'nom code').sort({ validFrom: -1 }).lean();
  res.json({ success: true, data });
};

exports.createContrat = async (req, res) => {
  const { reparateur, mode, salaire = 0, periodicite = 'mensuelle', observation = '' } = req.body;
  // Boutique qui porte le salaire (par défaut : la boutique active)
  const boutiqueRattachement = (await boutiqueSociete(req.body.boutiqueRattachement, 'Boutique de rattachement')) || requireBoutiqueId();
  if (!reparateur || !['salaire', 'commission', 'mixte'].includes(mode)) throw new AppError('Réparateur et mode requis');
  if (mode !== 'commission' && !(Number(salaire) > 0)) throw new AppError('Montant du salaire requis pour ce mode');
  await assertReparateur(req, reparateur);
  const validFrom = req.body.validFrom ? new Date(req.body.validFrom) : new Date();
  validFrom.setHours(0, 0, 0, 0);
  requireBoutiqueId();

  const ouverts = await ContratReparateur.find({ reparateur, $or: [{ validTo: null }, { validTo: { $gte: validFrom } }] });
  for (const c of ouverts) {
    if (c.validFrom >= validFrom) throw new AppError('Un contrat commence déjà à cette date ou après : choisissez une date ultérieure', 409);
    c.validTo = new Date(validFrom.getTime() - 1);
    await c.save();
  }
  const contrat = await ContratReparateur.create({
    reparateur, mode, salaire: mode === 'commission' ? 0 : money.round3(salaire), periodicite,
    validFrom, observation, boutiqueRattachement, createdBy: req.user._id,
  });
  await logAction({ entityType: 'ContratReparateur', entityId: contrat._id, action: 'CREATE', userId: req.user._id, newValue: { mode, salaire, periodicite, validFrom }, req });
  res.status(201).json({ success: true, data: contrat });
};

exports.terminerContrat = async (req, res) => {
  const c = await ContratReparateur.findById(req.params.id);
  if (!c) throw new AppError('Contrat introuvable', 404);
  const fin = isJour(req.body.validTo) ? jourBounds(req.body.validTo)[1] : (req.body.validTo ? new Date(req.body.validTo) : new Date());
  fin.setHours(23, 59, 59, 999);
  if (fin < c.validFrom) throw new AppError('Date de fin invalide');
  c.validTo = fin;
  await c.save();
  await logAction({ entityType: 'ContratReparateur', entityId: c._id, action: 'UPDATE', userId: req.user._id, comment: `Fin au ${fin.toISOString()}`, req });
  res.json({ success: true, data: c });
};

// ------------------------------------------------------------
// Commissions
// ------------------------------------------------------------
exports.listCommissions = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const q = { dateSource: { $gte: from, $lte: to } };
  const rep = scopeReparateur(req, req.query.reparateur);
  if (rep) q.reparateur = rep;
  if (req.query.statut) q.statut = req.query.statut;
  const data = await Commission.find(q)
    .populate('reparateur', userPop).populate('reparation', 'numero').populate('valideePar', userPop)
    .sort({ dateSource: -1 }).limit(2000).lean();
  const totaux = {
    calculee: money.sum(data.filter((c) => c.statut === 'calculee').map((c) => c.montant)),
    validee: money.sum(data.filter((c) => c.statut === 'validee').map((c) => c.montant)),
  };
  res.json({ success: true, data, totaux });
};

exports.calculer = async (req, res) => {
  const [from, to] = rangeFromQuery(req.body);
  const r = await commissionService.calculerPeriode({ from, to, reparateur: req.body.reparateur, userId: req.user._id });
  await logAction({ entityType: 'Commission', entityId: req.user._id, action: 'CALCULATE', userId: req.user._id, newValue: { from, to, ...r, alertes: r.alertes.length }, req });
  res.json({ success: true, message: `${r.crees} créée(s), ${r.recalculees} recalculée(s), ${r.annulees} annulée(s), ${r.contrePassations} contre-écriture(s)`, data: r });
};

exports.valider = async (req, res) => {
  const { ids, reparateur } = req.body;
  const filter = {};
  if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };
  else {
    const [from, to] = rangeFromQuery(req.body);
    filter.dateSource = { $gte: from, $lte: to };
  }
  if (reparateur) filter.reparateur = reparateur;
  const n = await commissionService.valider(filter, req.user._id);
  await logAction({ entityType: 'Commission', entityId: req.user._id, action: 'VALIDATE', userId: req.user._id, newValue: { filter, n }, req });
  res.json({ success: true, message: `${n} commission(s) validée(s)`, data: { validees: n } });
};

// ------------------------------------------------------------
// Écritures : primes / ajustements (jamais supprimées)
// ------------------------------------------------------------
exports.listEcritures = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const q = { date: { $gte: from, $lte: to } };
  const rep = scopeReparateur(req, req.query.reparateur);
  if (rep) q.reparateur = rep;
  const data = await EcritureRemuneration.find(q).populate('reparateur', userPop).populate('boutique', 'nom code').sort({ date: -1 }).lean();
  res.json({ success: true, data });
};

exports.createEcriture = async (req, res) => {
  const { reparateur, type, montant, libelle = '' } = req.body;
  if (!['prime', 'ajustement'].includes(type)) throw new AppError('Type : prime ou ajustement');
  const m = money.round3(montant);
  if (!m || (type === 'prime' && m < 0)) throw new AppError('Montant invalide');
  if (!String(libelle).trim()) throw new AppError('Libellé obligatoire');
  await assertReparateur(req, reparateur);
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const boutique = requireBoutiqueId();
  await assertPeriodeOuverte(boutique, date);
  const e = await EcritureRemuneration.create({ boutique, reparateur, type, montant: m, libelle, date, periode: periodeKey(date), createdBy: req.user._id });
  await logAction({ entityType: 'EcritureRemuneration', entityId: e._id, action: 'ADJUST', userId: req.user._id, newValue: { type, montant: m, libelle }, req });
  res.status(201).json({ success: true, data: e });
};

exports.annulerEcriture = async (req, res) => {
  const motif = String(req.body.motif || '').trim();
  if (!motif) throw new AppError('Motif obligatoire');
  const e = await EcritureRemuneration.findOne({ _id: req.params.id, statut: 'validee', annule: null });
  if (!e) throw new AppError('Écriture introuvable ou non annulable', 404);
  const now = new Date();
  const boutique = requireBoutiqueId();
  await assertPeriodeOuverte(boutique, now);
  let contre;
  try {
    // L'écriture d'origine reste intacte ; la contre-écriture (clé unique) la neutralise
    contre = await EcritureRemuneration.create({
      boutique: e.boutique, reparateur: e.reparateur, type: e.type === 'salaire' ? 'ajustement' : e.type,
      periode: periodeKey(now), date: now, montant: -e.montant, libelle: `Contre-écriture : ${motif}`,
      annule: e._id, cle: `annul:${sid(e._id)}`, statut: 'validee', createdBy: req.user._id,
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Écriture déjà annulée', 409);
    throw err;
  }
  await logAction({ entityType: 'EcritureRemuneration', entityId: e._id, action: 'CANCEL', userId: req.user._id, comment: motif, req });
  res.json({ success: true, data: contre });
};

// ------------------------------------------------------------
// Avances / paiements
// ------------------------------------------------------------
exports.listPaiements = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const q = { date: { $gte: from, $lte: to } };
  const rep = scopeReparateur(req, req.query.reparateur);
  if (rep) q.reparateur = rep;
  const data = await PaiementReparateur.find(q).populate('reparateur', userPop).populate('createdBy', userPop)
    .populate('boutique', 'nom code').sort({ date: -1 }).lean();
  res.json({ success: true, data });
};

exports.createPaiement = async (req, res) => {
  const { reparateur, type, montant, modePaiement, reference = '', observation = '' } = req.body;
  if (!['avance', 'paiement'].includes(type)) throw new AppError('Type : avance ou paiement');
  const m = money.round3(montant);
  if (!(m > 0)) throw new AppError('Montant invalide');
  await assertReparateur(req, reparateur);
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const boutique = requireBoutiqueId();
  await assertPeriodeOuverte(boutique, date);
  const p = await PaiementReparateur.create({
    boutique, reparateur, type, montant: m, date, periode: periodeKey(date), modePaiement, reference, observation, createdBy: req.user._id,
  });
  await logAction({ entityType: 'PaiementReparateur', entityId: p._id, action: 'PAYMENT', userId: req.user._id, newValue: { type, montant: m }, req });
  const [solde] = await remuneration.soldes({ from: new Date(0), to: new Date(), reparateurs: [reparateur] });
  res.status(201).json({ success: true, data: p, solde: solde?.cumul || null });
};

exports.annulerPaiement = async (req, res) => {
  const motif = String(req.body.motif || '').trim();
  if (!motif) throw new AppError('Motif obligatoire');
  const p = await PaiementReparateur.findOneAndUpdate(
    { _id: req.params.id, statut: 'validee' },
    { $set: { statut: 'annulee', annuleLe: new Date(), annulePar: req.user._id, motifAnnulation: motif } },
    { new: true }
  );
  if (!p) throw new AppError('Paiement introuvable ou déjà annulé', 409);
  await logAction({ entityType: 'PaiementReparateur', entityId: p._id, action: 'CANCEL', userId: req.user._id, comment: motif, req });
  res.json({ success: true, data: p });
};

// ------------------------------------------------------------
// Soldes
// ------------------------------------------------------------
exports.summary = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const rep = scopeReparateur(req, req.query.reparateur);
  const data = await remuneration.soldes({ from, to, reparateurs: rep ? [rep] : null });
  res.json({ success: true, data, periode: { from, to } });
};

exports.me = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const me = sid(req.user._id);
  const [soldes, commissions, contrat] = await Promise.all([
    remuneration.soldes({ from, to, reparateurs: [me] }),
    ((org) => runAsSystem(() => Commission.find({ organisation: org, reparateur: me, dateSource: { $gte: from, $lte: to } })
      .populate('reparation', 'numero').populate('boutique', 'nom code').sort({ dateSource: -1 }).lean().exec()))(societe()), // .exec() : exécuter DANS le contexte système
    ContratReparateur.findOne({ reparateur: me, validFrom: { $lte: new Date() }, $or: [{ validTo: null }, { validTo: { $gte: new Date() } }] }).lean(),
  ]);
  res.json({ success: true, data: { solde: soldes[0] || null, commissions, contrat } });
};

// ------------------------------------------------------------
// Clôtures
// ------------------------------------------------------------
exports.listClotures = async (req, res) => {
  const q = {};
  if (req.query.type) q.type = req.query.type;
  const data = await Cloture.find(q).populate('cloturePar', userPop).populate('historique.par', userPop).sort({ periode: -1 }).limit(200).lean();
  res.json({ success: true, data });
};

exports.getCloture = async (req, res) => {
  const c = await Cloture.findById(req.params.id).populate('cloturePar', userPop).populate('historique.par', userPop).lean();
  if (!c) throw new AppError('Clôture introuvable', 404);
  res.json({ success: true, data: c });
};

exports.cloturerJour = async (req, res) => {
  const r = await remuneration.cloturerJour(req.body.jour, req.user._id);
  await logAction({ entityType: 'Cloture', entityId: r.cloture._id, action: 'CLOSE', userId: req.user._id, comment: `Jour ${req.body.jour}`, req });
  res.json({ success: true, message: `Journée ${req.body.jour} clôturée`, data: r });
};

exports.cloturerMois = async (req, res) => {
  if (!isPeriode(req.body.periode)) throw new AppError('Période invalide (YYYY-MM)');
  const r = await remuneration.cloturerMois(req.body.periode, req.user._id);
  await logAction({ entityType: 'Cloture', entityId: r.cloture._id, action: 'CLOSE', userId: req.user._id, comment: `Mois ${req.body.periode}`, req });
  res.json({ success: true, message: `Mois ${req.body.periode} clôturé`, data: r });
};

exports.rouvrir = async (req, res) => {
  const c = await remuneration.rouvrir(req.params.id, req.body.motif, req.user._id);
  await logAction({ entityType: 'Cloture', entityId: c._id, action: 'REOPEN', userId: req.user._id, comment: req.body.motif, req });
  res.json({ success: true, message: 'Période rouverte', data: c });
};
