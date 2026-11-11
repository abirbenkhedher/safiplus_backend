const express = require('express');
const router = express.Router();
const c = require('../controllers/rapportsController');
const { requireAuth } = require('../middleware/auth');
const { requireAnyPermission, requirePermission } = require('../middleware/permissions');

router.use(requireAuth);
const rapports = requirePermission('rapports');

router.get('/', rapports, c.liste);
router.get('/dashboard', rapports, c.dashboard);
router.get('/rentabilite', rapports, c.rentabiliteBoutique);
// Rentabilité d'un dossier : visible depuis la fiche réparation
router.get('/reparation/:id/rentabilite', requireAnyPermission(['rapports', 'statistiques']), c.rentabiliteReparation);
router.get('/:nom', rapports, c.rapport);

module.exports = router;
