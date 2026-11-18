const express = require('express');
const router = express.Router();
const c = require('../controllers/commandeFournisseurController');
const { requireAuth } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permissions');

// ✅ Bons de commande fournisseur : même droit que les factures d'achat
const canUse = requireAnyPermission(['achats', 'depenses']);

router.get('/', requireAuth, canUse, c.list);
router.get('/:id', requireAuth, canUse, c.getOne);
router.post('/', requireAuth, canUse, c.create);
router.put('/:id', requireAuth, canUse, c.update);
router.delete('/:id', requireAuth, canUse, c.remove);
router.post('/:id/valider', requireAuth, canUse, c.valider);
router.post('/:id/annuler', requireAuth, canUse, c.annuler);
router.post('/:id/facturer', requireAuth, canUse, c.facturer);

module.exports = router;
