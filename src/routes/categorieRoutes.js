const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
// ✅ Lecture : module, lecture seule, ou « réparations » (formulaire et liste des réparations)
const canRead = requireAnyPermission(['categories', 'categories:read', 'reparations']);
const categorieController = require('../controllers/categorieController');

// ✅ LECTURE : 'categories' OU 'categories:read'
router.get('/', requireAuth, canRead, categorieController.getAll);
router.get('/:id', requireAuth, canRead, categorieController.getOne);

// ✅ ÉCRITURE : 'categories' uniquement
router.post('/', requireAuth, requirePermission('categories'), categorieController.create);
router.put('/:id', requireAuth, requirePermission('categories'), categorieController.update);
router.delete('/:id', requireAuth, requirePermission('categories'), categorieController.delete);

module.exports = router;