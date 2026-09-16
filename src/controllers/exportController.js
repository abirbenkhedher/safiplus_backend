const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const User = require('../models/User');
const History = require('../models/History');
const excelService = require('../services/excelService');
const logger = require('../config/logger');

// GET - Export Excel des réparations
exports.exportReparations = async (req, res) => {
  try {
    const {
      search,
      status,
      client,
      reparateur,
      createdBy,
      dateDebut,
      dateFin
    } = req.query;

    const query = { isDeleted: false };

    if (status) query.status = status;
    if (client) query.client = client;
    if (reparateur) query.reparateur = reparateur;
    if (createdBy) query.createdBy = createdBy;

    if (search) {
      query.$or = [
        { numero: { $regex: search, $options: 'i' } },
        { marque: { $regex: search, $options: 'i' } },
        { modele: { $regex: search, $options: 'i' } },
        { problemeDeclare: { $regex: search, $options: 'i' } }
      ];
    }

    if (dateDebut || dateFin) {
      query.createdAt = {};
      if (dateDebut) query.createdAt.$gte = new Date(dateDebut);
      if (dateFin) query.createdAt.$lte = new Date(dateFin);
    }

    const reparations = await Reparation.find(query)
      .populate('client', 'nom phone email code')
      .populate('status', 'label color')
      .populate('categorie', 'nom')
      .populate('objet', 'nom')
      .populate('createdBy', 'username firstName lastName')
      .populate('reparateur', 'username firstName lastName')
      .sort({ createdAt: -1 });

    const filters = {
      'Recherche': search,
      'Statut': status,
      'Client': client,
      'Réparateur': reparateur,
      'Date début': dateDebut,
      'Date fin': dateFin
    };

    const workbook = await excelService.exportReparations(reparations, filters);
    const filename = `reparations_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(`Export Excel réparations: ${reparations.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportReparations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export Excel'
    });
  }
};

// GET - Export Excel des clients
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

    // Ajouter les statistiques
    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const reparations = await Reparation.find({ client: client._id, isDeleted: false });
      const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
      const totalRestant = reparations.reduce((sum, r) => sum + (r.prix - r.acompte), 0);

      return {
        ...client.toObject(),
        totalReparations: reparations.length,
        totalPaye,
        totalRestant
      };
    }));

    const workbook = await excelService.exportClients(clientsWithStats);
    const filename = `clients_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(`Export Excel clients: ${clients.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportClients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export Excel'
    });
  }
};

// GET - Export Excel des utilisateurs
exports.exportUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(users.map(async (user) => {
      const reparationsCount = await Reparation.countDocuments({
        $or: [
          { reparateur: user._id },
          { createdBy: user._id }
        ],
        isDeleted: false
      });

      return {
        ...user.toObject(),
        reparationsCount
      };
    }));

    const workbook = await excelService.exportUsers(usersWithStats);
    const filename = `utilisateurs_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await excelService.sendWorkbook(res, workbook, filename);

    logger.info(`Export Excel utilisateurs: ${users.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export Excel'
    });
  }
};

// GET - Export Excel de l'historique
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

    logger.info(`Export Excel historique: ${history.length} lignes par ${req.user.username}`);
  } catch (error) {
    logger.error('Erreur exportHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export Excel'
    });
  }
};