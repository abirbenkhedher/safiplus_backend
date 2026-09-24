const express = require('express');
const router = express.Router();
const marqueController = require('../controllers/marqueController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', marqueController.getAll);
router.get('/:id', marqueController.getOne);
router.post('/', marqueController.create);
router.put('/:id', marqueController.update);
router.delete('/:id', marqueController.delete);

module.exports = router;