const express = require('express');
const c = require('../controllers/caisseController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');

// ✅ Caisse journalière : /api/caisse
const { requireModule } = require('../middleware/modules');

const caisse = express.Router();
caisse.use(requireAuth, requireModule('commercial'));
const read = requireAnyPermission(['caisse', 'comptoir', 'rapport_commercial', 'clotures_rouvrir']);
const write = requirePermission('caisse');

caisse.get('/courante', read, c.courante);
caisse.get('/sessions', read, c.list);
caisse.get('/sessions/:id', read, c.getOne);
caisse.post('/ouvrir', write, idempotent, c.ouvrir);
caisse.post('/sessions/:id/mouvements', write, idempotent, c.mouvement);
caisse.post('/mouvements/:id/annuler', write, idempotent, c.annulerMouvement);
caisse.post('/sessions/:id/fermer', write, idempotent, c.fermer);
caisse.post('/sessions/:id/rouvrir', requirePermission('clotures_rouvrir'), idempotent, c.rouvrir);

// ✅ Rapport commercial : /api/rapport-commercial
const rapport = express.Router();
rapport.use(requireAuth, requireModule('commercial'));
rapport.get('/', requireAnyPermission(['rapport_commercial', 'rapports']), c.rapport);
// Tableau de bord de l'espace Commerce
rapport.get('/tableau-de-bord', requireAnyPermission(['rapport_commercial', 'rapports', 'ventes', 'ventes:read']), c.tableauDeBord);
// Vue globale de l'entreprise (atelier + commerce, sans double comptage)
rapport.get('/global', requireAnyPermission(['statistiques', 'rapports', 'rapport_commercial']), c.vueGlobale);

module.exports = { caisse, rapport };
