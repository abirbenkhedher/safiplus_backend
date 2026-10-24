const express = require("express");
const router = express.Router();
const statistiquesController = require("../controllers/statistiquesController");

// Middleware d'authentification (adapte le nom selon ton projet : auth, verifyToken, etc.)
// const { protect, admin } = require("../middleware/auth.middleware");

// router.use(protect); // Décommente pour sécuriser

// Route 1 : Vue d'ensemble
router.get("/overview", statistiquesController.getOverview);

// Route 2 : Réparations
router.get("/reparations", statistiquesController.getReparations);

// Route 3 : Familles
router.get("/familles", statistiquesController.getFamilles);

// Route 4 : Catégories
router.get("/categories", statistiquesController.getCategories);

// Route 5 : Export (CSV)
router.get("/export", statistiquesController.exportData);
// Route 6 : appareils

router.get("/appareils", statistiquesController.getAppareils);
router.get("/reparateurs", statistiquesController.getReparateurs);

module.exports = router;