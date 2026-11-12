const mongoose = require('mongoose');
const Client = require('../models/Client');
const Reparation = require('../models/Reparation');
const Status = require('../models/Status');
const User = require('../models/User');
const logger = require('../config/logger');

// ============================================================
// ✅ Helper : l'utilisateur a-t-il accès aux données financières ?
// ============================================================
const canViewFinancials = (user) => ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

// ============================================================
// GET - Statistiques du dashboard
// ============================================================
exports.getStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const isAdmin = canViewFinancials(req.user);

    let reparationFilter = { isDeleted: false };

    // Un réparateur ne voit que ses propres réparations
    if (userRole === 'REPARATEUR') {
      reparationFilter.reparateur = userId;
    }

    // ✅ Récupérer tous les statuts
    const allStatuses = await Status.find();
    const statusMap = {};
    allStatuses.forEach(s => {
      statusMap[s._id.toString()] = s;
    });

    // ============================================================
    // ✅ PERFORMANCE : UNE seule lecture des réparations ($facet) au lieu d'une
    //    douzaine d'agrégations ; zones calculées sans jointure par réparation.
    //    (30 000 réparations : ~11 s → < 1 s sur la base de test)
    // ============================================================
    const matchFilter = { ...reparationFilter };
    if (matchFilter.reparateur) matchFilter.reparateur = new mongoose.Types.ObjectId(String(matchFilter.reparateur));
    const debutJour = new Date(new Date().setHours(0, 0, 0, 0));
    const finJour = new Date(new Date().setHours(23, 59, 59, 999));
    const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const finMois = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const top5 = (field, from, label) => [
      { $group: { _id: field, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from, localField: '_id', foreignField: '_id', as: 'info' } },
      { $unwind: { path: '$info', preserveNullAndEmptyArrays: true } },
      { $project: { label, count: 1 } },
    ];

    const [facet] = await Reparation.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          parStatut: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          totaux: [{
            $group: {
              _id: null,
              total: { $sum: 1 },
              jour: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', debutJour] }, { $lt: ['$createdAt', finJour] }] }, 1, 0] } },
              mois: { $sum: { $cond: [{ $and: [{ $gte: ['$createdAt', debutMois] }, { $lt: ['$createdAt', finMois] }] }, 1, 0] } },
              acomptes: { $sum: '$acompte' },
              prix: { $sum: '$prix' },
              paid: { $sum: { $cond: [{ $gte: ['$acompte', '$prix'] }, 1, 0] } },
              partial: { $sum: { $cond: [{ $and: [{ $gt: ['$acompte', 0] }, { $lt: ['$acompte', '$prix'] }] }, 1, 0] } },
              unpaid: { $sum: { $cond: [{ $eq: ['$acompte', 0] }, 1, 0] } },
            },
          }],
          categories: top5('$categorie', 'categories', '$info.nom'),
          objets: top5('$objet', 'objets', '$info.nom'),
          marques: top5('$marque', 'marques', '$info.nom'),
          reparateurs: [
            { $match: { reparateur: { $ne: null } } },
            ...top5('$reparateur', 'users', { $concat: ['$info.firstName', ' ', '$info.lastName'] }),
          ],
          parClient: [
            { $match: { client: { $ne: null } } },
            { $group: { _id: '$client', count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const statusMapDash = statusMap;
    const reparationsParStatut = facet.parStatut
      .map((item) => {
        const status = statusMapDash[item._id?.toString()];
        return { label: status?.label || 'Non défini', color: status?.color || '#6c757d', count: item.count };
      })
      .sort((a, b) => b.count - a.count);

    const t = facet.totaux[0] || { total: 0, jour: 0, mois: 0, acomptes: 0, prix: 0, paid: 0, partial: 0, unpaid: 0 };
    const totalReparations = t.total;
    const reparationsJour = t.jour;
    const reparationsMois = t.mois;
    const totalAcomptes = isAdmin ? [{ total: t.acomptes }] : [];
    const totalPrix = isAdmin ? [{ total: t.prix }] : [];
    const reparationsParCategorie = facet.categories;
    const topObjets = facet.objets;
    const topMarques = facet.marques;
    const activiteReparateurs = facet.reparateurs;

    // Zones : nombre de réparations par zone du client (zones lues une fois)
    const [totalClients, clientsZone] = await Promise.all([
      Client.countDocuments({ isActive: true }),
      Client.find({ zone: { $nin: [null, ''] } }).select('zone').lean(),
    ]);
    const zoneDe = new Map(clientsZone.map((c) => [String(c._id), c.zone]));
    const parZone = new Map();
    for (const pc of facet.parClient) {
      const z = zoneDe.get(String(pc._id));
      if (z) parZone.set(z, (parZone.get(z) || 0) + pc.count);
    }
    const topZones = [...parZone.entries()]
      .map(([z, count]) => ({ _id: z, label: z, count }))
      .sort((a, b) => b.count - a.count);

    const paymentCounts = isAdmin ? { _id: null, paid: t.paid, partial: t.partial, unpaid: t.unpaid } : null;

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

    // ✅ Champs financiers : calculés uniquement si ADMIN
    const ca = isAdmin && totalPrix.length > 0 ? totalPrix[0].total : 0;
    const acomptesTotal = isAdmin && totalAcomptes.length > 0 ? totalAcomptes[0].total : 0;
    const restant = isAdmin ? ca - acomptesTotal : 0;

    const cleanData = (data, defaultLabel = 'Non défini') => {
      return data.map(item => ({
        ...item,
        label: item.label || defaultLabel
      }));
    };

    // ============================================================
    // ✅ RÉPONSE : on n'inclut les champs financiers que si ADMIN
    // ============================================================
    const responseData = {
      // ✅ Données visibles par tous
      totalClients,
      totalReparations,
      enAttente,
      enCours,
      terminees,
      livrees,
      reparationsJour,
      reparationsMois,
      reparationsParStatut,
      reparationsParCategorie: cleanData(reparationsParCategorie),
      topObjets: cleanData(topObjets),
      topMarques: cleanData(topMarques),
      activiteReparateurs: cleanData(activiteReparateurs),
      topZones: cleanData(topZones),
    };

    // ✅ Ajouter les données financières UNIQUEMENT pour l'ADMIN
    if (isAdmin) {
      responseData.ca = ca;
      responseData.acomptes = acomptesTotal;
      responseData.restant = restant;
      responseData.paymentsStats = paymentCounts;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Erreur getStats dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

// ============================================================
// GET - Données pour les graphiques
// ============================================================
exports.getCharts = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const isAdmin = canViewFinancials(req.user);

    const reparationFilter = { isDeleted: false };
    if (userRole === 'REPARATEUR') {
      reparationFilter.reparateur = userId;
    }

    // 1. Réparations par jour (30 derniers jours) — visible par tous
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

    // 2. Chiffre d'affaires par mois (12 derniers mois) — ADMIN uniquement
    let caParMois = [];
    if (isAdmin) {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      caParMois = await Reparation.aggregate([
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
    }

    // 3. Évolution des statuts (7 derniers jours) — visible par tous
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

    // ✅ Réponse : caParMois uniquement pour ADMIN
    const responseData = {
      reparationsParJour,
      evolutionStatuts,
    };

    if (isAdmin) {
      responseData.caParMois = caParMois;
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error('Erreur getCharts dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des données des graphiques'
    });
  }
};