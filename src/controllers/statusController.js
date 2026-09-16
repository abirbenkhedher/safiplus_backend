const Status = require('../models/Status');
const logger = require('../config/logger');

// GET - Liste des statuts
exports.getAll = async (req, res) => {
  try {
    const statuses = await Status.find().sort({ order: 1 });
    res.json({
      success: true,
      data: statuses
    });
  } catch (error) {
    logger.error('Erreur getAll statuses:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statuts'
    });
  }
};

// GET - Un statut par ID
exports.getOne = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Statut non trouvé'
      });
    }
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Erreur getOne status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du statut'
    });
  }
};

// POST - Créer un statut
exports.create = async (req, res) => {
  try {
    const { label, parDefault, order, color, isTerminal, isEditableByReparateur } = req.body;

    const existing = await Status.findOne({ 
      label: { $regex: new RegExp(`^${label}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ce statut existe déjà'
      });
    }

    const status = new Status({
      label,
      parDefault: parDefault || false,
      order: order || 0,
      color: color || '#6c757d',
      isTerminal: isTerminal || false,
      isEditableByReparateur: isEditableByReparateur !== undefined ? isEditableByReparateur : true
    });

    await status.save();

    logger.info(`Statut créé: ${status.label} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Statut créé avec succès',
      data: status
    });
  } catch (error) {
    logger.error('Erreur create status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du statut'
    });
  }
};

// PUT - Modifier un statut
exports.update = async (req, res) => {
  try {
    const { label, parDefault, order, color, isTerminal, isEditableByReparateur } = req.body;
    const status = await Status.findById(req.params.id);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Statut non trouvé'
      });
    }

    if (label && label !== status.label) {
      const existing = await Status.findOne({ 
        label: { $regex: new RegExp(`^${label}$`, 'i') },
        _id: { $ne: status._id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Ce statut existe déjà'
        });
      }
    }

    status.label = label || status.label;
    status.order = order !== undefined ? order : status.order;
    status.color = color || status.color;
    status.isTerminal = isTerminal !== undefined ? isTerminal : status.isTerminal;
    status.isEditableByReparateur = isEditableByReparateur !== undefined ? isEditableByReparateur : status.isEditableByReparateur;

    // Gérer le statut par défaut
    if (parDefault) {
      await Status.updateMany(
        { _id: { $ne: status._id }, parDefault: true },
        { parDefault: false }
      );
      status.parDefault = true;
    } else {
      // Si on désactive le statut par défaut, vérifier qu'il y en a au moins un
      const defaultCount = await Status.countDocuments({ parDefault: true, _id: { $ne: status._id } });
      if (defaultCount === 0 && !parDefault) {
        return res.status(400).json({
          success: false,
          message: 'Il doit y avoir au moins un statut par défaut'
        });
      }
      status.parDefault = false;
    }

    await status.save();

    logger.info(`Statut modifié: ${status.label} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Statut modifié avec succès',
      data: status
    });
  } catch (error) {
    logger.error('Erreur update status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification du statut'
    });
  }
};

// DELETE - Supprimer un statut
exports.delete = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Statut non trouvé'
      });
    }

    // Vérifier si des réparations utilisent ce statut
    const Reparation = require('../models/Reparation');
    const reparationsCount = await Reparation.countDocuments({ status: status._id });
    
    if (reparationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer ce statut car il est utilisé par ${reparationsCount} réparation(s)`
      });
    }

    // Vérifier qu'il y a au moins un autre statut
    const count = await Status.countDocuments({ _id: { $ne: status._id } });
    if (count === 0) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer le dernier statut'
      });
    }

    await status.deleteOne();

    logger.info(`Statut supprimé: ${status.label} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Statut supprimé avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du statut'
    });
  }
};

// PATCH - Définir un statut par défaut
exports.setDefault = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);

    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Statut non trouvé'
      });
    }

    await Status.updateMany(
      { _id: { $ne: status._id }, parDefault: true },
      { parDefault: false }
    );

    status.parDefault = true;
    await status.save();

    logger.info(`Statut par défaut défini: ${status.label} par ${req.user.username}`);

    res.json({
      success: true,
      message: `"${status.label}" est maintenant le statut par défaut`,
      data: status
    });
  } catch (error) {
    logger.error('Erreur setDefault status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la définition du statut par défaut'
    });
  }
};