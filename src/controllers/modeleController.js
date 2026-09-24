const Modele = require('../models/Modele');
const Marque = require('../models/Marque');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des modèles (avec filtre marque)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { marque } = req.query;
    const filter = {};

    if (marque) filter.marque = marque;

    const modeles = await Modele.find(filter)
      .populate('marque', 'nom')
      .sort({ ordre: 1, nom: 1 });

    res.json({ success: true, data: modeles });
  } catch (error) {
    logger.error('Erreur getAll modeles:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des modèles',
    });
  }
};

// ============================================================
// GET - Un modèle par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const modele = await Modele.findById(req.params.id).populate('marque', 'nom');
    if (!modele) {
      return res.status(404).json({
        success: false,
        message: 'Modèle non trouvé',
      });
    }
    res.json({ success: true, data: modele });
  } catch (error) {
    logger.error('Erreur getOne modele:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du modèle',
    });
  }
};

// ============================================================
// POST - Créer un modèle
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, marque, ordre } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire',
      });
    }

    if (!marque) {
      return res.status(400).json({
        success: false,
        message: 'La marque est obligatoire',
      });
    }

    const marqueExists = await Marque.findById(marque);
    if (!marqueExists) {
      return res.status(400).json({
        success: false,
        message: 'La marque spécifiée n\'existe pas',
      });
    }

    const trimmedNom = nom.trim();
    const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existing = await Modele.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
      marque,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Ce modèle existe déjà pour cette marque',
      });
    }

    let finalOrdre = 0;
    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif',
        });
      }
      finalOrdre = numOrdre;
    }

    const modele = new Modele({
      nom: trimmedNom,
      marque,
      ordre: finalOrdre,
    });

    await modele.save();

    const populated = await Modele.findById(modele._id).populate('marque', 'nom');

    logger.info(`Modèle créé: ${modele.nom} (marque: ${marqueExists.nom}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Modèle créé avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur create modele:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ce modèle existe déjà pour cette marque',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du modèle',
    });
  }
};

// ============================================================
// PUT - Modifier un modèle
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, marque, ordre } = req.body;
    const modele = await Modele.findById(req.params.id);

    if (!modele) {
      return res.status(404).json({
        success: false,
        message: 'Modèle non trouvé',
      });
    }

    if (marque !== undefined && marque !== null) {
      const currentMarqueId = modele.marque ? modele.marque.toString() : null;
      if (marque !== currentMarqueId) {
        const marqueExists = await Marque.findById(marque);
        if (!marqueExists) {
          return res.status(400).json({
            success: false,
            message: 'La marque spécifiée n\'existe pas',
          });
        }
      }
    }

    let trimmedNom = null;
    if (nom !== undefined && nom !== null) {
      trimmedNom = String(nom).trim();
      if (!trimmedNom) {
        return res.status(400).json({
          success: false,
          message: 'Le nom ne peut pas être vide',
        });
      }
    }

    const checkMarque = marque || modele.marque;
    const checkNom = trimmedNom || modele.nom;

    if (checkNom !== modele.nom || (checkMarque && checkMarque.toString() !== modele.marque?.toString())) {
      const escapedNom = checkNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const existing = await Modele.findOne({
        nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
        marque: checkMarque,
        _id: { $ne: modele._id },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Ce modèle existe déjà pour cette marque',
        });
      }
    }

    if (trimmedNom !== null) modele.nom = trimmedNom;
    if (marque !== undefined && marque !== null) modele.marque = marque;

    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif',
        });
      }
      modele.ordre = numOrdre;
    }

    await modele.save();

    const populated = await Modele.findById(modele._id).populate('marque', 'nom');

    logger.info(`Modèle modifié: ${modele.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Modèle modifié avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur update modele:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ce modèle existe déjà pour cette marque',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification du modèle',
    });
  }
};

// ============================================================
// DELETE - Supprimer un modèle
// ============================================================
exports.delete = async (req, res) => {
  try {
    const modele = await Modele.findById(req.params.id);

    if (!modele) {
      return res.status(404).json({
        success: false,
        message: 'Modèle non trouvé',
      });
    }

    await modele.deleteOne();

    logger.info(`Modèle supprimé: ${modele.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Modèle supprimé avec succès',
    });
  } catch (error) {
    logger.error('Erreur delete modele:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du modèle',
    });
  }
};