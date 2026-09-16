const express = require('express');
const router = express.Router();
const { 
  login, 
  refreshToken, 
  logout, 
  getMe 
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Routes publiques
router.post('/login', login);
router.post('/refresh', refreshToken);

// Routes protégées
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

module.exports = router;