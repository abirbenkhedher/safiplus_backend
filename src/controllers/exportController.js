const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const User = require('../models/User');
const History = require('../models/History');
const excelService = require('../services/excelService');
const logger = require('../config/logger');

// ============================================================
// GET - Export Excel des réparations (filtres serveur)
// ============================================================
exports.exportReparations = async (req, res) => {
  try {
    const {
      search,
      status,
      categorie,
      client,
      reparateur,
      createdBy,
      dateDebut,
      dateFin,
      zone,
    } = req.query;

    const query = { isDeleted: false };

    if (status) query.status = status;
    if (categorie) query.categorie = categorie;
    if (client) query.client = client;
    if (reparateur) query.reparateur = reparateur;
    if (createdBy) query.createdBy = createdBy;

    if (zone && zone.trim() !== '') {
      const clientsWithZone = await Client.find({
        zone: { $regex: `^${zone}$`, $options: 'i' },
      }).select('_id');

      const clientIds = clientsWithZone.map((c) => c._id);

      if (clientIds.length > 0) {
        query.client = { $in: clientIds };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pages: 0 },
        });
      }
    }

    if (search) {
      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { problemeDeclare: { $regex: search, $options: 'i' } },
        { panneType: { $regex: search, $options: 'i' } },
      ];
    }

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) {
        const endDate = new Date(dateFin);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const reparations = await Reparation.find(query)
      .populate('client', 'nom phone phone2 email code adresse zone')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .sort({ createdAt: -1 });

    const filters = {
      search, status, categorie, client, reparateur, zone, dateDebut, dateFin,
    };

    const workbook = await excelService.exportReparations(reparations, filters);
    const filename = `reparations_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel réparations: ${reparations.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportReparations:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// POST - Export Excel des réparations (données filtrées client)
// ============================================================
exports.exportReparationsPost = async (req, res) => {
  try {
    const { reparations, filters } = req.body;

    if (!Array.isArray(reparations)) {
      return res.status(400).json({
        success: false,
        message: 'La liste des réparations est requise',
      });
    }

    const workbook = await excelService.exportReparations(
      reparations,
      filters || {}
    );
    const filename = `reparations_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel réparations (POST): ${reparations.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportReparationsPost:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// GET - Export Excel des clients (filtres serveur)
// ============================================================
exports.exportClients = async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$text = { $search: search };
    }

    const clients = await Client.find(query).sort({ createdAt: -1 });

    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const reparations = await Reparation.find({
          client: client._id,
          isDeleted: false,
        });
        const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
        const totalRestant = reparations.reduce(
          (sum, r) => sum + (r.prix - r.acompte),
          0
        );

        return {
          ...client.toObject(),
          totalReparations: reparations.length,
          totalPaye,
          totalRestant,
        };
      })
    );

    const workbook = await excelService.exportClients(clientsWithStats);
    const filename = `clients_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel clients: ${clients.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportClients:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// POST - Export Excel des clients (données filtrées client)
// ============================================================
exports.exportClientsPost = async (req, res) => {
  try {
    const { clients, filters } = req.body;

    if (!Array.isArray(clients)) {
      return res.status(400).json({
        success: false,
        message: 'La liste des clients est requise',
      });
    }

    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        if (
          client.totalReparations !== undefined &&
          client.totalPaye !== undefined &&
          client.totalRestant !== undefined
        ) {
          return client;
        }

        const clientId = client._id || client.id;
        const reparations = await Reparation.find({
          client: clientId,
          isDeleted: false,
        });
        const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
        const totalRestant = reparations.reduce(
          (sum, r) => sum + (r.prix - r.acompte),
          0
        );

        return {
          ...client,
          totalReparations: reparations.length,
          totalPaye,
          totalRestant,
        };
      })
    );

    const workbook = await excelService.exportClients(
      clientsWithStats,
      filters || {}
    );
    const filename = `clients_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel clients (POST): ${clients.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportClientsPost:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// GET - Export Excel des utilisateurs
// ============================================================
exports.exportUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const reparationsCount = await Reparation.countDocuments({
          $or: [{ reparateur: user._id }, { createdBy: user._id }],
          isDeleted: false,
        });

        return {
          ...user.toObject(),
          reparationsCount,
        };
      })
    );

    const workbook = await excelService.exportUsers(usersWithStats);
    const filename = `utilisateurs_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel utilisateurs: ${users.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportUsers:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// GET - Export Excel de l'historique
// ============================================================
exports.exportHistory = async (req, res) => {
  try {
    const { entityType, action, dateDebut, dateFin } = req.query;
    const query = {};

    if (entityType) query.entityType = entityType;
    if (action) query.action = action;

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) query.createdAt.$lte = new Date(dateFin);
    }

    const history = await History.find(query)
      .populate('user', 'username firstName lastName')
      .populate('oldStatus', 'label color')
      .populate('newStatus', 'label color')
      .sort({ createdAt: -1 })
      .limit(5000);

    const workbook = await excelService.exportHistory(history);
    const filename = `historique_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel historique: ${history.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportHistory:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// ✅ NOUVEAU : POST - Export Excel des appareils (statistiques)
// ============================================================
exports.exportAppareils = async (req, res) => {
  try {
    const { appareils, filters } = req.body;

    if (!Array.isArray(appareils)) {
      return res.status(400).json({
        success: false,
        message: 'La liste des appareils est requise',
      });
    }

    const workbook = await excelService.exportAppareils(appareils, filters || {});
    const filename = `appareils_stats_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(
      `Export Excel appareils: ${appareils.length} lignes par ${req.user.username}`
    );
  } catch (error) {
    logger.error('Erreur exportAppareils:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'export Excel",
    });
  }
};

// ============================================================
// ✅ NOUVEAU : POST - Export Excel des familles
// ============================================================
exports.exportFamilles = async (req, res) => {
  try {
    const { familles, filters } = req.body;
    if (!Array.isArray(familles)) {
      return res.status(400).json({ success: false, message: 'La liste des familles est requise' });
    }
    const workbook = await excelService.exportFamilles(familles, filters || {});
    const filename = `familles_stats_${new Date().toISOString().slice(0, 10)}.xlsx`;
    await excelService.sendWorkbook(res, workbook, filename);
    logger.info(`Export Excel familles: ${familles.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportFamilles:', error);
    res.status(500).json({ success: false, message: "Erreur lors de l'export Excel" });
  }
};

// ============================================================
// ✅ NOUVEAU : POST - Export Excel des catégories
// ============================================================
exports.exportCategories = async (req, res) => {
  try {
    const { categories, filters } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ success: false, message: 'La liste des catégories est requise' });
    }
    const workbook = await excelService.exportCategories(categories, filters || {});
    const filename = `categories_stats_${new Date().toISOString().slice(0, 10)}.xlsx`;
    await excelService.sendWorkbook(res, workbook, filename);
    logger.info(`Export Excel catégories: ${categories.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportCategories:', error);
    res.status(500).json({ success: false, message: "Erreur lors de l'export Excel" });
  }
};