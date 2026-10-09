const Categorie = require('../models/Categorie');
const Famille = require('../models/Famille');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des catégories avec filtre famille
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { famille } = req.query;
    const filter = {};

    if (famille) {
      filter.famille = famille;
    }

    // ✅ Tri par ordre croissant, puis par nom
    const categories = await Categorie.find(filter)
      .populate('famille', 'nom')
      .populate('reparateurs', 'firstName lastName username role')   // ✅ AJOUT
      .sort({ ordre: 1, nom: 1 });

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

// ============================================================
// GET - Une catégorie par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const categorie = await Categorie.findById(req.params.id)
      .populate('famille', 'nom')
      .populate('reparateurs', 'firstName lastName username role');   // ✅ AJOUT

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

// ============================================================
// POST - Créer une catégorie
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, famille, ordre, reparateurs } = req.body;   // ✅ AJOUT reparateurs

    // ✅ Validation du nom
    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire'
      });
    }

    // ✅ Validation de la famille
    if (!famille) {
      return res.status(400).json({
        success: false,
        message: 'La famille est obligatoire'
      });
    }

    // Vérifier que la famille existe
    const familleExists = await Famille.findById(famille);
    if (!familleExists) {
      return res.status(400).json({
        success: false,
        message: 'La famille spécifiée n\'existe pas'
      });
    }

    const trimmedNom = nom.trim();
    const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Vérifier si la catégorie existe déjà dans cette famille
    const existing = await Categorie.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
      famille
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette catégorie existe déjà dans cette famille'
      });
    }

    // ✅ Validation de l'ordre
    let finalOrdre = 0;
    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif'
        });
      }
      finalOrdre = numOrdre;
    }

    // ✅ Validation des réparateurs (tableau d'ObjectId)
    const cleanReparateurs = Array.isArray(reparateurs)
      ? reparateurs.filter((id) => id)   // retire null/undefined
      : [];

    const categorie = new Categorie({
      nom: trimmedNom,
      famille,
      ordre: finalOrdre,
      reparateurs: cleanReparateurs,   // ✅ AJOUT
    });

    await categorie.save();

    const populated = await Categorie.findById(categorie._id)
      .populate('famille', 'nom')
      .populate('reparateurs', 'firstName lastName username role');   // ✅ AJOUT

    logger.info(`Catégorie créée: ${trimmedNom} (ordre: ${finalOrdre}, ${cleanReparateurs.length} réparateur(s)) dans famille ${familleExists.nom} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Catégorie créée avec succès',
      data: populated
    });
  } catch (error) {
    logger.error('Erreur create catégorie:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette catégorie existe déjà dans cette famille'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la catégorie'
    });
  }
};

// ============================================================
// PUT - Modifier une catégorie
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, famille, ordre, reparateurs } = req.body;   // ✅ AJOUT reparateurs
    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      return res.status(404).json({
        success: false,
        message: 'Catégorie non trouvée'
      });
    }

    // ✅ Vérifier la nouvelle famille si elle change
    if (famille !== undefined && famille !== null) {
      const currentFamilleId = categorie.famille
        ? categorie.famille.toString()
        : null;

      if (famille !== currentFamilleId) {
        const familleExists = await Famille.findById(famille);
        if (!familleExists) {
          return res.status(400).json({
            success: false,
            message: 'La famille spécifiée n\'existe pas'
          });
        }
      }
    }

    // ✅ Valider et trimmer le nom si fourni
    let trimmedNom = null;
    if (nom !== undefined && nom !== null) {
      trimmedNom = String(nom).trim();

      if (!trimmedNom) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut pas être vide'
        });
      }
    }

    // ✅ Préparer les valeurs pour vérification doublons
    const checkFamille = famille || categorie.famille;
    const checkNom = trimmedNom || categorie.nom;

    const currentFamilleId = categorie.famille
      ? categorie.famille.toString()
      : null;

    const nomChanged = checkNom !== categorie.nom;
    const familleChanged = checkFamille && checkFamille.toString() !== currentFamilleId;

    // ✅ Vérifier les doublons si nécessaire
    if (nomChanged || familleChanged) {
      const escapedNom = checkNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const existing = await Categorie.findOne({
        nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
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

    // ✅ Appliquer les modifications
    if (trimmedNom !== null) categorie.nom = trimmedNom;
    if (famille !== undefined && famille !== null) categorie.famille = famille;

    // ✅ Mettre à jour l'ordre (HORS de tout if, exécution toujours si fourni)
    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif'
        });
      }
      categorie.ordre = numOrdre;
    }

    // ✅ Mettre à jour les réparateurs autorisés
    if (reparateurs !== undefined) {
      const cleanReparateurs = Array.isArray(reparateurs)
        ? reparateurs.filter((id) => id)
        : [];
      categorie.reparateurs = cleanReparateurs;
    }

    await categorie.save();

    const populated = await Categorie.findById(categorie._id)
      .populate('famille', 'nom')
      .populate('reparateurs', 'firstName lastName username role');   // ✅ AJOUT

    logger.info(`Catégorie modifiée: ${categorie.nom} (ordre: ${categorie.ordre}, ${categorie.reparateurs.length} réparateur(s)) par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Catégorie modifiée avec succès',
      data: populated
    });
  } catch (error) {
    logger.error('Erreur update catégorie:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette catégorie existe déjà dans cette famille'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de la catégorie'
    });
  }
};

// ============================================================
// DELETE - Supprimer une catégorie
// ============================================================
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