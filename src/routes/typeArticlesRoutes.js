const express = require('express');
const router = express.Router();
const typeArticlesController = require('../controllers/typeArticlesController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, typeArticlesController.getAll);
router.post('/', requireAuth, typeArticlesController.create);
router.delete('/:id', requireAuth, typeArticlesController.delete);

module.exports = router;