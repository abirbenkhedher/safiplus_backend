const Objet = require('../models/Objet');
const logger = require('../config/logger');

// GET - Liste des objets
exports.getAll = async (req, res) => {
  try {
    const objets = await Objet.find().sort({ nom: 1 });
    res.json({
      success: true,
      data: objets
    });
  } catch (error) {
    logger.error('Erreur getAll objets:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des objets'
    });
  }
};

// GET - Un objet par ID
exports.getOne = async (req, res) => {
  try {
    const objet = await Objet.findById(req.params.id);
    if (!objet) {
      return res.status(404).json({
        success: false,
        message: 'Objet non trouvé'
      });
    }
    res.json({
      success: true,
      data: objet
    });
  } catch (error) {
    logger.error('Erreur getOne objet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'objet'
    });
  }
};

// POST - Créer un objet
exports.create = async (req, res) => {
  try {
    const { nom } = req.body;

    const existing = await Objet.findOne({ 
      nom: { $regex: new RegExp(`^${nom}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cet objet existe déjà'
      });
    }

    const objet = new Objet({ nom });
    await objet.save();

    logger.info(`Objet créé: ${objet.nom} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Objet créé avec succès',
      data: objet
    });
  } catch (error) {
    logger.error('Erreur create objet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'objet'
    });
  }
};

// PUT - Modifier un objet
exports.update = async (req, res) => {
  try {
    const { nom } = req.body;
    const objet = await Objet.findById(req.params.id);

    if (!objet) {
      return res.status(404).json({
        success: false,
        message: 'Objet non trouvé'
      });
    }

    if (nom && nom !== objet.nom) {
      const existing = await Objet.findOne({ 
        nom: { $regex: new RegExp(`^${nom}$`, 'i') },
        _id: { $ne: objet._id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Cet objet existe déjà'
        });
      }
    }

    objet.nom = nom || objet.nom;
    await objet.save();

    logger.info(`Objet modifié: ${objet.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Objet modifié avec succès',
      data: objet
    });
  } catch (error) {
    logger.error('Erreur update objet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de l\'objet'
    });
  }
};

// DELETE - Supprimer un objet
exports.delete = async (req, res) => {
  try {
    const objet = await Objet.findById(req.params.id);

    if (!objet) {
      return res.status(404).json({
        success: false,
        message: 'Objet non trouvé'
      });
    }

    // Vérifier si des réparations utilisent cet objet
    const Reparation = require('../models/Reparation');
    const reparationsCount = await Reparation.countDocuments({ objet: objet._id });
    
    if (reparationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cet objet car il est utilisé par ${reparationsCount} réparation(s)`
      });
    }

    await objet.deleteOne();

    logger.info(`Objet supprimé: ${objet.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Objet supprimé avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete objet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de l\'objet'
    });
  }
};