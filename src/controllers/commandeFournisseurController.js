const mongoose = require('mongoose');
const CommandeFournisseur = require('../models/CommandeFournisseur');
const Depense = require('../models/Depense');
const Stock = require('../models/Stock');
const Counter = require('../models/Counter');
const { requireBoutiqueId } = require('../services/atelierService');
const { withTransaction, so } = require('../services/transaction');
const { logAction } = require('../services/historyService');
const { AppError } = require('../utils/appError');

// ============================================================
// ✅ BONS DE COMMANDE FOURNISSEUR (/api/commandes-fournisseurs)
// ============================================================
const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Identifiant invalide');
  return id;
};
const populate = (q) => q
  .populate('fournisseurRef', 'nom telephone email')
  .populate('createdBy', 'username firstName lastName')
  .populate('validePar', 'username firstName lastName')
  .populate('depense', 'numero statut montant');

const nomStock = (st) => [st.typeArticle?.nom, st.marque?.nom, st.modele?.nom].filter(Boolean).join(' ') || st.code || 'Article';

/** Lignes : article du stock (désignation, TVA et dernier prix d'achat par défaut) ou ligne libre. */
const parseLignes = async (lignes, boutique) => {
  if (!Array.isArray(lignes) || lignes.length === 0) throw new AppError('Le bon de commande doit contenir au moins une ligne');
  const out = [];
  for (const l of lignes) {
    const quantite = Number(l.quantite);
    if (!(quantite > 0)) throw new AppError('Quantité invalide sur une ligne');
    let designation = String(l.designation || '').trim();
    let { prixUnitaire, tauxTVA } = l;
    let stock = null;
    if (l.stock) {
      const st = await Stock.findById(oid(l.stock)).populate('typeArticle marque modele', 'nom').lean();
      if (!st) throw new AppError('Article introuvable sur une ligne');
      if (String(st.boutique) !== String(boutique)) throw new AppError("Article d'une autre boutique");
      stock = st._id;
      if (!designation) designation = nomStock(st);
      if (prixUnitaire === undefined || prixUnitaire === null || prixUnitaire === '') prixUnitaire = st.dernierCoutAchat ?? st.cmp ?? 0;
      if (tauxTVA === undefined || tauxTVA === null || tauxTVA === '') tauxTVA = st.tauxTVA ?? 19;
    } else if (!designation) {
      throw new AppError('Désignation obligatoire pour une ligne libre');
    }
    const pu = Number(prixUnitaire);
    const t = Number(tauxTVA ?? 0);
    if (!(pu >= 0)) throw new AppError('Prix unitaire invalide sur une ligne');
    if (!(t >= 0 && t <= 100)) throw new AppError('Taux de TVA invalide sur une ligne');
    out.push({ stock, designation, quantite, prixUnitaire: pu, tauxTVA: t });
  }
  return out;
};

const appliquer = async (doc, body) => {
  if (body.fournisseurRef !== undefined) doc.fournisseurRef = body.fournisseurRef || null;
  if (body.fournisseur !== undefined) doc.fournisseur = String(body.fournisseur || '').trim();
  if (body.date !== undefined) doc.date = body.date ? new Date(body.date) : new Date();
  if (body.dateLivraisonPrevue !== undefined) doc.dateLivraisonPrevue = body.dateLivraisonPrevue ? new Date(body.dateLivraisonPrevue) : null;
  if (body.observation !== undefined) doc.observation = String(body.observation || '');
  if (body.lignes !== undefined) doc.lignes = await parseLignes(body.lignes, doc.boutique);
};

const charger = async (id) => {
  const doc = await CommandeFournisseur.findOne({ _id: oid(id), isDeleted: false });
  if (!doc) throw new AppError('Bon de commande introuvable', 404);
  return doc;
};
const log = (req, doc, action, comment) => logAction({
  entityType: 'Depense', entityId: doc.depense || doc._id, action, userId: req.user._id, req,
  comment: comment || `Bon de commande fournisseur ${doc.numero || '(brouillon)'}`,
}).catch(() => {});

// GET /
exports.list = async (req, res) => {
  const q = { isDeleted: false };
  if (req.query.statut) q.statut = req.query.statut;
  if (req.query.from || req.query.to) {
    q.date = {};
    if (req.query.from) q.date.$gte = new Date(req.query.from);
    if (req.query.to) { const t = new Date(req.query.to); t.setHours(23, 59, 59, 999); q.date.$lte = t; }
  }
  const data = await populate(CommandeFournisseur.find(q).sort({ date: -1, createdAt: -1 }).limit(500)).lean();
  res.json({ success: true, data });
};

// GET /:id
exports.getOne = async (req, res) => {
  const data = await populate(CommandeFournisseur.findOne({ _id: oid(req.params.id), isDeleted: false })).lean();
  if (!data) throw new AppError('Bon de commande introuvable', 404);
  res.json({ success: true, data });
};

