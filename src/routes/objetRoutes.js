const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requirePermissionOrRead } = require('../middleware/permissions');
const objetController = require('../controllers/objetController');

router.get('/', requireAuth, requirePermissionOrRead('objets'), objetController.getAll);
router.get('/:id', requireAuth, requirePermissionOrRead('objets'), objetController.getOne);

router.post('/', requireAuth, requirePermission('objets'), objetController.create);
router.put('/:id', requireAuth, requirePermission('objets'), objetController.update);
router.delete('/:id', requireAuth, requirePermission('objets'), objetController.delete);

module.exports = router;