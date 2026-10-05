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
      Client.countDocuments(query),
    ]);

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
        const lastReparation =
          reparations.length > 0 ? reparations[reparations.length - 1] : null;

        return {
          ...client.toObject(),
          totalReparations: reparations.length,
          totalPaye,
          totalRestant,
          lastReparation: lastReparation?.createdAt || null,
        };
      })
    );

    res.json({
      success: true,
      data: clientsWithStats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Erreur getAll clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des clients',
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
        message: 'Client non trouvé',
      });
    }

    const reparations = await Reparation.find({
      client: client._id,
      isDeleted: false,
    })
      .populate('status', 'label color')
      .populate('objet', 'nom')
      .populate('categorie', 'nom')
      .populate('marque', 'nom')   // ✅ AJOUT
      .populate('modele', 'nom')   // ✅ AJOUT
      .sort({ createdAt: -1 });

    const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
    const totalRestant = reparations.reduce(
      (sum, r) => sum + (r.prix - r.acompte),
      0
    );

    res.json({
      success: true,
      data: {
        client,
        reparations,
        stats: {
          totalReparations: reparations.length,
          totalPaye,
          totalRestant,
        },
      },
    });
  } catch (error) {
    logger.error('Erreur getOne client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du client',
    });
  }
};

// ============================================================
// POST - Créer un client
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, phone, phone2, email, adresse, zone, codeFidelite } = req.body;

    if (!nom || !nom.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Le nom est obligatoire' });
    }
    if (!phone || !phone.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Le téléphone est obligatoire' });
    }

    // Ne PAS vérifier l'unicité si c'est le numéro par défaut
    if (!isDefaultPhone(phone)) {
      const existing = await Client.findOne({ phone: phone.trim() });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà',
        });
      }
    }

    // ✅ Vérifier l'unicité du code fidélité SI fourni manuellement
    if (codeFidelite && codeFidelite.trim()) {
      const existingFid = await Client.findOne({
        codeFidelite: codeFidelite.trim().toUpperCase(),
      });
      if (existingFid) {
        return res.status(400).json({
          success: false,
          message: 'Ce code fidélité existe déjà',
        });
      }
    }

    const clientData = {
      nom: nom.trim(),
      phone: phone.trim(),
      adresse: adresse?.trim() || undefined,
      zone: zone?.trim() || undefined,
    };

    if (codeFidelite && codeFidelite.trim()) {
      clientData.codeFidelite = codeFidelite.trim().toUpperCase();
    }

    if (phone2 && phone2.trim() !== '') {
      clientData.phone2 = phone2.trim();
    }

    if (email && email.trim() !== '') {
      clientData.email = email.trim();
    }

    const client = new Client(clientData);
    await client.save();

    logger.info(
      `Client créé: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.status(201).json({
      success: true,
      message: 'Client créé avec succès',
      data: client,
    });
  } catch (error) {
    logger.error('Erreur create client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création du client',
    });
  }
};

// ============================================================
// PUT - Modifier un client
// ============================================================
exports.update = async (req, res) => {
  try {
    const {
      nom,
      phone,
      phone2,
      email,
      adresse,
      zone,
      codeFidelite,
      isActive,
    } = req.body;

    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    // Vérifier unicité téléphone
    if (phone && phone !== client.phone && !isDefaultPhone(phone)) {
      const existing = await Client.findOne({
        phone,
        _id: { $ne: client._id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà',
        });
      }
    }

    // ✅ Vérifier unicité code fidélité SI modifié
    if (codeFidelite !== undefined && codeFidelite !== client.codeFidelite) {
      if (codeFidelite && codeFidelite.trim()) {
        const existingFid = await Client.findOne({
          codeFidelite: codeFidelite.trim().toUpperCase(),
          _id: { $ne: client._id },
        });
        if (existingFid) {
          return res.status(400).json({
            success: false,
            message: 'Ce code fidélité existe déjà',
          });
        }
      }
    }

    client.nom = nom || client.nom;
    client.phone = phone || client.phone;
    client.adresse = adresse !== undefined ? adresse : client.adresse;
    client.zone = zone !== undefined ? zone : client.zone;

    if (codeFidelite !== undefined) {
      client.codeFidelite = codeFidelite
        ? codeFidelite.trim().toUpperCase()
        : client.codeFidelite;
    }

    client.isActive = isActive !== undefined ? isActive : client.isActive;

    if (phone2 !== undefined) {
      client.phone2 = phone2 && phone2.trim() !== '' ? phone2.trim() : null;
    }

    if (email !== undefined) {
      client.email = email && email.trim() !== '' ? email.trim() : null;
    }

    await client.save();

    logger.info(
      `Client modifié: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.json({
      success: true,
      message: 'Client modifié avec succès',
      data: client,
    });
  } catch (error) {
    logger.error('Erreur update client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la modification du client',
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
        message: 'Le numéro de téléphone ou le code fidélité est obligatoire',
      });
    }

    const input = String(phone).trim();

    const isFideliteSearch = /^FID-/i.test(input) || /[A-Za-z]/.test(input);

    if (isFideliteSearch) {
      const client = await Client.findOne({
        codeFidelite: { $regex: `^${input}$`, $options: 'i' },
      });

      if (client) {
        return res.json({
          success: true,
          data: client,
          exists: true,
        });
      }

      return res.json({
        success: true,
        data: null,
        exists: false,
      });
    }

    const cleanPhone = input.replace(/[^0-9]/g, '');

    if (cleanPhone === DEFAULT_PHONE) {
      return res.json({
        success: true,
        data: null,
        exists: false,
      });
    }

    if (cleanPhone.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Numéro trop court',
      });
    }

    const clients = await Client.find({});
    const foundClient = clients.find((c) => {
      const cPhone = (c.phone || '').replace(/[^0-9]/g, '');
      const cPhone2 = (c.phone2 || '').replace(/[^0-9]/g, '');
      if (cPhone === DEFAULT_PHONE) return false;
      return (
        cPhone.includes(cleanPhone) ||
        cleanPhone.includes(cPhone) ||
        (cPhone2 &&
          (cPhone2.includes(cleanPhone) || cleanPhone.includes(cPhone2)))
      );
    });

    if (foundClient) {
      return res.json({
        success: true,
        data: foundClient,
        exists: true,
      });
    }

    res.json({
      success: true,
      data: null,
      exists: false,
    });
  } catch (error) {
    logger.error('Erreur findByPhone:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche',
    });
  }
};

