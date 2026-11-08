const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { requirePermission: perm } = require('../middleware/permissions');

// ============================================================
// ✅ Routes GET (filtres serveur)
// ============================================================
router.get('/reparations', protect, perm('reparations'), exportController.exportReparations);
router.get('/clients', protect, perm('clients'), exportController.exportClients);
router.get('/users', protect, perm('users'), exportController.exportUsers);
router.get('/history', protect, perm('history'), exportController.exportHistory);

// ============================================================
// ✅ Routes POST (données filtrées côté client)
// ============================================================
router.post('/reparations', protect, perm('reparations'), exportController.exportReparationsPost);
router.post('/clients', protect, perm('clients'), exportController.exportClientsPost);

// ============================================================
// ✅ Routes POST statistiques (appareils / familles / catégories / réparateurs)
// ============================================================
router.post('/appareils', protect, perm('statistiques'), exportController.exportAppareils);
router.post('/familles', protect, perm('statistiques'), exportController.exportFamilles);
router.post('/categories', protect, perm('statistiques'), exportController.exportCategories);
router.post('/reparateurs', protect, perm('statistiques'), exportController.exportReparateursPost);

// ✅ NOUVEAU : Statuts
router.post('/statuts', protect, perm('statistiques'), exportController.exportStatutsPost);

module.exports = router;