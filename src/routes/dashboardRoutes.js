const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', requireAuth, requirePermission('dashboard'), dashboardController.getStats);
router.get('/charts', requireAuth, requirePermission('dashboard'), dashboardController.getCharts);

module.exports = router;