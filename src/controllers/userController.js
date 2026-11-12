const User = require('../models/User');
const Reparation = require('../models/Reparation');
const logger = require('../config/logger');
const {
  userScopeFilter,
  sanitizeBoutiques,
  isOwnerUser,
} = require('../services/tenantService');

// ✅ Multi-tenant : un utilisateur visible par l'utilisateur courant
const findScopedUser = (req, id) =>
  User.findOne({ _id: id, ...userScopeFilter(req) });

// ✅ Admin (ou super admin) : peut tout gérer et donner toutes les permissions
const isAdminUser = (req) => ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

// ✅ Qui peut gérer quel compte :
//  - un propriétaire n'est géré que par un propriétaire
//  - un compte ADMIN n'est géré que par un admin
const canManage = (req, target) => {
  if (target.isOwner && !isOwnerUser(req.user)) return false;
  if (target.role === 'ADMIN' && !isAdminUser(req)) return false;
  return true;
};
const FORBIDDEN_MANAGE = "Vous n'avez pas le droit de gérer ce compte";

// ✅ Permissions qu'un utilisateur peut donner :
//  - admin : toutes
//  - employé ayant la permission "users" : seulement celles qu'il possède
//    (la lecture seule "x:read" si lui-même a "x" ou "x:read")
const canGrant = (req, perm) => {
  if (isAdminUser(req)) return true;
  const mine = req.user.permissions || [];
  if (mine.includes(perm)) return true;
  return perm.endsWith(':read') && mine.includes(perm.slice(0, -5));
};

/**
 * Permissions finales : celles demandées (limitées à ce que l'on peut donner)
 * + celles déjà présentes que l'on n'a pas le droit de retirer.
 */
const resolvePermissions = (req, requested, existing = []) => {
  const list = Array.isArray(requested) ? requested : [];
  const valid = [...new Set(list)].filter((p) => AVAILABLE_MODULES.includes(p) && canGrant(req, p));
  const kept = existing.filter((p) => !canGrant(req, p));
  return [...new Set([...valid, ...kept])];
};

// ✅ Nombre d'administrateurs de l'organisation
const countOrgAdmins = (req, extra = {}) =>
  User.countDocuments({ organisation: req.tenant.organisation, role: 'ADMIN', ...extra });

const AVAILABLE_MODULES = User.AVAILABLE_MODULES;
const DEFAULT_PERMISSIONS = User.DEFAULT_PERMISSIONS;

// GET - Liste des utilisateurs
exports.getAll = async (req, res) => {
  try {
    const users = await User.find(userScopeFilter(req))
      .select('-password -refreshToken')
      .populate('boutiques', 'nom code')
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
    const user = await findScopedUser(req, req.params.id)
      .select('-password -refreshToken')
      .populate('boutiques', 'nom code');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error('Erreur getOne user:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// GET - Annuaire léger des employés visibles (aucune donnée sensible)
exports.annuaire = async (req, res) => {
  const users = await User.find({ ...userScopeFilter(req) })
    .select('firstName lastName username role isActive')
    .sort({ firstName: 1 }).lean();
  res.json({ success: true, data: users });
};

// GET - Récupérer les modules disponibles
exports.getAvailableModules = async (req, res) => {
  res.json({
    success: true,
    data: {
      modules: AVAILABLE_MODULES,
      defaultPermissions: DEFAULT_PERMISSIONS,
      // ✅ Ce que l'utilisateur connecté a le droit de donner
      grantable: AVAILABLE_MODULES.filter((p) => canGrant(req, p)),
      canManageAdmins: isAdminUser(req),
    },
  });
};

// POST - Créer un utilisateur
exports.create = async (req, res) => {
  try {
    const { username, email, phone, password, firstName, lastName, role, isActive, permissions, boutiques, isOwner } = req.body;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Rôle non autorisé' });
    }
    if (role === 'ADMIN' && !isAdminUser(req)) {
      return res.status(403).json({ success: false, message: 'Seul un administrateur peut créer un compte administrateur' });
    }

    const orFilters = [{ username }];
    if (email) orFilters.push({ email });
    const existing = await User.findOne({ $or: orFilters });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur ou email déjà utilisé' });
    }

    // ✅ Permissions limitées à celles que l'utilisateur connecté peut donner
    const finalPermissions = resolvePermissions(
      req,
      permissions && permissions.length > 0 ? permissions : DEFAULT_PERMISSIONS[role || 'COMMERCIAL']
    );

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
      // ✅ Multi-tenant
      organisation: req.tenant.organisation,
      isOwner: isOwnerUser(req.user) && role === 'ADMIN' && !!isOwner,
      boutiques: sanitizeBoutiques(req, boutiques),
    });

    if (!user.isOwner && user.boutiques.length === 0) {
      return res.status(400).json({ success: false, message: 'Veuillez affecter au moins une boutique' });
    }

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
    const { username, email, phone, password, firstName, lastName, role, isActive, permissions, boutiques, isOwner } = req.body;
    const user = await findScopedUser(req, req.params.id);

    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (!canManage(req, user)) {
      return res.status(403).json({ success: false, message: FORBIDDEN_MANAGE });
    }
    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Rôle non autorisé' });
    }
    if (role === 'ADMIN' && user.role !== 'ADMIN' && !isAdminUser(req)) {
      return res.status(403).json({ success: false, message: 'Seul un administrateur peut nommer un administrateur' });
    }

    if (username && username !== user.username) {
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Nom d\'utilisateur déjà utilisé' });
    }

    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: user._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Email déjà utilisé' });
    }

    if (role && role !== 'ADMIN' && user.role === 'ADMIN') {
      const adminCount = await countOrgAdmins(req);
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

    // ✅ Permissions limitées à celles que l'utilisateur connecté peut donner
    //    (celles qu'il ne peut pas donner sont conservées telles quelles)
    if (permissions !== undefined) {
      user.permissions = resolvePermissions(req, permissions, user.permissions || []);
    } else if (role && role !== oldRole) {
      user.permissions = resolvePermissions(req, DEFAULT_PERMISSIONS[role] || [], user.permissions || []);
    }

    if (password && password.trim() !== '') {
      user.password = password;
    }

    // ✅ Multi-tenant : propriétaire + boutiques
    if (isOwnerUser(req.user) && isOwner !== undefined && user._id.toString() !== req.user.id) {
      user.isOwner = !!isOwner && user.role === 'ADMIN';
    }
    if (boutiques !== undefined) {
      // On conserve les boutiques que l'utilisateur courant ne gère pas
      const allowed = (req.tenant?.allowed || []).map(String);
      const kept = (user.boutiques || []).filter((b) => !allowed.includes(String(b)));
      user.boutiques = [...kept, ...sanitizeBoutiques(req, boutiques)];
    }
    if (!user.isOwner && (user.boutiques || []).length === 0) {
      return res.status(400).json({ success: false, message: 'Veuillez affecter au moins une boutique' });
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
    const user = await findScopedUser(req, req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (!canManage(req, user)) {
      return res.status(403).json({ success: false, message: FORBIDDEN_MANAGE });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    if (user.role === 'ADMIN') {
      const adminCount = await countOrgAdmins(req);
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
    const user = await findScopedUser(req, req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (!canManage(req, user)) {
      return res.status(403).json({ success: false, message: FORBIDDEN_MANAGE });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas modifier votre propre statut' });
    }

    if (user.role === 'ADMIN' && user.isActive) {
      const activeAdminCount = await countOrgAdmins(req, { isActive: true });
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