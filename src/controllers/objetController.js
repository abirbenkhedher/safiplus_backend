const Objet = require('../models/Objet');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des objets
// ============================================================
exports.getAll = async (req, res) => {
  try {
    // ✅ Tri par ordre croissant, puis par nom
    const objets = await Objet.find().sort({ ordre: 1, nom: 1 });
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

// ============================================================
// GET - Un objet par ID
// ============================================================
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

// ============================================================
// POST - Créer un objet
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

    const existing = await Objet.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cet objet existe déjà'
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

    const objet = new Objet({
      nom: trimmedNom,
      ordre: finalOrdre,
    });

    await objet.save();

    logger.info(`Objet créé: ${objet.nom} (ordre: ${objet.ordre}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Objet créé avec succès',
      data: objet
    });
  } catch (error) {
    logger.error('Erreur create objet:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cet objet existe déjà'
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
      message: 'Erreur lors de la création de l\'objet'
    });
  }
};

// ============================================================
// PUT - Modifier un objet
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, ordre } = req.body;
    const objet = await Objet.findById(req.params.id);

    if (!objet) {
      return res.status(404).json({
        success: false,
        message: 'Objet non trouvé'
      });
    }

    // ✅ Valider et trimmer le nom si fourni
    if (nom !== undefined && nom !== null) {
      const trimmedNom = String(nom).trim();

      if (!trimmedNom) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut pas être vide'
        });
      }

      if (trimmedNom !== objet.nom) {
        const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const existing = await Objet.findOne({
          nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
          _id: { $ne: objet._id }
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Cet objet existe déjà'
          });
        }

        objet.nom = trimmedNom;
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
      objet.ordre = numOrdre;
    }

    await objet.save();

    logger.info(`Objet modifié: ${objet.nom} (ordre: ${objet.ordre}) par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Objet modifié avec succès',
      data: objet
    });
  } catch (error) {
    logger.error('Erreur update objet:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cet objet existe déjà'
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
      message: 'Erreur lors de la modification de l\'objet'
    });
  }
};

// ============================================================
// DELETE - Supprimer un objet
// ============================================================
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