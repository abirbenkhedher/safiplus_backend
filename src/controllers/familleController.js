const Famille = require('../models/Famille');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des familles
// ============================================================
exports.getAll = async (req, res) => {
  try {
    // ✅ Tri par ordre croissant, puis par nom
    const familles = await Famille.find().sort({ ordre: 1, nom: 1 });
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

// ============================================================
// GET - Une famille par ID
// ============================================================
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

// ============================================================
// POST - Créer une famille
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, ordre } = req.body;

    // ✅ Validation du nom
    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire'
      });
    }

    const trimmedNom = nom.trim();
    const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Vérifier si la famille existe déjà
    const existing = await Famille.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette famille existe déjà'
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

    const famille = new Famille({
      nom: trimmedNom,
      ordre: finalOrdre,
    });

    await famille.save();

    logger.info(`Famille créée: ${famille.nom} (ordre: ${famille.ordre}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Famille créée avec succès',
      data: famille
    });
  } catch (error) {
    logger.error('Erreur create famille:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette famille existe déjà'
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
      message: 'Erreur lors de la création de la famille'
    });
  }
};

// ============================================================
// PUT - Modifier une famille
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, ordre } = req.body;
    const famille = await Famille.findById(req.params.id);

    if (!famille) {
      return res.status(404).json({
        success: false,
        message: 'Famille non trouvée'
      });
    }

    // ✅ Vérifier le nom si fourni
    if (nom !== undefined && nom !== null) {
      const trimmedNom = String(nom).trim();

      if (!trimmedNom) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut pas être vide'
        });
      }

      // Vérifier l'unicité si le nom change
      if (trimmedNom !== famille.nom) {
        const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const existing = await Famille.findOne({
          nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
          _id: { $ne: famille._id }
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Cette famille existe déjà'
          });
        }

        famille.nom = trimmedNom;
      }
    }

    // ✅ Mettre à jour l'ordre (HORS de tout if, exécution toujours si fourni)
    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif'
        });
      }
      famille.ordre = numOrdre;
    }

    await famille.save();

    logger.info(`Famille modifiée: ${famille.nom} (ordre: ${famille.ordre}) par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Famille modifiée avec succès',
      data: famille
    });
  } catch (error) {
    logger.error('Erreur update famille:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette famille existe déjà'
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
      message: 'Erreur lors de la modification de la famille'
    });
  }
};

// ============================================================
// DELETE - Supprimer une famille
// ============================================================
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