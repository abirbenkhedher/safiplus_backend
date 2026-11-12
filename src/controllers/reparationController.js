const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const Status = require('../models/Status');
const Marque = require('../models/Marque');
const Modele = require('../models/Modele');
const Panne = require('../models/Panne');
const Categorie = require('../models/Categorie');
const Stock = require('../models/Stock');
const MouvementStock = require('../models/MouvementStock');
const logger = require('../config/logger');
const valorisation = require('../services/valorisationService');
const commissionService = require('../services/commissionService');
const { getParametres } = require('../services/atelierService');
const pdfService = require('../services/pdfService');
const smsService = require('../services/smsService');

// ✅ Statuts : libellés normalisés (accents, tirets, réparé/réparée...)
const { isStatutNonRepare, doitEtreCloturee } = require('../utils/statutReparation');

const OBJECTID_FIELDS_TO_CLEAN = [
  'marque', 'modele', 'reparateur', 'reparateurSAV',
  'representant', 'categorie', 'objet', 'client', 'status',
];

// ============================================================
// ✅ HELPERS
// ============================================================
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMultiValue(val) {
  if (val === undefined || val === null) return [];
  const str = String(val).trim();
  if (!str) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildInClause(val) {
  const arr = parseMultiValue(val);
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return { $in: arr };
}

async function cleanEmptyObjectIds() {
  try {
    for (const field of OBJECTID_FIELDS_TO_CLEAN) {
      const result = await Reparation.collection.updateMany(
        { [field]: '' },
        { $set: { [field]: null } }
      );
      if (result.modifiedCount > 0) {
        logger.info(`🔧 Nettoyage ${field}: ${result.modifiedCount} doc(s)`);
      }
    }
  } catch (err) {
    logger.error('Erreur cleanEmptyObjectIds:', err);
  }
}

function computePrixTotal(r) {
  const imprevusAcceptes = (r.diagnosticImprevus?.imprevus || [])
    .filter((i) => i.accepte === true)
    .reduce((sum, i) => sum + (Number(i.prixSupplementaire) || 0), 0);
  return (Number(r.prix) || 0) + imprevusAcceptes;
}

function enrichReparation(r) {
  if (!r) return null;
  const prixTotal = computePrixTotal(r);
  const acompte = Number(r.acompte) || 0;
  return {
    ...r,
    prixTotal,
    reste: Math.max(0, prixTotal - acompte),
    resteTotal: Math.max(0, prixTotal - acompte),
    imprevusEnAttente: (r.diagnosticImprevus?.imprevus || []).filter(
      (i) => i.accepte === null || i.accepte === undefined
    ).length,
  };
}

// ============================================================
// ✅ NOUVEAU : détermine si une réparation est clôturée
//    (statut "sortie réparée" ET reste à payer = 0)
// ============================================================
function isReparationCloturee(reparation, statusLabel) {
  // statut « réparé / sortie réparé(e) » ET reste à payer = 0 (prix 0 inclus)
  return doitEtreCloturee(reparation, statusLabel);
}

async function syncPannesWithCategories(panneNoms, categorieId) {
  try {
    if (!categorieId || !Array.isArray(panneNoms)) return;

    for (const nom of panneNoms) {
      const trimmed = String(nom).trim();
      if (!trimmed) continue;

      const existing = await Panne.findOne({
        nom: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' },
        categorie: categorieId,
      });

      if (!existing) {
        const lastPanne = await Panne.findOne({ categorie: categorieId })
          .sort({ ordre: -1 })
          .select('ordre')
          .lean();

        const lastOrdre = lastPanne?.ordre ?? 0;
        const nextOrdre = lastOrdre >= 999 ? lastOrdre + 1 : 999;

        await Panne.create({
          nom: trimmed,
          categorie: categorieId,
          ordre: nextOrdre,
          isActive: true,
        });

        logger.info(`✨ Panne créée: "${trimmed}"`);
      }
    }
  } catch (error) {
    logger.error('Erreur syncPannesWithCategories:', error);
  }
}

async function trySendSMS(reparationId, statusIdOrDoc, userId) {
  try {
    const repWithClient = await Reparation.findById(reparationId).populate(
      'client',
      'nom phone phone2 email code codeFidelite'
    );

    if (!repWithClient) {
      return { statutEnvoi: 'echec', erreur: 'Réparation introuvable', skip: true };
    }

    let statusDoc = null;
    if (statusIdOrDoc && typeof statusIdOrDoc === 'object' && statusIdOrDoc.label) {
      statusDoc = statusIdOrDoc;
    } else {
      const statusId = statusIdOrDoc || repWithClient.status;
      statusDoc = await Status.findById(statusId);
    }

    if (!statusDoc) {
      return { statutEnvoi: 'echec', erreur: 'Statut introuvable', skip: true };
    }

    const smsInfo = await smsService.sendStatusSMS(
      repWithClient,
      statusDoc.label,
      userId
    );

    if (smsInfo && !smsInfo.skip) {
      repWithClient.smsEnvoyes = [...(repWithClient.smsEnvoyes || []), smsInfo];
      await repWithClient.save();
    }

    return smsInfo;
  } catch (error) {
    logger.error('Erreur trySendSMS:', error);
    return { statutEnvoi: 'echec', erreur: error.message, skip: false };
  }
}

function getFullPopulate(query) {
  return query
    .populate('boutique', 'nom code')
    .populate('client', 'nom phone phone2 email code codeFidelite adresse zone')
    .populate('status', 'label color parDefault')
    .populate({
      path: 'categorie',
      select: 'nom famille reparateurs',
      populate: {
        path: 'reparateurs',
        select: 'firstName lastName username role',
      },
    })
    .populate('objet', 'nom')
    .populate('marque', 'nom')
    .populate('modele', 'nom')
    .populate('createdBy', 'username firstName lastName')
    .populate('representant', 'username firstName lastName')
    .populate('reparateur', 'username firstName lastName')
    .populate('reparateurSAV', 'username firstName lastName')
    .populate('modifications.modifiedBy', 'username firstName lastName')
    .populate('diagnosticImprevus.imprevus.decisionPar', 'username firstName lastName')
    .populate('diagnosticImprevus.decisionClient.enregistrePar', 'username firstName lastName')
    .populate('smsEnvoyes.envoyePar', 'username firstName lastName')
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
}

async function restaurerStockPourReparation(reparation, userId, motif) {
  try {
    const pieces = reparation.piecesStock || [];
    const aRestaurer = pieces.filter((p) => p.statut === 'consomme');

    if (aRestaurer.length === 0) {
      return { restaurees: 0, details: [] };
    }

    const details = [];
    const params = await getParametres(reparation.boutique);

    for (const piece of aRestaurer) {
      try {
        // ✅ Retour valorisé au coût d'origine (CMP / lots) ; pas de retour
        //    physique si la pièce avait été consommée en mode stock désactivé
        const out = await valorisation.retour({
          stockId: piece.stock, quantite: piece.quantite, coutUnitaire: piece.coutUnitaire,
          stockPhysique: piece.stockPhysique !== false, params, userId,
          type: 'RESTAURATION_REPARATION', motif: motif || `Restauration (${reparation.numero})`,
          reparationId: reparation._id, sourceType: 'Reparation', sourceId: reparation._id,
        });

        piece.statut = 'restaure';
        piece.dateRestauration = new Date();
        piece.restaurePar = userId;
        piece.motifRestauration = motif || '';
        piece.mouvementRestaurationId = out.mouvementId;

        details.push({
          stock: piece.stock,
          quantite: piece.quantite,
          nouveauStock: out.quantiteApres,
        });

        logger.info(`♻️ Stock restauré: +${piece.quantite} × ${piece.stock}`);
      } catch (err) {
        logger.error(`❌ Erreur restauration pièce ${piece._id}:`, err);
      }
    }

    return { restaurees: details.length, details };
  } catch (error) {
    logger.error('Erreur restaurerStockPourReparation:', error);
    return { restaurees: 0, details: [], error: error.message };
  }
}

// ============================================================
// ✅ GET /reparations/en-retard — alerte du header
// Réparations au statut « en cours » reçues depuis plus de N heures (défaut 48).
// Liste légère (quelques champs) : l'ancien chargement complet des réparations
// en cours pesait des dizaines de Mo avec beaucoup de dossiers.
// ============================================================
exports.getEnRetard = async (req, res) => {
  try {
    const heures = Math.min(Math.max(parseInt(req.query.heures, 10) || 48, 1), 24 * 365);
    const limite = new Date(Date.now() - heures * 3600 * 1000);
    const statuts = await Status.find({ label: /cours/i }).select('_id').lean();
    if (statuts.length === 0) return res.json({ success: true, data: [], total: 0 });

    const query = {
      isDeleted: false,
      status: { $in: statuts.map((s) => s._id) },
      $or: [
        { dateReception: { $lte: limite } },
        { dateReception: null, createdAt: { $lte: limite } },
      ],
    };
    const [data, total] = await Promise.all([
      Reparation.find(query)
        .select('numero client marque modele status dateReception createdAt')
        .populate('client', 'nom')
        .populate('marque', 'nom')
        .populate('modele', 'nom')
        .populate('status', 'label')
        .sort({ dateReception: 1, createdAt: 1 })
        .limit(500)
        .lean(),
      Reparation.countDocuments(query),
    ]);
    res.json({ success: true, data, total, heures });
  } catch (error) {
    logger.error('Erreur getEnRetard:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la recherche des retards' });
  }
};

