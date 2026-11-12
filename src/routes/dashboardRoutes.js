const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const dashboardController = require('../controllers/dashboardController');

router.get('/stats', requireAuth, requirePermission('dashboard'), dashboardController.getStats);
router.get('/charts', requireAuth, requirePermission('dashboard'), dashboardController.getCharts);
// ✅ Tableau de bord personnel (réparateur / commercial ; l'admin peut passer ?user=<id>)
router.get('/me', requireAuth, requirePermission('mon_dashboard'), require('../controllers/monDashboardController').getMe);

module.exports = router;