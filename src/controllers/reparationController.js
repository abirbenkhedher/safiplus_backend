const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const Status = require('../models/Status');
const logger = require('../config/logger');
const pdfService = require('../services/pdfService');
const smsService = require('../services/smsService');

// ============================================================
// GET - Liste des réparations avec filtres
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const {
      search, status, client, reparateur, createdBy,
      dateDebut, dateFin, adresse, limit = 50, page = 1, sort = '-createdAt'
    } = req.query;

    const query = { isDeleted: false };

    if (status) query.status = status;
    if (client) query.client = client;
    if (reparateur) query.reparateur = reparateur;
    if (createdBy) query.createdBy = createdBy;

    // ✅ Filtre ADRESSE
    if (adresse && adresse.trim() !== '') {
      const clientsWithAdresse = await Client.find({
        adresse: { $regex: adresse, $options: 'i' },
      }).select('_id');

      const clientIds = clientsWithAdresse.map((c) => c._id);

      if (clientIds.length > 0) {
        query.client = { $in: clientIds };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pages: 0 },
        });
      }
    }

    // ✅ Recherche globale multi-champs
    if (search) {
      // Rechercher aussi dans Marque et Modele (par nom)
      const Marque = require('../models/Marque');
      const Modele = require('../models/Modele');

      const [matchingClients, matchingMarques, matchingModeles] = await Promise.all([
        Client.find({
          $or: [
            { nom: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { phone2: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } },
            { adresse: { $regex: search, $options: 'i' } },
          ],
        }).select('_id'),
        Marque.find({
          nom: { $regex: search, $options: 'i' },
        }).select('_id'),
        Modele.find({
          nom: { $regex: search, $options: 'i' },
        }).select('_id'),
      ]);

      const clientIds = matchingClients.map((c) => c._id);
      const marqueIds = matchingMarques.map((m) => m._id);
      const modeleIds = matchingModeles.map((m) => m._id);

      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { problemeDeclare: { $regex: search, $options: 'i' } },
        { panneType: { $regex: search, $options: 'i' } },
        { note: { $regex: search, $options: 'i' } },
        { accessoires: { $regex: search, $options: 'i' } },
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
        .populate('client', 'nom phone phone2 email code adresse')
        .populate('status', 'label color parDefault')
        .populate('categorie', 'nom')
        .populate('objet', 'nom')
        // ✅ Marque et Modèle populés
        .populate('marque', 'nom')
        .populate('modele', 'nom')
        .populate('createdBy', 'username firstName lastName')
        .populate('representant', 'username firstName lastName')
        .populate('reparateur', 'username firstName lastName')
        .populate('diagnosticImprevus.imprevus.decisionPar', 'username firstName lastName')
        .populate('diagnosticImprevus.decisionClient.enregistrePar', 'username firstName lastName')
        .populate('smsEnvoyes.envoyePar', 'username firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Reparation.countDocuments(query)
    ]);

    const reparationsWithReste = reparations.map(r => ({
      ...r.toObject(),
      reste: r.prix - r.acompte,
      prixTotal: r.prixTotal,
      resteTotal: r.resteTotal,
      imprevusEnAttente: (r.diagnosticImprevus?.imprevus || [])
        .filter(i => i.accepte === null || i.accepte === undefined).length,
    }));

    res.json({
      success: true,
      data: reparationsWithReste,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Erreur getAll reparations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des réparations'
    });
  }
};

// ============================================================
// GET - Une réparation par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code adresse')
      .populate('status', 'label color parDefault')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      // ✅ Marque et Modèle populés
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate('diagnosticImprevus.imprevus.decisionPar', 'username firstName lastName')
      .populate('diagnosticImprevus.decisionClient.enregistrePar', 'username firstName lastName')
      .populate('smsEnvoyes.envoyePar', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

    res.json({
      success: true,
      data: {
        ...reparation.toObject(),
        reste: reparation.prix - reparation.acompte,
        prixTotal: reparation.prixTotal,
        resteTotal: reparation.resteTotal,
      }
    });
  } catch (error) {
    logger.error('Erreur getOne reparation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la réparation'
    });
  }
};

