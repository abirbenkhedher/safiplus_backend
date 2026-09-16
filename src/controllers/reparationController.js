const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const Status = require('../models/Status');
const logger = require('../config/logger');
const pdfService = require('../services/pdfService');

// ============================================================
// GET - Liste des réparations avec filtres
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      status,
      client,
      reparateur,
      createdBy,
      dateDebut,
      dateFin,
      limit = 50,
      page = 1,
      sort = '-createdAt'
    } = req.query;

    const query = { isDeleted: false };

    if (status) query.status = status;
    if (client) query.client = client;
    if (reparateur) query.reparateur = reparateur;
    if (createdBy) query.createdBy = createdBy;

    if (search) {
      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { marque: { $regex: search, $options: 'i' } },
        { modele: { $regex: search, $options: 'i' } },
        { problemeDeclare: { $regex: search, $options: 'i' } },
        { panneType: { $regex: search, $options: 'i' } }
      ];
    }

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) query.createdAt.$lte = new Date(dateFin);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reparations, total] = await Promise.all([
      Reparation.find(query)
        .populate('client', 'nom phone email code')
        .populate('status', 'label color parDefault')
        .populate('categorie', 'nom')
        .populate('objet', 'nom')
        .populate('createdBy', 'username firstName lastName')
        .populate('representant', 'username firstName lastName')
        .populate('reparateur', 'username firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Reparation.countDocuments(query)
    ]);

    const reparationsWithReste = reparations.map(r => ({
      ...r.toObject(),
      reste: r.prix - r.acompte
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
      .populate('client', 'nom phone email code adresse')
      .populate('status', 'label color parDefault')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName')
      .populate('modifications.oldValue')
      .populate('modifications.newValue');

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
// POST - Créer une réparation
// ============================================================
exports.create = async (req, res) => {
  try {
      const {
      client,
      categorie,
      objet,
      marque,
      modele,
      numeroSerie,
      accessoires,
      problemeDeclare,
      panneType,
      note,
      observation,
      observations,
      diagnostic,
      travauxEffectues,
      piecesUtilisees,
      prix,
      acompte,
      paymentType,
      status,
      representant,
      reparateur,
      datePrevisionnelle,
      isReparable,
      isNotified
    } = req.body;

    // Vérifier le client
    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(400).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // Vérifier le statut
    const statusExists = await Status.findById(status);
    if (!statusExists) {
      return res.status(400).json({
        success: false,
        message: 'Statut non trouvé'
      });
    }

    // ✅ VÉRIFIER LE TYPE DE PANNE (OBLIGATOIRE)
    if (!panneType || !panneType.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le type de panne est obligatoire'
      });
    }

    // ✅ Calcul auto du paymentType
    const finalPrix = prix || 0;
    const finalAcompte = acompte || 0;
    let finalPaymentType = paymentType || 'unpaid';
    
    if (finalAcompte >= finalPrix && finalPrix > 0) finalPaymentType = 'paid';
    else if (finalAcompte > 0 && finalAcompte < finalPrix) finalPaymentType = 'partial';
    else finalPaymentType = 'unpaid';

    // ✅ Nettoyer les observations vides
    const cleanObservations = (observations || []).filter(o => o.text && o.text.trim() !== '');

    // ✅ Nettoyer les imprévus
    const cleanUnexpectedIssues = (unexpectedIssues || []).filter(
      i => i.description && i.description.trim() !== ''
    );

    // ✅ Créer la réparation
    const reparation = new Reparation({
      client,
      categorie,
      objet,
      marque,
      modele,
      numeroSerie,
      accessoires,
      problemeDeclare,
      panneType,
      note,
      observation,
      observations: cleanObservations,
      diagnostic,
      travauxEffectues,
      piecesUtilisees,
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
      // ✅ Historique initial
      modifications: [{
        field: '_create',
        oldValue: null,
        newValue: 'Réparation créée',
        modifiedBy: req.user.id,
        modifiedAt: new Date(),
      }],
    });

    await reparation.save();

    // Récupérer avec populations
    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone email code')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName');

    logger.info(`Réparation créée: ${reparation.numero} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Réparation créée avec succès',
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte
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
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

        const {
      categorie,
      objet,
      marque,
      modele,
      numeroSerie,
      accessoires,
      problemeDeclare,
      panneType,
      note,
      observation,
      observations,
      diagnostic,
      travauxEffectues,
      piecesUtilisees,
      prix,
      acompte,
      paymentType,
      status,
      representant,
      reparateur,
      datePrevisionnelle,
      isReparable,
      isNotified
    } = req.body;

    // ✅ VÉRIFIER LE TYPE DE PANNE (si modifié)
    if (panneType !== undefined && (!panneType || !panneType.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Le type de panne est obligatoire'
      });
    }

    // ✅ Vérifier le statut si modifié
    if (status && status !== reparation.status.toString()) {
      const statusExists = await Status.findById(status);
      if (!statusExists) {
        return res.status(400).json({
          success: false,
          message: 'Statut non trouvé'
        });
      }
    }

    // ✅ SNAPSHOT AVANT MODIFICATION
    const oldValues = {
      categorie: reparation.categorie,
      objet: reparation.objet,
      marque: reparation.marque,
      modele: reparation.modele,
      numeroSerie: reparation.numeroSerie,
      accessoires: reparation.accessoires,
      problemeDeclare: reparation.problemeDeclare,
      panneType: reparation.panneType,
      note: reparation.note,
      observation: reparation.observation,
      observations: reparation.observations,
      diagnostic: reparation.diagnostic,
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

    // ✅ Mettre à jour les champs
    reparation.categorie = categorie || reparation.categorie;
    reparation.objet = objet || reparation.objet;
    reparation.marque = marque || reparation.marque;
    reparation.modele = modele !== undefined ? modele : reparation.modele;
    reparation.numeroSerie = numeroSerie !== undefined ? numeroSerie : reparation.numeroSerie;
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


    // ✅ Recalculer le paymentType
    const finalPrix = reparation.prix || 0;
    const finalAcompte = reparation.acompte || 0;
    if (finalAcompte >= finalPrix && finalPrix > 0) reparation.paymentType = 'paid';
    else if (finalAcompte > 0 && finalAcompte < finalPrix) reparation.paymentType = 'partial';
    else reparation.paymentType = 'unpaid';

    // ✅ Date de livraison si statut = Livré
    if (status) {
      const newStatusDoc = await Status.findById(status);
      if (newStatusDoc && newStatusDoc.label === 'Livré') {
        reparation.dateLivraison = new Date();
      }
    }

    // ============================================================
    // ✅ TRAÇABILITÉ : Enregistrer les modifications
    // ============================================================
    const trackedFields = [
      'prix', 'acompte', 'status', 'reparateur', 'problemeDeclare',
      'panneType', 'marque', 'modele', 'note', 'observations',
      'numeroSerie', 'accessoires', 'datePrevisionnelle',
      'categorie', 'objet', 'observation',
      'diagnostic', 'travauxEffectues', 'piecesUtilisees',
      'isReparable', 'isNotified',
    ];

    const newModifications = [];

    trackedFields.forEach(field => {
      if (req.body[field] === undefined) return;

      const oldVal = oldValues[field];
      const newVal = reparation[field];

      let changed = false;

      if (field === 'observations') {
        const oldStr = JSON.stringify(
          (oldVal || []).map(o => ({ text: o.text || '' }))
        );
        const newStr = JSON.stringify(
          (newVal || []).map(o => ({ text: o.text || '' }))
        );
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

    // ✅ Imprévus (comparer les tableaux)
    if (unexpectedIssues !== undefined) {
      const oldIssuesStr = JSON.stringify(
        (oldValues.unexpectedIssues || []).map(i => ({
          description: i.description || '',
          additionalPrice: i.additionalPrice || 0,
        }))
      );
      const newIssuesStr = JSON.stringify(
        (reparation.unexpectedIssues || []).map(i => ({
          description: i.description || '',
          additionalPrice: i.additionalPrice || 0,
        }))
      );

      if (oldIssuesStr !== newIssuesStr) {
        newModifications.push({
          field: 'unexpectedIssues',
          oldValue: oldValues.unexpectedIssues,
          newValue: reparation.unexpectedIssues,
          modifiedBy: req.user.id,
          modifiedAt: new Date(),
        });
      }
    }

    if (newModifications.length > 0) {
      reparation.modifications = [
        ...(reparation.modifications || []),
        ...newModifications,
      ];
      logger.info(`📝 ${newModifications.length} modification(s) enregistrée(s) pour ${reparation.numero}`);
    }

    await reparation.save();

    const populated = await Reparation.findById(reparation._id)
      .populate('client', 'nom phone email code')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .populate('modifications.modifiedBy', 'username firstName lastName');

    logger.info(`Réparation modifiée: ${reparation.numero} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Réparation modifiée avec succès',
      data: {
        ...populated.toObject(),
        reste: populated.prix - populated.acompte
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
    const { status, comment } = req.body;
    const reparation = await Reparation.findById(req.params.id);

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

    const statusExists = await Status.findById(status);
    if (!statusExists) {
      return res.status(400).json({
        success: false,
        message: 'Statut non trouvé'
      });
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

    // ✅ Enregistrer dans modifications
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
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

    const oldReparateur = reparation.reparateur;
    reparation.reparateur = reparateur;

    // ✅ Enregistrer dans modifications
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
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
    }

    reparation.isDeleted = true;

    // ✅ Enregistrer dans modifications
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
      .populate('client', 'nom phone email code')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
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
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du PDF'
    });
  }
};

// ============================================================
// GET - Obtenir le HTML pour impression navigateur
// ============================================================
exports.getTicketHTML = async (req, res) => {
  try {
    const reparation = await Reparation.findById(req.params.id)
      .populate('client', 'nom phone email code')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('representant', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName');

    if (!reparation || reparation.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Réparation non trouvée'
      });
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
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du ticket'
    });
  }
};