// ============================================================
// GET - Liste paginée OPTIMISÉE
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const startTime = Date.now();

    await cleanEmptyObjectIds();

    const {
      search, status, categorie, client, reparateur, createdBy, commercial,
      famille, dateDebut, dateFin, zone,
      dateModifDebut, dateModifFin,
      dateClotureDebut, dateClotureFin, // ✅ NOUVEAU
      limit = 20, page = 1, sort = '-createdAt',
    } = req.query;

    // limit=all → toutes les lignes (option « Tous » de la pagination)
    const showAll = String(limit) === 'all';
    const limitNum = showAll ? 0 : Math.min(parseInt(limit) || 20, 200);
    const pageNum = showAll ? 1 : Math.max(parseInt(page) || 1, 1);

    const query = { isDeleted: false };

    const statusClause = buildInClause(status);
    if (statusClause) query.status = statusClause;

    const clientClause = buildInClause(client);
    if (clientClause) query.client = clientClause;

    const reparateurClause = buildInClause(reparateur);
    if (reparateurClause) query.reparateur = reparateurClause;

    const createdByClause = buildInClause(createdBy) || buildInClause(commercial);
    if (createdByClause) query.createdBy = createdByClause;

    const familleIds = parseMultiValue(famille);
    const categorieIds = parseMultiValue(categorie);

    if (familleIds.length > 0) {
      const categoriesDeLaFamille = await Categorie.find({
        famille: { $in: familleIds },
      }).select('_id').lean();

      const categorieIdsDeLaFamille = categoriesDeLaFamille.map((c) => String(c._id));

      if (categorieIds.length > 0) {
        const intersection = categorieIds.filter((id) =>
          categorieIdsDeLaFamille.includes(String(id))
        );

        if (intersection.length > 0) {
          query.categorie = intersection.length === 1 ? intersection[0] : { $in: intersection };
        } else {
          return res.json({
            success: true, data: [],
            pagination: { total: 0, page: 1, pages: 0, limit: limitNum },
          });
        }
      } else {
        if (categorieIdsDeLaFamille.length > 0) {
          query.categorie = { $in: categorieIdsDeLaFamille };
        } else {
          return res.json({
            success: true, data: [],
            pagination: { total: 0, page: 1, pages: 0, limit: limitNum },
          });
        }
      }
    } else if (categorieIds.length > 0) {
      query.categorie = categorieIds.length === 1 ? categorieIds[0] : { $in: categorieIds };
    }

    const zoneValues = parseMultiValue(zone);
    if (zoneValues.length > 0) {
      const zoneRegex = zoneValues.map((z) => ({
        zone: { $regex: `^${escapeRegex(z)}$`, $options: 'i' },
      }));

      const clientsWithZone = await Client.find({ $or: zoneRegex }).select('_id').lean();
      const clientIdsZone = clientsWithZone.map((c) => c._id);

      if (clientIdsZone.length > 0) {
        if (query.client && typeof query.client === 'object' && query.client.$in) {
          query.client = {
            $in: query.client.$in.filter((id) =>
              clientIdsZone.some((cid) => String(cid) === String(id))
            ),
          };
          if (query.client.$in.length === 0) {
            return res.json({
              success: true, data: [],
              pagination: { total: 0, page: 1, pages: 0, limit: limitNum },
            });
          }
        } else if (query.client) {
          const belongs = clientIdsZone.some((cid) => String(cid) === String(query.client));
          if (!belongs) {
            return res.json({
              success: true, data: [],
              pagination: { total: 0, page: 1, pages: 0, limit: limitNum },
            });
          }
        } else {
          query.client = clientIdsZone.length === 1 ? clientIdsZone[0] : { $in: clientIdsZone };
        }
      } else {
        return res.json({
          success: true, data: [],
          pagination: { total: 0, page: 1, pages: 0, limit: limitNum },
        });
      }
    }

    if (search && String(search).trim()) {
      const textSearch = String(search).trim();
      const rx = escapeRegex(textSearch);

      const [matchingClients, matchingMarques, matchingModeles] = await Promise.all([
        Client.find({
          $or: [
            { nom: { $regex: rx, $options: 'i' } },
            { phone: { $regex: rx, $options: 'i' } },
            { phone2: { $regex: rx, $options: 'i' } },
            { code: { $regex: rx, $options: 'i' } },
            { codeFidelite: { $regex: rx, $options: 'i' } },
          ],
        }).select('_id').limit(1000).lean(),
        Marque.find({ nom: { $regex: rx, $options: 'i' } }).select('_id').limit(200).lean(),
        Modele.find({ nom: { $regex: rx, $options: 'i' } }).select('_id').limit(200).lean(),
      ]);

      const clientIds = matchingClients.map((c) => c._id);
      const marqueIds = matchingMarques.map((m) => m._id);
      const modeleIds = matchingModeles.map((m) => m._id);

      const searchConditions = [
        { numero: { $regex: rx, $options: 'i' } },
        { problemeDeclare: { $regex: rx, $options: 'i' } },
        { note: { $regex: rx, $options: 'i' } },
        { panneType: { $regex: rx, $options: 'i' } },
        ...(clientIds.length > 0 ? [{ client: { $in: clientIds } }] : []),
        ...(marqueIds.length > 0 ? [{ marque: { $in: marqueIds } }] : []),
        ...(modeleIds.length > 0 ? [{ modele: { $in: modeleIds } }] : []),
      ];

      if (query.$or) {
        query.$and = [
          ...(query.$and || []),
          { $or: query.$or },
          { $or: searchConditions },
        ];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) {
        const endDate = new Date(dateFin);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    if (dateModifDebut || dateModifFin) {
      query.updatedAt = {};
      if (dateModifDebut) query.updatedAt.$gte = new Date(dateModifDebut);
      if (dateModifFin) {
        const endDate = new Date(dateModifFin);
        endDate.setHours(23, 59, 59, 999);
        query.updatedAt.$lte = endDate;
      }
    }

    // ✅ NOUVEAU : filtre date de clôture
    if (dateClotureDebut || dateClotureFin) {
      query.dateCloture = { $ne: null };
      if (dateClotureDebut) {
        query.dateCloture.$gte = new Date(dateClotureDebut);
      }
      if (dateClotureFin) {
        const endDate = new Date(dateClotureFin);
        endDate.setHours(23, 59, 59, 999);
        query.dateCloture.$lte = endDate;
      }
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'dateCloture', 'numero', 'prix', 'acompte'];
    let safeSort = '-createdAt';
    if (sort && typeof sort === 'string' && sort.trim()) {
      const field = sort.replace(/^-/, '').trim();
      if (allowedSortFields.includes(field)) {
        safeSort = sort;
      }
    }

    const skip = (pageNum - 1) * limitNum;

    const [reparations, total] = await Promise.all([
      getFullPopulate(Reparation.find(query))
        .sort(safeSort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Reparation.countDocuments(query),
    ]);

    const reparationsWithReste = reparations.map(enrichReparation).filter(Boolean);

    const duration = Date.now() - startTime;
    logger.info(`📋 getAll: ${total} réparations, ${reparations.length} retournées en ${duration}ms`);

    res.json({
      success: true,
      data: reparationsWithReste,
      pagination: {
        total,
        page: pageNum,
        pages: showAll ? (total ? 1 : 0) : Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    logger.error('Erreur getAll reparations:', error);
    console.error('❌ [getAll] FULL ERROR:', { message: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des réparations',
      ...(process.env.NODE_ENV !== 'production' && { debug: error.message }),
    });
  }
};

// ============================================================
// GET - Une réparation par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const reparation = await getFullPopulate(Reparation.findById(req.params.id));

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    res.json({
      success: true,
      data: enrichReparation(reparation.toObject()),
    });
  } catch (error) {
    logger.error('Erreur getOne reparation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la réparation',
    });
  }
};

// ============================================================
// GET - Route PUBLIQUE
// ============================================================
exports.getPublicByNumero = async (req, res) => {
  try {
    const { numero } = req.params;

    if (!numero) {
      return res.status(400).json({ success: false, message: 'Numéro de réparation requis' });
    }

    const reparation = await Reparation.findOne({ numero, isDeleted: false })
      .populate('client', 'nom phone phone2 codeFidelite adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('reparateur', 'firstName lastName')
      .populate('boutique', 'nom telephone adresse')
      .lean();

    if (!reparation) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const imprevusAcceptes = (reparation.diagnosticImprevus?.imprevus || [])
      .filter((i) => i.accepte === true);

    const imprevusEnAttente = (reparation.diagnosticImprevus?.imprevus || [])
      .filter((i) => i.accepte === null || i.accepte === undefined);

    const totalImprevusAcceptes = imprevusAcceptes
      .reduce((sum, i) => sum + (Number(i.prixSupplementaire) || 0), 0);

    const prixTotal = (reparation.prix || 0) + totalImprevusAcceptes;
    const reste = Math.max(0, prixTotal - (reparation.acompte || 0));

    res.json({
      success: true,
      data: {
        numero: reparation.numero,
        boutique: reparation.boutique
          ? { nom: reparation.boutique.nom, telephone: reparation.boutique.telephone, adresse: reparation.boutique.adresse }
          : null,
        client: {
          nom: reparation.client?.nom || 'N/A',
          phone: reparation.client?.phone,
          phone2: reparation.client?.phone2,
          codeFidelite: reparation.client?.codeFidelite,
          adresse: reparation.client?.adresse,
        },
        objet: reparation.objet?.nom,
        categorie: reparation.categorie?.nom,
        marque: reparation.marque?.nom || null,
        modele: reparation.modele?.nom || null,
        panneType: reparation.panneType || [],
        problemeDeclare: reparation.problemeDeclare,
        status: {
          label: reparation.status?.label,
          color: reparation.status?.color,
        },
        reparateur: reparation.reparateur
          ? { firstName: reparation.reparateur.firstName, lastName: reparation.reparateur.lastName }
          : null,
        dateReception: reparation.dateReception || reparation.createdAt,
        datePrevisionnelle: reparation.datePrevisionnelle,
        dateFinReelle: reparation.dateFinReelle,
        dateLivraison: reparation.dateLivraison,
        dateCloture: reparation.dateCloture || null,
        prix: reparation.prix,
        acompte: reparation.acompte,
        prixTotal,
        reste,
        imprevusAcceptes: imprevusAcceptes.map((i) => ({
          description: i.description,
          prix: i.prixSupplementaire,
        })),
        imprevusEnAttente: imprevusEnAttente.length,
        isReparable: reparation.isReparable,
        createdAt: reparation.createdAt,
        updatedAt: reparation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Erreur getPublicByNumero:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
};

// ============================================================
// POST - Créer une réparation
// ============================================================
exports.create = async (req, res) => {
  try {
    const {
      client, categorie, objet, marque, modele,
      problemeDeclare, panneType, note, observation ,observations,
            diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, reparateurSAV,
      datePrevisionnelle, isReparable, isNotified,
    } = req.body;

    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(400).json({ success: false, message: 'Client non trouvé' });
    }

    const statusExists = await Status.findById(status);
    if (!statusExists) {
      return res.status(400).json({ success: false, message: 'Statut non trouvé' });
    }

    if (!panneType || !Array.isArray(panneType) || panneType.length === 0) {
      return res.status(400).json({
        success: false, message: 'Au moins une panne est obligatoire',
      });
    }

    const cleanPanneTypes = panneType
      .filter((p) => p && typeof p === 'string' && p.trim() !== '')
      .map((p) => p.trim());

    if (cleanPanneTypes.length === 0) {
      return res.status(400).json({
        success: false, message: 'Au moins une panne valide est obligatoire',
      });
    }

    if (marque) {
      const marqueExists = await Marque.findById(marque);
      if (!marqueExists) {
        return res.status(400).json({ success: false, message: 'Marque non trouvée' });
      }
    }

    if (modele) {
      const modeleExists = await Modele.findById(modele);
      if (!modeleExists) {
        return res.status(400).json({ success: false, message: 'Modèle non trouvé' });
      }
    }

    const finalPrix = prix || 0;
    const finalAcompte = acompte || 0;
    let finalPaymentType = paymentType || 'unpaid';

    if (finalAcompte >= finalPrix && finalPrix > 0) finalPaymentType = 'paid';
    else if (finalAcompte > 0 && finalAcompte < finalPrix) finalPaymentType = 'partial';
    else finalPaymentType = 'unpaid';

    const cleanObservations = (observations || []).filter(
      (o) => o.text && o.text.trim() !== ''
    );

    const reparation = new Reparation({
      client, categorie, objet,
      marque: marque || null,
      modele: modele || null,
      problemeDeclare,
      panneType: cleanPanneTypes,
      note, observation,
      observations: cleanObservations,
      diagnostic,
      diagnosticImprevus: {
        constat: diagnosticImprevusData?.constat || '',
        imprevus: (diagnosticImprevusData?.imprevus || []).filter(
          (i) => i.description?.trim()
        ),
        decisionClient: {
          statut: diagnosticImprevusData?.decisionClient?.statut || 'en_attente',
          date: diagnosticImprevusData?.decisionClient?.date || null,
          note: diagnosticImprevusData?.decisionClient?.note || '',
          enregistrePar: diagnosticImprevusData?.decisionClient?.enregistrePar || null,
        },
      },
      travauxEffectues, piecesUtilisees,
      prix: finalPrix,
      acompte: finalAcompte,
      paymentType: finalPaymentType,
      status,
      createdBy: req.user.id,
      representant: representant || req.user.id,
      reparateur: reparateur || null,
      reparateurSAV: reparateurSAV || null,
      datePrevisionnelle: datePrevisionnelle || null,
      isReparable: isReparable !== undefined ? isReparable : true,
      isNotified: isNotified !== undefined ? isNotified : false,
      modifications: [{
        field: '_create',
        oldValue: null,
        newValue: 'Réparation créée',
        modifiedBy: req.user.id,
        modifiedAt: new Date(),
      }],
    });

    // ✅ NOUVEAU : si la réparation est créée directement clôturée → enregistrer dateCloture
    const statusLabel = (statusExists.label || '').toUpperCase().trim();
    if (isReparationCloturee(reparation, statusLabel)) {
      reparation.dateCloture = new Date();
      logger.info(
        `🔒 Réparation créée directement clôturée: ${statusLabel}`
      );
    }

    await reparation.save();

    await syncPannesWithCategories(cleanPanneTypes, categorie);

    const populated = await getFullPopulate(Reparation.findById(reparation._id));

    logger.info(`Réparation créée: ${reparation.numero} par ${req.user.username}`);

    let smsInfo = null;
    if (req.body.envoyerSMS) {
      smsInfo = await trySendSMS(reparation._id, statusExists, req.user.id);
    }

    res.status(201).json({
      success: true,
      message: 'Réparation créée avec succès',
      sms: smsInfo,
      data: enrichReparation(populated.toObject()),
    });
  } catch (error) {
    logger.error('Erreur create reparation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création de la réparation',
    });
  }
};

// ============================================================
// PUT - Modifier une réparation
// ============================================================
exports.update = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id);

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const {
      client, categorie, objet, marque, modele,
      problemeDeclare, panneType, note, observation, observations,
      diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, reparateurSAV,
      datePrevisionnelle, isReparable, isNotified,
      envoyerSMS = false,
      dateModification,
      dateCloture: dateClotureOverride, // ✅ NOUVEAU
    } = req.body;

    console.log('🔍 [UPDATE] req.user.role =', req.user?.role);
    console.log('🔍 [UPDATE] dateModification reçue =', dateModification);
    console.log('🔍 [UPDATE] dateClotureOverride reçue =', dateClotureOverride);

    if (client !== undefined && client !== null && client !== '') {
      const currentClientId = reparation.client ? reparation.client.toString() : null;
      if (client !== currentClientId) {
        const clientExists = await Client.findById(client);
        if (!clientExists) {
          return res.status(400).json({ success: false, message: 'Client non trouvé' });
        }
      }
    }

    let cleanPanneTypes = null;
    if (panneType !== undefined) {
      if (!Array.isArray(panneType)) {
        return res.status(400).json({
          success: false, message: 'Le type de panne doit être un tableau',
        });
      }

      cleanPanneTypes = panneType
        .filter((p) => p && typeof p === 'string' && p.trim() !== '')
        .map((p) => p.trim());

      if (cleanPanneTypes.length === 0) {
        return res.status(400).json({
          success: false, message: 'Au moins une panne est obligatoire',
        });
      }
    }

    const oldStatusId = reparation.status?.toString();
    let oldStatusLabel = '';
    if (oldStatusId) {
      const oldStatusDoc = await Status.findById(oldStatusId);
      oldStatusLabel = (oldStatusDoc?.label || '').toUpperCase().trim();
    }

    if (status && status !== oldStatusId) {
      const statusExists = await Status.findById(status);
      if (!statusExists) {
        return res.status(400).json({ success: false, message: 'Statut non trouvé' });
      }
    }

    if (marque !== undefined && marque !== null && marque !== '') {
      const currentMarqueId = reparation.marque ? reparation.marque.toString() : null;
      if (marque !== currentMarqueId) {
        const marqueExists = await Marque.findById(marque);
        if (!marqueExists) {
          return res.status(400).json({ success: false, message: 'Marque non trouvée' });
        }
      }
    }

    if (modele !== undefined && modele !== null && modele !== '') {
      const currentModeleId = reparation.modele ? reparation.modele.toString() : null;
      if (modele !== currentModeleId) {
        const modeleExists = await Modele.findById(modele);
        if (!modeleExists) {
          return res.status(400).json({ success: false, message: 'Modèle non trouvé' });
        }
      }
    }

    const oldValues = {
      client: reparation.client,
      categorie: reparation.categorie,
      objet: reparation.objet,
      marque: reparation.marque,
      modele: reparation.modele,
      problemeDeclare: reparation.problemeDeclare,
      panneType: [...(reparation.panneType || [])],
      note: reparation.note,
      observation: reparation.observation,
      observations: reparation.observations,
      diagnostic: reparation.diagnostic,
      diagnosticImprevus: JSON.parse(JSON.stringify(reparation.diagnosticImprevus || {})),
      travauxEffectues: reparation.travauxEffectues,
      piecesUtilisees: reparation.piecesUtilisees,
      prix: reparation.prix,
      acompte: reparation.acompte,
      status: reparation.status,
      reparateur: reparation.reparateur,
      reparateurSAV: reparation.reparateurSAV,
      datePrevisionnelle: reparation.datePrevisionnelle,
      isReparable: reparation.isReparable,
      isNotified: reparation.isNotified,
      dateCloture: reparation.dateCloture,
    };

    if (client !== undefined && client !== null && client !== '') {
      reparation.client = client;
    }

    reparation.categorie = categorie || reparation.categorie;
    reparation.objet = objet || reparation.objet;
    reparation.marque = marque !== undefined ? (marque || null) : reparation.marque;
    reparation.modele = modele !== undefined ? (modele || null) : reparation.modele;
    reparation.problemeDeclare = problemeDeclare !== undefined ? problemeDeclare : reparation.problemeDeclare;

    if (cleanPanneTypes !== null) {
      reparation.panneType = cleanPanneTypes;
      await syncPannesWithCategories(cleanPanneTypes, reparation.categorie);
    }

    reparation.note = note !== undefined ? note : reparation.note;
    reparation.observation = observation !== undefined ? observation : reparation.observation;

    if (observations !== undefined) {
      reparation.observations = observations.filter(
        (o) => o.text && o.text.trim() !== ''
      );
    }

    reparation.diagnostic = diagnostic !== undefined ? diagnostic : reparation.diagnostic;
    reparation.travauxEffectues = travauxEffectues !== undefined ? travauxEffectues : reparation.travauxEffectues;
    reparation.piecesUtilisees = piecesUtilisees !== undefined ? piecesUtilisees : reparation.piecesUtilisees;
    reparation.prix = prix !== undefined ? prix : reparation.prix;
    reparation.acompte = acompte !== undefined ? acompte : reparation.acompte;
    reparation.status = status || reparation.status;
    reparation.representant = representant || reparation.representant;
    reparation.reparateur = reparateur !== undefined ? reparateur : reparation.reparateur;
    reparation.reparateurSAV = reparateurSAV !== undefined ? reparateurSAV : reparation.reparateurSAV;
    reparation.datePrevisionnelle = datePrevisionnelle !== undefined ? datePrevisionnelle : reparation.datePrevisionnelle;
    reparation.isReparable = isReparable !== undefined ? isReparable : reparation.isReparable;
    reparation.isNotified = isNotified !== undefined ? isNotified : reparation.isNotified;

    if (diagnosticImprevusData !== undefined) {
      const oldDiag = reparation.diagnosticImprevus || {};
      const newImprevus = (diagnosticImprevusData.imprevus || []).filter(
        (i) => i.description?.trim()
      );

      const enrichedImprevus = newImprevus.map((newImp, idx) => {
        const oldImp = oldDiag.imprevus?.[idx];
        const decisionChanged = oldImp && oldImp.accepte !== newImp.accepte;
        const isNewDecision = newImp.accepte !== null && newImp.accepte !== undefined;

        return {
          description: newImp.description,
          prixSupplementaire: newImp.prixSupplementaire || 0,
          accepte: newImp.accepte !== undefined ? newImp.accepte : null,
          dateDecision: (decisionChanged || (isNewDecision && !oldImp?.dateDecision))
            ? new Date()
            : (newImp.dateDecision || oldImp?.dateDecision || null),
          decisionPar: (decisionChanged || (isNewDecision && !oldImp?.decisionPar))
            ? req.user.id
            : (newImp.decisionPar || oldImp?.decisionPar || null),
          noteDecision: newImp.noteDecision || '',
        };
      });

      const newDecision = diagnosticImprevusData.decisionClient || {};
      const oldDecision = oldDiag.decisionClient || {};
      const decisionChanged = oldDecision.statut !== newDecision.statut;

      reparation.diagnosticImprevus = {
        constat: diagnosticImprevusData.constat !== undefined ? diagnosticImprevusData.constat : (oldDiag.constat || ''),
        imprevus: enrichedImprevus,
        decisionClient: {
          statut: newDecision.statut || oldDecision.statut || 'en_attente',
          date: decisionChanged && newDecision.statut !== 'en_attente'
            ? new Date()
            : (newDecision.date || oldDecision.date || null),
          note: newDecision.note !== undefined ? newDecision.note : (oldDecision.note || ''),
          enregistrePar: decisionChanged && newDecision.statut !== 'en_attente'
            ? req.user.id
            : (newDecision.enregistrePar || oldDecision.enregistrePar || null),
        },
      };
    }

    // ✅ Clôture : date saisie par l'admin prioritaire, sinon clôture automatique
    //    dès que le statut est "réparé / sortie réparé" et que le reste à payer est 0.
    const roleUp = String(req.user?.role || '').toUpperCase();
    if (dateClotureOverride !== undefined && ['ADMIN', 'SUPER_ADMIN'].includes(roleUp)) {
      if (dateClotureOverride === null || dateClotureOverride === '') {
        reparation.dateCloture = null;
      } else {
        const d = new Date(dateClotureOverride);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: 'Date de clôture invalide' });
        }
        reparation.dateCloture = d;
      }
    } else if (!reparation.dateCloture) {
      const finalStatusDoc = reparation.status ? await Status.findById(reparation.status) : null;
      if (isReparationCloturee(reparation, finalStatusDoc?.label)) {
        reparation.dateCloture = new Date();
        reparation.modifications = [...(reparation.modifications || []), {
          field: 'dateCloture', oldValue: null, newValue: reparation.dateCloture,
          modifiedBy: req.user.id, modifiedAt: new Date(), comment: 'Clôture automatique (réparé + reste 0)',
        }];
        logger.info(`🔒 Réparation ${reparation.numero} clôturée automatiquement`);
      }
    }

    const finalPrix = reparation.prix || 0;
    const finalAcompte = reparation.acompte || 0;
    if (finalAcompte >= finalPrix && finalPrix > 0) reparation.paymentType = 'paid';
    else if (finalAcompte > 0 && finalAcompte < finalPrix) reparation.paymentType = 'partial';
    else reparation.paymentType = 'unpaid';

    if (status) {
      const newStatusDoc = await Status.findById(status);
      if (newStatusDoc && newStatusDoc.label === 'Livré') {
        reparation.dateLivraison = new Date();
      }
    }

    // ✅ Intervention partagée : répartition explicite des commissions
    if (req.body.repartitionCommission !== undefined) {
      const canSplit = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)
        || (req.user.permissions || []).some((p) => ['commissions_valider', 'remuneration_regles'].includes(p));
      if (!canSplit) {
        return res.status(403).json({ success: false, message: 'Permission requise pour répartir les commissions' });
      }
      const old = (reparation.repartitionCommission || []).map((r) => ({ reparateur: String(r.reparateur), pourcentage: r.pourcentage }));
      reparation.repartitionCommission = Array.isArray(req.body.repartitionCommission) ? req.body.repartitionCommission : [];
      reparation.modifications = [...(reparation.modifications || []), {
        field: 'repartitionCommission', oldValue: old, newValue: req.body.repartitionCommission,
        modifiedBy: req.user.id, modifiedAt: new Date(),
      }];
    }

    const trackedFields = [
      'client',
      'prix', 'acompte', 'status', 'reparateur', 'reparateurSAV',
      'problemeDeclare',
      'panneType', 'marque', 'modele', 'note', 'observations',
      'datePrevisionnelle',
      'categorie', 'objet', 'observation',
      'diagnostic', 'diagnosticImprevus', 'travauxEffectues', 'piecesUtilisees',
      'isReparable', 'isNotified',
      'dateCloture', // ✅ NOUVEAU
    ];

    const newModifications = [];

    trackedFields.forEach((field) => {
      if (req.body[field] === undefined) return;

      const oldVal = oldValues[field];
      const newVal = reparation[field];

      let changed = false;

      if (field === 'observations') {
        const oldStr = JSON.stringify((oldVal || []).map((o) => ({ text: o.text || '' })));
        const newStr = JSON.stringify((newVal || []).map((o) => ({ text: o.text || '' })));
        changed = oldStr !== newStr;
      } else if (field === 'panneType') {
        const oldStr = JSON.stringify([...(oldVal || [])].sort());
        const newStr = JSON.stringify([...(newVal || [])].sort());
        changed = oldStr !== newStr;
      } else if (field === 'diagnosticImprevus') {
        const oldStr = JSON.stringify({
          constat: oldVal?.constat || '',
          imprevus: (oldVal?.imprevus || []).map((i) => ({
            description: i.description || '',
            prixSupplementaire: i.prixSupplementaire || 0,
            accepte: i.accepte,
          })),
          decisionClient: {
            statut: oldVal?.decisionClient?.statut || 'en_attente',
            note: oldVal?.decisionClient?.note || '',
          },
        });
        const newStr = JSON.stringify({
          constat: newVal?.constat || '',
          imprevus: (newVal?.imprevus || []).map((i) => ({
            description: i.description || '',
            prixSupplementaire: i.prixSupplementaire || 0,
            accepte: i.accepte,
          })),
          decisionClient: {
            statut: newVal?.decisionClient?.statut || 'en_attente',
            note: newVal?.decisionClient?.note || '',
          },
        });
        changed = oldStr !== newStr;
      } else if (field === 'dateCloture') {
        const oldStr = oldVal ? new Date(oldVal).toISOString() : '';
        const newStr = newVal ? new Date(newVal).toISOString() : '';
        changed = oldStr !== newStr;
      } else if (typeof oldVal === 'boolean' || typeof newVal === 'boolean') {
        changed = Boolean(oldVal) !== Boolean(newVal);
      } else {
        const oldStr = oldVal?.toString() || '';
        const newStr = newVal?.toString() || '';
        changed = oldStr !== newStr;
      }

      if (changed) {
        newModifications.push({
          field,
          oldValue: oldVal,
          newValue: newVal,
          modifiedBy: req.user.id,
          modifiedAt: new Date(),
        });
      }
    });

    if (newModifications.length > 0) {
      reparation.modifications = [
        ...(reparation.modifications || []),
        ...newModifications,
      ];
      logger.info(`📝 ${newModifications.length} modification(s) pour ${reparation.numero}`);
    }

    let stockRestauration = null;

    if (status && status !== oldStatusId) {
      const newStatusDoc = await Status.findById(status);
      const newStatusLabel = (newStatusDoc?.label || '').toUpperCase().trim();

      const wasNonRepare = isStatutNonRepare(oldStatusLabel);
      const isNonRepare = isStatutNonRepare(newStatusLabel);

      if (!wasNonRepare && isNonRepare) {
        logger.info(
          `♻️ Restauration stock pour ${reparation.numero} (${oldStatusLabel} → ${newStatusLabel})`
        );

        stockRestauration = await restaurerStockPourReparation(
          reparation,
          req.user.id,
          `Réparation ${newStatusLabel}`
        );

        if (stockRestauration.restaurees > 0) {
          reparation.modifications = [
            ...(reparation.modifications || []),
            {
              field: 'piecesStock',
              oldValue: null,
              newValue: `${stockRestauration.restaurees} pièce(s) restaurée(s) au stock`,
              modifiedBy: req.user.id,
              modifiedAt: new Date(),
            },
          ];
        }
      }
    }

     

    // ============================================================
    // ✅ Si admin + dateModification → ajouter une entrée dans l'historique
    // ============================================================
    const userRole = (req.user?.role || '').toString().toUpperCase().trim();
    const isAdmin = userRole === 'ADMIN';

    let forcedUpdatedAt = null;

    if (isAdmin && dateModification) {
      const parsed = new Date(dateModification);
      if (!isNaN(parsed.getTime())) {
        forcedUpdatedAt = parsed;

        const oldUpdatedAt = reparation.updatedAt;

        reparation.modifications = [
          ...(reparation.modifications || []),
          {
            field: 'updatedAt',
            oldValue: oldUpdatedAt,
            newValue: forcedUpdatedAt,
            modifiedBy: req.user.id,
            modifiedAt: new Date(),
            comment: 'Date de modification forcée par admin',
          },
        ];

        logger.info(
          `🕒 [UPDATE] Date de modification forcée: ${reparation.numero} → ${forcedUpdatedAt.toISOString()} par ${req.user.username}`
        );
      } else {
        logger.warn(`⚠️ dateModification invalide: "${dateModification}"`);
      }
    }

    const originalTimestamps = reparation.$timestamps;
    if (forcedUpdatedAt) {
      reparation.$timestamps = false;
      reparation.updatedAt = forcedUpdatedAt;
    }

    await reparation.save();

    reparation.$timestamps = originalTimestamps ?? true;

    let dateModifUpdated = false;
    if (forcedUpdatedAt) {
      try {
        const result = await Reparation.collection.updateOne(
          { _id: reparation._id },
          { $set: { updatedAt: forcedUpdatedAt } }
        );
        dateModifUpdated = (result.matchedCount ?? 0) > 0;
      } catch (err) {
        logger.error('Erreur updateOne dateModification:', err);
      }
    }

    let smsInfo = null;
    if (envoyerSMS) {
      smsInfo = await trySendSMS(
        reparation._id,
        status || reparation.status,
        req.user.id
      );
    }

    const populated = await getFullPopulate(Reparation.findById(reparation._id));

    if (forcedUpdatedAt) {
      console.log('🔍 [UPDATE] updatedAt réel en BDD =', populated?.updatedAt);
      console.log('🔍 [UPDATE] date forcée demandée =', forcedUpdatedAt.toISOString());
    }
    console.log('🔍 [UPDATE] dateCloture en BDD =', populated?.dateCloture);

    logger.info(`Réparation modifiée: ${reparation.numero} par ${req.user.username}`);
    commissionService.syncReparationSafe(reparation._id, req.user._id); // ✅ commissions

    res.json({
      success: true,
      message: 'Réparation modifiée avec succès',
      sms: smsInfo,
      stockRestauration,
      dateModifUpdated,
      data: enrichReparation(populated.toObject()),
    });
  } catch (error) {
    logger.error('Erreur update reparation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la modification de la réparation',
    });
  }
};

