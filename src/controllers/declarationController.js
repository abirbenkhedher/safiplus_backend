const DeclarationJournaliere = require('../models/DeclarationJournaliere');
const Reparation = require('../models/Reparation');
const Stock = require('../models/Stock');
const valorisation = require('../services/valorisationService');
const commissionService = require('../services/commissionService');
const { withTransaction, so } = require('../services/transaction');
const { getParametres, requireBoutiqueId, assertPeriodeOuverte } = require('../services/atelierService');
const { logAction } = require('../services/historyService');
const { AppError, isJour, jourBounds, rangeFromQuery } = require('../utils/appError');
const money = require('../utils/money');

// ============================================================
// ✅ DÉCLARATIONS JOURNALIÈRES (§6.2, §6.3)
// ============================================================

const sid = (v) => (v ? String(v._id || v) : null);
const isAdmin = (u) => ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
const can = (req, p) => isAdmin(req.user) || (req.user.permissions || []).includes(p);
const canValidate = (req) => can(req, 'consommations_valider');

const populate = (q) => q
  .populate('reparateur', 'firstName lastName username')
  .populate('lignes.reparation', 'numero')
  .populate('valideePar', 'firstName lastName')
  .populate('createdBy', 'firstName lastName');

/** Un réparateur sans droit de contrôle ne voit / ne gère que ses déclarations. */
const assertAccess = (req, decl) => {
  if (canValidate(req)) return;
  if (sid(decl.reparateur) !== sid(req.user._id)) throw new AppError('Accès refusé à cette déclaration', 403);
};

const prepareLignes = async (lignes, params, boutique) => {
  if (!Array.isArray(lignes) || lignes.length === 0) throw new AppError('Au moins une ligne est requise');
  const out = [];
  for (const l of lignes) {
    const quantite = Number(l.quantite);
    if (!Number.isInteger(quantite) || quantite < 1) throw new AppError('Quantité invalide');
    const st = await Stock.findById(l.stock).populate('typeArticle marque modele', 'nom').lean();
    if (!st || sid(st.boutique) !== sid(boutique)) throw new AppError("Article introuvable dans le stock de la boutique");
    let reparation = l.reparation || null;
    if (params.lienDeclarationReparation === 'desactive') reparation = null;
    if (params.lienDeclarationReparation === 'obligatoire' && !reparation) {
      throw new AppError('Le rattachement à un dossier de réparation est obligatoire dans cette boutique');
    }
    if (reparation) {
      const rep = await Reparation.findById(reparation).select('boutique isDeleted').lean();
      if (!rep || rep.isDeleted || sid(rep.boutique) !== sid(boutique)) throw new AppError('Dossier de réparation invalide');
    }
    out.push({
      stock: st._id, quantite, reparation,
      designation: [st.typeArticle?.nom, st.marque?.nom, st.modele?.nom].filter(Boolean).join(' ') || st.code || '',
      coutManuel: l.coutManuel !== undefined && l.coutManuel !== null && l.coutManuel !== '' ? Number(l.coutManuel) : null,
    });
  }
  return out;
};

exports.list = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  const q = { date: { $gte: from, $lte: to } };
  if (req.query.statut) q.statut = req.query.statut;
  if (!canValidate(req)) q.reparateur = req.user._id;
  else if (req.query.reparateur) q.reparateur = req.query.reparateur;
  const data = await populate(DeclarationJournaliere.find(q)).sort({ date: -1, createdAt: -1 }).lean();
  res.json({ success: true, data });
};

exports.getOne = async (req, res) => {
  const d = await populate(DeclarationJournaliere.findById(req.params.id)).lean();
  if (!d) throw new AppError('Déclaration introuvable', 404);
  assertAccess(req, d);
  res.json({ success: true, data: d });
};

exports.create = async (req, res) => {
  const boutique = requireBoutiqueId();
  const params = await getParametres(boutique);
  if (params.modeSaisieConsommation === 'reparation') {
    throw new AppError('Les déclarations journalières sont désactivées dans cette boutique', 409);
  }
  const { jour, lignes, observation = '' } = req.body;
  if (!isJour(jour)) throw new AppError('Jour invalide (YYYY-MM-DD)');
  const reparateur = canValidate(req) && req.body.reparateur ? req.body.reparateur : req.user._id;
  const [d0] = jourBounds(jour);
  await assertPeriodeOuverte(boutique, d0);

  try {
    const decl = await DeclarationJournaliere.create({
      boutique, reparateur, jour, date: d0, observation,
      lignes: await prepareLignes(lignes, params, boutique), createdBy: req.user._id,
    });
    await logAction({ entityType: 'DeclarationJournaliere', entityId: decl._id, action: 'CREATE', userId: req.user._id, req });
    res.status(201).json({ success: true, data: decl });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Une déclaration existe déjà pour ce réparateur et ce jour : modifiez-la.', 409);
    throw err;
  }
};

exports.update = async (req, res) => {
  const decl = await DeclarationJournaliere.findById(req.params.id);
  if (!decl) throw new AppError('Déclaration introuvable', 404);
  assertAccess(req, decl);
  if (decl.statut !== 'brouillon') throw new AppError('Seul un brouillon peut être modifié', 409);
  const params = await getParametres(decl.boutique);
  if (req.body.lignes !== undefined) decl.lignes = await prepareLignes(req.body.lignes, params, decl.boutique);
  if (req.body.observation !== undefined) decl.observation = req.body.observation;
  await decl.save();
  await logAction({ entityType: 'DeclarationJournaliere', entityId: decl._id, action: 'UPDATE', userId: req.user._id, req });
  res.json({ success: true, data: decl });
};

