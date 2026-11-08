const Boutique = require('../models/Boutique');
const Organisation = require('../models/Organisation');
const User = require('../models/User');
const logger = require('../config/logger');
const { getUserBoutiques } = require('../services/tenantService');

// ============================================================
// ✅ BOUTIQUES
// - GET  /mine : boutiques accessibles à l'utilisateur connecté
// - CRUD       : propriétaire (sa propre organisation) ou SUPER_ADMIN
// ============================================================

const isSuper = (req) => req.user.role === 'SUPER_ADMIN';

/** Génère un code court unique à partir du nom (ex: "Sousse Centre" → "SOUS", "SOUS2"...). */
const generateBoutiqueCode = async (nom) => {
  const base = String(nom || 'BTQ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'BTQ';
  const padded = base.length < 2 ? `${base}X` : base;
  let code = padded;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Boutique.exists({ code })) {
    code = `${padded}${i}`.slice(0, 8);
    i += 1;
  }
  return code;
};
exports.generateBoutiqueCode = generateBoutiqueCode;

/** Boutique accessible en gestion par l'utilisateur courant. */
const findManagedBoutique = (req, id) => {
  const query = { _id: id };
  if (!isSuper(req)) query.organisation = req.user.organisation;
  return Boutique.findOne(query);
};

// GET /api/boutiques/mine
exports.getMine = async (req, res) => {
  try {
    const data = await getUserBoutiques(req.user);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur getMine boutiques:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// GET /api/boutiques  (?organisation=... pour le SUPER_ADMIN)
exports.getAll = async (req, res) => {
  try {
    const query = {};
    if (isSuper(req)) {
      if (req.query.organisation) query.organisation = req.query.organisation;
    } else {
      query.organisation = req.user.organisation;
    }

    const boutiques = await Boutique.find(query).sort({ nom: 1 }).lean();

    // Nombre d'employés par boutique
    const counts = await User.aggregate([
      { $match: { boutiques: { $in: boutiques.map((b) => b._id) } } },
      { $unwind: '$boutiques' },
      { $group: { _id: '$boutiques', count: { $sum: 1 } } },
    ]);

    const data = boutiques.map((b) => ({
      ...b,
      usersCount: counts.find((c) => String(c._id) === String(b._id))?.count || 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Erreur getAll boutiques:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
};

// POST /api/boutiques
exports.create = async (req, res) => {
  try {
    const { nom, code, adresse, telephone, email } = req.body || {};
    const organisationId = isSuper(req) ? req.body.organisation : req.user.organisation;

    if (!organisationId) {
      return res.status(400).json({ success: false, message: "L'organisation est obligatoire" });
    }
    if (!nom) {
      return res.status(400).json({ success: false, message: 'Le nom est obligatoire' });
    }

    const org = await Organisation.findById(organisationId);
    if (!org) return res.status(404).json({ success: false, message: 'Organisation non trouvée' });

    if (org.maxBoutiques > 0) {
      const count = await Boutique.countDocuments({ organisation: org._id });
      if (count >= org.maxBoutiques) {
        return res.status(400).json({
          success: false,
          message: `Limite atteinte : ${org.maxBoutiques} boutique(s) maximum pour cette organisation`,
        });
      }
    }

    const boutique = await Boutique.create({
      organisation: org._id,
      nom,
      code: code || (await generateBoutiqueCode(nom)),
      adresse,
      telephone,
      email,
    });

    logger.info(`Boutique créée: ${boutique.nom} (${boutique.code}) par ${req.user.username}`);
    res.status(201).json({ success: true, message: 'Boutique créée avec succès', data: boutique });
  } catch (error) {
    logger.error('Erreur create boutique:', error);
    const message = error.code === 11000 ? 'Nom ou code de boutique déjà utilisé' : error.message;
    res.status(400).json({ success: false, message });
  }
};

// PUT /api/boutiques/:id
exports.update = async (req, res) => {
  try {
    const boutique = await findManagedBoutique(req, req.params.id);
    if (!boutique) return res.status(404).json({ success: false, message: 'Boutique non trouvée' });

    // ⚠️ Le code n'est pas modifiable : il préfixe les numéros de réparation
    const fields = ['nom', 'adresse', 'telephone', 'email'];
    for (const f of fields) {
      if (req.body[f] !== undefined) boutique[f] = req.body[f];
    }
    await boutique.save();

    res.json({ success: true, message: 'Boutique modifiée', data: boutique });
  } catch (error) {
    logger.error('Erreur update boutique:', error);
    const message = error.code === 11000 ? 'Ce nom est déjà utilisé' : error.message;
    res.status(400).json({ success: false, message });
  }
};

// PATCH /api/boutiques/:id/status
exports.toggleStatus = async (req, res) => {
  try {
    const boutique = await findManagedBoutique(req, req.params.id);
    if (!boutique) return res.status(404).json({ success: false, message: 'Boutique non trouvée' });

    if (boutique.isActive) {
      const activeCount = await Boutique.countDocuments({
        organisation: boutique.organisation,
        isActive: true,
      });
      if (activeCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de désactiver la dernière boutique active',
        });
      }
    }

    boutique.isActive = !boutique.isActive;
    await boutique.save();

    res.json({
      success: true,
      message: `Boutique ${boutique.isActive ? 'activée' : 'désactivée'}`,
      data: { _id: boutique._id, isActive: boutique.isActive },
    });
  } catch (error) {
    logger.error('Erreur toggleStatus boutique:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};
