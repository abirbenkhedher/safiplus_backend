const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/organisationController');

// ✅ Gestion des organisations (franchisés) — SUPER_ADMIN uniquement
router.get('/', requireAuth, requireSuperAdmin, ctrl.getAll);
router.get('/:id', requireAuth, requireSuperAdmin, ctrl.getOne);
router.post('/', requireAuth, requireSuperAdmin, ctrl.create);
router.put('/:id', requireAuth, requireSuperAdmin, ctrl.update);
router.patch('/:id/status', requireAuth, requireSuperAdmin, ctrl.toggleStatus);
router.post('/:id/owners', requireAuth, requireSuperAdmin, ctrl.addOwner);

module.exports = router;