// ============================================================
// PATCH - Changer le statut
// ============================================================
exports.changeStatus = async (req, res) => {
  try {
    const { status, comment, envoyerSMS = false } = req.body;

    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code codeFidelite');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const statusExists = await Status.findById(status);
    if (!statusExists) {
      return res.status(400).json({ success: false, message: 'Statut non trouvé' });
    }

    const oldStatus = reparation.status;
    const oldStatusDoc = oldStatus ? await Status.findById(oldStatus) : null;
    const oldStatusLabel = (oldStatusDoc?.label || '').toUpperCase().trim();
    const newStatusLabel = (statusExists.label || '').toUpperCase().trim();

    if (statusExists.isTerminal) {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Seul un administrateur peut changer un statut terminal',
        });
      }
    }

    reparation.status = status;

    reparation.modifications = [
      ...(reparation.modifications || []),
      {
        field: 'status',
        oldValue: oldStatus,
        newValue: status,
        modifiedBy: req.user.id,
        modifiedAt: new Date(),
        comment: comment || null,
      },
    ];

    let stockRestauration = null;

    const wasNonRepare = isStatutNonRepare(oldStatusLabel);
    const isNonRepare = isStatutNonRepare(newStatusLabel);

    if (!wasNonRepare && isNonRepare) {
      logger.info(
        `♻️ Restauration stock pour ${reparation.numero} (${oldStatusLabel} → ${newStatusLabel})`
      );

      stockRestauration = await restaurerStockPourReparation(
        reparation,
        req.user.id,
        `Réparation ${newStatusLabel}`
      );

      if (stockRestauration.restaurees > 0) {
        reparation.modifications = [
          ...(reparation.modifications || []),
          {
            field: 'piecesStock',
            oldValue: null,
            newValue: `${stockRestauration.restaurees} pièce(s) restaurée(s) au stock`,
            modifiedBy: req.user.id,
            modifiedAt: new Date(),
          },
        ];
      }
    }

    // ✅ NOUVEAU : calcul dateCloture dans changeStatus
    const cloture = isReparationCloturee(reparation, newStatusLabel);
    if (cloture && !reparation.dateCloture) {
      reparation.dateCloture = new Date();
      logger.info(`🔒 Réparation ${reparation.numero} clôturée le ${reparation.dateCloture.toISOString()}`);
    }

    await reparation.save();

    let smsInfo = null;
    if (envoyerSMS) {
      smsInfo = await trySendSMS(reparation._id, statusExists, req.user.id);
    }

    const populated = await Reparation.findById(reparation._id)
      .populate('status', 'label color')
      .populate('piecesStock.stock')
      .lean();

    logger.info(`Statut changé: ${reparation.numero} → ${statusExists.label} par ${req.user.username}`);
    commissionService.syncReparationSafe(reparation._id, req.user._id); // ✅ commissions

    res.json({
      success: true,
      message: 'Statut changé avec succès',
      sms: smsInfo,
      stockRestauration,
      data: enrichReparation(populated),
    });
  } catch (error) {
    logger.error('Erreur changeStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de statut',
    });
  }
};

