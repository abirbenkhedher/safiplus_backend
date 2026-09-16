const Categorie = require('../models/Categorie');
const Famille = require('../models/Famille');
const logger = require('../config/logger');

// GET - Liste des catégories avec filtre famille
exports.getAll = async (req, res) => {
  try {
    const { famille } = req.query;
    const filter = {};
    
    if (famille) {
      filter.famille = famille;
    }

    const categories = await Categorie.find(filter)
      .populate('famille', 'nom')
      .sort({ nom: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Erreur getAll catégories:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des catégories'
    });
  }
};

// GET - Une catégorie par ID
exports.getOne = async (req, res) => {
  try {
    const categorie = await Categorie.findById(req.params.id).populate('famille', 'nom');
    if (!categorie) {
      return res.status(404).json({
        success: false,
        message: 'Catégorie non trouvée'
      });
    }
    res.json({
      success: true,
      data: categorie
    });
  } catch (error) {
    logger.error('Erreur getOne catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la catégorie'
    });
  }
};

// POST - Créer une catégorie
exports.create = async (req, res) => {
  try {
    const { nom, famille } = req.body;

    // Vérifier que la famille existe
    const familleExists = await Famille.findById(famille);
    if (!familleExists) {
      return res.status(400).json({
        success: false,
        message: 'La famille spécifiée n\'existe pas'
      });
    }

    // Vérifier si la catégorie existe déjà dans cette famille
    const existing = await Categorie.findOne({ 
      nom: { $regex: new RegExp(`^${nom}$`, 'i') },
      famille
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette catégorie existe déjà dans cette famille'
      });
    }

    const categorie = new Categorie({ nom, famille });
    await categorie.save();

    const populated = await Categorie.findById(categorie._id).populate('famille', 'nom');

    logger.info(`Catégorie créée: ${nom} dans famille ${familleExists.nom} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Catégorie créée avec succès',
      data: populated
    });
  } catch (error) {
    logger.error('Erreur create catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la catégorie'
    });
  }
};

// PUT - Modifier une catégorie
exports.update = async (req, res) => {
  try {
    const { nom, famille } = req.body;
    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      return res.status(404).json({
        success: false,
        message: 'Catégorie non trouvée'
      });
    }

    // Vérifier la nouvelle famille si elle change
    if (famille && famille !== categorie.famille.toString()) {
      const familleExists = await Famille.findById(famille);
      if (!familleExists) {
        return res.status(400).json({
          success: false,
          message: 'La famille spécifiée n\'existe pas'
        });
      }
    }

    // Vérifier les doublons
    const checkFamille = famille || categorie.famille;
    const checkNom = nom || categorie.nom;

    if (checkNom !== categorie.nom || checkFamille !== categorie.famille.toString()) {
      const existing = await Categorie.findOne({ 
        nom: { $regex: new RegExp(`^${checkNom}$`, 'i') },
        famille: checkFamille,
        _id: { $ne: categorie._id }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Cette catégorie existe déjà dans cette famille'
        });
      }
    }

    categorie.nom = nom || categorie.nom;
    categorie.famille = famille || categorie.famille;
    await categorie.save();

    const populated = await Categorie.findById(categorie._id).populate('famille', 'nom');

    logger.info(`Catégorie modifiée: ${categorie.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Catégorie modifiée avec succès',
      data: populated
    });
  } catch (error) {
    logger.error('Erreur update catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de la catégorie'
    });
  }
};

// DELETE - Supprimer une catégorie
exports.delete = async (req, res) => {
  try {
    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      return res.status(404).json({
        success: false,
        message: 'Catégorie non trouvée'
      });
    }

    // Vérifier si des réparations utilisent cette catégorie
    const Reparation = require('../models/Reparation');
    const reparationsCount = await Reparation.countDocuments({ categorie: categorie._id });
    
    if (reparationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cette catégorie car elle est utilisée par ${reparationsCount} réparation(s)`
      });
    }

    await categorie.deleteOne();

    logger.info(`Catégorie supprimée: ${categorie.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Catégorie supprimée avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la catégorie'
    });
  }
};