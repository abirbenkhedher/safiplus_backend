const express = require('express');
const router = express.Router();
const typeArticlesController = require('../controllers/typeArticlesController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.get('/', requireAuth, typeArticlesController.getAll);
router.post('/', requireAuth, requirePermission('stock'), typeArticlesController.create);
router.delete('/:id', requireAuth, requirePermission('stock'), typeArticlesController.delete);

module.exports = router;