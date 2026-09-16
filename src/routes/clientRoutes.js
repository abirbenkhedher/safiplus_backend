const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const clientController = require('../controllers/clientController');

// ✅ Route de recherche par téléphone (avant /:id)
router.get('/search/phone', requireAuth, requirePermission('clients'), clientController.findByPhone);

router.get('/', requireAuth, requirePermission('clients'), clientController.getAll);
router.get('/:id', requireAuth, requirePermission('clients'), clientController.getOne);
router.post('/', requireAuth, requirePermission('clients'), clientController.create);
router.put('/:id', requireAuth, requirePermission('clients'), clientController.update);
router.delete('/:id', requireAuth, requirePermission('clients'), clientController.delete);

module.exports = router;