// ============================================================
// GET - Route PUBLIQUE : Consulter une réparation par numéro (QR Code)
// ============================================================
exports.getPublicByNumero = async (req, res) => {
  try {
    const { numero } = req.params;

    if (!numero) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de réparation requis'
      });
    }

    const reparation = await Reparation.findOne({ numero, isDeleted: false })
      .populate('client', 'nom phone phone2 adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      // ✅ Marque et Modèle populés
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('reparateur', 'firstName lastName');

    if (!reparation) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

    const imprevusAcceptes = (reparation.diagnosticImprevus?.imprevus || [])
      .filter(i => i.accepte === true);

    const imprevusEnAttente = (reparation.diagnosticImprevus?.imprevus || [])
      .filter(i => i.accepte === null || i.accepte === undefined);

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
          adresse: reparation.client?.adresse,
        },
        objet: reparation.objet?.nom,
        categorie: reparation.categorie?.nom,
        // ✅ Extraction des noms depuis les objets populés
        marque: reparation.marque?.nom || null,
        modele: reparation.modele?.nom || null,
        panneType: reparation.panneType,
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
        imprevusAcceptes: imprevusAcceptes.map(i => ({
          description: i.description,
          prix: i.prixSupplementaire,
        })),
        imprevusEnAttente: imprevusEnAttente.length,
        isReparable: reparation.isReparable,
        createdAt: reparation.createdAt,
        updatedAt: reparation.updatedAt,
      }
    });
  } catch (error) {
    logger.error('Erreur getPublicByNumero:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération'
    });
  }
};

