const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ✅ Toutes les routes nécessitent l'authentification
router.use(requireAuth);

// ============================================================
// ✅ GET : lecture OUVERTE à tout utilisateur authentifié
//    (les zones sont un référentiel non sensible utilisé par
//     tous les rôles dans les formulaires client/réparation)
// ============================================================
router.get('/', zoneController.getAll);
router.get('/:id', zoneController.getOne);

// ============================================================
// ✅ POST/PUT : écriture avec permission "zones" OU "clients" OU ADMIN
// ============================================================
const canWrite = (req, res, next) => {
  const user = req.user;
  const ok =
    user.role === 'ADMIN' ||
    user.permissions?.includes('zones') ||
    user.permissions?.includes('clients');
  if (!ok) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Permission "zones" ou "clients" requise.',
    });
  }
  next();
};

router.post('/', canWrite, zoneController.create);
router.put('/:id', canWrite, zoneController.update);

// ============================================================
// ✅ DELETE : ADMIN uniquement
// ============================================================
router.delete('/:id', requireAdmin, zoneController.delete);

module.exports = router;