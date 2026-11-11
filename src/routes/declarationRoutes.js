const express = require('express');
const router = express.Router();
const c = require('../controllers/declarationController');
const { requireAuth } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');

router.use(requireAuth);
const access = requireAnyPermission(['declarations', 'consommations_valider']);

router.get('/', access, c.list);
router.get('/:id', access, c.getOne);
router.post('/', access, c.create);
router.put('/:id', access, c.update);
router.post('/:id/validate', requireAnyPermission(['consommations_valider']), idempotent, c.validate);
router.post('/:id/annuler', access, idempotent, c.annuler);

module.exports = router;
