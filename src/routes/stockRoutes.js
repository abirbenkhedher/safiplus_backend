const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, stockController.getAll);
router.get('/stats', requireAuth, stockController.getStats);
router.get('/referentiels', requireAuth, stockController.getReferentiels); // ✅ NOUVEAU
router.post('/', requireAuth, stockController.create);
router.put('/:id', requireAuth, stockController.update);
router.patch('/:id/quantite', requireAuth, stockController.setQuantite); // ✅ NOUVEAU
router.post('/:id/increment', requireAuth, stockController.increment);
router.post('/consommer', requireAuth, stockController.consommerPourReparation);
router.get('/:id/mouvements', requireAuth, stockController.getMouvements);
router.delete('/:id', requireAuth, stockController.delete);
// ✅ NOUVELLES ROUTES
router.patch(
  '/pieces/:reparationId/:pieceId/annuler',
  requireAuth,
  stockController.annulerConsommation
);

router.get(
  '/pieces/:reparationId',
  requireAuth,
  stockController.getPiecesReparation
);

module.exports = router;