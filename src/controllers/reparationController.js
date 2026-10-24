const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const Status = require('../models/Status');
const Marque = require('../models/Marque');
const Modele = require('../models/Modele');
const Panne = require('../models/Panne');
const Categorie = require('../models/Categorie');
const logger = require('../config/logger');
const pdfService = require('../services/pdfService');
const smsService = require('../services/smsService');

// ============================================================
// ✅ HELPER : Échapper les caractères regex
// ============================================================
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// ✅ HELPER : Découper une valeur CSV en tableau
// ============================================================
function parseMultiValue(val) {
  if (val === undefined || val === null) return [];
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
// ✅ HELPER : Synchroniser les pannes personnalisées avec la base
// ============================================================
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
          .select('ordre');

        const lastOrdre = lastPanne?.ordre ?? 0;
        const nextOrdre = lastOrdre >= 999 ? lastOrdre + 1 : 999;

        await Panne.create({
          nom: trimmed,
          categorie: categorieId,
          ordre: nextOrdre,
          isActive: true,
        });

        logger.info(
          `✨ Panne personnalisée créée automatiquement: "${trimmed}" (catégorie ${categorieId}, ordre ${nextOrdre})`
        );
      }
    }
  } catch (error) {
    logger.error('Erreur syncPannesWithCategories:', error);
  }
}

// ============================================================
// ✅ HELPER : Envoi SMS + persistance + diagnostic
// ============================================================
async function trySendSMS(reparationId, statusIdOrDoc, userId) {
  try {
    const repWithClient = await Reparation.findById(reparationId).populate(
      'client',
      'nom phone phone2 email code codeFidelite'
    );

    if (!repWithClient) {
      console.log('🔴 trySendSMS: réparation introuvable', reparationId);
      return {
        statutEnvoi: 'echec',
        erreur: 'Réparation introuvable',
        skip: true,
      };
    }

    let statusDoc = null;
    if (statusIdOrDoc && typeof statusIdOrDoc === 'object' && statusIdOrDoc.label) {
      statusDoc = statusIdOrDoc;
    } else {
      const statusId = statusIdOrDoc || repWithClient.status;
      statusDoc = await Status.findById(statusId);
    }

    if (!statusDoc) {
      console.log('🔴 trySendSMS: statut introuvable', statusIdOrDoc);
      return {
        statutEnvoi: 'echec',
        erreur: 'Statut introuvable',
        skip: true,
      };
    }

    console.log('🟡 trySendSMS:', {
      numero: repWithClient.numero,
      statusLabel: statusDoc.label,
      clientPhone: repWithClient.client?.phone,
      phoneType: typeof repWithClient.client?.phone,
      hasApiKey: Boolean(process.env.TEXTBEE_API_KEY),
    });

    const smsInfo = await smsService.sendStatusSMS(
      repWithClient,
      statusDoc.label,
      userId
    );

    if (smsInfo && !smsInfo.skip) {
      repWithClient.smsEnvoyes = [
        ...(repWithClient.smsEnvoyes || []),
        smsInfo,
      ];
      await repWithClient.save();
    }

    return smsInfo;
  } catch (error) {
    logger.error('Erreur trySendSMS:', error);
    console.log('🔴 Erreur trySendSMS:', error.message);
    return {
      statutEnvoi: 'echec',
      erreur: error.message,
      skip: false,
    };
  }
}

