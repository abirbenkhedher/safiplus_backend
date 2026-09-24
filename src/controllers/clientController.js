const Client = require('../models/Client');
const Reparation = require('../models/Reparation');
const logger = require('../config/logger');

// ============================================================
// ✅ CONSTANTE : numéro par défaut (client sans téléphone)
// ============================================================
const DEFAULT_PHONE = '00000000';

// ============================================================
// ✅ Helper : vérifie si un numéro est le numéro par défaut
// ============================================================
const isDefaultPhone = (phone) => {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  return cleaned === DEFAULT_PHONE;
};

// ============================================================
// GET - Liste des clients avec recherche
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const { search, isActive, limit = 100, page = 1 } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [clients, total] = await Promise.all([
      Client.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Client.countDocuments(query)
    ]);

    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const reparations = await Reparation.find({ client: client._id, isDeleted: false });
      const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
      const totalRestant = reparations.reduce((sum, r) => sum + (r.prix - r.acompte), 0);
      const lastReparation = reparations.length > 0 ? reparations[reparations.length - 1] : null;

      return {
        ...client.toObject(),
        totalReparations: reparations.length,
        totalPaye,
        totalRestant,
        lastReparation: lastReparation?.createdAt || null
      };
    }));

    res.json({
      success: true,
      data: clientsWithStats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Erreur getAll clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des clients'
    });
  }
};

// ============================================================
// GET - Un client par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    const reparations = await Reparation.find({ client: client._id, isDeleted: false })
      .populate('status', 'label color')
      .populate('objet', 'nom')
      .populate('categorie', 'nom')
      .sort({ createdAt: -1 });

    const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
    const totalRestant = reparations.reduce((sum, r) => sum + (r.prix - r.acompte), 0);

    res.json({
      success: true,
      data: {
        client,
        reparations,
        stats: {
          totalReparations: reparations.length,
          totalPaye,
          totalRestant
        }
      }
    });
  } catch (error) {
    logger.error('Erreur getOne client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du client'
    });
  }
};

// ============================================================
// POST - Créer un client
// ============================================================
exports.create = async (req, res) => {
  try {
const { nom, phone, phone2, email, adresse, zone } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({ success: false, message: 'Le nom est obligatoire' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Le téléphone est obligatoire' });
    }

    // ✅ Ne PAS vérifier l'unicité si c'est le numéro par défaut
    if (!isDefaultPhone(phone)) {
      const existing = await Client.findOne({ phone: phone.trim() });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà'
        });
      }
    }

    // Créer le client
    const clientData = {
      nom: nom.trim(),
      phone: phone.trim(),
      adresse: adresse?.trim() || undefined,
        zone: zone?.trim() || undefined,   // ✅ NOUVEAU

    };

    if (phone2 && phone2.trim() !== '') {
      clientData.phone2 = phone2.trim();
    }

    if (email && email.trim() !== '') {
      clientData.email = email.trim();
    }

    const client = new Client(clientData);
    await client.save();

    logger.info(`Client créé: ${client.nom} (${client.code}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Client créé avec succès',
      data: client
    });
  } catch (error) {
    logger.error('Erreur create client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création du client'
    });
  }
};

// ============================================================
// PUT - Modifier un client
// ============================================================
exports.update = async (req, res) => {
  try {
const { nom, phone, phone2, email, adresse, zone, isActive } = req.body;
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    // ✅ Vérifier l'unicité SEULEMENT si ce n'est PAS le numéro par défaut
    if (phone && phone !== client.phone && !isDefaultPhone(phone)) {
      const existing = await Client.findOne({ phone, _id: { $ne: client._id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà'
        });
      }
    }

    client.nom = nom || client.nom;
    client.phone = phone || client.phone;
    client.adresse = adresse !== undefined ? adresse : client.adresse;
    client.zone = zone !== undefined ? zone : client.zone;   // ✅ NOUVEAU

    client.isActive = isActive !== undefined ? isActive : client.isActive;

    if (phone2 !== undefined) {
      client.phone2 = phone2 && phone2.trim() !== '' ? phone2.trim() : null;
    }

    if (email !== undefined) {
      client.email = email && email.trim() !== '' ? email.trim() : null;
    }

    await client.save();

    logger.info(`Client modifié: ${client.nom} (${client.code}) par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Client modifié avec succès',
      data: client
    });
  } catch (error) {
    logger.error('Erreur update client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la modification du client'
    });
  }
};

// ============================================================
// GET - Rechercher un client par téléphone
// ============================================================
exports.findByPhone = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone est obligatoire'
      });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // ✅ Ne PAS chercher si c'est le numéro par défaut
    if (cleanPhone === DEFAULT_PHONE) {
      return res.json({
        success: true,
        data: null,
        exists: false
      });
    }

    if (cleanPhone.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Numéro trop court'
      });
    }

    const clients = await Client.find({});
    const foundClient = clients.find(c => {
      const cPhone = (c.phone || '').replace(/[^0-9]/g, '');
      const cPhone2 = (c.phone2 || '').replace(/[^0-9]/g, '');
      // ✅ Ignorer les clients avec le numéro par défaut
      if (cPhone === DEFAULT_PHONE) return false;
      return (
        cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone) ||
        (cPhone2 && (cPhone2.includes(cleanPhone) || cleanPhone.includes(cPhone2)))
      );
    });

    if (foundClient) {
      return res.json({
        success: true,
        data: foundClient,
        exists: true
      });
    }

    res.json({
      success: true,
      data: null,
      exists: false
    });
  } catch (error) {
    logger.error('Erreur findByPhone:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche'
    });
  }
};

// ============================================================
// DELETE - Supprimer un client
// ============================================================
exports.delete = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé'
      });
    }

    const reparationsCount = await Reparation.countDocuments({ client: client._id, isDeleted: false });
    if (reparationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer ce client car il a ${reparationsCount} réparation(s)`
      });
    }

    await client.deleteOne();

    logger.info(`Client supprimé: ${client.nom} (${client.code}) par ${req.user.username}`);

    res.json({
      success: true,
      message: 'Client supprimé avec succès'
    });
  } catch (error) {
    logger.error('Erreur delete client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du client'
    });
  }
};