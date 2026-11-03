const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const clientController = require('../controllers/clientController');

// ============================================================
// ✅ MULTER : upload en mémoire pour l'import Excel
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez .xlsx, .xls ou .csv'));
  },
});

// ============================================================
// ✅ IMPORT EXCEL — ADMIN uniquement
// (avant /:id pour éviter le conflit de route)
// ============================================================
router.post(
  '/import',
  requireAuth,
  requireAdmin,
  requirePermission('clients'),
  upload.single('file'),
  clientController.importClients
);

// ============================================================
// ✅ SUPPRESSION MULTIPLE — ADMIN uniquement
// (avant /:id pour éviter le conflit de route)
// ============================================================
router.delete(
  '/many',
  requireAuth,
  requireAdmin,
  requirePermission('clients'),
  clientController.deleteMany
);

// ============================================================
// ✅ CLIENTS PASSAGERS — numéro 00000000
// (avant /:id pour éviter le conflit de route)
// ============================================================
router.get(
  '/passengers',
  requireAuth,
  requirePermission('clients'),
  clientController.getPassengers
);

// ============================================================
// ✅ RECHERCHE par téléphone / code fidélité
// (avant /:id pour éviter le conflit de route)
// ============================================================
router.get(
  '/search/phone',
  requireAuth,
  requirePermission('clients'),
  clientController.findByPhone
);

// ============================================================
// ✅ ROUTES CRUD
// ============================================================
router.get(
  '/',
  requireAuth,
  requirePermission('clients'),
  clientController.getAll
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('clients'),
  clientController.getOne
);

router.post(
  '/',
  requireAuth,
  requirePermission('clients'),
  clientController.create
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('clients'),
  clientController.update
);

// ============================================================
// ✅ SUPPRESSION SIMPLE — ADMIN uniquement
// ============================================================
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  requirePermission('clients'),
  clientController.delete
);

module.exports = router;