// ============================================================
// PATCH - Assigner un réparateur
// ============================================================
exports.assignReparateur = async (req, res) => {
  try {
    const { reparateur } = req.body;
    const reparation = await Reparation.findById(req.params.id);

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const oldReparateur = reparation.reparateur;
    reparation.reparateur = reparateur;

    reparation.modifications = [
      ...(reparation.modifications || []),
      {
        field: 'reparateur',
        oldValue: oldReparateur,
        newValue: reparateur,
        modifiedBy: req.user.id,
        modifiedAt: new Date(),
      },
    ];

    await reparation.save();

    const populated = await Reparation.findById(reparation._id)
      .populate('reparateur', 'username firstName lastName')
      .lean();

    logger.info(`Réparateur assigné: ${reparation.numero} par ${req.user.username}`);
    commissionService.syncReparationSafe(reparation._id, req.user._id); // ✅ commissions

    res.json({
      success: true,
      message: 'Réparateur assigné avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur assignReparateur:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'assignation du réparateur",
    });
  }
};

// ============================================================
// DELETE - Supprimer une réparation (soft delete)
// ============================================================
exports.delete = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id);

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    reparation.isDeleted = true;

    reparation.modifications = [
      ...(reparation.modifications || []),
      {
        field: '_delete',
        oldValue: null,
        newValue: 'Réparation supprimée',
        modifiedBy: req.user.id,
        modifiedAt: new Date(),
      },
    ];

    await reparation.save();

    logger.info(`Réparation supprimée: ${reparation.numero} par ${req.user.username}`);
    commissionService.syncReparationSafe(reparation._id, req.user._id); // ✅ annule / contre-passe

    res.json({
      success: true,
      message: 'Réparation supprimée avec succès',
    });
  } catch (error) {
    logger.error('Erreur delete reparation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la réparation',
    });
  }
};