// ============================================================
// GET - Liste des réparations avec filtres (MULTI-VALEURS)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      status,
      categorie,
      client,
      reparateur,
      createdBy,
      commercial,
      famille,
      dateDebut,
      dateFin,
      zone,
      limit = 50,
      page = 1,
      sort = '-createdAt',
    } = req.query;

    const query = { isDeleted: false };

    const statusClause = buildInClause(status);
    if (statusClause) query.status = statusClause;

    const clientClause = buildInClause(client);
    if (clientClause) query.client = clientClause;

    const reparateurClause = buildInClause(reparateur);
    if (reparateurClause) query.reparateur = reparateurClause;

    const createdByClause =
      buildInClause(createdBy) || buildInClause(commercial);
    if (createdByClause) query.createdBy = createdByClause;

    const familleIds = parseMultiValue(famille);
    const categorieIds = parseMultiValue(categorie);

    if (familleIds.length > 0) {
      const categoriesDeLaFamille = await Categorie.find({
        famille: { $in: familleIds },
      }).select('_id');

      const categorieIdsDeLaFamille = categoriesDeLaFamille.map((c) =>
        String(c._id)
      );

      if (categorieIds.length > 0) {
        const intersection = categorieIds.filter((id) =>
          categorieIdsDeLaFamille.includes(String(id))
        );

        if (intersection.length > 0) {
          query.categorie =
            intersection.length === 1 ? intersection[0] : { $in: intersection };
        } else {
          return res.json({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, pages: 0 },
          });
        }
      } else {
        if (categorieIdsDeLaFamille.length > 0) {
          query.categorie = { $in: categorieIdsDeLaFamille };
        } else {
          return res.json({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, pages: 0 },
          });
        }
      }
    } else if (categorieIds.length > 0) {
      query.categorie =
        categorieIds.length === 1 ? categorieIds[0] : { $in: categorieIds };
    }

    const zoneValues = parseMultiValue(zone);
    if (zoneValues.length > 0) {
      const zoneRegex = zoneValues.map((z) => ({
        zone: { $regex: `^${escapeRegex(z)}$`, $options: 'i' },
      }));

      const clientsWithZone = await Client.find({
        $or: zoneRegex,
      }).select('_id');

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
              success: true,
              data: [],
              pagination: { total: 0, page: 1, pages: 0 },
            });
          }
        } else if (query.client) {
          const belongs = clientIdsZone.some(
            (cid) => String(cid) === String(query.client)
          );
          if (!belongs) {
            return res.json({
              success: true,
              data: [],
              pagination: { total: 0, page: 1, pages: 0 },
            });
          }
        } else {
          query.client =
            clientIdsZone.length === 1
              ? clientIdsZone[0]
              : { $in: clientIdsZone };
        }
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pages: 0 },
        });
      }
    }

    if (search) {
      const [matchingClients, matchingMarques, matchingModeles] =
        await Promise.all([
          Client.find({
            $or: [
              { nom: { $regex: search, $options: 'i' } },
              { phone: { $regex: search, $options: 'i' } },
              { phone2: { $regex: search, $options: 'i' } },
              { code: { $regex: search, $options: 'i' } },
              { codeFidelite: { $regex: search, $options: 'i' } },
              { adresse: { $regex: search, $options: 'i' } },
              { zone: { $regex: search, $options: 'i' } },
            ],
          }).select('_id'),
          Marque.find({ nom: { $regex: search, $options: 'i' } }).select('_id'),
          Modele.find({ nom: { $regex: search, $options: 'i' } }).select('_id'),
        ]);

      const clientIds = matchingClients.map((c) => c._id);
      const marqueIds = matchingMarques.map((m) => m._id);
      const modeleIds = matchingModeles.map((m) => m._id);

      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { problemeDeclare: { $regex: search, $options: 'i' } },
        { panneType: { $regex: search, $options: 'i' } },
        { note: { $regex: search, $options: 'i' } },
        ...(clientIds.length > 0 ? [{ client: { $in: clientIds } }] : []),
        ...(marqueIds.length > 0 ? [{ marque: { $in: marqueIds } }] : []),
        ...(modeleIds.length > 0 ? [{ modele: { $in: modeleIds } }] : []),
      ];
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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reparations, total] = await Promise.all([
      Reparation.find(query)
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
        .populate(
          'diagnosticImprevus.imprevus.decisionPar',
          'username firstName lastName'
        )
        .populate(
          'diagnosticImprevus.decisionClient.enregistrePar',
          'username firstName lastName'
        )
        .populate('smsEnvoyes.envoyePar', 'username firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Reparation.countDocuments(query),
    ]);

    const reparationsWithReste = reparations.map((r) => ({
      ...r.toObject(),
      reste: r.prix - r.acompte,
      prixTotal: r.prixTotal,
      resteTotal: r.resteTotal,
      imprevusEnAttente: (r.diagnosticImprevus?.imprevus || []).filter(
        (i) => i.accepte === null || i.accepte === undefined
      ).length,
    }));

    res.json({
      success: true,
      data: reparationsWithReste,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Erreur getAll reparations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des réparations',
    });
  }
};

// ============================================================
// GET - Une réparation par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code codeFidelite adresse')
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
      .populate(
        'diagnosticImprevus.imprevus.decisionPar',
        'username firstName lastName'
      )
      .populate(
        'diagnosticImprevus.decisionClient.enregistrePar',
        'username firstName lastName'
      )
      .populate('smsEnvoyes.envoyePar', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée',
      });
    }

    res.json({
      success: true,
      data: {
        ...reparation.toObject(),
        reste: reparation.prix - reparation.acompte,
        prixTotal: reparation.prixTotal,
        resteTotal: reparation.resteTotal,
      },
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
      return res.status(400).json({
        success: false,
        message: 'Numéro de réparation requis',
      });
    }

    const reparation = await Reparation.findOne({ numero, isDeleted: false })
      .populate('client', 'nom phone phone2 codeFidelite adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('reparateur', 'firstName lastName');

    if (!reparation) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée',
      });
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
          ? {
              firstName: reparation.reparateur.firstName,
              lastName: reparation.reparateur.lastName,
            }
          : null,
        dateReception: reparation.dateReception || reparation.createdAt,
        datePrevisionnelle: reparation.datePrevisionnelle,
        dateFinReelle: reparation.dateFinReelle,
        dateLivraison: reparation.dateLivraison,
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
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération',
    });
  }
};

