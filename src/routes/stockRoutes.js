const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');

// Lecture : module stock, ou besoin du stock pour une reparation / le dashboard
const canRead = requireAnyPermission(['stock', 'stock:read', 'reparations', 'dashboard']);
const canWrite = requirePermission('stock');

router.get('/', requireAuth, canRead, stockController.getAll);
router.get('/stats', requireAuth, canRead, stockController.getStats);
router.get('/referentiels', requireAuth, canRead, stockController.getReferentiels); // ✅ NOUVEAU
router.post('/', requireAuth, canWrite, stockController.create);
router.put('/:id', requireAuth, canWrite, stockController.update);
router.patch('/:id/quantite', requireAuth, canWrite, stockController.setQuantite); // ✅ NOUVEAU
router.post('/:id/increment', requireAuth, canWrite, stockController.increment);
router.post('/consommer', requireAuth, requireAnyPermission(['stock', 'reparations']), stockController.consommerPourReparation);
router.get('/:id/mouvements', requireAuth, canRead, stockController.getMouvements);
// ✅ Module atelier : coût, transferts, inventaire
router.get('/:id/cout', requireAuth, canRead, stockController.getCout);
router.post('/transfert', requireAuth, canWrite, idempotent, stockController.transfert);
router.post('/inventaire', requireAuth, canWrite, idempotent, stockController.inventaire);
router.delete('/:id', requireAuth, canWrite, stockController.delete);
// ✅ NOUVELLES ROUTES
router.patch(
  '/pieces/:reparationId/:pieceId/annuler',
  requireAuth,
  requireAnyPermission(['stock', 'reparations']), // même règle que /consommer
  stockController.annulerConsommation
);

router.get(
  '/pieces/:reparationId',
  requireAuth,
  requireAnyPermission(['stock', 'stock:read', 'reparations']),
  stockController.getPiecesReparation
);

module.exports = router;