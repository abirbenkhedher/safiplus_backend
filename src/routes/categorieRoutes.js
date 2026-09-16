const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requirePermissionOrRead } = require('../middleware/permissions');
const categorieController = require('../controllers/categorieController');

// ✅ LECTURE : 'categories' OU 'categories:read'
router.get('/', requireAuth, requirePermissionOrRead('categories'), categorieController.getAll);
router.get('/:id', requireAuth, requirePermissionOrRead('categories'), categorieController.getOne);

// ✅ ÉCRITURE : 'categories' uniquement
router.post('/', requireAuth, requirePermission('categories'), categorieController.create);
router.put('/:id', requireAuth, requirePermission('categories'), categorieController.update);
router.delete('/:id', requireAuth, requirePermission('categories'), categorieController.delete);

module.exports = router;