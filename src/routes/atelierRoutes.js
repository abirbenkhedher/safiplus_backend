const express = require('express');
const router = express.Router();
const c = require('../controllers/atelierController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');

router.use(requireAuth);

// Lecture des paramètres : nécessaire à tous les écrans du module
router.get('/parametres', c.getParametres);
router.put('/parametres', requirePermission('parametres_atelier'), c.updateParametres);

const readF = requireAnyPermission(['fournisseurs', 'achats', 'depenses']);
router.get('/fournisseurs', readF, c.listFournisseurs);
router.post('/fournisseurs', requireAnyPermission(['fournisseurs', 'achats']), c.createFournisseur);
router.put('/fournisseurs/:id', requirePermission('fournisseurs'), c.updateFournisseur);
router.delete('/fournisseurs/:id', requirePermission('fournisseurs'), c.deleteFournisseur);

module.exports = router;
