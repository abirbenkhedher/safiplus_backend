const express = require('express');
const router = express.Router();
const depensesController = require('../controllers/depensesController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.get('/', requireAuth, requirePermission('depenses'), depensesController.getAll);
router.get('/stats', requireAuth, requirePermission('depenses'), depensesController.getStats);
router.post('/', requireAuth, requirePermission('depenses'), depensesController.create);
router.put('/:id', requireAuth, requirePermission('depenses'), depensesController.update);
router.delete('/:id', requireAuth, requirePermission('depenses'), depensesController.delete);

module.exports = router;