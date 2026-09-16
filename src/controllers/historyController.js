const History = require('../models/History');
const logger = require('../config/logger');

// GET - Liste de l'historique avec filtres
exports.getAll = async (req, res) => {
  try {
    const {
      entityType,
      action,
      userId,
      entityId,
      dateDebut,
      dateFin,
      search,
      limit = 50,
      page = 1
    } = req.query;

    const query = {};

    if (entityType) query.entityType = entityType;
    if (action) query.action = action;
    if (userId) query.user = userId;
    if (entityId) query.entityId = entityId;

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) {
        const endDate = new Date(dateFin);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    if (search) {
      query.$or = [
        { comment: { $regex: search, $options: 'i' } },
        { entityType: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [history, total] = await Promise.all([
      History.find(query)
        .populate('user', 'username firstName lastName role')
        .populate('oldStatus', 'label color')
        .populate('newStatus', 'label color')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      History.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Erreur getAll history:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
};

// GET - Statistiques de l'historique
exports.getStats = async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;

    const matchStage = {};
    if (dateDebut || dateFin) {
      matchStage.createdAt = {};
      if (dateDebut) matchStage.createdAt.$gte = new Date(dateDebut);
      if (dateFin) {
        const endDate = new Date(dateFin);
        endDate.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = endDate;
      }
    }

    const [byAction, byEntityType, byUser, byDay] = await Promise.all([
      // Par action
      History.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Par type d'entité
      History.aggregate([
        { $match: matchStage },
        { $group: { _id: '$entityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // Par utilisateur (top 10)
      History.aggregate([
        { $match: matchStage },
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            label: { $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] },
            username: '$userInfo.username',
            count: 1
          }
        }
      ]),

      // Par jour (30 derniers jours)
      History.aggregate([
        {
          $match: {
            ...matchStage,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        byAction,
        byEntityType,
        byUser,
        byDay
      }
    });
  } catch (error) {
    logger.error('Erreur getStats history:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

// GET - Historique d'une entité spécifique
exports.getByEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const history = await History.find({
      entityType,
      entityId
    })
      .populate('user', 'username firstName lastName')
      .populate('oldStatus', 'label color')
      .populate('newStatus', 'label color')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Erreur getByEntity:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
};

// GET - Détail d'une entrée
exports.getOne = async (req, res) => {
  try {
    const history = await History.findById(req.params.id)
      .populate('user', 'username firstName lastName email role')
      .populate('oldStatus', 'label color')
      .populate('newStatus', 'label color');

    if (!history) {
      return res.status(404).json({
        success: false,
        message: 'Entrée non trouvée'
      });
    }

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Erreur getOne history:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'entrée'
    });
  }
};

// DELETE - Nettoyer l'historique ancien (ADMIN uniquement)
exports.cleanOld = async (req, res) => {
  try {
    const { days = 365 } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await History.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    logger.info(`Historique nettoyé: ${result.deletedCount} entrées supprimées par ${req.user.username}`);

    res.json({
      success: true,
      message: `${result.deletedCount} entrée(s) supprimée(s)`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    logger.error('Erreur cleanOld:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du nettoyage de l\'historique'
    });
  }
};