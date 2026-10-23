const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { protect } = require('../middleware/auth');

// ============================================================
// ✅ Routes GET (filtres serveur)
// ============================================================
router.get('/reparations', protect, exportController.exportReparations);
router.get('/clients', protect, exportController.exportClients);
router.get('/users', protect, exportController.exportUsers);
router.get('/history', protect, exportController.exportHistory);

// ============================================================
// ✅ Routes POST (données filtrées côté client)
// ============================================================
router.post('/reparations', protect, exportController.exportReparationsPost);
router.post('/clients', protect, exportController.exportClientsPost);

// ============================================================
// ✅ NOUVEAU : Route POST pour les appareils/famille et categorie (statistiques)
// ============================================================
router.post('/appareils', protect, exportController.exportAppareils);
router.post('/familles', protect, exportController.exportFamilles);
router.post('/categories', protect, exportController.exportCategories);
module.exports = router;