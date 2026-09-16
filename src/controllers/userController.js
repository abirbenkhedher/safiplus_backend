const User = require('../models/User');
const Reparation = require('../models/Reparation');
const logger = require('../config/logger');

const AVAILABLE_MODULES = User.AVAILABLE_MODULES;
const DEFAULT_PERMISSIONS = User.DEFAULT_PERMISSIONS;

// GET - Liste des utilisateurs
exports.getAll = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(users.map(async (user) => {
      const reparationsCount = await Reparation.countDocuments({
        $or: [{ reparateur: user._id }, { createdBy: user._id }],
        isDeleted: false,
      });
      return { ...user.toObject(), reparationsCount };
    }));

    res.json({ success: true, data: usersWithStats });
  } catch (error) {
    logger.error('Erreur getAll users:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
};

// GET - Un utilisateur
exports.getOne = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error('Erreur getOne user:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// GET - Récupérer les modules disponibles
exports.getAvailableModules = async (req, res) => {
  res.json({
    success: true,
    data: {
      modules: AVAILABLE_MODULES,
      defaultPermissions: DEFAULT_PERMISSIONS,
    },
  });
};

// POST - Créer un utilisateur
exports.create = async (req, res) => {
  try {
    const { username, email, phone, password, firstName, lastName, role, isActive, permissions } = req.body;

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur ou email déjà utilisé' });
    }

    const finalPermissions = permissions && permissions.length > 0
      ? permissions
      : DEFAULT_PERMISSIONS[role || 'COMMERCIAL'];

    const user = new User({
      username,
      email,
      phone: phone || '',
      password,
      firstName,
      lastName,
      role: role || 'COMMERCIAL',
      isActive: isActive !== undefined ? isActive : true,
      permissions: finalPermissions,
    });

    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshToken;

    logger.info(`Utilisateur créé: ${user.username} (${user.role}) par ${req.user.username}`);
    res.status(201).json({ success: true, message: 'Utilisateur créé avec succès', data: userData });
  } catch (error) {
    logger.error('Erreur create user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT - Modifier un utilisateur
exports.update = async (req, res) => {
  try {
    const { username, email, phone, password, firstName, lastName, role, isActive, permissions } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (username && username !== user.username) {
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Nom d\'utilisateur déjà utilisé' });
    }

    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: user._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    }

    if (role && role !== 'ADMIN' && user.role === 'ADMIN') {
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Impossible de modifier le rôle du dernier administrateur' });
      }
    }

    const oldRole = user.role;

    if (username) user.username = username;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    if (permissions !== undefined) {
      user.permissions = permissions;
    } else if (role && role !== oldRole) {
      user.permissions = DEFAULT_PERMISSIONS[role] || [];
    }

    if (password && password.trim() !== '') {
      user.password = password;
    }

    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshToken;

    logger.info(`Utilisateur modifié: ${user.username} par ${req.user.username}`);
    res.json({ success: true, message: 'Utilisateur modifié avec succès', data: userData });
  } catch (error) {
    logger.error('Erreur update user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE - Supprimer
exports.delete = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    if (user.role === 'ADMIN') {
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    await user.deleteOne();
    logger.info(`Utilisateur supprimé: ${user.username} par ${req.user.username}`);
    res.json({ success: true, message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    logger.error('Erreur delete user:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// PATCH - Toggle status
exports.toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas modifier votre propre statut' });
    }

    if (user.role === 'ADMIN' && user.isActive) {
      const activeAdminCount = await User.countDocuments({ role: 'ADMIN', isActive: true });
      if (activeAdminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Impossible de désactiver le dernier administrateur actif' });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    logger.info(`Statut modifié: ${user.username} -> ${user.isActive ? 'Actif' : 'Inactif'}`);
    res.json({
      success: true,
      message: `Utilisateur ${user.isActive ? 'activé' : 'désactivé'} avec succès`,
      data: { _id: user._id, isActive: user.isActive },
    });
  } catch (error) {
    logger.error('Erreur toggleStatus:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};