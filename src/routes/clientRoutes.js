const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const clientController = require('../controllers/clientController');

// ✅ Route de suppression multiple (AVANT /:id)
router.delete(
  '/many',
  requireAuth,
  requirePermission('clients'),
  clientController.deleteMany
);

// ✅ Route de recherche par téléphone/code fidélité (AVANT /:id)
router.get(
  '/search/phone',
  requireAuth,
  requirePermission('clients'),
  clientController.findByPhone
);

// Routes CRUD
router.get(
  '/',
  requireAuth,
  requirePermission('clients'),
  clientController.getAll
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('clients'),
  clientController.getOne
);

router.post(
  '/',
  requireAuth,
  requirePermission('clients'),
  clientController.create
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('clients'),
  clientController.update
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('clients'),
  clientController.delete
);

module.exports = router;