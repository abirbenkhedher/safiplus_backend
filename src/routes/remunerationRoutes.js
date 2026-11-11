const express = require('express');
const router = express.Router();
const c = require('../controllers/remunerationController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');

router.use(requireAuth);

// Lecture : journal des rémunérations (ses propres données sans "remuneration_autrui")
const read = requireAnyPermission(['remuneration', 'remuneration_autrui', 'remuneration_regles', 'commissions_valider', 'paiements_reparateurs']);
const regles = requirePermission('remuneration_regles');

// Espace personnel du réparateur (toujours accessible)
router.get('/me', c.me);

router.get('/reparateurs', read, c.listReparateurs);
router.get('/summary', read, c.summary);

router.get('/regles', read, c.listRegles);
router.post('/regles', regles, c.createRegle);
router.put('/regles/:id', regles, c.updateRegle);
router.delete('/regles/:id', regles, c.deleteRegle);

router.get('/contrats', read, c.listContrats);
router.post('/contrats', regles, c.createContrat);
router.post('/contrats/:id/terminer', regles, c.terminerContrat);

router.get('/commissions', read, c.listCommissions);
router.post('/commissions/calculate', requireAnyPermission(['commissions_valider', 'remuneration_regles']), idempotent, c.calculer);
router.post('/commissions/valider', requirePermission('commissions_valider'), idempotent, c.valider);

router.get('/ecritures', read, c.listEcritures);
router.post('/ecritures', requirePermission('commissions_valider'), idempotent, c.createEcriture);
router.post('/ecritures/:id/annuler', requirePermission('operations_annuler'), idempotent, c.annulerEcriture);

router.get('/paiements', read, c.listPaiements);
router.post('/paiements', requirePermission('paiements_reparateurs'), idempotent, c.createPaiement);
router.post('/paiements/:id/annuler', requirePermission('operations_annuler'), idempotent, c.annulerPaiement);

router.get('/clotures', requireAnyPermission(['clotures', 'clotures_rouvrir', 'remuneration_autrui']), c.listClotures);
router.get('/clotures/:id', requireAnyPermission(['clotures', 'clotures_rouvrir', 'remuneration_autrui']), c.getCloture);
router.post('/clotures/jour', requirePermission('clotures'), idempotent, c.cloturerJour);
router.post('/clotures/mois', requirePermission('clotures'), idempotent, c.cloturerMois);
router.post('/clotures/:id/rouvrir', requirePermission('clotures_rouvrir'), idempotent, c.rouvrir);

module.exports = router;
