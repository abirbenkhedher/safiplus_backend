const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const depensesController = require('../controllers/depensesController');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { idempotent } = require('../middleware/idempotency');
const { restoreTenant } = require('../config/tenantContext');

const canRead = requireAnyPermission(['depenses', 'achats']);
const canWrite = requireAnyPermission(['depenses', 'achats']);

// ✅ Pièces justificatives (PDF / images, 10 Mo)
fs.mkdirSync(depensesController.UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: depensesController.UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.mimetype)),
});

router.get('/', requireAuth, canRead, depensesController.getAll);
router.get('/stats', requireAuth, canRead, depensesController.getStats);
router.get('/:id', requireAuth, canRead, depensesController.getOne);
router.post('/', requireAuth, canWrite, depensesController.create);
router.put('/:id', requireAuth, canWrite, depensesController.update);
router.delete('/:id', requireAuth, canWrite, depensesController.delete);

// ✅ Facture d'achat : validation / annulation
router.post('/:id/validate', requireAuth, requirePermission('achats'), idempotent, depensesController.validate);
router.post('/:id/annuler', requireAuth, requirePermission('operations_annuler'), idempotent, depensesController.annuler);

// ✅ Pièces jointes
router.post('/:id/pieces-jointes', requireAuth, canWrite, upload.single('fichier'), restoreTenant, depensesController.addPieceJointe);
router.get('/:id/pieces-jointes/:pjId', requireAuth, canRead, depensesController.getPieceJointe);

module.exports = router;
