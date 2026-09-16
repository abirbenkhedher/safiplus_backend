const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const userController = require('../controllers/userController');

// ✅ Route pour récupérer les modules disponibles (accessible à tous les authentifiés)
router.get('/meta/modules', requireAuth, userController.getAvailableModules);

// ✅ Routes avec permission granulaire "users"
router.get('/', requireAuth, requirePermission('users'), userController.getAll);
router.get('/:id', requireAuth, requirePermission('users'), userController.getOne);
router.post('/', requireAuth, requirePermission('users'), userController.create);
router.put('/:id', requireAuth, requirePermission('users'), userController.update);
router.delete('/:id', requireAuth, requirePermission('users'), userController.delete);
router.patch('/:id/status', requireAuth, requirePermission('users'), userController.toggleStatus);

module.exports = router;