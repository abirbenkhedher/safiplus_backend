const express = require('express');
const router = express.Router();
const marqueController = require('../controllers/marqueController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

router.use(requireAuth);

// Lecture : module, lecture seule, ou formulaire de reparation
const canRead = requireAnyPermission(['marques', 'marques:read', 'reparations']);
router.get('/', canRead, marqueController.getAll);
router.get('/:id', canRead, marqueController.getOne);
// Creation rapide aussi possible depuis le formulaire de reparation
router.post('/', requireAnyPermission(['marques', 'reparations']), marqueController.create);
router.put('/:id', requirePermission('marques'), marqueController.update);
router.delete('/:id', requirePermission('marques'), marqueController.delete);

module.exports = router;