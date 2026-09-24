const express = require('express');
const router = express.Router();
const modeleController = require('../controllers/modeleController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', modeleController.getAll);
router.get('/:id', modeleController.getOne);
router.post('/', modeleController.create);
router.put('/:id', modeleController.update);
router.delete('/:id', modeleController.delete);

module.exports = router;