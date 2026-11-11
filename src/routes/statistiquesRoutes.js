const express = require("express");
const router = express.Router();
const statistiquesController = require("../controllers/statistiquesController");

// ✅ Authentification obligatoire (fournit aussi le contexte multi-tenant)
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
router.use(requireAuth, requirePermission("statistiques"));

// Route 1 : Vue d'ensemble
router.get("/overview", statistiquesController.getOverview);

// Route 2 : Réparations
router.get("/reparations", statistiquesController.getReparations);

// Route 3 : Familles
router.get("/familles", statistiquesController.getFamilles);

// Route 4 : Catégories
router.get("/categories", statistiquesController.getCategories);

// Route 5 : Export (JSON pour l'instant)
router.get("/export", statistiquesController.exportData);

// Route 6 : Appareils
router.get("/appareils", statistiquesController.getAppareils);

// Route 7 : Réparateurs
router.get("/reparateurs", statistiquesController.getReparateurs);

// ✅ NOUVEAU : Route 8 : Statuts
router.get("/statuts", statistiquesController.getStatuts);

// ✅ NOUVEAU : Bénéfice
router.get("/benefice", statistiquesController.getBenefice);

// ✅ Bénéfice détaillé par famille / catégorie
router.get("/benefice-familles", statistiquesController.getBeneficeFamilles);

module.exports = router;