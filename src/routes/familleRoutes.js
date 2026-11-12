const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requirePermissionOrRead, requireAnyPermission } = require('../middleware/permissions');
const familleController = require('../controllers/familleController');

// Lecture aussi avec « réparations » : le formulaire de réparation a besoin des familles
router.get('/', requireAuth, requireAnyPermission(['familles', 'familles:read', 'reparations', 'depenses']), familleController.getAll);
router.get('/:id', requireAuth, requirePermissionOrRead('familles'), familleController.getOne);

router.post('/', requireAuth, requirePermission('familles'), familleController.create);
router.put('/:id', requireAuth, requirePermission('familles'), familleController.update);
router.delete('/:id', requireAuth, requirePermission('familles'), familleController.delete);

module.exports = router;