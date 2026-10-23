const Zone = require('../models/Zone');
const Client = require('../models/Client');
const logger = require('../config/logger');

// GET - Liste des zones
exports.getAll = async (req, res) => {
  try {
    const { isActive } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const zones = await Zone.find(filter).sort({ ordre: 1, nom: 1 });
    res.json({ success: true, data: zones });
  } catch (error) {
    logger.error('Erreur getAll zones:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des zones',
    });
  }
};

// GET - Une zone
exports.getOne = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone non trouvée' });
    }
    res.json({ success: true, data: zone });
  } catch (error) {
    logger.error('Erreur getOne zone:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// POST - Créer une zone
exports.create = async (req, res) => {
  try {
    const { nom, ordre } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le nom est obligatoire',
      });
    }

    const trimmedNom = nom.trim();
    const escaped = trimmedNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const existing = await Zone.findOne({
      nom: { $regex: new RegExp(`^${escaped}$`, 'i') },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Cette zone existe déjà',
      });
    }

    let finalOrdre = 0;
    if (ordre !== undefined && ordre !== null && ordre !== '') {
      const num = Number(ordre);
      if (!Number.isFinite(num) || num < 0) {
        return res.status(400).json({
          success: false,
          message: 'L\'ordre doit être un nombre positif',
        });
      }
      finalOrdre = num;
    }

    const zone = new Zone({ nom: trimmedNom, ordre: finalOrdre });
    await zone.save();

    logger.info(`Zone créée: ${zone.nom} par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Zone créée avec succès',
      data: zone,
    });
  } catch (error) {
    logger.error('Erreur create zone:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Cette zone existe déjà' });
    }
    res.status(500).json({ success: false, message: 'Erreur lors de la création' });
  }
};

// PUT - Modifier
exports.update = async (req, res) => {
  try {
    const { nom, ordre, isActive } = req.body;
    const zone = await Zone.findById(req.params.id);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone non trouvée' });
    }

    if (nom !== undefined) {
      const trimmed = String(nom).trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'Le nom ne peut pas être vide' });
      }
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existing = await Zone.findOne({
        nom: { $regex: new RegExp(`^${escaped}$`, 'i') },
        _id: { $ne: zone._id },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Cette zone existe déjà' });
      }
      zone.nom = trimmed;
    }

    if (ordre !== undefined) {
      const num = Number(ordre);
      if (!Number.isFinite(num) || num < 0) {
        return res.status(400).json({ success: false, message: 'Ordre invalide' });
      }
      zone.ordre = num;
    }

    if (isActive !== undefined) zone.isActive = isActive;

    await zone.save();
    res.json({ success: true, message: 'Zone modifiée', data: zone });
  } catch (error) {
    logger.error('Erreur update zone:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la modification' });
  }
};

// DELETE - Supprimer
exports.delete = async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone non trouvée' });
    }

    // ⚠️ Vérifier si des clients utilisent cette zone (stockée en string)
    const clientsCount = await Client.countDocuments({ zone: zone.nom });
    if (clientsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer cette zone car ${clientsCount} client(s) l'utilisent`,
      });
    }

    await zone.deleteOne();
    res.json({ success: true, message: 'Zone supprimée' });
  } catch (error) {
    logger.error('Erreur delete zone:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
};