const Stock = require('../models/Stock');
const MouvementStock = require('../models/MouvementStock');
const Reparation = require('../models/Reparation');
const Categorie = require('../models/Categorie');
const Objet = require('../models/Objet');
const Marque = require('../models/Marque');
const Modele = require('../models/Modele');
const TypeArticle = require('../models/TypeArticle');
const logger = require('../config/logger');

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

    const query = {};

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
    const [categories, objets, marques, modeles, typesArticle] = await Promise.all([
      Categorie.find({}).select('nom').sort({ nom: 1 }),
      Objet.find({}).select('nom').sort({ nom: 1 }),
      Marque.find({}).select('nom objet').sort({ nom: 1 }),
      Modele.find({}).select('nom marque').sort({ nom: 1 }),
      TypeArticle.find({ isActive: true })
        .select('nom ordre')
        .sort({ ordre: 1, nom: 1 }),
    ]);

    res.json({
      success: true,
      data: {
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
    let valeur = 0;

    all.forEach((s) => {
      if (s.quantite === 0) rupture++;
      else if (s.quantite <= s.seuilAlerte) enAlerte++;
      valeur += s.quantite * (s.prixIndicatif || 0);
    });

    res.json({
      success: true,
      data: {
        total: all.length,
        enAlerte,
        rupture,
        valeur: Math.round(valeur * 100) / 100,
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
    } = req.body;

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
      createdBy: req.user.id,
    });

    await MouvementStock.create({
      stock: stock._id,
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

    const ancienneQuantite = stock.quantite;

    if (quantite !== undefined && Number(quantite) !== ancienneQuantite) {
      const nouvelle = Number(quantite);
      if (nouvelle < 0) {
        return res.status(400).json({ success: false, message: 'Quantité négative interdite' });
      }

      stock.quantite = nouvelle;

      await MouvementStock.create({
        stock: stock._id,
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
// ✅ Enrichi : snapshot + statut "consomme" + lien mouvement
// ============================================================
exports.consommerPourReparation = async (req, res) => {
  try {
    const { reparationId, stockId, quantite = 1 } = req.body;

    if (!reparationId || !stockId) {
      return res.status(400).json({ success: false, message: 'reparationId et stockId requis' });
    }

    const qte = Number(quantite) || 1;
    if (qte < 1) {
      return res.status(400).json({ success: false, message: 'Quantité invalide' });
    }

    const reparation = await Reparation.findById(reparationId);
    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    // ✅ Vérifier que la réparation n'est pas dans un statut "NON REPARE"
    // (on ne peut pas consommer du stock sur une réparation déjà déclarée non réparable)
    // Optionnel mais recommandé
    // const statusDoc = await Status.findById(reparation.status);
    // if (['NON REPARE', 'SAV NON REPARE', 'SORTIE NON REPARE'].includes((statusDoc?.label || '').toUpperCase())) { ... }

    // ✅ Récupérer le stock pour le snapshot
    const stockBefore = await populateStock(Stock.findById(stockId));
    if (!stockBefore) {
      return res.status(404).json({ success: false, message: 'Stock introuvable' });
    }

    // ✅ Décrément atomique
    const updated = await Stock.findOneAndUpdate(
      { _id: stockId, quantite: { $gte: qte } },
      { $inc: { quantite: -qte } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant' });
    }

    // ✅ Mouvement d'audit
    const mouvement = await MouvementStock.create({
      stock: updated._id,
      type: 'RETRAIT_REPARATION',
      quantite: -qte,
      quantiteAvant: updated.quantite + qte,
      quantiteApres: updated.quantite,
      reparationId: reparation._id,
      motif: `Consommation pour ${reparation.numero}`,
      createdBy: req.user.id,
    });

    // ✅ Ajouter la pièce dans la réparation avec snapshot + statut
    reparation.piecesStock = reparation.piecesStock || [];
    reparation.piecesStock.push({
      stock: updated._id,
      snapshot: buildStockSnapshot(stockBefore),
      quantite: qte,
      statut: 'consomme',
      dateConsommation: new Date(),
      consommePar: req.user.id,
      mouvementStockId: mouvement._id,
    });
    await reparation.save();

    logger.info(`Stock consommé: ${qte} × ${stockId} pour ${reparation.numero}`);

    res.json({
      success: true,
      message: 'Pièce consommée',
      data: updated,
      mouvementId: mouvement._id,
    });
  } catch (error) {
    logger.error('Erreur consommerPourReparation:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// ✅ PATCH - Annuler une consommation (annulation manuelle)
//     Remet la pièce au stock + log mouvement
//     Route : PATCH /api/stock/pieces/:reparationId/:pieceId/annuler
// ============================================================
exports.annulerConsommation = async (req, res) => {
  try {
    const { reparationId, pieceId } = req.params;
    const { motif } = req.body;

    const reparation = await Reparation.findById(reparationId);
    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    // Trouver la pièce
    const piece = (reparation.piecesStock || []).find(
      (p) => String(p._id) === String(pieceId)
    );

    if (!piece) {
      return res.status(404).json({ success: false, message: 'Pièce introuvable' });
    }

    // ✅ Vérifier que la pièce est bien "consomme" (pas déjà restaurée/annulée)
    if (piece.statut !== 'consomme') {
      return res.status(400).json({
        success: false,
        message: `Cette pièce est déjà "${piece.statut}". Impossible de l'annuler.`,
      });
    }

    // ✅ Remettre au stock (incrément atomique)
    const stock = await Stock.findByIdAndUpdate(
      piece.stock,
      { $inc: { quantite: piece.quantite } },
      { new: true }
    );

    if (!stock) {
      return res.status(404).json({ success: false, message: 'Ligne de stock introuvable' });
    }

    // ✅ Créer un mouvement d'audit
    const mouvement = await MouvementStock.create({
      stock: stock._id,
      type: 'ANNULATION_CONSOMMATION',
      quantite: piece.quantite,
      quantiteAvant: stock.quantite - piece.quantite,
      quantiteApres: stock.quantite,
      reparationId: reparation._id,
      motif: motif || `Annulation de consommation (${reparation.numero})`,
      createdBy: req.user.id,
    });

    // ✅ Mettre à jour la pièce
    piece.statut = 'annule';
    piece.dateAnnulation = new Date();
    piece.annulePar = req.user.id;
    piece.motifAnnulation = motif || '';
    piece.mouvementAnnulationId = mouvement._id;

    await reparation.save();

    logger.info(
      `↩️ Consommation annulée: ${piece.quantite} × ${stock._id} pour ${reparation.numero} par ${req.user.username}`
    );

    res.json({
      success: true,
      message: `Pièce annulée — ${piece.quantite} unité(s) remise(s) en stock`,
      data: {
        piece,
        nouveauStock: stock.quantite,
      },
      mouvementId: mouvement._id,
    });
  } catch (error) {
    logger.error('Erreur annulerConsommation:', error);
    res.status(500).json({ success: false, message: error.message });
  }
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