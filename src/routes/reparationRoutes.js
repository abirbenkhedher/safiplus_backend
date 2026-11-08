const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const reparationController = require('../controllers/reparationController');
const { systemContext } = require('../config/tenantContext');

// ============================================================
// ✅ SUPPRESSION MULTIPLE — ADMIN uniquement
// (avant /:id pour éviter le conflit de route)
// ============================================================
router.delete(
  '/many',
  requireAuth,
  requireAdmin,                              // ✅ AJOUT
  requirePermission('reparations'),
  reparationController.deleteMany
);

// ============================================================
// ✅ ROUTES GET / POST / PUT / PATCH
// (accessibles aux utilisateurs ayant la permission "reparations")
// ============================================================
router.get(
  '/',
  requireAuth,
  requirePermission('reparations'),
  reparationController.getAll
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('reparations'),
  reparationController.getOne
);

router.post(
  '/',
  requireAuth,
  requirePermission('reparations'),
  reparationController.create
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('reparations'),
  reparationController.update
);

router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('reparations'),
  reparationController.changeStatus
);

router.patch(
  '/:id/assign',
  requireAuth,
  requirePermission('reparations'),
  reparationController.assignReparateur
);

// ============================================================
// ✅ SUPPRESSION SIMPLE — ADMIN uniquement
// ============================================================
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,                              // ✅ AJOUT
  requirePermission('reparations'),
  reparationController.delete
);

// ============================================================
// ✅ ROUTE PUBLIQUE (sans auth) — Suivi client via QR Code
// ============================================================
// ✅ Route publique : pas d'utilisateur → contexte "system" (numéro unique global)
router.get('/public/:numero', systemContext, reparationController.getPublicByNumero);

// ============================================================
// Impression
// ============================================================
router.get(
  '/:id/pdf',
  requireAuth,
  requirePermission('reparations'),
  reparationController.generatePDF
);

router.get(
  '/:id/ticket',
  requireAuth,
  requirePermission('reparations'),
  reparationController.getTicketHTML
);

module.exports = router;