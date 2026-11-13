const Stock = require('../models/Stock');
const User = require('../models/User');
const MouvementStock = require('../models/MouvementStock');
const Reparation = require('../models/Reparation');
const Categorie = require('../models/Categorie');
const Objet = require('../models/Objet');
const Marque = require('../models/Marque');
const Modele = require('../models/Modele');
const TypeArticle = require('../models/TypeArticle');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const LotStock = require('../models/LotStock');
const valorisation = require('../services/valorisationService');
const commissionService = require('../services/commissionService');
const { withTransaction, so } = require('../services/transaction');
const { getParametres, assertPeriodeOuverte } = require('../services/atelierService');
const { getTenant, runWithTenant } = require('../config/tenantContext');
const { logAction } = require('../services/historyService');
const { AppError } = require('../utils/appError');
const money = require('../utils/money');

// ============================================================
// ✅ HELPER : Parser une valeur CSV en tableau
// ============================================================
function parseMultiValue(val) {
  if (!val) return [];
  const str = String(val).trim();
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================
// ✅ HELPER : Construire la clause Mongo depuis une valeur CSV
// ============================================================
function buildInClause(val) {
  const arr = parseMultiValue(val);
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return { $in: arr };
}

// ============================================================
// ✅ HELPER : Populate standard d'un stock
// ============================================================
function populateStock(query) {
  return query
    .populate('categorie', 'nom')
    .populate('objet', 'nom')
    .populate('typeArticle', 'nom')
    .populate('marque', 'nom')
    .populate('modele', 'nom');
}

// ============================================================
// ✅ HELPER : Créer un snapshot d'une ligne de stock
// ============================================================
function buildStockSnapshot(stock) {
  return {
    categorie: stock.categorie?.nom || '',
    objet: stock.objet?.nom || '',
    typeArticle: stock.typeArticle?.nom || '',
    marque: stock.marque?.nom || '',
    modele: stock.modele?.nom || '',
  };
}

// ============================================================
// GET - Liste du stock avec filtres MULTI-CRITÈRES (CSV supporté)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const {
      categorie, objet, typeArticle, marque, modele,
      search, etat,
    } = req.query;

    // ✅ usage=reparation | vente (inclut « les deux ») ; absent = tous
    const query = { ...Stock.filtreUsage(req.query.usage) };

    const categorieClause = buildInClause(categorie);
    if (categorieClause) query.categorie = categorieClause;

    const objetClause = buildInClause(objet);
    if (objetClause) query.objet = objetClause;

    const typeClause = buildInClause(typeArticle);
    if (typeClause) query.typeArticle = typeClause;

    const marqueClause = buildInClause(marque);
    if (marqueClause) query.marque = marqueClause;

    const modeleClause = buildInClause(modele);
    if (modeleClause) query.modele = modeleClause;

    const etatValues = parseMultiValue(etat);
    if (etatValues.length > 0) {
      const orClauses = [];
      if (etatValues.includes('rupture')) {
        orClauses.push({ quantite: 0 });
      }
      if (etatValues.includes('faible')) {
        orClauses.push({
          $expr: {
            $and: [
              { $gt: ['$quantite', 0] },
              { $lte: ['$quantite', '$seuilAlerte'] },
            ],
          },
        });
      }
      if (orClauses.length > 0) {
        query.$or = orClauses;
      }
    }

    const stocks = await populateStock(
      Stock.find(query)
        .populate('createdBy', 'username firstName lastName')
        .sort({ quantite: 1, createdAt: -1 })
    );

    let filtered = stocks;
    if (search) {
      const s = search.toLowerCase();
      filtered = stocks.filter(
        (st) =>
          (st.categorie?.nom || '').toLowerCase().includes(s) ||
          (st.objet?.nom || '').toLowerCase().includes(s) ||
          (st.typeArticle?.nom || '').toLowerCase().includes(s) ||
          (st.marque?.nom || '').toLowerCase().includes(s) ||
          (st.modele?.nom || '').toLowerCase().includes(s)
      );
    }

    const data = filtered.map((s) => {
      const obj = s.toObject();
      let etatCalc = 'ok';
      if (s.quantite === 0) etatCalc = 'rupture';
      else if (s.quantite <= s.seuilAlerte) etatCalc = 'faible';
      return { ...obj, etat: etatCalc };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur getAll stock:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement' });
  }
};

