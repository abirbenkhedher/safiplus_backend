const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const reparationController = require('../controllers/reparationController');


router.delete('/many',requireAuth ,requirePermission('reparations'), reparationController.deleteMany);

// ✅ Toutes les routes nécessitent "reparations"
router.get('/', requireAuth, requirePermission('reparations'), reparationController.getAll);
router.get('/:id', requireAuth, requirePermission('reparations'), reparationController.getOne);
router.post('/', requireAuth, requirePermission('reparations'), reparationController.create);
router.put('/:id', requireAuth, requirePermission('reparations'), reparationController.update);
router.patch('/:id/status', requireAuth, requirePermission('reparations'), reparationController.changeStatus);
router.patch('/:id/assign', requireAuth, requirePermission('reparations'), reparationController.assignReparateur);
router.delete('/:id', requireAuth, requirePermission('reparations'), reparationController.delete);

// ✅ Route PUBLIQUE (sans auth) pour le suivi client via QR Code
router.get('/public/:numero', reparationController.getPublicByNumero);

// Impression
router.get('/:id/pdf', requireAuth, requirePermission('reparations'), reparationController.generatePDF);
router.get('/:id/ticket', requireAuth, requirePermission('reparations'), reparationController.getTicketHTML);

module.exports = router;