const statistiquesService = require("../services/statistiquesService");

// ============================================================
// ✅ HELPER : Récupérer la période depuis la requête
// ============================================================
const getPeriod = (req) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  let from = req.query.from;
  
  if (!from) {
    const d = new Date(to);
    d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  }
  
  return { from, to };
};

// ============================================================
// GET /api/statistiques/overview
// ============================================================
exports.getOverview = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getOverview(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getOverview:", error);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques globales" });
  }
};

// ============================================================
// GET /api/statistiques/reparations
// ============================================================
exports.getReparations = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getReparations(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getReparations:", error);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques de réparations" });
  }
};

// ============================================================
// GET /api/statistiques/familles
// ============================================================
exports.getFamilles = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getFamilles(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getFamilles:", error);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques par famille" });
  }
};

// ============================================================
// GET /api/statistiques/categories
// ============================================================
exports.getCategories = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getCategories(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getCategories:", error);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques par catégorie" });
  }
};

// ============================================================
// GET /api/statistiques/export
// ============================================================
exports.exportData = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    
    // On récupère toutes les données pour l'export
    const [overview, reparations, familles, categories] = await Promise.all([
      statistiquesService.getOverview(from, to),
      statistiquesService.getReparations(from, to),
      statistiquesService.getFamilles(from, to),
      statistiquesService.getCategories(from, to),
    ]);

    // Pour l'instant, on renvoie du JSON (tu pourras ajouter une librairie CSV plus tard)
    res.json({
      periode: { from, to },
      overview,
      reparations,
      familles: familles.table,
      categories: categories.table,
    });
  } catch (error) {
    console.error("Erreur exportData:", error);
    res.status(500).json({ message: "Erreur lors de l'export des données" });
  }
};

exports.getAppareils = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getAppareils(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getAppareils:", error);
    res.status(500).json({ message: "Erreur lors du chargement des statistiques par appareil" });
  }
};


exports.getReparateurs = async (req, res) => {
  try {
    const { from, to } = getPeriod(req);
    const data = await statistiquesService.getReparateurs(from, to);
    res.json(data);
  } catch (error) {
    console.error("Erreur getReparateurs:", error);
    res.status(500).json({ message: "Erreur lors du chargement des stats réparateurs" });
  }
};