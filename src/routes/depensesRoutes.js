const express = require('express');
const router = express.Router();
const depensesController = require('../controllers/depensesController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, depensesController.getAll);
router.get('/stats', requireAuth, depensesController.getStats);
router.post('/', requireAuth, depensesController.create);
router.put('/:id', requireAuth, depensesController.update);
router.delete('/:id', requireAuth, depensesController.delete);

module.exports = router;