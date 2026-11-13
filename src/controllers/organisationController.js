const mongoose = require('mongoose');
const Organisation = require('../models/Organisation');
const Boutique = require('../models/Boutique');
const User = require('../models/User');
const logger = require('../config/logger');
const { generateBoutiqueCode } = require('./boutiqueController');

// ============================================================
// ✅ ORGANISATIONS — réservé au SUPER_ADMIN
// ============================================================

// GET /api/organisations
exports.getAll = async (req, res) => {
  try {
    const orgs = await Organisation.find().sort({ createdAt: -1 }).lean();
    const ids = orgs.map((o) => o._id);

    const [boutiques, owners, usersCount] = await Promise.all([
      Boutique.find({ organisation: { $in: ids } }).select('organisation nom code isActive').lean(),
      User.find({ organisation: { $in: ids }, isOwner: true })
        .select('organisation username firstName lastName email phone isActive')
        .lean(),
      User.aggregate([
        { $match: { organisation: { $in: ids } } },
        { $group: { _id: '$organisation', count: { $sum: 1 } } },
      ]),
    ]);

    const data = orgs.map((o) => {
      const id = String(o._id);
      return {
        ...o,
        boutiques: boutiques.filter((b) => String(b.organisation) === id),
        owners: owners.filter((u) => String(u.organisation) === id),
        usersCount: usersCount.find((u) => String(u._id) === id)?.count || 0,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur getAll organisations:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
};

// GET /api/organisations/:id
exports.getOne = async (req, res) => {
  try {
    const org = await Organisation.findById(req.params.id).lean();
    if (!org) return res.status(404).json({ success: false, message: 'Organisation non trouvée' });

    const [boutiques, users] = await Promise.all([
      Boutique.find({ organisation: org._id }).sort({ nom: 1 }).lean(),
      User.find({ organisation: org._id })
        .select('username firstName lastName email phone role isOwner isActive boutiques')
        .lean(),
    ]);

    res.json({ success: true, data: { ...org, boutiques, users } });
  } catch (error) {
    logger.error('Erreur getOne organisation:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// POST /api/organisations
// body: { nom, telephone, email, adresse, maxBoutiques,
//         boutique: { nom, code, adresse, telephone },
//         owner: { username, password, firstName, lastName, email, phone } }
exports.create = async (req, res) => {
  const { nom, telephone, email, adresse, maxBoutiques, boutique = {}, owner = {} } = req.body || {};

  if (!nom || !owner.username || !owner.password || !owner.firstName || !owner.lastName) {
    return res.status(400).json({
      success: false,
      message: "Nom de l'organisation et compte propriétaire (identifiant, mot de passe, prénom, nom) obligatoires",
    });
  }

  let org = null;
  let shop = null;
  try {
    const usernameEscaped = String(owner.username).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingUser = await User.findOne({
      username: { $regex: `^${usernameEscaped}$`, $options: 'i' },
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Ce nom d'utilisateur est déjà utilisé" });
    }

    org = await Organisation.create({
      nom, telephone, email, adresse, maxBoutiques,
      // ✅ Formule : gestion commerciale incluse ou non (défaut : incluse)
      modules: { commercial: req.body?.modules?.commercial !== false },
    });

    const boutiqueNom = boutique.nom || nom;
    shop = await Boutique.create({
      organisation: org._id,
      nom: boutiqueNom,
      code: boutique.code || (await generateBoutiqueCode(boutiqueNom)),
      adresse: boutique.adresse || adresse || '',
      telephone: boutique.telephone || telephone || '',
    });

    const user = await User.create({
      username: owner.username,
      password: owner.password,
      firstName: owner.firstName,
      lastName: owner.lastName,
      email: owner.email || undefined,
      phone: owner.phone || '',
      role: 'ADMIN',
      isOwner: true,
      organisation: org._id,
      boutiques: [shop._id],
    });

    logger.info(`Organisation créée: ${org.nom} (propriétaire ${user.username}) par ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Organisation créée avec succès',
      data: { organisation: org, boutique: shop, owner: { _id: user._id, username: user.username } },
    });
  } catch (error) {
    // Nettoyage en cas d'échec partiel
    if (shop) await Boutique.deleteOne({ _id: shop._id }).catch(() => {});
    if (org) await Organisation.deleteOne({ _id: org._id }).catch(() => {});
    logger.error('Erreur create organisation:', error);
    const message = error.code === 11000 ? 'Nom ou code déjà utilisé' : error.message;
    res.status(400).json({ success: false, message });
  }
};

// PUT /api/organisations/:id
exports.update = async (req, res) => {
  try {
    const org = await Organisation.findById(req.params.id);
    if (!org) return res.status(404).json({ success: false, message: 'Organisation non trouvée' });

    const fields = ['nom', 'telephone', 'email', 'adresse', 'maxBoutiques', 'isActive'];
    for (const f of fields) {
      if (req.body[f] !== undefined) org[f] = req.body[f];
    }
    // ✅ Modules souscrits (super admin)
    if (req.body.modules && typeof req.body.modules.commercial === 'boolean') {
      org.set('modules.commercial', req.body.modules.commercial);
    }
    await org.save();

    res.json({ success: true, message: 'Organisation modifiée', data: org });
  } catch (error) {
    logger.error('Erreur update organisation:', error);
    const message = error.code === 11000 ? 'Ce nom est déjà utilisé' : error.message;
    res.status(400).json({ success: false, message });
  }
};

// PATCH /api/organisations/:id/status
exports.toggleStatus = async (req, res) => {
  try {
    const org = await Organisation.findById(req.params.id);
    if (!org) return res.status(404).json({ success: false, message: 'Organisation non trouvée' });

    org.isActive = !org.isActive;
    await org.save();

    res.json({
      success: true,
      message: `Organisation ${org.isActive ? 'activée' : 'désactivée'}`,
      data: { _id: org._id, isActive: org.isActive },
    });
  } catch (error) {
    logger.error('Erreur toggleStatus organisation:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// POST /api/organisations/:id/owners — ajouter un propriétaire
exports.addOwner = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const org = await Organisation.findById(req.params.id);
    if (!org) return res.status(404).json({ success: false, message: 'Organisation non trouvée' });

    const { username, password, firstName, lastName, email, phone } = req.body || {};
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ success: false, message: "Nom d'utilisateur déjà utilisé" });

    const user = await User.create({
      username, password, firstName, lastName,
      email: email || undefined,
      phone: phone || '',
      role: 'ADMIN',
      isOwner: true,
      organisation: org._id,
    });

    res.status(201).json({ success: true, message: 'Propriétaire ajouté', data: { _id: user._id, username } });
  } catch (error) {
    logger.error('Erreur addOwner:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};