// ============================================================
// POST - Créer une réparation
// ============================================================
exports.create = async (req, res) => {
  try {
    const {
      client, categorie, objet, marque, modele,
      problemeDeclare, panneType, note, observation, observations,
      diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, reparateurSAV,  // ✅ AJOUT
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
        success: false,
        message: 'Au moins une panne est obligatoire',
      });
    }

    const cleanPanneTypes = panneType
      .filter((p) => p && typeof p === 'string' && p.trim() !== '')
      .map((p) => p.trim());

    if (cleanPanneTypes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Au moins une panne valide est obligatoire',
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
      reparateurSAV: reparateurSAV || null,  // ✅ AJOUT
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

    await reparation.save();

    await syncPannesWithCategories(cleanPanneTypes, categorie);

    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone phone2 email code codeFidelite adresse')
      .populate('status', 'label color')
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
      .populate('reparateurSAV', 'username firstName lastName')  // ✅ AJOUT
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate(
        'diagnosticImprevus.imprevus.decisionPar',
        'username firstName lastName'
      )
      .populate(
        'diagnosticImprevus.decisionClient.enregistrePar',
        'username firstName lastName'
      );

    logger.info(`Réparation créée: ${reparation.numero} par ${req.user.username}`);

    let smsInfo = null;
    if (req.body.envoyerSMS) {
      smsInfo = await trySendSMS(reparation._id, statusExists, req.user.id);
    }

    res.status(201).json({
      success: true,
      message: 'Réparation créée avec succès',
      sms: smsInfo,
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte,
        prixTotal: populated.prixTotal,
        resteTotal: populated.resteTotal,
      },
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
      client,
      categorie, objet, marque, modele,
      problemeDeclare, panneType, note, observation, observations,
      diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, reparateurSAV,  // ✅ AJOUT
      datePrevisionnelle, isReparable, isNotified,
      envoyerSMS = false,
    } = req.body;

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
          success: false,
          message: 'Le type de panne doit être un tableau',
        });
      }

      cleanPanneTypes = panneType
        .filter((p) => p && typeof p === 'string' && p.trim() !== '')
        .map((p) => p.trim());

      if (cleanPanneTypes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Au moins une panne est obligatoire',
        });
      }
    }

    if (status && status !== reparation.status.toString()) {
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
      reparateurSAV: reparation.reparateurSAV,  // ✅ AJOUT
      datePrevisionnelle: reparation.datePrevisionnelle,
      isReparable: reparation.isReparable,
      isNotified: reparation.isNotified,
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
    reparation.reparateurSAV = reparateurSAV !== undefined ? reparateurSAV : reparation.reparateurSAV;  // ✅ AJOUT
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

    const trackedFields = [
      'client',
      'prix', 'acompte', 'status', 'reparateur', 'reparateurSAV',  // ✅ AJOUT
      'problemeDeclare',
      'panneType', 'marque', 'modele', 'note', 'observations',
      'datePrevisionnelle',
      'categorie', 'objet', 'observation',
      'diagnostic', 'diagnosticImprevus', 'travauxEffectues', 'piecesUtilisees',
      'isReparable', 'isNotified',
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
      logger.info(`📝 ${newModifications.length} modification(s) enregistrée(s) pour ${reparation.numero}`);
    }

    await reparation.save();

    let smsInfo = null;
    if (envoyerSMS) {
      smsInfo = await trySendSMS(
        reparation._id,
        status || reparation.status,
        req.user.id
      );
    }

    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone phone2 email code codeFidelite adresse')
      .populate('status', 'label color')
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
      .populate('reparateurSAV', 'username firstName lastName')  // ✅ AJOUT
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate(
        'diagnosticImprevus.imprevus.decisionPar',
        'username firstName lastName'
      )
      .populate(
        'diagnosticImprevus.decisionClient.enregistrePar',
        'username firstName lastName'
      )
      .populate('smsEnvoyes.envoyePar', 'username firstName lastName');

    logger.info(`Réparation modifiée: ${reparation.numero} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Réparation modifiée avec succès',
      sms: smsInfo,
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte,
        prixTotal: populated.prixTotal,
        resteTotal: populated.resteTotal,
      },
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

    if (statusExists.isTerminal) {
      if (req.user.role !== 'ADMIN') {
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

    await reparation.save();

    let smsInfo = null;
    if (envoyerSMS) {
      smsInfo = await trySendSMS(reparation._id, statusExists, req.user.id);
    }

    const populated = await Reparation.findById(reparation._id)
      .populate('status', 'label color');

    logger.info(
      `Statut changé: ${reparation.numero} -> ${statusExists.label} par ${req.user.username}`
    );

    res.json({
      success: true,
      message: 'Statut changé avec succès',
      sms: smsInfo,
      data: populated,
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
      .populate('reparateur', 'username firstName lastName');

    logger.info(`Réparateur assigné: ${reparation.numero} par ${req.user.username}`);

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
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code codeFidelite adresse')
      .populate('status', 'label color')
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
      .populate('reparateurSAV', 'username firstName lastName');  // ✅ AJOUT

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
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code codeFidelite adresse')
      .populate('status', 'label color')
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
      .populate('reparateurSAV', 'username firstName lastName');  // ✅ AJOUT

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

    logger.info(
      `${result.modifiedCount} réparation(s) supprimée(s) par ${req.user.username}`
    );

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