// ============================================================
// GET - Générer le PDF du reçu
// ============================================================
exports.generatePDF = async (req, res) => {
  try {
    const reparation = await getFullPopulate(Reparation.findById(req.params.id));

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const options = {
      boutiqueName: process.env.BOUTIQUE_NAME || 'ATELIER PRO',
      boutiqueAddress: process.env.BOUTIQUE_ADDRESS || 'Adresse',
      boutiquePhone: process.env.BOUTIQUE_PHONE || 'Tél',
      boutiqueEmail: process.env.BOUTIQUE_EMAIL || '',
      footerMessage: process.env.TICKET_FOOTER || 'Merci de votre confiance!',
      offsetLeft: parseFloat(req.query.offsetLeft) || 0.2,
      offsetRight: parseFloat(req.query.offsetRight) || 0.2,
    };

    const pdfBuffer = await pdfService.generateTicketPDF(reparation, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recu-${reparation.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Erreur generatePDF:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la génération du PDF' });
  }
};

// ============================================================
// GET - Obtenir le HTML pour impression navigateur
// ============================================================
exports.getTicketHTML = async (req, res) => {
  try {
    const reparation = await getFullPopulate(Reparation.findById(req.params.id));

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const options = {
      boutiqueName: process.env.BOUTIQUE_NAME || 'ATELIER PRO',
      boutiqueAddress: process.env.BOUTIQUE_ADDRESS || 'Adresse',
      boutiquePhone: process.env.BOUTIQUE_PHONE || 'Tél',
      boutiqueEmail: process.env.BOUTIQUE_EMAIL || '',
      footerMessage: process.env.TICKET_FOOTER || 'Merci de votre confiance!',
    };

    const html = await pdfService.generateTicketHTML(reparation, options);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Erreur getTicketHTML:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la génération du ticket' });
  }
};

// ============================================================
// DELETE - Supprimer plusieurs réparations
// ============================================================
exports.deleteMany = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune réparation à supprimer',
      });
    }

    const result = await Reparation.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      {
        $set: {
          isDeleted: true,
        },
      }
    );

    logger.info(`${result.modifiedCount} réparation(s) supprimée(s) par ${req.user.username}`);
    ids.forEach((id) => commissionService.syncReparationSafe(id, req.user._id)); // ✅ commissions

    res.json({
      success: true,
      message: `${result.modifiedCount} réparation(s) supprimée(s) avec succès`,
      deletedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error('Erreur deleteMany reparations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression multiple',
    });
  }
};