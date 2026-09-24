const Panne = require('../models/Panne');
const Categorie = require('../models/Categorie');
const Reparation = require('../models/Reparation');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des pannes (avec filtre catégorie)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { categorie, isActive } = req.query;
    const filter = {};

    if (categorie) filter.categorie = categorie;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const pannes = await Panne.find(filter)
      .populate('categorie', 'nom')
      .sort({ ordre: 1, nom: 1 });

    res.json({ success: true, data: pannes });
  } catch (error) {
    logger.error('Erreur getAll pannes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des pannes',
    });
  }
};

// ============================================================
// GET - Une panne par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const panne = await Panne.findById(req.params.id).populate('categorie', 'nom');
    if (!panne) {
      return res.status(404).json({
        success: false,
        message: 'Panne non trouvée',
      });
    }
    res.json({ success: true, data: panne });
  } catch (error) {
    logger.error('Erreur getOne panne:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la panne',
    });
  }
};

// ============================================================
// POST - Créer une panne
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, categorie, ordre } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire',
      });
    }

    if (!categorie) {
      return res.status(400).json({
        success: false,
        message: 'La catégorie est obligatoire',
      });
    }

    const categorieExists = await Categorie.findById(categorie);
    if (!categorieExists) {
      return res.status(400).json({
        success: false,
        message: 'La catégorie spécifiée n\'existe pas',
      });
    }

    const trimmedNom = nom.trim();
    const escapedNom = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existing = await Panne.findOne({
      nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
      categorie,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette panne existe déjà dans cette catégorie',
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

    const panne = new Panne({
      nom: trimmedNom,
      categorie,
      ordre: finalOrdre,
    });

    await panne.save();

    const populated = await Panne.findById(panne._id).populate('categorie', 'nom');

    logger.info(`Panne créée: ${panne.nom} (catégorie: ${categorieExists.nom}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Panne créée avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur create panne:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette panne existe déjà dans cette catégorie',
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la panne',
    });
  }
};

// ============================================================
// PUT - Modifier une panne
// ============================================================
exports.update = async (req, res) => {
  try {
    const { nom, categorie, ordre, isActive } = req.body;
    const panne = await Panne.findById(req.params.id);

    if (!panne) {
      return res.status(404).json({
        success: false,
        message: 'Panne non trouvée',
      });
    }

    // Vérifier la nouvelle catégorie si changée
    if (categorie !== undefined && categorie !== null) {
      const currentCatId = panne.categorie ? panne.categorie.toString() : null;
      if (categorie !== currentCatId) {
        const categorieExists = await Categorie.findById(categorie);
        if (!categorieExists) {
          return res.status(400).json({
            success: false,
            message: 'La catégorie spécifiée n\'existe pas',
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

    // Vérifier les doublons
    const checkCategorie = categorie || panne.categorie;
    const checkNom = trimmedNom || panne.nom;

    if (
      checkNom !== panne.nom ||
      (checkCategorie && checkCategorie.toString() !== panne.categorie?.toString())
    ) {
      const escapedNom = checkNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const existing = await Panne.findOne({
        nom: { $regex: new RegExp(`^${escapedNom}$`, 'i') },
        categorie: checkCategorie,
        _id: { $ne: panne._id },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Cette panne existe déjà dans cette catégorie',
        });
      }
    }

    if (trimmedNom !== null) panne.nom = trimmedNom;
    if (categorie !== undefined && categorie !== null) panne.categorie = categorie;

    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const numOrdre = Number(ordre);
      if (!Number.isFinite(numOrdre) || numOrdre < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif',
        });
      }
      panne.ordre = numOrdre;
    }

    if (isActive !== undefined) panne.isActive = isActive;

    await panne.save();

    const populated = await Panne.findById(panne._id).populate('categorie', 'nom');

    logger.info(`Panne modifiée: ${panne.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Panne modifiée avec succès',
      data: populated,
    });
  } catch (error) {
    logger.error('Erreur update panne:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cette panne existe déjà dans cette catégorie',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification de la panne',
    });
  }
};

// ============================================================
// DELETE - Supprimer une panne
// ============================================================
exports.delete = async (req, res) => {
  try {
    const panne = await Panne.findById(req.params.id);

    if (!panne) {
      return res.status(404).json({
        success: false,
        message: 'Panne non trouvée',
      });
    }

    // ⚠️ Vérifier si des réparations utilisent cette panne
    // Comme panneType est un tableau de strings, on cherche dans les réparations
    const reparationsCount = await Reparation.countDocuments({
      panneType: panne.nom,
    });

    if (reparationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cette panne car elle est utilisée par ${reparationsCount} réparation(s)`,
      });
    }

    await panne.deleteOne();

    logger.info(`Panne supprimée: ${panne.nom} par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Panne supprimée avec succès',
    });
  } catch (error) {
    logger.error('Erreur delete panne:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la panne',
    });
  }
};