// POST /
exports.create = async (req, res) => {
  const doc = new CommandeFournisseur({ boutique: requireBoutiqueId(), createdBy: req.user._id });
  await appliquer(doc, req.body);
  await doc.save();
  res.status(201).json({ success: true, message: 'Bon de commande créé (brouillon)', data: doc });
};

// PUT /:id  (brouillon seulement)
exports.update = async (req, res) => {
  const doc = await charger(req.params.id);
  if (doc.statut !== 'brouillon') throw new AppError('Bon de commande validé : modification impossible', 409);
  await appliquer(doc, req.body);
  await doc.save();
  res.json({ success: true, message: 'Bon de commande enregistré', data: doc });
};

// DELETE /:id  (brouillon seulement)
exports.remove = async (req, res) => {
  const doc = await charger(req.params.id);
  if (doc.statut !== 'brouillon') throw new AppError('Seul un brouillon se supprime (sinon : annuler)', 409);
  doc.isDeleted = true;
  await doc.save();
  res.json({ success: true, message: 'Brouillon supprimé' });
};

// POST /:id/valider  → numéro BCF-AAAA-0001
exports.valider = async (req, res) => {
  const pre = await charger(req.params.id);
  if (pre.statut !== 'brouillon') throw new AppError(`Bon de commande déjà ${pre.statut}`, 409);
  if (!pre.lignes.length) throw new AppError('Le bon de commande ne contient aucune ligne');
  if (!pre.fournisseurRef && !pre.fournisseur) throw new AppError('Indiquez le fournisseur');
  const doc = await withTransaction(async (session) => {
    const d = await CommandeFournisseur.findOne({ _id: pre._id, statut: 'brouillon' }).session(session || null);
    if (!d) throw new AppError('Bon de commande déjà traité', 409);
    const year = new Date().getFullYear();
    const c = await Counter.findOneAndUpdate(
      { _id: `commandeFournisseur:${d.boutique}:${year}` }, { $inc: { seq: 1 } }, so(session, { new: true, upsert: true })
    );
    d.numero = `BCF-${year}-${String(c.seq).padStart(4, '0')}`;
    d.statut = 'valide';
    d.valideLe = new Date();
    d.validePar = req.user._id;
    await d.save(so(session));
    return d;
  });
  await log(req, doc, 'VALIDATE', `Bon de commande fournisseur ${doc.numero} validé`);
  res.json({ success: true, message: `${doc.numero} validé`, data: doc });
};

// POST /:id/annuler { motif }
exports.annuler = async (req, res) => {
  const motif = String(req.body.motif || '').trim();
  if (!motif) throw new AppError("Le motif d'annulation est obligatoire");
  const doc = await CommandeFournisseur.findOneAndUpdate(
    { _id: oid(req.params.id), isDeleted: false, statut: { $in: ['brouillon', 'valide'] } },
    { $set: { statut: 'annulee', motifAnnulation: motif } }, { new: true }
  );
  if (!doc) throw new AppError('Bon de commande introuvable, déjà reçu ou annulé', 409);
  res.json({ success: true, message: 'Bon de commande annulé', data: doc });
};

// POST /:id/facturer  → facture d'achat BROUILLON (l'entrée en stock se fait à sa validation)
exports.facturer = async (req, res) => {
  const pre = await charger(req.params.id);
  if (pre.statut !== 'valide') throw new AppError('Seul un bon de commande validé (non reçu) se transforme en facture d\'achat', 409);
  const result = await withTransaction(async (session) => {
    const d = await CommandeFournisseur.findOneAndUpdate(
      { _id: pre._id, statut: 'valide' }, { $set: { statut: 'recue' } }, so(session, { new: true })
    );
    if (!d) throw new AppError('Bon de commande déjà traité', 409);
    const dep = new Depense({
      type: 'ACHAT', montant: 0, boutique: d.boutique, prixSaisis: 'HT',
      fournisseurRef: d.fournisseurRef, fournisseur: d.fournisseur,
      dateDepense: new Date(), observation: `Depuis le bon de commande ${d.numero}`,
      lignes: d.lignes.map((l) => ({
        stock: l.stock, designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA, remise: 0, fraisImputables: 0, prixSaisis: null,
      })),
      createdBy: req.user._id,
    });
    await dep.save(so(session));
    d.depense = dep._id;
    await d.save(so(session));
    return { commande: d, depense: dep };
  });
  await log(req, result.commande, 'CREATE', `Facture d'achat ${result.depense.numero} créée depuis ${result.commande.numero}`);
  res.status(201).json({
    success: true, message: `Facture d'achat ${result.depense.numero || ''} créée en brouillon`,
    data: result.commande, depense: result.depense,
  });
};
