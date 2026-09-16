const Famille = require('../models/Famille');
const logger = require('../config/logger');

// GET - Liste des familles
exports.getAll = async (req, res) => {
  try {
    const familles = await Famille.find().sort({ nom: 1 });
    res.json({
      success: true,
      data: familles
    });
  } catch (error) {
    logger.error('Erreur getAll familles:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des familles'
    });
  }
};

// GET - Une famille par ID
exports.getOne = async (req, res) => {
  try {
    const famille = await Famille.findById(req.params.id);
    if (!famille) {
      return res.status(404).json({
        success: false,
        message: 'Famille non trouvée'
      });
    }
    res.json({
      success: true,
      data: famille
    });
  } catch (error) {
    logger.error('Erreur getOne famille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la famille'
    });
  }
};

// POST - Créer une famille
exports.create = async (req, res) => {
  try {
    const { nom } = req.body;
    
    // Vérifier si la famille existe déjà
    const existing = await Famille.findOne({ nom: { $regex: new RegExp(`^${nom}$`, 'i') } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette famille existe déjà'
      });
    }

    const famille = new Famille({ nom });
    await famille.save();

    logger.info(`Famille créée: ${famille.nom} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Famille créée avec succès',
      data: famille
    });
  } catch (error) {
    logger.error('Erreur create famille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la famille'
    });
  }
};

// PUT - Modifier une famille
exports.update = async (req, res) => {
  try {
    const { nom } = req.body;
    const famille = await Famille.findById(req.params.id);

    if (!famille) {
      return res.status(404).json({
        success: false,
        message: 'Famille non trouvée'
      });
    }

    // Vérifier si le nouveau nom existe déjà (sauf pour la même famille)
    if (nom && nom !== famille.nom) {
      const existing = await Famille.findOne({ 
        nom: { $regex: new RegExp(`^${nom}$`, 'i') },
        _id: { $ne: famille._id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Cette famille existe déjà'
        });
      }
    }

    famille.nom = nom || famille.nom;
    await famille.save();

    logger.info(`Famille modifiée: ${famille.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Famille modifiée avec succès',
      data: famille
    });
  } catch (error) {
    logger.error('Erreur update famille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de la famille'
    });
  }
};

// DELETE - Supprimer une famille
exports.delete = async (req, res) => {
  try {
    const famille = await Famille.findById(req.params.id);

    if (!famille) {
      return res.status(404).json({
        success: false,
        message: 'Famille non trouvée'
      });
    }

    // Vérifier si des catégories sont liées à cette famille
    const Categorie = require('../models/Categorie');
    const categoriesCount = await Categorie.countDocuments({ famille: famille._id });
    
    if (categoriesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cette famille car elle est utilisée par ${categoriesCount} catégorie(s)`
      });
    }

    await famille.deleteOne();

    logger.info(`Famille supprimée: ${famille.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Famille supprimée avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete famille:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la famille'
    });
  }
};