const Client = require('../models/Client');
const Reparation = require('../models/Reparation');
const Status = require('../models/Status');
const User = require('../models/User');
const logger = require('../config/logger');

// GET - Statistiques du dashboard
exports.getStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    let reparationFilter = { isDeleted: false };
    
    if (userRole === 'REPARATEUR') {
      reparationFilter.reparateur = userId;
    }

    // ✅ Récupérer tous les statuts
    const allStatuses = await Status.find();
    const statusMap = {};
    allStatuses.forEach(s => {
      statusMap[s._id.toString()] = s;
    });

    // ✅ Réparations par statut (calcul direct)
    const statusCounts = await Reparation.aggregate([
      { $match: reparationFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const reparationsParStatut = statusCounts
      .map(item => {
        const status = statusMap[item._id?.toString()];
        return {
          label: status?.label || 'Non défini',
          color: status?.color || '#6c757d',
          count: item.count,
        };
      })
      .sort((a, b) => b.count - a.count);

    // ✅ Le reste du code
    const [
      totalClients,
      totalReparations,
      reparationsJour,
      reparationsMois,
      totalAcomptes,
      totalPrix,
      reparationsParCategorie,
      topObjets,
      topMarques,
      activiteReparateurs
    ] = await Promise.all([
      Client.countDocuments({ isActive: true }),
      Reparation.countDocuments(reparationFilter),
      Reparation.countDocuments({
        ...reparationFilter,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999))
        }
      }),
      Reparation.countDocuments({
        ...reparationFilter,
        createdAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
        }
      }),
      Reparation.aggregate([
        { $match: reparationFilter },
        { $group: { _id: null, total: { $sum: '$acompte' } } }
      ]),
      Reparation.aggregate([
        { $match: reparationFilter },
        { $group: { _id: null, total: { $sum: '$prix' } } }
      ]),
      Reparation.aggregate([
        { $match: reparationFilter },
        { $group: { _id: '$categorie', count: { $sum: 1 } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'categorieInfo' } },
        { $unwind: { path: '$categorieInfo', preserveNullAndEmptyArrays: true } },
        { $project: { label: '$categorieInfo.nom', count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Reparation.aggregate([
        { $match: reparationFilter },
        { $group: { _id: '$objet', count: { $sum: 1 } } },
        { $lookup: { from: 'objets', localField: '_id', foreignField: '_id', as: 'objetInfo' } },
        { $unwind: { path: '$objetInfo', preserveNullAndEmptyArrays: true } },
        { $project: { label: '$objetInfo.nom', count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Reparation.aggregate([
        { $match: reparationFilter },
        { $group: { _id: '$marque', count: { $sum: 1 } } },
        { $project: { label: '$_id', count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Reparation.aggregate([
        { $match: { ...reparationFilter, reparateur: { $ne: null } } },
        { $group: { _id: '$reparateur', count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        { $project: { label: { $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] }, count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
    ]);

    // ✅ États de paiement
    const paymentsStats = await Reparation.aggregate([
      { $match: reparationFilter },
      {
        $group: {
          _id: null,
          paid: {
            $sum: {
              $cond: [{ $gte: ['$acompte', '$prix'] }, 1, 0]
            }
          },
          partial: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$acompte', 0] }, { $lt: ['$acompte', '$prix'] }] },
                1,
                0
              ]
            }
          },
          unpaid: {
            $sum: {
              $cond: [{ $eq: ['$acompte', 0] }, 1, 0]
            }
          },
        },
      },
    ]);

    const paymentCounts = paymentsStats[0] || { paid: 0, partial: 0, unpaid: 0 };

    // ✅ Compteurs spécifiques par statut
    const getStatusCount = (labels) => {
      return reparationsParStatut
        .filter(s => labels.some(l => 
          s.label?.toLowerCase().includes(l.toLowerCase())
        ))
        .reduce((sum, s) => sum + s.count, 0);
    };

    const enAttente = getStatusCount(['attente']);
    const enCours = getStatusCount(['en cours']) - getStatusCount(['sav']);
    const terminees = getStatusCount(['repare', 'réparé', 'pret', 'prêt']) - getStatusCount(['non repare', 'non réparé']);
    const livrees = getStatusCount(['sortie']);

    const ca = totalPrix.length > 0 ? totalPrix[0].total : 0;
    const acomptesTotal = totalAcomptes.length > 0 ? totalAcomptes[0].total : 0;
    const restant = ca - acomptesTotal;

    const cleanData = (data, defaultLabel = 'Non défini') => {
      return data.map(item => ({
        ...item,
        label: item.label || defaultLabel
      }));
    };

    res.json({
      success: true,
      data: {
        totalClients,
        totalReparations,
        enAttente,
        enCours,
        terminees,
        livrees,
        reparationsJour,
        reparationsMois,
        ca,
        acomptes: acomptesTotal,
        restant,
        reparationsParStatut,   // ✅ Déjà nettoyé
        reparationsParCategorie: cleanData(reparationsParCategorie),
        topObjets: cleanData(topObjets),
        topMarques: cleanData(topMarques),
        activiteReparateurs: cleanData(activiteReparateurs),
        paymentsStats: paymentCounts,
      }
    });
  } catch (error) {
    logger.error('Erreur getStats dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

// GET - Données pour les graphiques
exports.getCharts = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    const reparationFilter = { isDeleted: false };
    if (userRole === 'REPARATEUR') {
      reparationFilter.reparateur = userId;
    }

    // 1. Réparations par jour (30 derniers jours)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const reparationsParJour = await Reparation.aggregate([
      { 
        $match: { 
          ...reparationFilter,
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $group: {
          _id: { 
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { 
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          count: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    // 2. Chiffre d'affaires par mois (12 derniers mois)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const caParMois = await Reparation.aggregate([
      {
        $match: {
          ...reparationFilter,
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$prix' }
        }
      },
      {
        $project: {
          _id: 0,
          month: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          total: 1
        }
      },
      { $sort: { month: 1 } }
    ]);

    // 3. Évolution des statuts (7 derniers jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const evolutionStatuts = await Reparation.aggregate([
      {
        $match: {
          ...reparationFilter,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'statuses',
          localField: '_id.status',
          foreignField: '_id',
          as: 'statusInfo'
        }
      },
      { $unwind: { path: '$statusInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          date: '$_id.date',
          status: '$statusInfo.label',
          color: '$statusInfo.color',
          count: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        reparationsParJour,
        caParMois,
        evolutionStatuts
      }
    });
  } catch (error) {
    logger.error('Erreur getCharts dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des données des graphiques'
    });
  }
};