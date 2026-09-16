const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const exportController = require('../controllers/exportController');

router.get('/reparations', requireAuth, requirePermission('reparations'), exportController.exportReparations);
router.get('/clients', requireAuth, requirePermission('clients'), exportController.exportClients);
router.get('/users', requireAuth, requirePermission('users'), exportController.exportUsers);
router.get('/history', requireAuth, requirePermission('history'), exportController.exportHistory);

module.exports = router;