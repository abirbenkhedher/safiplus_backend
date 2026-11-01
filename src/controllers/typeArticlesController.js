const TypeArticle = require('../models/TypeArticle');
const logger = require('../config/logger');

// GET — Liste des types d'articles
exports.getAll = async (req, res) => {
  try {
    const { search, includeInactive = 'false' } = req.query;

    const query = {};
    if (includeInactive !== 'true') query.isActive = true;
    if (search) {
      query.nom = { $regex: search, $options: 'i' };
    }

    const types = await TypeArticle.find(query)
      .sort({ ordre: 1, nom: 1 })
      .select('nom ordre isActive');

    res.json({ success: true, data: types });
  } catch (error) {
    logger.error('Erreur getAll typeArticles:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// POST — Créer un type d'article (avec détection de doublon)
exports.create = async (req, res) => {
  try {
    const { nom } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({ success: false, message: 'Le nom est obligatoire' });
    }

    const cleanNom = nom.trim();

    // ✅ Recherche insensible à la casse
    const existing = await TypeArticle.findOne({
      nom: { $regex: `^${cleanNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });

    if (existing) {
      return res.json({
        success: true,
        data: existing,
        message: 'Ce type existe déjà',
        existed: true,
      });
    }

    const type = await TypeArticle.create({
      nom: cleanNom,
      ordre: 999,
      createdBy: req.user.id,
    });

    logger.info(`Type d'article créé: "${cleanNom}" par ${req.user.username}`);

    res.status(201).json({ success: true, data: type });
  } catch (error) {
    logger.error('Erreur create typeArticle:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Ce type existe déjà' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE — Désactiver un type
exports.delete = async (req, res) => {
  try {
    const type = await TypeArticle.findById(req.params.id);
    if (!type) return res.status(404).json({ success: false, message: 'Introuvable' });

    type.isActive = false;
    await type.save();

    res.json({ success: true, message: 'Type désactivé' });
  } catch (error) {
    logger.error('Erreur delete typeArticle:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};