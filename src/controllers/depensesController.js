const path = require('path');
const fs = require('fs');
const Depense = require('../models/Depense');
const Stock = require('../models/Stock');
const logger = require('../config/logger');
const { logAction } = require('../services/historyService');
const { withTransaction, so } = require('../services/transaction');
const { getParametres } = require('../services/atelierService');
const valorisation = require('../services/valorisationService');
const { AppError } = require('../utils/appError');

const TYPES = ['REPARATION', 'DIVERSE', 'ACHAT'];
const UPLOAD_DIR = path.join(__dirname, '../../uploads/depenses');

// ============================================================
// HELPERS
// ============================================================
const buildDateFilter = (dateDebut, dateFin) => {
  if (!dateDebut && !dateFin) return null;
  const f = {};
  if (dateDebut) f.$gte = new Date(dateDebut);
  if (dateFin) {
    const end = new Date(dateFin);
    end.setHours(23, 59, 59, 999);
    f.$lte = end;
  }
  return f;
};

/** portee = 'administrative' (boutique null) | 'boutiques' (rattachées) | '' (toutes visibles) */
const porteeFilter = (portee) => {
  if (portee === 'administrative') return { boutique: null };
  if (portee === 'boutiques') return { boutique: { $ne: null } };
  return {};
};

/** Normalise les lignes d'une facture d'achat (montants recalculés par le modèle). */
const parseLignes = async (lignes) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new AppError("Une facture d'achat doit contenir au moins une ligne");
  }
  const out = [];
  for (const l of lignes) {
    const quantite = Number(l.quantite);
    const prixUnitaire = Number(l.prixUnitaire);
    if (!(quantite > 0)) throw new AppError('Quantité invalide sur une ligne');
    if (!(prixUnitaire >= 0)) throw new AppError('Prix unitaire invalide sur une ligne');
    let designation = String(l.designation || '').trim();
    if (l.stock) {
      const st = await Stock.findById(l.stock).populate('typeArticle marque modele', 'nom').lean();
      if (!st) throw new AppError('Article introuvable sur une ligne');
      if (!designation) designation = [st.typeArticle?.nom, st.marque?.nom, st.modele?.nom].filter(Boolean).join(' ');
    } else if (!designation) {
      throw new AppError('Désignation obligatoire pour une ligne libre');
    }
    out.push({
      stock: l.stock || null, designation, quantite, prixUnitaire,
      remise: Number(l.remise) || 0, fraisImputables: Number(l.fraisImputables) || 0,
    });
  }
  return out;
};

/** "achats" donne accès aux factures d'achat ; les autres dépenses exigent "depenses". */
const assertTypePermission = (req, type) => {
  const u = req.user;
  if (['ADMIN', 'SUPER_ADMIN'].includes(u.role)) return;
  const perms = u.permissions || [];
  const ok = type === 'ACHAT' ? perms.includes('achats') || perms.includes('depenses') : perms.includes('depenses');
  if (!ok) throw new AppError('Accès refusé pour ce type de dépense', 403);
};

const populateDepense = (q) => q
  .populate('createdBy', 'username firstName lastName')
  .populate('valideePar', 'username firstName lastName')
  .populate('annuleePar', 'username firstName lastName')
  .populate('fournisseurRef', 'nom');

