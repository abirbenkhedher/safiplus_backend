const Depense = require('../models/Depense');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des dépenses avec filtres
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { type, dateDebut, dateFin, search, limit = 100, page = 1 } = req.query;

    const query = { isDeleted: false };

    if (type) query.type = type;

    if (dateDebut || dateFin) {
      query.dateDepense = {};
      if (dateDebut) query.dateDepense.$gte = new Date(dateDebut);
      if (dateFin) {
        const end = new Date(dateFin);
        end.setHours(23, 59, 59, 999);
        query.dateDepense.$lte = end;
      }
    }

    if (search) {
      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { fournisseur: { $regex: search, $options: 'i' } },
        { factureNumero: { $regex: search, $options: 'i' } },
        { motifDiverse: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [depenses, total] = await Promise.all([
      Depense.find(query)
        .populate('createdBy', 'username firstName lastName')
        .sort({ dateDepense: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Depense.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: depenses,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Erreur getAll depenses:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement' });
  }
};

// ============================================================
// GET - Stats dépenses (KPI)
// ============================================================
exports.getStats = async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;

    const match = { isDeleted: false };
    if (dateDebut || dateFin) {
      match.dateDepense = {};
      if (dateDebut) match.dateDepense.$gte = new Date(dateDebut);
      if (dateFin) {
        const end = new Date(dateFin);
        end.setHours(23, 59, 59, 999);
        match.dateDepense.$lte = end;
      }
    }

    const agg = await Depense.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$montant' },
          count: { $sum: 1 },
        },
      },
    ]);

    const reparation = agg.find((a) => a._id === 'REPARATION') || { total: 0, count: 0 };
    const diverse = agg.find((a) => a._id === 'DIVERSE') || { total: 0, count: 0 };

    res.json({
      success: true,
      data: {
        total: reparation.total + diverse.total,
        count: reparation.count + diverse.count,
        reparation: { total: reparation.total, count: reparation.count },
        diverse: { total: diverse.total, count: diverse.count },
      },
    });
  } catch (error) {
    logger.error('Erreur getStats depenses:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// POST - Créer une dépense
// ============================================================
exports.create = async (req, res) => {
  try {
    const {
      type, montant, categorieDiverse, motifDiverse,
      fournisseur, factureNumero, dateDepense, modePaiement, observation,
    } = req.body;

    if (!type || !['REPARATION', 'DIVERSE'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type invalide' });
    }
    if (montant === undefined || montant === null || Number(montant) < 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide' });
    }

    const depense = await Depense.create({
      type,
      montant: Number(montant),
      categorieDiverse: type === 'DIVERSE' ? (categorieDiverse || '') : '',
      motifDiverse: type === 'DIVERSE' ? (motifDiverse || '') : '',
      fournisseur: fournisseur || '',
      factureNumero: factureNumero || '',
      dateDepense: dateDepense ? new Date(dateDepense) : new Date(),
      modePaiement: modePaiement || 'ESPECES',
      observation: observation || '',
      createdBy: req.user.id,
    });

    logger.info(`Dépense créée: ${depense.numero} (${type}, ${montant} DT) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Dépense créée avec succès',
      data: depense,
    });
  } catch (error) {
    logger.error('Erreur create depense:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création',
    });
  }
};

// ============================================================
// PUT - Modifier une dépense
// ============================================================
exports.update = async (req, res) => {
  try {
    const depense = await Depense.findById(req.params.id);
    if (!depense || depense.isDeleted) {
      return res.status(404).json({ success: false, message: 'Dépense non trouvée' });
    }

    const allowed = [
      'montant', 'categorieDiverse', 'motifDiverse', 'fournisseur',
      'factureNumero', 'dateDepense', 'modePaiement', 'observation',
    ];

    allowed.forEach((k) => {
      if (req.body[k] !== undefined) depense[k] = req.body[k];
    });

    await depense.save();
    logger.info(`Dépense modifiée: ${depense.numero} par ${req.user.username}`);

    res.json({ success: true, message: 'Dépense modifiée', data: depense });
  } catch (error) {
    logger.error('Erreur update depense:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// DELETE - Soft delete
// ============================================================
exports.delete = async (req, res) => {
  try {
    const depense = await Depense.findById(req.params.id);
    if (!depense || depense.isDeleted) {
      return res.status(404).json({ success: false, message: 'Dépense non trouvée' });
    }

    depense.isDeleted = true;
    await depense.save();

    logger.info(`Dépense supprimée: ${depense.numero} par ${req.user.username}`);
    res.json({ success: true, message: 'Dépense supprimée' });
  } catch (error) {
    logger.error('Erreur delete depense:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};