// ------------------------------------------------------------
// Validation : anti-doublon + sorties valorisées + commissions
// ------------------------------------------------------------
exports.validate = async (req, res) => {
  const userId = req.user._id;
  const result = await withTransaction(async (session) => {
    const decl = await DeclarationJournaliere.findOneAndUpdate(
      { _id: req.params.id, statut: 'brouillon' },
      { $set: { statut: 'validee', valideeLe: new Date(), valideePar: userId } },
      so(session, { new: true })
    );
    if (!decl) {
      const ex = await DeclarationJournaliere.findById(req.params.id).select('statut').lean();
      if (!ex) throw new AppError('Déclaration introuvable', 404);
      throw new AppError(`Déclaration déjà ${ex.statut}`, 409, 'DEJA_TRAITEE');
    }
    await assertPeriodeOuverte(decl.boutique, decl.date, session);
    const params = await getParametres(decl.boutique, session);
    const vus = new Set();
    let totalM = 0;

    for (const l of decl.lignes) {
      // §6.3 : déjà saisie dans le dossier de réparation ?
      if (l.reparation) {
        const key = `${sid(l.reparation)}:${sid(l.stock)}`;
        const rep = await Reparation.findById(l.reparation).select('piecesStock numero').session(session || null).lean();
        const dejaDossier = (rep?.piecesStock || []).some((p) => p.statut === 'consomme' && sid(p.stock) === sid(l.stock));
        const autreDecl = await DeclarationJournaliere.exists({
          _id: { $ne: decl._id }, statut: { $in: ['validee', 'cloturee'] },
          lignes: { $elemMatch: { reparation: l.reparation, stock: l.stock, statut: 'active' } },
        }).session(session || null);
        if (dejaDossier || autreDecl || vus.has(key)) {
          l.statut = 'doublon_exclu';
          l.motifExclusion = dejaDossier
            ? `Déjà saisie dans le dossier ${rep.numero}`
            : 'Déjà déclarée pour ce dossier';
          continue;
        }
        vus.add(key);
      }
      const out = await valorisation.sortie({
        stockId: l.stock, quantite: l.quantite, params, session, userId,
        type: 'CONSOMMATION_JOURNALIERE', motif: `Déclaration ${decl.jour}`,
        reparationId: l.reparation || null, sourceType: 'DeclarationJournaliere', sourceId: decl._id,
        coutManuel: l.coutManuel,
      });
      Object.assign(l, {
        coutUnitaire: out.coutUnitaire, coutTotal: out.coutTotal, sourceCout: out.sourceCout,
        prixVenteUnitaire: out.prixVenteUnitaire, stockPhysique: out.stockPhysique, mouvementId: out.mouvementId,
      });
      totalM += money.toM(out.coutTotal);
    }
    decl.coutTotal = money.fromM(totalM);
    await decl.save(so(session));
    return decl;
  });

  const commissions = await commissionService.syncDeclaration(result._id, userId);
  await logAction({ entityType: 'DeclarationJournaliere', entityId: result._id, action: 'VALIDATE', userId, req });
  const exclues = result.lignes.filter((l) => l.statut === 'doublon_exclu').length;
  res.json({
    success: true,
    message: exclues ? `Déclaration validée — ${exclues} ligne(s) exclue(s) (doublon)` : 'Déclaration validée',
    data: result,
    alertes: commissions.alertes,
  });
};

// ------------------------------------------------------------
// Annulation : brouillon → annulée ; validée → contre-mouvements
// ------------------------------------------------------------
exports.annuler = async (req, res) => {
  const userId = req.user._id;
  const motif = String(req.body.motif || '').trim();
  const decl0 = await DeclarationJournaliere.findById(req.params.id).lean();
  if (!decl0) throw new AppError('Déclaration introuvable', 404);
  assertAccess(req, decl0);
  if (decl0.statut === 'validee' && !can(req, 'operations_annuler')) {
    throw new AppError('Permission "operations_annuler" requise', 403);
  }
  if (decl0.statut === 'validee' && !motif) throw new AppError("Le motif d'annulation est obligatoire");

  const result = await withTransaction(async (session) => {
    const decl = await DeclarationJournaliere.findOneAndUpdate(
      { _id: req.params.id, statut: { $in: ['brouillon', 'validee'] } },
      { $set: { statut: 'annulee', annuleeLe: new Date(), annuleePar: userId, motifAnnulation: motif } },
      so(session, { new: false })
    );
    if (!decl) throw new AppError('Déclaration clôturée ou déjà annulée', 409);
    if (decl.statut === 'validee') {
      await assertPeriodeOuverte(decl.boutique, decl.date, session); // jour de la déclaration
      await assertPeriodeOuverte(decl.boutique, new Date(), session); // jour du retour en stock
      const params = await getParametres(decl.boutique, session);
      for (const l of decl.lignes.filter((x) => x.statut === 'active')) {
        await valorisation.retour({
          stockId: l.stock, quantite: l.quantite, coutUnitaire: l.coutUnitaire, stockPhysique: l.stockPhysique,
          params, session, userId, type: 'ANNULATION_DECLARATION', motif: `Annulation déclaration ${decl.jour} : ${motif}`,
          reparationId: l.reparation || null, sourceType: 'DeclarationJournaliere', sourceId: decl._id,
        });
      }
    }
    return decl;
  });

  await commissionService.syncDeclaration(result._id, userId);
  await logAction({ entityType: 'DeclarationJournaliere', entityId: result._id, action: 'CANCEL', userId, req, comment: motif });
  res.json({ success: true, message: 'Déclaration annulée' });
};
