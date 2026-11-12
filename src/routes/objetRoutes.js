const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
// ✅ Lecture : module, lecture seule, ou « réparations » (formulaire et liste des réparations)
const canRead = requireAnyPermission(['objets', 'objets:read', 'reparations']);
const objetController = require('../controllers/objetController');

router.get('/', requireAuth, canRead, objetController.getAll);
router.get('/:id', requireAuth, canRead, objetController.getOne);

router.post('/', requireAuth, requirePermission('objets'), objetController.create);
router.put('/:id', requireAuth, requirePermission('objets'), objetController.update);
router.delete('/:id', requireAuth, requirePermission('objets'), objetController.delete);

module.exports = router;