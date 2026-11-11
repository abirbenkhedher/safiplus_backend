const mongoose = require('mongoose');
const ParametresAtelier = require('../models/ParametresAtelier');
const { getTenant, runWithTenant } = require('../config/tenantContext');
const Fournisseur = require('../models/Fournisseur');
const { logAction } = require('../services/historyService');
const { getParametres, requireBoutiqueId } = require('../services/atelierService');
const { AppError } = require('../utils/appError');

// ============================================================
// ✅ PARAMÈTRES DE LA BOUTIQUE
// ============================================================
const EDITABLE = [
  'modeSaisieConsommation', 'lienDeclarationReparation', 'methodeValorisation',
  'prixTTC', 'tauxTVA', 'remisesDeduites', 'commissionSurSAV', 'periodicitePaie',
];

exports.getParametres = async (req, res) => {
  const boutique = requireBoutiqueId();
  const data = await getParametres(boutique);
  res.json({
    success: true,
    data,
    options: {
      modeStock: ParametresAtelier.MODES_STOCK,
      modeSaisieConsommation: ParametresAtelier.MODES_SAISIE,
      lienDeclarationReparation: ParametresAtelier.LIENS_DECLARATION,
      methodeValorisation: ParametresAtelier.VALORISATIONS,
    },
  });
};

/** Applique les paramètres reçus à UNE boutique (dans le contexte tenant courant). */
const appliquerParametres = async (boutique, body, req) => {
  let doc = await ParametresAtelier.findOne({ boutique });
  if (!doc) doc = new ParametresAtelier({ boutique });
  const before = doc.toObject();

  for (const k of EDITABLE) if (body[k] !== undefined) doc[k] = body[k];

  // §5 : changement de mode de stock = validation explicite + historique
  const { modeStock, confirmationModeStock, motifModeStock } = body;
  if (modeStock !== undefined && modeStock !== doc.modeStock) {
    if (confirmationModeStock !== true) {
      throw new AppError(
        'Le changement de mode de stock nécessite une confirmation explicite (historiques conservés).',
        409, 'CONFIRMATION_REQUISE'
      );
    }
    doc.historiqueModeStock.push({ ancien: doc.modeStock, nouveau: modeStock, par: req.user._id, motif: motifModeStock || '' });
    doc.modeStock = modeStock;
  }
  doc.updatedBy = req.user._id;
  await doc.save();

  const changes = {};
  for (const k of [...EDITABLE, 'modeStock']) {
    if (String(before[k]) !== String(doc[k])) changes[k] = { old: before[k], new: doc[k] };
  }
  await logAction({ entityType: 'ParametresAtelier', entityId: doc._id, action: 'UPDATE', userId: req.user._id, changes, req });
};

// PUT /api/atelier/parametres
// body.appliquerA = [boutiqueId...] : applique AUSSI ces paramètres à d'autres
// boutiques de l'organisation (administrateur). Chaque boutique garde ses
// propres paramètres ensuite (aucun lien permanent).
exports.updateParametres = async (req, res) => {
  const boutique = requireBoutiqueId();
  const ctx = getTenant();

  const cibles = [...new Set((Array.isArray(req.body.appliquerA) ? req.body.appliquerA : []).map(String))]
    .filter((id) => id !== String(boutique));
  if (cibles.length > 0) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      throw new AppError('Seul un administrateur peut appliquer les paramètres à plusieurs boutiques', 403);
    }
    const allowed = (ctx.allowed || []).map(String);
    const interdite = cibles.find((id) => !allowed.includes(id));
    if (interdite) throw new AppError("Vous n'avez pas accès à l'une des boutiques choisies", 403);
  }

  await appliquerParametres(boutique, req.body, req);

  // Autres boutiques : chacune dans son propre contexte (filtrage tenant respecté).
  // Le mode de stock n'est recopié que sur demande explicite (appliquerModeStock),
  // qui vaut confirmation du changement (§5, historisé dans chaque boutique).
  const { modeStock: _ignore, confirmationModeStock: _c, ...sansMode } = req.body;
  const bodyCible = req.body.appliquerModeStock === true
    ? { ...req.body, confirmationModeStock: true, motifModeStock: req.body.motifModeStock || 'Paramètres appliqués depuis une autre boutique' }
    : sansMode;
  const appliquees = [];
  for (const id of cibles) {
    const b = new mongoose.Types.ObjectId(id);
    // eslint-disable-next-line no-await-in-loop
    await runWithTenant({ ...ctx, boutiques: [b], boutique: b, globalView: false }, () =>
      appliquerParametres(b, bodyCible, req)
    );
    appliquees.push(id);
  }

  res.json({
    success: true,
    message: appliquees.length
      ? `Paramètres enregistrés (et appliqués à ${appliquees.length} autre(s) boutique(s))`
      : 'Paramètres enregistrés',
    data: await getParametres(boutique),
  });
};

// ============================================================
// ✅ FOURNISSEURS (partagés par l'organisation)
// ============================================================
const FOURNISSEUR_FIELDS = ['nom', 'telephone', 'email', 'adresse', 'matriculeFiscal', 'observation', 'isActive'];
const pick = (body) => Object.fromEntries(FOURNISSEUR_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

exports.listFournisseurs = async (req, res) => {
  const q = {};
  if (req.query.actifs === 'true') q.isActive = true;
  if (req.query.search) q.nom = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const data = await Fournisseur.find(q).sort({ nom: 1 }).lean();
  res.json({ success: true, data });
};

exports.createFournisseur = async (req, res) => {
  if (!req.body.nom) throw new AppError('Nom obligatoire');
  try {
    const f = await Fournisseur.create({ ...pick(req.body), createdBy: req.user._id });
    await logAction({ entityType: 'Fournisseur', entityId: f._id, action: 'CREATE', userId: req.user._id, req });
    res.status(201).json({ success: true, data: f });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Ce fournisseur existe déjà');
    throw err;
  }
};

exports.updateFournisseur = async (req, res) => {
  const f = await Fournisseur.findById(req.params.id);
  if (!f) throw new AppError('Fournisseur introuvable', 404);
  f.set(pick(req.body));
  await f.save();
  await logAction({ entityType: 'Fournisseur', entityId: f._id, action: 'UPDATE', userId: req.user._id, changes: pick(req.body), req });
  res.json({ success: true, data: f });
};

// Pas de suppression physique : désactivation (historique des achats préservé)
exports.deleteFournisseur = async (req, res) => {
  const f = await Fournisseur.findById(req.params.id);
  if (!f) throw new AppError('Fournisseur introuvable', 404);
  f.isActive = false;
  await f.save();
  await logAction({ entityType: 'Fournisseur', entityId: f._id, action: 'DELETE', userId: req.user._id, req });
  res.json({ success: true, message: 'Fournisseur désactivé' });
};
