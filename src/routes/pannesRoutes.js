const express = require('express');
const router = express.Router();
const panneController = require('../controllers/panneController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ✅ Toutes les routes nécessitent l'authentification
router.use(requireAuth);

// ============================================================
// ✅ GET : Lecture accessible aux rôles avec pannes OU pannes:read
// ============================================================
router.get('/', (req, res, next) => {
  const user = req.user;
  const hasAccess =
    user.role === 'ADMIN' ||
    user.permissions?.includes('pannes') ||
    user.permissions?.includes('pannes:read');

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permission "pannes" ou "pannes:read" requise.',
    });
  }
  next();
}, panneController.getAll);

router.get('/:id', (req, res, next) => {
  const user = req.user;
  const hasAccess =
    user.role === 'ADMIN' ||
    user.permissions?.includes('pannes') ||
    user.permissions?.includes('pannes:read');

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permission "pannes" ou "pannes:read" requise.',
    });
  }
  next();
}, panneController.getOne);

// ============================================================
// ✅ POST/PUT : Écriture accessible avec "pannes" OU ADMIN
// ============================================================
router.post('/', (req, res, next) => {
  const user = req.user;
  const hasAccess =
    user.role === 'ADMIN' ||
    user.permissions?.includes('pannes');

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permission "pannes" requise.',
    });
  }
  next();
}, panneController.create);

router.put('/:id', (req, res, next) => {
  const user = req.user;
  const hasAccess =
    user.role === 'ADMIN' ||
    user.permissions?.includes('pannes');

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permission "pannes" requise.',
    });
  }
  next();
}, panneController.update);

// ============================================================
// ✅ DELETE : ADMIN uniquement
// ============================================================
router.delete('/:id', requireAdmin, panneController.delete);

module.exports = router;