// ============================================================
// POST - Créer une réparation
// ============================================================
exports.create = async (req, res) => {
  try {
    const {
      client, categorie, objet, marque, modele, accessoires,
      problemeDeclare, panneType, note, observation, observations,
      diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, datePrevisionnelle, isReparable, isNotified
    } = req.body;

    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(400).json({ success: false, message: 'Client non trouvé' });
    }

    const statusExists = await Status.findById(status);
    if (!statusExists) {
      return res.status(400).json({ success: false, message: 'Statut non trouvé' });
    }

    if (!panneType || !panneType.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le type de panne est obligatoire'
      });
    }

    // ✅ Valider la marque si fournie
    if (marque) {
      const Marque = require('../models/Marque');
      const marqueExists = await Marque.findById(marque);
      if (!marqueExists) {
        return res.status(400).json({ success: false, message: 'Marque non trouvée' });
      }
    }

    // ✅ Valider le modèle si fourni
    if (modele) {
      const Modele = require('../models/Modele');
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

    const cleanObservations = (observations || []).filter(o => o.text && o.text.trim() !== '');

    const reparation = new Reparation({
      client, categorie, objet,
      marque: marque || null,      // ✅ ObjectId
      modele: modele || null,      // ✅ ObjectId
      accessoires,
      problemeDeclare, panneType, note, observation,
      observations: cleanObservations,
      diagnostic,
      diagnosticImprevus: {
        constat: diagnosticImprevusData?.constat || '',
        imprevus: (diagnosticImprevusData?.imprevus || []).filter(i => i.description?.trim()),
        decisionClient: {
          statut: diagnosticImprevusData?.decisionClient?.statut || 'en_attente',
          date: diagnosticImprevusData?.decisionClient?.date || null,
          note: diagnosticImprevusData?.decisionClient?.note || '',
          enregistrePar: diagnosticImprevusData?.decisionClient?.enregistrePar || null,
        }
      },
      travauxEffectues, piecesUtilisees,
      prix: finalPrix,
      acompte: finalAcompte,
      paymentType: finalPaymentType,
      status,
      createdBy: req.user.id,
      representant: representant || req.user.id,
      reparateur: reparateur || null,
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

    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone phone2 email code adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate('diagnosticImprevus.imprevus.decisionPar', 'username firstName lastName')
      .populate('diagnosticImprevus.decisionClient.enregistrePar', 'username firstName lastName');

    logger.info(`Réparation créée: ${reparation.numero} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Réparation créée avec succès',
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte,
        prixTotal: populated.prixTotal,
        resteTotal: populated.resteTotal,
      }
    });
  } catch (error) {
    logger.error('Erreur create reparation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création de la réparation'
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
      categorie, objet, marque, modele, accessoires,
      problemeDeclare, panneType, note, observation, observations,
      diagnostic, diagnosticImprevus: diagnosticImprevusData,
      travauxEffectues, piecesUtilisees, prix, acompte, paymentType, status,
      representant, reparateur, datePrevisionnelle, isReparable, isNotified,
      envoyerSMS = false
    } = req.body;

    if (panneType !== undefined && (!panneType || !panneType.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Le type de panne est obligatoire'
      });
    }

    if (status && status !== reparation.status.toString()) {
      const statusExists = await Status.findById(status);
      if (!statusExists) {
        return res.status(400).json({ success: false, message: 'Statut non trouvé' });
      }
    }

    // ✅ Valider la marque si fournie et changée
    if (marque !== undefined && marque !== null && marque !== '') {
      const currentMarqueId = reparation.marque ? reparation.marque.toString() : null;
      if (marque !== currentMarqueId) {
        const Marque = require('../models/Marque');
        const marqueExists = await Marque.findById(marque);
        if (!marqueExists) {
          return res.status(400).json({ success: false, message: 'Marque non trouvée' });
        }
      }
    }

    // ✅ Valider le modèle si fourni et changé
    if (modele !== undefined && modele !== null && modele !== '') {
      const currentModeleId = reparation.modele ? reparation.modele.toString() : null;
      if (modele !== currentModeleId) {
        const Modele = require('../models/Modele');
        const modeleExists = await Modele.findById(modele);
        if (!modeleExists) {
          return res.status(400).json({ success: false, message: 'Modèle non trouvé' });
        }
      }
    }

    const oldValues = {
      categorie: reparation.categorie,
      objet: reparation.objet,
      marque: reparation.marque,
      modele: reparation.modele,
      accessoires: reparation.accessoires,
      problemeDeclare: reparation.problemeDeclare,
      panneType: reparation.panneType,
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
      datePrevisionnelle: reparation.datePrevisionnelle,
      isReparable: reparation.isReparable,
      isNotified: reparation.isNotified,
    };

    reparation.categorie = categorie || reparation.categorie;
    reparation.objet = objet || reparation.objet;
    // ✅ Marque et Modèle : ObjectId ou null
    reparation.marque = marque !== undefined ? (marque || null) : reparation.marque;
    reparation.modele = modele !== undefined ? (modele || null) : reparation.modele;
    reparation.accessoires = accessoires !== undefined ? accessoires : reparation.accessoires;
    reparation.problemeDeclare = problemeDeclare !== undefined ? problemeDeclare : reparation.problemeDeclare;
    reparation.panneType = panneType !== undefined ? panneType : reparation.panneType;
    reparation.note = note !== undefined ? note : reparation.note;
    reparation.observation = observation !== undefined ? observation : reparation.observation;

    if (observations !== undefined) {
      reparation.observations = observations.filter(o => o.text && o.text.trim() !== '');
    }

    reparation.diagnostic = diagnostic !== undefined ? diagnostic : reparation.diagnostic;
    reparation.travauxEffectues = travauxEffectues !== undefined ? travauxEffectues : reparation.travauxEffectues;
    reparation.piecesUtilisees = piecesUtilisees !== undefined ? piecesUtilisees : reparation.piecesUtilisees;
    reparation.prix = prix !== undefined ? prix : reparation.prix;
    reparation.acompte = acompte !== undefined ? acompte : reparation.acompte;
    reparation.status = status || reparation.status;
    reparation.representant = representant || reparation.representant;
    reparation.reparateur = reparateur !== undefined ? reparateur : reparation.reparateur;
    reparation.datePrevisionnelle = datePrevisionnelle !== undefined ? datePrevisionnelle : reparation.datePrevisionnelle;
    reparation.isReparable = isReparable !== undefined ? isReparable : reparation.isReparable;
    reparation.isNotified = isNotified !== undefined ? isNotified : reparation.isNotified;

    if (diagnosticImprevusData !== undefined) {
      const oldDiag = reparation.diagnosticImprevus || {};
      const newImprevus = (diagnosticImprevusData.imprevus || []).filter(i => i.description?.trim());

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
        }
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
      'prix', 'acompte', 'status', 'reparateur', 'problemeDeclare',
      'panneType', 'marque', 'modele', 'note', 'observations',
      'accessoires', 'datePrevisionnelle',
      'categorie', 'objet', 'observation',
      'diagnostic', 'diagnosticImprevus', 'travauxEffectues', 'piecesUtilisees',
      'isReparable', 'isNotified',
    ];

    const newModifications = [];

    trackedFields.forEach(field => {
      if (req.body[field] === undefined) return;

      const oldVal = oldValues[field];
      const newVal = reparation[field];

      let changed = false;

      if (field === 'observations') {
        const oldStr = JSON.stringify((oldVal || []).map(o => ({ text: o.text || '' })));
        const newStr = JSON.stringify((newVal || []).map(o => ({ text: o.text || '' })));
        changed = oldStr !== newStr;
      } else if (field === 'diagnosticImprevus') {
        const oldStr = JSON.stringify({
          constat: oldVal?.constat || '',
          imprevus: (oldVal?.imprevus || []).map(i => ({
            description: i.description || '',
            prixSupplementaire: i.prixSupplementaire || 0,
            accepte: i.accepte,
          })),
          decisionClient: {
            statut: oldVal?.decisionClient?.statut || 'en_attente',
            note: oldVal?.decisionClient?.note || '',
          }
        });
        const newStr = JSON.stringify({
          constat: newVal?.constat || '',
          imprevus: (newVal?.imprevus || []).map(i => ({
            description: i.description || '',
            prixSupplementaire: i.prixSupplementaire || 0,
            accepte: i.accepte,
          })),
          decisionClient: {
            statut: newVal?.decisionClient?.statut || 'en_attente',
            note: newVal?.decisionClient?.note || '',
          }
        });
        changed = oldStr !== newStr;
      } else if (typeof oldVal === 'boolean' || typeof newVal === 'boolean') {
        changed = Boolean(oldVal) !== Boolean(newVal);
      } else {
        // Pour les ObjectId (marque, modele), comparer avec toString()
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

    if (envoyerSMS && status && status !== oldValues.status?.toString()) {
      const newStatusDoc = await Status.findById(status);
      if (newStatusDoc) {
        const repWithClient = await Reparation.findById(reparation._id)
          .populate('client', 'nom phone phone2 email code');

        const smsResult = await smsService.sendStatusSMS(
          repWithClient,
          newStatusDoc.label,
          req.user.id
        );

        if (smsResult) {
          repWithClient.smsEnvoyes = [
            ...(repWithClient.smsEnvoyes || []),
            smsResult,
          ];
          await repWithClient.save();
        }
      }
    }

    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone phone2 email code adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate('diagnosticImprevus.imprevus.decisionPar', 'username firstName lastName')
      .populate('diagnosticImprevus.decisionClient.enregistrePar', 'username firstName lastName')
      .populate('smsEnvoyes.envoyePar', 'username firstName lastName');

    logger.info(`Réparation modifiée: ${reparation.numero} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Réparation modifiée avec succès',
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte,
        prixTotal: populated.prixTotal,
        resteTotal: populated.resteTotal,
      }
    });
  } catch (error) {
    logger.error('Erreur update reparation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la modification de la réparation'
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
      .populate('client', 'nom phone phone2 email code');

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
          message: 'Seul un administrateur peut changer un statut terminal'
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

    if (envoyerSMS) {
      const smsResult = await smsService.sendStatusSMS(
        reparation,
        statusExists.label,
        req.user.id
      );

      if (smsResult) {
        reparation.smsEnvoyes = [
          ...(reparation.smsEnvoyes || []),
          smsResult,
        ];
        await reparation.save();
      }
    }

    const populated = await Reparation.findById(reparation._id)
      .populate('status', 'label color');

    logger.info(`Statut changé: ${reparation.numero} -> ${statusExists.label} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Statut changé avec succès',
      data: populated
    });
  } catch (error) {
    logger.error('Erreur changeStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de statut'
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
      data: populated
    });
  } catch (error) {
    logger.error('Erreur assignReparateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation du réparateur'
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
      message: 'Réparation supprimée avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete reparation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la réparation'
    });
  }
};

// ============================================================
// GET - Générer le PDF du reçu
// ============================================================
exports.generatePDF = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone phone2 email code adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const options = {
      boutiqueName: process.env.BOUTIQUE_NAME || 'ATELIER PRO',
      boutiqueAddress: process.env.BOUTIQUE_ADDRESS || 'Adresse',
      boutiquePhone: process.env.BOUTIQUE_PHONE || 'Tél',
      boutiqueEmail: process.env.BOUTIQUE_EMAIL || '',
      footerMessage: process.env.TICKET_FOOTER || 'Merci de votre confiance!'
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
      .populate('client', 'nom phone phone2 email code adresse')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réparation non trouvée' });
    }

    const options = {
      boutiqueName: process.env.BOUTIQUE_NAME || 'ATELIER PRO',
      boutiqueAddress: process.env.BOUTIQUE_ADDRESS || 'Adresse',
      boutiquePhone: process.env.BOUTIQUE_PHONE || 'Tél',
      boutiqueEmail: process.env.BOUTIQUE_EMAIL || '',
      footerMessage: process.env.TICKET_FOOTER || 'Merci de votre confiance!'
    };

    const html = await pdfService.generateTicketHTML(reparation, options);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Erreur getTicketHTML:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la génération du ticket' });
  }
};