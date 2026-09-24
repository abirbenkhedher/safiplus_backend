const Marque = require('../models/Marque');
const Objet = require('../models/Objet');
const Modele = require('../models/Modele');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des marques (avec filtre objet)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { objet } = req.query;
    const filter = {};

    if (objet) filter.objet = objet;

    const marques = await Marque.find(filter)
      .populate('objet', 'nom')
      .sort({ ordre: 1, nom: 1 });

    res.json({ success: true, data: marques });
  } catch (error) {
    logger.error('Erreur getAll marques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des marques',
    });
  }
};

// ============================================================
// GET - Une marque par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const marque = await Marque.findById(req.params.id).populate('objet', 'nom');
    if (!marque) {
      return res.status(404).json({
        success: false,
        message: 'Marque non trouvée',
      });
    }
    res.json({ success: true, data: marque });
  } catch (error) {
    logger.error('Erreur getOne marque:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la marque',
    });
  }
};

// ============================================================
// POST - Créer une marque
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, objet, ordre } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire',
      });
    }

    if (!objet) {
      return res.status(400).json({
        success: false,
        message: 'L\'objet est obligatoire',
      });
    }

    const objetExists = await Objet.findById(objet);
    if (!objetExists) {
      return res.status(400).json({
        success: false,
        message: 'L\'objet spécifié n\'existe pas',
      });
    }

    const trimmedNom = nom.trim();
    const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existing = await Marque.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
      objet,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette marque existe déjà pour cet objet',
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

    const marque = new Marque({
      nom: trimmedNom,
      objet,
      ordre: finalOrdre,
    });

    await marque.save();

    const populated = await Marque.findById(marque._id).populate('objet', 'nom');

    logger.info(`Marque créée: ${marque.nom} (objet: ${objetExists.nom}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Marque créée avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur create marque:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette marque existe déjà pour cet objet',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la marque',
    });
  }
};

// ============================================================
// PUT - Modifier une marque
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, objet, ordre } = req.body;
    const marque = await Marque.findById(req.params.id);

    if (!marque) {
      return res.status(404).json({
        success: false,
        message: 'Marque non trouvée',
      });
    }

    // Vérifier le nouvel objet si changé
    if (objet !== undefined && objet !== null) {
      const currentObjetId = marque.objet ? marque.objet.toString() : null;
      if (objet !== currentObjetId) {
        const objetExists = await Objet.findById(objet);
        if (!objetExists) {
          return res.status(400).json({
            success: false,
            message: 'L\'objet spécifié n\'existe pas',
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

    const checkObjet = objet || marque.objet;
    const checkNom = trimmedNom || marque.nom;

    if (checkNom !== marque.nom || (checkObjet && checkObjet.toString() !== marque.objet?.toString())) {
      const escapedNom = checkNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const existing = await Marque.findOne({
        nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
        objet: checkObjet,
        _id: { $ne: marque._id },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Cette marque existe déjà pour cet objet',
        });
      }
    }

    if (trimmedNom !== null) marque.nom = trimmedNom;
    if (objet !== undefined && objet !== null) marque.objet = objet;

    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif',
        });
      }
      marque.ordre = numOrdre;
    }

    await marque.save();

    const populated = await Marque.findById(marque._id).populate('objet', 'nom');

    logger.info(`Marque modifiée: ${marque.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Marque modifiée avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur update marque:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette marque existe déjà pour cet objet',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de la marque',
    });
  }
};

// ============================================================
// DELETE - Supprimer une marque
// ============================================================
exports.delete = async (req, res) => {
  try {
    const marque = await Marque.findById(req.params.id);

    if (!marque) {
      return res.status(404).json({
        success: false,
        message: 'Marque non trouvée',
      });
    }

    // Vérifier si des modèles sont liés
    const modelesCount = await Modele.countDocuments({ marque: marque._id });
    if (modelesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cette marque car elle est utilisée par ${modelesCount} modèle(s)`,
      });
    }

    await marque.deleteOne();

    logger.info(`Marque supprimée: ${marque.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Marque supprimée avec succès',
    });
  } catch (error) {
    logger.error('Erreur delete marque:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la marque',
    });
  }
};