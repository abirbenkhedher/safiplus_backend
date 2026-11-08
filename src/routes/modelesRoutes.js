const express = require('express');
const router = express.Router();
const modeleController = require('../controllers/modeleController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

router.use(requireAuth);

// Lecture : module, lecture seule, ou formulaire de reparation
const canRead = requireAnyPermission(['modeles', 'modeles:read', 'reparations']);
router.get('/', canRead, modeleController.getAll);
router.get('/:id', canRead, modeleController.getOne);
// Creation rapide aussi possible depuis le formulaire de reparation
router.post('/', requireAnyPermission(['modeles', 'reparations']), modeleController.create);
router.put('/:id', requirePermission('modeles'), modeleController.update);
router.delete('/:id', requirePermission('modeles'), modeleController.delete);

module.exports = router;