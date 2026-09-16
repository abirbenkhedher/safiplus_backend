const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requirePermissionOrRead } = require('../middleware/permissions');
const statusController = require('../controllers/statusController');

router.get('/', requireAuth, requirePermissionOrRead('statuses'), statusController.getAll);
router.get('/:id', requireAuth, requirePermissionOrRead('statuses'), statusController.getOne);

router.post('/', requireAuth, requirePermission('statuses'), statusController.create);
router.put('/:id', requireAuth, requirePermission('statuses'), statusController.update);
router.delete('/:id', requireAuth, requirePermission('statuses'), statusController.delete);
router.patch('/:id/default', requireAuth, requirePermission('statuses'), statusController.setDefault);

module.exports = router;