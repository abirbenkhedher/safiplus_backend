const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateLogin } = require('../utils/validators');
const logger = require('../config/logger');

// Générer les tokens
const generateTokens = (user) => {
  const payload = { id: user._id, username: user.username, role: user.role };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

// Login
const login = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ success: false, message: 'Données manquantes' });
    }

    const { username, password } = req.body;

    const { error } = validateLogin(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // ✅ Recherche INSENSIBLE à la casse
    // On échappe les caractères regex pour éviter les injections
    const escaped = String(username).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const user = await User.findOne({
      username: { $regex: `^${escaped}$`, $options: 'i' },
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Nom d'utilisateur ou mot de passe incorrect",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Compte désactivé. Contactez l'administrateur.",
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Nom d'utilisateur ou mot de passe incorrect",
      });
    }

    // ✅ Réinitialiser lastActivity à chaque login
    const now = new Date();
    user.lastLogin = now;
    user.lastActivity = now;

    const { accessToken, refreshToken } = generateTokens(user);

    user.refreshToken = refreshToken;
    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshToken;

    if (!userData.permissions || !Array.isArray(userData.permissions)) {
      userData.permissions = User.DEFAULT_PERMISSIONS[userData.role] || [];
    }

    logger.info(`Utilisateur connecté: ${user.username} (${user.role})`);

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: { user: userData, accessToken, refreshToken },
    });
  } catch (error) {
    logger.error('Erreur lors du login:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la connexion' });
  }
};

// Rafraîchir le token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token manquant' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token invalide' });
    }

    // ✅ Mettre à jour lastActivity lors du refresh
    user.lastActivity = new Date();

    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({ success: true, message: 'Token rafraîchi', data: tokens });
  } catch (error) {
    logger.error('Erreur refresh token:', error);
    res.status(401).json({ success: false, message: 'Refresh token invalide ou expiré' });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      // ⚠️ NE PAS toucher à isActive, NE PAS désactiver le compte
      await user.save();
    }

    logger.info(`Utilisateur déconnecté: ${req.user.username}`);
    res.json({ success: true, message: 'Déconnexion réussie' });
  } catch (error) {
    logger.error('Erreur logout:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la déconnexion' });
  }
};

// Obtenir l'utilisateur connecté
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -refreshToken');

    const userData = user.toObject();
    if (!userData.permissions || !Array.isArray(userData.permissions)) {
      userData.permissions = User.DEFAULT_PERMISSIONS[userData.role] || [];
    }

    res.json({ success: true, data: userData });
  } catch (error) {
    logger.error('Erreur getMe:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
};

module.exports = { login, refreshToken, logout, getMe };