// ============================================================
// GET - Référentiels
// ============================================================
exports.getReferentiels = async (req, res) => {
  try {
    const Famille = require('../models/Famille');
    const [categories, objets, marques, modeles, typesArticle, familles] = await Promise.all([
      Categorie.find({}).select('nom famille').sort({ nom: 1 }),
      Objet.find({}).select('nom').sort({ nom: 1 }),
      Marque.find({}).select('nom objet').sort({ nom: 1 }),
      Modele.find({}).select('nom marque').sort({ nom: 1 }),
      TypeArticle.find({ isActive: true })
        .select('nom ordre')
        .sort({ ordre: 1, nom: 1 }),
      Famille.find({}).select('nom').sort({ nom: 1 }),
    ]);

    res.json({
      success: true,
      data: {
        familles,
        typesArticle,
        categories,
        objets,
        marques,
        modeles,
      },
    });
  } catch (error) {
    logger.error('Erreur getReferentiels stock:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// GET - Stats stock (KPI)
// ============================================================
exports.getStats = async (req, res) => {
  try {
    const all = await Stock.find({});

    let enAlerte = 0;
    let rupture = 0;

    all.forEach((s) => {
      if (s.quantite === 0) rupture++;
      else if (s.quantite <= s.seuilAlerte) enAlerte++;
    });

    res.json({
      success: true,
      data: {
        total: all.length,
        enAlerte,
        rupture,
      },
    });
  } catch (error) {
    logger.error('Erreur getStats stock:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// POST - Créer une entrée de stock
// ============================================================
exports.create = async (req, res) => {
  try {
    const {
      categorie, objet, typeArticle,
      marque, modele,
      quantite, seuilAlerte, prixIndicatif, observation,
      code, unite, coutManuel, commissionActive, coutUnitaire, usage,
    } = req.body;

    if (usage !== undefined && !Stock.USAGES.includes(usage)) {
      return res.status(400).json({ success: false, message: 'Usage invalide (reparation, vente ou mixte)' });
    }
    if (!categorie) {
      return res.status(400).json({ success: false, message: 'Catégorie obligatoire' });
    }
    if (!typeArticle) {
      return res.status(400).json({ success: false, message: "Type d'article obligatoire" });
    }

    const typeExists = await TypeArticle.findById(typeArticle);
    if (!typeExists) {
      return res.status(400).json({ success: false, message: "Type d'article invalide" });
    }

    const existing = await Stock.findOne({
      categorie,
      objet: objet || null,
      typeArticle,
      marque: marque || null,
      modele: modele || null,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Une ligne de stock existe déjà pour cette combinaison. Modifiez la quantité existante.',
        existingId: existing._id,
      });
    }

    const stock = await Stock.create({
      categorie,
      objet: objet || null,
      typeArticle,
      marque: marque || null,
      modele: modele || null,
      quantite: Number(quantite) || 0,
      seuilAlerte: Number(seuilAlerte) || 2,
      prixIndicatif: Number(prixIndicatif) || 0,
      observation: observation || '',
      // ✅ Fiche article
      code: code ? String(code).trim().toUpperCase() : null,
      unite: unite || 'pièce',
      coutManuel: coutManuel !== undefined && coutManuel !== null && coutManuel !== '' ? Number(coutManuel) : null,
      commissionActive: commissionActive !== false,
      usage: usage || 'reparation',
      tauxTVA: req.body.tauxTVA === undefined || req.body.tauxTVA === null || req.body.tauxTVA === '' ? null : Number(req.body.tauxTVA),
      // Valorisation initiale (si un coût unitaire est fourni)
      cmp: coutUnitaire !== undefined && coutUnitaire !== null && coutUnitaire !== '' ? money.round3(coutUnitaire) : null,
      dernierCoutAchat: coutUnitaire !== undefined && coutUnitaire !== null && coutUnitaire !== '' ? money.round3(coutUnitaire) : null,
      cmpQuantiteBase: Number(quantite) || 0,
      createdBy: req.user.id,
    });

    if (stock.cmp !== null && stock.quantite > 0) {
      await LotStock.create({
        stock: stock._id, boutique: stock.boutique, quantiteInitiale: stock.quantite,
        quantiteRestante: stock.quantite, coutUnitaire: stock.cmp, source: 'CREATION',
      });
    }

    await MouvementStock.create({
      stock: stock._id,
      boutique: stock.boutique, // ✅ multi-tenant
      type: 'CREATION',
      quantite: stock.quantite,
      quantiteAvant: 0,
      quantiteApres: stock.quantite,
      motif: 'Création de la ligne de stock',
      createdBy: req.user.id,
    });

    const populated = await populateStock(Stock.findById(stock._id));

    logger.info(`Stock créé: ${stock._id} (qté: ${stock.quantite}) par ${req.user.username}`);

    res.status(201).json({ success: true, message: 'Stock créé', data: populated });
  } catch (error) {
    logger.error('Erreur create stock:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Cette combinaison existe déjà' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT - Modifier quantité / seuil / prix
// ============================================================
exports.update = async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock non trouvé' });
    }

    const { quantite, seuilAlerte, prixIndicatif, observation, motif } = req.body;
    // ✅ Champs fiche article
    const { code, unite, coutManuel, commissionActive, isActive } = req.body;
    if (code !== undefined) stock.code = code ? String(code).trim().toUpperCase() : null;
    if (unite !== undefined) stock.unite = unite;
    if (coutManuel !== undefined) stock.coutManuel = coutManuel === null || coutManuel === '' ? null : Number(coutManuel);
    if (commissionActive !== undefined) stock.commissionActive = !!commissionActive;
    if (req.body.usage !== undefined) {
      if (!Stock.USAGES.includes(req.body.usage)) {
        return res.status(400).json({ success: false, message: 'Usage invalide (reparation, vente ou mixte)' });
      }
      stock.usage = req.body.usage;
    }
    if (isActive !== undefined) stock.isActive = !!isActive;
    if (req.body.tauxTVA !== undefined) {
      const t = req.body.tauxTVA === null || req.body.tauxTVA === '' ? null : Number(req.body.tauxTVA);
      if (t !== null && !(t >= 0 && t <= 100)) return res.status(400).json({ success: false, message: 'Taux de TVA invalide' });
      stock.tauxTVA = t;
    }

    const ancienneQuantite = stock.quantite;

    if (quantite !== undefined && Number(quantite) !== ancienneQuantite) {
      const nouvelle = Number(quantite);
      if (nouvelle < 0) {
        return res.status(400).json({ success: false, message: 'Quantité négative interdite' });
      }

      stock.quantite = nouvelle;

      await MouvementStock.create({
        stock: stock._id,
        boutique: stock.boutique, // ✅ multi-tenant
        type: 'AJUSTEMENT',
        quantite: nouvelle - ancienneQuantite,
        quantiteAvant: ancienneQuantite,
        quantiteApres: nouvelle,
        motif: motif || 'Modification manuelle',
        createdBy: req.user.id,
      });
    }

    if (seuilAlerte !== undefined) stock.seuilAlerte = Number(seuilAlerte);
    if (prixIndicatif !== undefined) stock.prixIndicatif = Number(prixIndicatif);
    if (observation !== undefined) stock.observation = observation;

    await stock.save();

    const populated = await populateStock(Stock.findById(stock._id));

    logger.info(`Stock modifié: ${stock._id} (${ancienneQuantite} → ${stock.quantite}) par ${req.user.username}`);

    res.json({ success: true, message: 'Stock modifié', data: populated });
  } catch (error) {
    logger.error('Erreur update stock:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST - Incrément rapide (+1 / -1)
// ============================================================
exports.increment = async (req, res) => {
  try {
    const { delta } = req.body;
    const stockId = req.params.id;

    if (!delta || ![1, -1].includes(Number(delta))) {
      return res.status(400).json({ success: false, message: 'Delta invalide (1 ou -1)' });
    }

    const deltaNum = Number(delta);

    const filter = { _id: stockId };
    if (deltaNum < 0) filter.quantite = { $gte: 1 };

    const updated = await Stock.findOneAndUpdate(
      filter,
      { $inc: { quantite: deltaNum } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant ou introuvable' });
    }

    await MouvementStock.create({
      stock: updated._id,
      boutique: updated.boutique, // ✅ multi-tenant
      type: deltaNum > 0 ? 'AJOUT_MANUEL' : 'RETRAIT_MANUEL',
      quantite: deltaNum,
      quantiteAvant: updated.quantite - deltaNum,
      quantiteApres: updated.quantite,
      motif: deltaNum > 0 ? 'Ajout rapide' : 'Retrait rapide',
      createdBy: req.user.id,
    });

    const populated = await populateStock(Stock.findById(updated._id));

    logger.info(`Stock incrémenté: ${stockId} (${deltaNum > 0 ? '+' : ''}${deltaNum}) par ${req.user.username}`);

    res.json({ success: true, data: populated });
  } catch (error) {
    logger.error('Erreur increment stock:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PATCH - Définir la quantité exacte (input direct)
// ============================================================
exports.setQuantite = async (req, res) => {
  try {
    const { quantite, motif } = req.body;
    const stockId = req.params.id;

    const qte = Number(quantite);
    if (isNaN(qte) || qte < 0) {
      return res.status(400).json({ success: false, message: 'Quantité invalide' });
    }

    const stock = await Stock.findById(stockId);
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock introuvable' });
    }

    const ancienne = stock.quantite;
    if (ancienne === qte) {
      const populated = await populateStock(Stock.findById(stock._id));
      return res.json({ success: true, message: 'Aucune modification', data: populated });
    }

    stock.quantite = qte;
    await stock.save();

    await MouvementStock.create({
      stock: stock._id,
      boutique: stock.boutique, // ✅ multi-tenant
      type: 'AJUSTEMENT',
      quantite: qte - ancienne,
      quantiteAvant: ancienne,
      quantiteApres: qte,
      motif: motif || 'Modification manuelle (input direct)',
      createdBy: req.user.id,
    });

    const populated = await populateStock(Stock.findById(stock._id));

    logger.info(`Quantité définie: ${stockId} ${ancienne} → ${qte} par ${req.user.username}`);

    res.json({ success: true, message: 'Quantité mise à jour', data: populated });
  } catch (error) {
    logger.error('Erreur setQuantite:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST - Consommer du stock pour une réparation
// ✅ Valorisation figée (CMP / FIFO / manuel), mode de stock de la
//    boutique respecté, période clôturée refusée, transaction.
// ============================================================
exports.consommerPourReparation = async (req, res) => {
  const { reparationId, stockId, quantite = 1, coutManuel = null, reparateur = null } = req.body;

  if (!reparationId || !stockId) {
    return res.status(400).json({ success: false, message: 'reparationId et stockId requis' });
  }
  const qte = Number(quantite) || 1;
  if (qte < 1 || !Number.isInteger(qte)) {
    return res.status(400).json({ success: false, message: 'Quantité invalide' });
  }
  const userId = req.user._id;

  const result = await withTransaction(async (session) => {
    const reparation = await Reparation.findById(reparationId).session(session || null);
    if (!reparation || reparation.isDeleted) throw new AppError('Réparation non trouvée', 404);

    const params = await getParametres(reparation.boutique, session);
    await assertPeriodeOuverte(reparation.boutique, new Date(), session);

    const stockBefore = await populateStock(Stock.findById(stockId)).session(session || null);
    if (!stockBefore) throw new AppError('Stock introuvable', 404);
    // ✅ Multi-tenant : la pièce doit venir du stock de la boutique de la réparation
    if (String(stockBefore.boutique) !== String(reparation.boutique)) {
      throw new AppError("Cette pièce appartient au stock d'une autre boutique");
    }
    // ✅ Un produit de vente seul (coque, câble…) ne se monte pas en réparation
    if (!Stock.utilisablePour(stockBefore, 'reparation')) {
      throw new AppError('Cet article est un produit de vente : changez son usage en « Les deux » pour l\'utiliser en réparation', 400, 'USAGE_ARTICLE');
    }
    const out = await valorisation.sortie({
      stockId, quantite: qte, params, session, userId, type: 'RETRAIT_REPARATION',
      motif: `Consommation pour ${reparation.numero}`, reparationId: reparation._id,
      sourceType: 'Reparation', sourceId: reparation._id, coutManuel,
    });

    const tech = reparateur || reparation.reparateur || (User.ROLES_REPARATEUR.includes(req.user.role) ? userId : null) // ✅ réparateur ou commercial;
    reparation.piecesStock = reparation.piecesStock || [];
    reparation.piecesStock.push({
      stock: stockBefore._id,
      snapshot: buildStockSnapshot(stockBefore),
      quantite: qte,
      statut: 'consomme',
      dateConsommation: new Date(),
      consommePar: userId,
      mouvementStockId: out.mouvementId,
      coutUnitaire: out.coutUnitaire,
      coutTotal: out.coutTotal,
      sourceCout: out.sourceCout,
      prixVenteUnitaire: out.prixVenteUnitaire,
      stockPhysique: out.stockPhysique,
      reparateur: tech,
    });
    await reparation.save(so(session));
    return { reparation, out };
  });

  commissionService.syncReparationSafe(result.reparation._id, userId);
  const updated = await Stock.findById(stockId);
  logger.info(`Stock consommé: ${qte} × ${stockId} pour ${result.reparation.numero} (coût ${result.out.coutTotal})`);

  res.json({
    success: true,
    message: result.out.sourceCout === 'ESTIME' ? 'Pièce consommée (coût estimé)' : 'Pièce consommée',
    data: updated,
    mouvementId: result.out.mouvementId,
    cout: {
      unitaire: result.out.coutUnitaire, total: result.out.coutTotal,
      source: result.out.sourceCout, estime: result.out.sourceCout === 'ESTIME',
    },
  });
};

// ============================================================
// ✅ PATCH - Annuler une consommation (contre-mouvement au coût d'origine)
//     Route : PATCH /api/stock/pieces/:reparationId/:pieceId/annuler
// ============================================================
exports.annulerConsommation = async (req, res) => {
  const { reparationId, pieceId } = req.params;
  const { motif } = req.body;
  const userId = req.user._id;

  const result = await withTransaction(async (session) => {
    const reparation = await Reparation.findById(reparationId).session(session || null);
    if (!reparation || reparation.isDeleted) throw new AppError('Réparation non trouvée', 404);

    const piece = (reparation.piecesStock || []).find((p) => String(p._id) === String(pieceId));
    if (!piece) throw new AppError('Pièce introuvable', 404);
    if (piece.statut !== 'consomme') {
      throw new AppError(`Cette pièce est déjà "${piece.statut}". Impossible de l'annuler.`);
    }
    await assertPeriodeOuverte(reparation.boutique, new Date(), session);
    const params = await getParametres(reparation.boutique, session);

    const out = await valorisation.retour({
      stockId: piece.stock, quantite: piece.quantite, coutUnitaire: piece.coutUnitaire,
      stockPhysique: piece.stockPhysique !== false, params, session, userId,
      type: 'ANNULATION_CONSOMMATION', motif: motif || `Annulation de consommation (${reparation.numero})`,
      reparationId: reparation._id, sourceType: 'Reparation', sourceId: reparation._id,
    });

    piece.statut = 'annule';
    piece.dateAnnulation = new Date();
    piece.annulePar = userId;
    piece.motifAnnulation = motif || '';
    piece.mouvementAnnulationId = out.mouvementId;
    await reparation.save(so(session));
    return { reparation, piece, out };
  });

  commissionService.syncReparationSafe(result.reparation._id, userId);
  logger.info(`↩️ Consommation annulée: ${result.piece.quantite} × ${result.piece.stock} pour ${result.reparation.numero} par ${req.user.username}`);

  res.json({
    success: true,
    message: `Pièce annulée — ${result.piece.quantite} unité(s) remise(s) en stock`,
    data: { piece: result.piece, nouveauStock: result.out.quantiteApres },
    mouvementId: result.out.mouvementId,
  });
};

// ============================================================
// ✅ GET - Coût disponible d'un article (§16 GET /articles/{id}/cost)
// ============================================================
exports.getCout = async (req, res) => {
  const stock = await Stock.findById(req.params.id).lean();
  if (!stock) throw new AppError('Article introuvable', 404);
  const params = await getParametres(stock.boutique);
  const lots = await LotStock.find({ stock: stock._id, isAnnule: false, quantiteRestante: { $gt: 0 } })
    .sort({ dateEntree: 1 }).select('quantiteRestante coutUnitaire dateEntree source').lean();
  const ref = valorisation.coutReference(stock);
  res.json({
    success: true,
    data: {
      methode: params.methodeValorisation,
      modeStock: params.modeStock,
      cmp: stock.cmp,
      dernierCoutAchat: stock.dernierCoutAchat,
      coutManuel: stock.coutManuel,
      prixIndicatif: stock.prixIndicatif,
      prixVente: stock.prixIndicatif, // prix de vente / réparation (champ existant)
      coutReference: ref.cout,
      sourceCout: ref.source,
      estime: ref.source === 'ESTIME',
      lots,
    },
  });
};

// ============================================================
// ✅ POST - Transfert entre boutiques (stock détaillé)
// ============================================================
exports.transfert = async (req, res) => {
  const { stockId, boutiqueDestination, quantite, motif = '' } = req.body;
  const qte = Number(quantite);
  if (!stockId || !boutiqueDestination || !(qte >= 1) || !Number.isInteger(qte)) {
    throw new AppError('stockId, boutiqueDestination et quantité entière requis');
  }
  const ctx = getTenant();
  const allowed = (ctx.allowed || []).map(String);
  if (!allowed.includes(String(boutiqueDestination))) throw new AppError('Boutique de destination non autorisée', 403);
  const userId = req.user._id;

  const src = await Stock.findById(stockId).lean();
  if (!src) throw new AppError('Article introuvable', 404);
  if (String(src.boutique) === String(boutiqueDestination)) throw new AppError('Boutique de destination identique');

  // Contexte élargi aux deux boutiques pour la durée de l'opération
  const wide = { ...ctx, boutiques: [src.boutique, boutiqueDestination].map((b) => new mongoose.Types.ObjectId(String(b))) };
  const result = await runWithTenant(wide, () => withTransaction(async (session) => {
    const [pSrc, pDst] = await Promise.all([
      getParametres(src.boutique, session), getParametres(boutiqueDestination, session),
    ]);
    if (pSrc.modeStock !== 'detaille') throw new AppError('Les transferts nécessitent le mode de stock détaillé (boutique source)', 409);
    await assertPeriodeOuverte(src.boutique, new Date(), session);
    await assertPeriodeOuverte(boutiqueDestination, new Date(), session);

    const combo = { categorie: src.categorie, objet: src.objet || null, typeArticle: src.typeArticle, marque: src.marque || null, modele: src.modele || null };
    let dst = await Stock.findOne({ ...combo, boutique: boutiqueDestination }).session(session || null);
    if (!dst) {
      [dst] = await Stock.create([{
        ...combo, boutique: boutiqueDestination, quantite: 0, seuilAlerte: src.seuilAlerte,
        prixIndicatif: src.prixIndicatif, unite: src.unite,
        commissionActive: src.commissionActive, usage: src.usage || 'reparation', createdBy: userId,
      }], so(session));
    }

    const out = await valorisation.sortie({
      stockId: src._id, quantite: qte, params: pSrc, session, userId, type: 'TRANSFERT_SORTIE',
      motif: `Transfert vers boutique ${boutiqueDestination} ${motif}`.trim(), sourceType: 'Transfert', sourceId: dst._id,
    });
    const inn = await valorisation.entree({
      stockId: dst._id, quantite: qte, coutUnitaire: out.coutUnitaire, params: pDst, session, userId,
      type: 'TRANSFERT_ENTREE', motif: `Transfert depuis boutique ${src.boutique} ${motif}`.trim(),
      sourceType: 'Transfert', sourceId: src._id, lotSource: `TRANSFERT:${src._id}:${Date.now()}`,
    });
    return { out, inn, destination: dst._id };
  }));

  await logAction({ entityType: 'Stock', entityId: src._id, action: 'TRANSFER', userId, req, comment: `${qte} → ${boutiqueDestination}`, newValue: { coutUnitaire: result.out.coutUnitaire } });
  res.json({ success: true, message: `Transfert de ${qte} unité(s) effectué`, data: { destinationStock: result.destination, coutUnitaire: result.out.coutUnitaire } });
};

// ============================================================
// ✅ POST - Inventaire (stock détaillé) : écarts valorisés au coût courant
// ============================================================
exports.inventaire = async (req, res) => {
  const { lignes, motif = 'Inventaire' } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) throw new AppError('Aucune ligne d\'inventaire');
  const userId = req.user._id;

  const ecarts = await withTransaction(async (session) => {
    const out = [];
    for (const l of lignes) {
      const counted = Number(l.quantiteComptee);
      if (!Number.isInteger(counted) || counted < 0) throw new AppError('Quantité comptée invalide');
      const st = await Stock.findById(l.stockId).session(session || null);
      if (!st) throw new AppError('Article introuvable', 404);
      const params = await getParametres(st.boutique, session);
      if (params.modeStock !== 'detaille') throw new AppError("L'inventaire nécessite le mode de stock détaillé", 409);
      await assertPeriodeOuverte(st.boutique, new Date(), session);
      const diff = counted - st.quantite;
      if (diff === 0) { out.push({ stock: st._id, avant: st.quantite, apres: counted, ecart: 0, valeur: 0 }); continue; }
      const ref = valorisation.coutReference(st);
      if (diff > 0) {
        await valorisation.entree({
          stockId: st._id, quantite: diff, coutUnitaire: ref.cout, params, session, userId, type: 'INVENTAIRE',
          motif, sourceType: 'Inventaire', lotSource: `INVENTAIRE:${Date.now()}`, majCmp: ref.source !== 'ESTIME',
        });
      } else {
        await valorisation.sortie({ stockId: st._id, quantite: -diff, params, session, userId, type: 'INVENTAIRE', motif, sourceType: 'Inventaire' });
      }
      out.push({ stock: st._id, avant: st.quantite, apres: counted, ecart: diff, valeur: money.mul(ref.cout, diff), estime: ref.source === 'ESTIME' });
    }
    return out;
  });

  for (const e of ecarts.filter((x) => x.ecart !== 0)) {
    await logAction({ entityType: 'Stock', entityId: e.stock, action: 'INVENTORY', userId, req, oldValue: e.avant, newValue: e.apres, comment: motif });
  }
  res.json({ success: true, message: 'Inventaire enregistré', data: { ecarts, valeurEcarts: money.sum(ecarts.map((e) => e.valeur)) } });
};

// ============================================================
// ✅ GET - Liste des pièces d'une réparation
//     Route : GET /api/stock/pieces/:reparationId
// ============================================================
exports.getPiecesReparation = async (req, res) => {
  try {
    const { reparationId } = req.params;

    const reparation = await Reparation.findById(reparationId)
      .populate({
        path: 'piecesStock.stock',
        populate: [
          { path: 'categorie', select: 'nom' },
          { path: 'objet', select: 'nom' },
          { path: 'typeArticle', select: 'nom' },
          { path: 'marque', select: 'nom' },
          { path: 'modele', select: 'nom' },
        ],
      })
      .populate('piecesStock.consommePar', 'username firstName lastName')
      .populate('piecesStock.restaurePar', 'username firstName lastName')
      .populate('piecesStock.annulePar', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    // ✅ Filtrer uniquement les pièces actives (consomme)
    const piecesActives = (reparation.piecesStock || []).filter(
      (p) => p.statut === 'consomme'
    );

    res.json({
      success: true,
      data: {
        numero: reparation.numero,
        pieces: reparation.piecesStock || [],
        piecesActives,
        totalActif: piecesActives.reduce((sum, p) => sum + (p.quantite || 0), 0),
      },
    });
  } catch (error) {
    logger.error('Erreur getPiecesReparation:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// DELETE - Retirer la ligne de stock
// ============================================================
exports.delete = async (req, res) => {
  try {
    const stock = await Stock.findById(req.params.id);
    if (!stock) return res.status(404).json({ success: false, message: 'Introuvable' });

    await Stock.deleteOne({ _id: stock._id });
    logger.info(`Stock supprimé: ${stock._id} par ${req.user.username}`);
    res.json({ success: true, message: 'Ligne supprimée' });
  } catch (error) {
    logger.error('Erreur delete stock:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// GET - Historique des mouvements d'un stock
// ============================================================
exports.getMouvements = async (req, res) => {
  try {
    const mouvements = await MouvementStock.find({ stock: req.params.id })
      .populate('createdBy', 'username firstName lastName')
      .populate('reparationId', 'numero')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: mouvements });
  } catch (error) {
    logger.error('Erreur getMouvements:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};