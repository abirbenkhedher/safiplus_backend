const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/teamMessageController');

router.use(requireAuth);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.patch('/read-all', controller.markAllAsRead);
router.patch('/:id/read', controller.markAsRead);
router.delete('/:id', controller.delete);

module.exports = router;