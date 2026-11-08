const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner, requireSuperAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/boutiqueController');

// ✅ Boutiques accessibles à l'utilisateur connecté (sélecteur du header)
router.get('/mine', requireAuth, ctrl.getMine);

// ✅ Consultation / modification des infos : propriétaire ou SUPER_ADMIN
router.get('/', requireAuth, requireOwner, ctrl.getAll);
router.put('/:id', requireAuth, requireOwner, ctrl.update);
// ✅ Création / activation : SUPER_ADMIN uniquement (backoffice)
router.post('/', requireAuth, requireSuperAdmin, ctrl.create);
router.patch('/:id/status', requireAuth, requireSuperAdmin, ctrl.toggleStatus);

module.exports = router;