// ============================================================
// GET - Liste des dépenses avec filtres
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { type, statut, fournisseurRef, dateDebut, dateFin, search, page = 1 } = req.query;

    const query = { isDeleted: false, ...porteeFilter(req.query.portee) };
    if (type) query.type = type;
    if (statut) query.statut = statut;
    if (fournisseurRef) query.fournisseurRef = fournisseurRef;

    const dates = buildDateFilter(dateDebut, dateFin);
    if (dates) query.dateDepense = dates;

    if (search) {
      const s = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { numero: { $regex: s, $options: 'i' } },
        { fournisseur: { $regex: s, $options: 'i' } },
        { factureNumero: { $regex: s, $options: 'i' } },
        { motifDiverse: { $regex: s, $options: 'i' } },
        { 'lignes.designation': { $regex: s, $options: 'i' } },
      ];
    }

    // limit=all (ou 0) → toutes les dépenses
    const all = String(req.query.limit) === 'all' || String(req.query.limit) === '0';
    const limit = all ? 0 : Math.max(1, parseInt(req.query.limit, 10) || 100);
    const skip = all ? 0 : (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

    const [depenses, total] = await Promise.all([
      populateDepense(Depense.find(query))
        .sort({ dateDepense: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Depense.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: depenses,
      pagination: { total, page: all ? 1 : parseInt(page, 10) || 1, pages: all ? 1 : Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Erreur getAll depenses:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement' });
  }
};

exports.getOne = async (req, res) => {
  const d = await populateDepense(Depense.findById(req.params.id)).populate('lignes.stock', 'code quantite cmp');
  if (!d || d.isDeleted) throw new AppError('Dépense non trouvée', 404);
  res.json({ success: true, data: d });
};

// ============================================================
// GET - Stats dépenses (KPI) — hors brouillons et annulées
// ============================================================
exports.getStats = async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;
    const match = { isDeleted: false, statut: { $nin: ['annulee', 'brouillon'] }, ...porteeFilter(req.query.portee) };
    const dates = buildDateFilter(dateDebut, dateFin);
    if (dates) match.dateDepense = dates;

    const agg = await Depense.aggregate([
      { $match: match },
      { $group: { _id: '$type', total: { $sum: '$montant' }, count: { $sum: 1 } } },
    ]);
    const pick = (t) => {
      const x = agg.find((a) => a._id === t) || { total: 0, count: 0 };
      return { total: Math.round(x.total * 1000) / 1000, count: x.count };
    };
    const reparation = pick('REPARATION');
    const diverse = pick('DIVERSE');
    const achat = pick('ACHAT');

    res.json({
      success: true,
      data: {
        total: Math.round((reparation.total + diverse.total + achat.total) * 1000) / 1000,
        count: reparation.count + diverse.count + achat.count,
        reparation,
        diverse,
        achat,
      },
    });
  } catch (error) {
    logger.error('Erreur getStats depenses:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// POST - Créer une dépense (ou une facture d'achat en brouillon)
// ============================================================
exports.create = async (req, res) => {
  const {
    type, montant, categorieDiverse, motifDiverse, fournisseur, fournisseurRef,
    factureNumero, dateDepense, modePaiement, observation, lignes,
  } = req.body;

  if (!type || !TYPES.includes(type)) throw new AppError('Type invalide');
  assertTypePermission(req, type);
  if (type !== 'ACHAT' && (montant === undefined || montant === null || Number(montant) < 0)) {
    throw new AppError('Montant invalide');
  }

  // ✅ Dépense administrative (globale) : admin, en vue « Toutes les boutiques »
  const administrative = req.body.administrative === true || req.body.administrative === 'true';
  if (administrative) {
    if (type === 'ACHAT') throw new AppError("Une facture d'achat doit être rattachée à une boutique (stock)");
    if (req.user.role !== 'ADMIN') throw new AppError('Dépense administrative réservée à l\'administrateur', 403);
  }

  const doc = {
    type,
    montant: type === 'ACHAT' ? 0 : Number(montant),
    categorieDiverse: type === 'DIVERSE' ? (categorieDiverse || '') : '',
    motifDiverse: type === 'DIVERSE' ? (motifDiverse || '') : '',
    fournisseur: fournisseur || '',
    fournisseurRef: fournisseurRef || null,
    factureNumero: factureNumero || '',
    dateDepense: dateDepense ? new Date(dateDepense) : new Date(),
    modePaiement: modePaiement || 'ESPECES',
    observation: observation || '',
    createdBy: req.user.id,
  };
  if (type === 'ACHAT') doc.lignes = await parseLignes(lignes);
  // Boutique choisie dans le formulaire (vue globale) — contrôlée par le plugin tenant
  if (!administrative && req.body.boutique) doc.boutique = req.body.boutique;

  const depense = new Depense(doc);
  if (administrative) depense.$locals.tenantGlobal = true;
  await depense.save();
  await logAction({ entityType: 'Depense', entityId: depense._id, action: 'CREATE', userId: req.user._id, req });
  logger.info(`Dépense créée: ${depense.numero} (${type}, ${depense.montant} DT) par ${req.user.username}`);

  res.status(201).json({ success: true, message: 'Dépense créée avec succès', data: depense });
};

// ============================================================
// PUT - Modifier une dépense (facture d'achat : brouillon uniquement)
// ============================================================
exports.update = async (req, res) => {
  const depense = await Depense.findById(req.params.id);
  if (!depense || depense.isDeleted) throw new AppError('Dépense non trouvée', 404);
  assertTypePermission(req, depense.type);
  if (depense.statut === 'annulee') throw new AppError('Dépense annulée : modification impossible', 409);
  if (depense.type === 'ACHAT' && depense.statut !== 'brouillon') {
    throw new AppError("Facture d'achat validée : utilisez l'annulation (contre-écriture)", 409);
  }

  const allowed = [
    'categorieDiverse', 'motifDiverse', 'fournisseur', 'fournisseurRef',
    'factureNumero', 'dateDepense', 'modePaiement', 'observation',
  ];
  if (depense.type !== 'ACHAT') allowed.push('montant');
  const before = depense.toObject();
  allowed.forEach((k) => { if (req.body[k] !== undefined) depense[k] = req.body[k]; });
  if (depense.type === 'ACHAT' && req.body.lignes !== undefined) depense.lignes = await parseLignes(req.body.lignes);

  await depense.save();
  await logAction({
    entityType: 'Depense', entityId: depense._id, action: 'UPDATE', userId: req.user._id, req,
    oldValue: { montant: before.montant }, newValue: { montant: depense.montant },
  });
  res.json({ success: true, message: 'Dépense modifiée', data: depense });
};

// ============================================================
// POST - Valider une facture d'achat → entrées de stock + CMP/lots
// ============================================================
exports.validate = async (req, res) => {
  const userId = req.user._id;
  const result = await withTransaction(async (session) => {
    const dep = await Depense.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false, statut: 'brouillon' },
      { $set: { statut: 'validee', valideeLe: new Date(), valideePar: userId } },
      so(session, { new: true })
    );
    if (!dep) {
      const exists = await Depense.findById(req.params.id).select('statut').lean();
      if (!exists) throw new AppError('Dépense non trouvée', 404);
      throw new AppError(`Dépense déjà ${exists.statut}`, 409, 'DEJA_TRAITEE');
    }
    const params = await getParametres(dep.boutique, session);
    for (const l of dep.lignes || []) {
      if (!l.stock) continue;
      const st = await Stock.findById(l.stock).select('boutique').session(session || null).lean();
      if (!st || String(st.boutique) !== String(dep.boutique)) {
        throw new AppError(`Ligne "${l.designation}" : article d'une autre boutique ou introuvable`);
      }
      await valorisation.entree({
        stockId: l.stock, quantite: l.quantite, coutUnitaire: l.coutUnitaireRevient, params, session, userId,
        type: 'ENTREE_ACHAT', motif: `Achat ${dep.numero}`, sourceType: 'Depense', sourceId: dep._id,
        lotSource: `ACHAT:${dep._id}:${l._id}`, majDernierCout: true,
      });
    }
    dep.modeStockApplique = params.modeStock;
    await dep.save(so(session));
    return dep;
  });

  await logAction({ entityType: 'Depense', entityId: result._id, action: 'VALIDATE', userId, req, comment: `Facture ${result.numero} validée` });
  res.json({ success: true, message: 'Facture validée : stock et coûts mis à jour', data: result });
};

// ============================================================
// POST - Annuler une dépense validée (contre-écriture, jamais supprimée)
// ============================================================
exports.annuler = async (req, res) => {
  const userId = req.user._id;
  const motif = String(req.body.motif || '').trim();
  if (!motif) throw new AppError("Le motif d'annulation est obligatoire");

  const result = await withTransaction(async (session) => {
    const dep = await Depense.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false, statut: 'validee' },
      { $set: { statut: 'annulee', annuleeLe: new Date(), annuleePar: userId, motifAnnulation: motif } },
      so(session, { new: true })
    );
    if (!dep) throw new AppError('Seule une dépense validée peut être annulée', 409);
    if (dep.type === 'ACHAT') {
      const params = await getParametres(dep.boutique, session);
      const physique = (dep.modeStockApplique || params.modeStock) !== 'desactive';
      for (const l of dep.lignes || []) {
        if (!l.stock) continue;
        await valorisation.annulerEntree({
          stockId: l.stock, quantite: l.quantite, coutUnitaire: l.coutUnitaireRevient, params, physique,
          session, userId, motif: `Annulation achat ${dep.numero} : ${motif}`, sourceType: 'Depense',
          sourceId: dep._id, lotSource: `ACHAT:${dep._id}:${l._id}`,
        });
      }
    }
    return dep;
  });

  await logAction({ entityType: 'Depense', entityId: result._id, action: 'CANCEL', userId, req, comment: motif });
  res.json({ success: true, message: 'Dépense annulée (contre-écriture enregistrée)', data: result });
};

