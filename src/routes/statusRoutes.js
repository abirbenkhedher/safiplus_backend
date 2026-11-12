const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
// ✅ Lecture : module, lecture seule, ou « réparations » (formulaire et liste des réparations)
const canRead = requireAnyPermission(['statuses', 'statuses:read', 'reparations']);
const statusController = require('../controllers/statusController');

router.get('/', requireAuth, canRead, statusController.getAll);
router.get('/:id', requireAuth, canRead, statusController.getOne);

router.post('/', requireAuth, requirePermission('statuses'), statusController.create);
router.put('/:id', requireAuth, requirePermission('statuses'), statusController.update);
router.delete('/:id', requireAuth, requirePermission('statuses'), statusController.delete);
router.patch('/:id/default', requireAuth, requirePermission('statuses'), statusController.setDefault);

module.exports = router;