const express = require('express');
const c = require('../controllers/venteController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');

// ============================================================
// ✅ Gestion commerciale : /api/ventes et /api/reglements
// ============================================================
const { requireModule } = require('../middleware/modules');

const ventes = express.Router();
ventes.use(requireAuth, requireModule('commercial'));
const read = requireAnyPermission(['ventes', 'ventes:read', 'reglements']);
const write = requirePermission('ventes');

// Vente comptoir : permission dédiée (caissier) ou ventes
const comptoir = requireAnyPermission(['comptoir', 'ventes']);
ventes.get('/comptoir/articles', comptoir, c.articlesComptoir);
ventes.get('/comptoir/jour', comptoir, c.comptoirJour);
ventes.post('/comptoir', comptoir, idempotent, c.venteComptoir);

ventes.get('/parametres', requireAnyPermission(['ventes', 'ventes:read', 'reglements', 'comptoir']), c.parametres);
ventes.get('/a-facturer', write, c.aFacturer);
ventes.get('/reparation/:id', requireAnyPermission(['ventes', 'ventes:read', 'reglements', 'reparations']), c.parReparation);
ventes.post('/depuis', write, c.depuis);
ventes.get('/', read, c.list);
ventes.get('/:id', read, c.getOne);
ventes.post('/', write, c.create);
ventes.put('/:id', write, c.update);
ventes.delete('/:id', write, c.remove);
ventes.post('/:id/valider', write, idempotent, c.valider);
ventes.post('/:id/statut', write, c.statutDevis);
ventes.post('/:id/annuler', write, idempotent, c.annuler);
ventes.post('/:id/transformer', write, c.transformer);
ventes.post('/:id/avoir', write, c.avoir);

const reglements = express.Router();
reglements.use(requireAuth, requireModule('commercial'));
const rRead = requireAnyPermission(['reglements', 'ventes', 'ventes:read']);
const rWrite = requirePermission('reglements');

reglements.get('/', rRead, c.listReglements);
reglements.get('/impayees', rRead, c.impayees);
reglements.get('/creances', rRead, c.creances);
reglements.get('/journal', rRead, c.journal);
reglements.get('/synthese', rRead, c.synthese);
reglements.get('/releve/:clientId', rRead, c.releve);
reglements.get('/solde/:clientId', rRead, c.solde);
reglements.post('/', rWrite, idempotent, c.createReglement);
reglements.post('/:id/affecter', rWrite, idempotent, c.affecterReglement);
reglements.post('/:id/cheque', rWrite, idempotent, c.etatCheque);
reglements.post('/:id/annuler', requirePermission('operations_annuler'), idempotent, c.annulerReglement);

module.exports = { ventes, reglements };
