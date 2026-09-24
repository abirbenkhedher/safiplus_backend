const express = require('express');
const router = express.Router();
const panneController = require('../controllers/panneController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', panneController.getAll);
router.get('/:id', panneController.getOne);
router.post('/', panneController.create);
router.put('/:id', panneController.update);
router.delete('/:id', panneController.delete);

module.exports = router;