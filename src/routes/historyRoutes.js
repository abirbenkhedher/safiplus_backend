const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const historyController = require('../controllers/historyController');

// Routes authentifiées
router.get('/', requireAuth, historyController.getAll);
router.get('/stats', requireAuth, historyController.getStats);
router.get('/entity/:entityType/:entityId', requireAuth, historyController.getByEntity);
router.get('/:id', requireAuth, historyController.getOne);

// Routes ADMIN uniquement
router.delete('/clean', requireAuth, requireAdmin, historyController.cleanOld);

module.exports = router;