// ============================================================
// ✅ DELETE - Supprimer un client (+ réparations en cascade)
// ============================================================
exports.delete = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    // ✅ Compter et supprimer en cascade (soft delete) les réparations
    const reparationsCount = await Reparation.countDocuments({
      client: client._id,
      isDeleted: false,
    });

    if (reparationsCount > 0) {
      await Reparation.updateMany(
        { client: client._id, isDeleted: false },
        { $set: { isDeleted: true } }
      );

      logger.info(
        `${reparationsCount} réparation(s) supprimée(s) en cascade pour le client ${client.nom}`
      );
    }

    await client.deleteOne();

    logger.info(
      `Client supprimé: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.json({
      success: true,
      message:
        reparationsCount > 0
          ? `Client "${client.nom}" supprimé ainsi que ${reparationsCount} réparation(s)`
          : `Client "${client.nom}" supprimé avec succès`,
      deletedReparations: reparationsCount,
    });
  } catch (error) {
    logger.error('Erreur delete client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du client',
    });
  }
};

// ============================================================
// ✅ DELETE - Supprimer plusieurs clients (+ réparations en cascade)
// ============================================================
exports.deleteMany = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client à supprimer',
      });
    }

    // Vérifier que les clients existent
    const clients = await Client.find({ _id: { $in: ids } });
    const validIds = clients.map((c) => c._id);

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client valide trouvé',
      });
    }

    // ✅ Supprimer en cascade les réparations (soft delete)
    const reparationsResult = await Reparation.updateMany(
      { client: { $in: validIds }, isDeleted: false },
      { $set: { isDeleted: true } }
    );

    // Supprimer les clients
    const result = await Client.deleteMany({ _id: { $in: validIds } });

    logger.info(
      `${result.deletedCount} client(s) et ${reparationsResult.modifiedCount} réparation(s) supprimé(s) par ${req.user.username}`
    );

    res.json({
      success: true,
      message: `${result.deletedCount} client(s) supprimé(s)${
        reparationsResult.modifiedCount > 0
          ? ` avec ${reparationsResult.modifiedCount} réparation(s) en cascade`
          : ''
      }`,
      deletedCount: result.deletedCount,
      deletedReparations: reparationsResult.modifiedCount,
    });
  } catch (error) {
    logger.error('Erreur deleteMany clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression multiple',
    });
  }
};