// ============================================================
// DELETE - Soft delete (factures d'achat : brouillon uniquement)
// ============================================================
exports.delete = async (req, res) => {
  const depense = await Depense.findById(req.params.id);
  if (!depense || depense.isDeleted) throw new AppError('Dépense non trouvée', 404);
  assertTypePermission(req, depense.type);
  if (depense.type === 'ACHAT' && depense.statut === 'validee') {
    throw new AppError("Facture d'achat validée : utilisez l'annulation", 409);
  }
  depense.isDeleted = true;
  await depense.save();
  await logAction({ entityType: 'Depense', entityId: depense._id, action: 'DELETE', userId: req.user._id, req });
  logger.info(`Dépense supprimée: ${depense.numero} par ${req.user.username}`);
  res.json({ success: true, message: 'Dépense supprimée' });
};

// ============================================================
// ✅ PIÈCES JOINTES
// ============================================================
exports.UPLOAD_DIR = UPLOAD_DIR;

exports.addPieceJointe = async (req, res) => {
  if (!req.file) throw new AppError('Fichier manquant');
  const depense = await Depense.findById(req.params.id);
  if (!depense || depense.isDeleted) {
    fs.unlink(req.file.path, () => {});
    throw new AppError('Dépense non trouvée', 404);
  }
  depense.piecesJointes.push({
    nom: req.file.originalname, fichier: req.file.filename, mimetype: req.file.mimetype, taille: req.file.size,
  });
  await depense.save();
  res.status(201).json({ success: true, data: depense.piecesJointes });
};

exports.getPieceJointe = async (req, res) => {
  const depense = await Depense.findById(req.params.id).lean();
  const pj = depense?.piecesJointes?.find((p) => String(p._id) === req.params.pjId);
  if (!pj) throw new AppError('Pièce jointe introuvable', 404);
  const file = path.join(UPLOAD_DIR, path.basename(pj.fichier));
  if (!fs.existsSync(file)) throw new AppError('Fichier introuvable', 404);
  res.setHeader('Content-Type', pj.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pj.nom)}"`);
  fs.createReadStream(file).pipe(res);
};
