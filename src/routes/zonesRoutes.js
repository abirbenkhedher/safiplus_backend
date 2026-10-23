const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth);

// GET - lecture (comme pannes)
const canRead = (req, res, next) => {
  const user = req.user;
  const ok =
    user.role === 'ADMIN' ||
    user.permissions?.includes('zones') ||
    user.permissions?.includes('zones:read') ||
    user.permissions?.includes('clients'); // les commerciaux gèrent les clients
  if (!ok) {
    return res.status(403).json({ success: false, message: 'Accès refusé.' });
  }
  next();
};

router.get('/', canRead, zoneController.getAll);
router.get('/:id', canRead, zoneController.getOne);

// POST/PUT - écriture
const canWrite = (req, res, next) => {
  const user = req.user;
  const ok =
    user.role === 'ADMIN' ||
    user.permissions?.includes('zones') ||
    user.permissions?.includes('clients');
  if (!ok) {
    return res.status(403).json({ success: false, message: 'Accès refusé.' });
  }
  next();
};

router.post('/', canWrite, zoneController.create);
router.put('/:id', canWrite, zoneController.update);

// DELETE - admin
router.delete('/:id', requireAdmin, zoneController.delete);

module.exports = router;