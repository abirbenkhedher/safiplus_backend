const Reparation = require("../models/Reparation");
const Status = require("../models/Status");
const Depense = require("../models/Depense");

// ============================================================
// ✅ HELPER : Calcul du prix total (prix + imprévus acceptés)
// ============================================================
const getPrixTotalExpr = () => {
  return {
    $add: [
      { $ifNull: ["$prix", 0] },
      {
        $sum: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$diagnosticImprevus.imprevus", []] },
                as: "imp",
                cond: { $eq: ["$$imp.accepte", true] }
              }
            },
            as: "imp",
            in: { $ifNull: ["$$imp.prixSupplementaire", 0] }
          }
        }
      }
    ]
  };
};

// ============================================================
// ✅ HELPER : Calculer la période précédente
// ============================================================
const getPreviousPeriod = (from, to) => {
  const startDate = new Date(from);
  const endDate = new Date(to);
  const diffTime = endDate - startDate;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const prevTo = new Date(startDate);
  prevTo.setDate(prevTo.getDate() - 1);

  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - diffDays);

  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
};

// ============================================================
// ✅ HELPER : Calculer la variation en %
// ============================================================
const calcVariation = (currentVal, prevVal) => {
  if (prevVal === 0 && currentVal === 0) return 0;
  if (prevVal === 0) return 100;
  return Math.round(((currentVal - prevVal) / prevVal) * 1000) / 10;
};

// ============================================================
// ✅ HELPER : Construire la clause match Mongo
// ============================================================
const buildMatch = (from, to) => {
  const start = new Date(from);
  const end = new Date(to + "T23:59:59.999Z");
  return {
    isDeleted: false,
    $or: [
      { dateReception: { $gte: start, $lte: end } },
      { dateReception: null, createdAt: { $gte: start, $lte: end } }
    ]
  };
};

// ============================================================
// 1. OVERVIEW (Vue d'ensemble)
// ============================================================
exports.getOverview = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  // --- KPI Période Actuelle ---
  const currentKpis = await Reparation.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        ca_total: { $sum: prixTotalExpr },
        encaissements: { $sum: { $ifNull: ["$acompte", 0] } },
        nb_reparations: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        ca_total: 1,
        encaissements: 1,
        creances: { $subtract: ["$ca_total", "$encaissements"] },
        nb_reparations: 1
      }
    }
  ]);

  const current = currentKpis[0] || { ca_total: 0, encaissements: 0, creances: 0, nb_reparations: 0 };

  // --- KPI Période Précédente ---
  const prevDates = getPreviousPeriod(from, to);
  const prevMatch = buildMatch(prevDates.from, prevDates.to);

  const prevKpis = await Reparation.aggregate([
    { $match: prevMatch },
    {
      $group: {
        _id: null,
        ca_total: { $sum: prixTotalExpr },
        encaissements: { $sum: { $ifNull: ["$acompte", 0] } },
        nb_reparations: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        ca_total: 1,
        encaissements: 1,
        creances: { $subtract: ["$ca_total", "$encaissements"] },
        nb_reparations: 1
      }
    }
  ]);

  const prev = prevKpis[0] || { ca_total: 0, encaissements: 0, creances: 0, nb_reparations: 0 };

  const variations = {
    ca_total: calcVariation(current.ca_total, prev.ca_total),
    encaissements: calcVariation(current.encaissements, prev.encaissements),
    creances: calcVariation(current.creances, prev.creances),
    nb_reparations: calcVariation(current.nb_reparations, prev.nb_reparations),
  };

  // --- Évolution ---
  const evolution = await Reparation.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$dateReception", "$createdAt"] } } },
        ca: { $sum: prixTotalExpr },
        encaissements: { $sum: { $ifNull: ["$acompte", 0] } }
      }
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", ca: 1, encaissements: 1 } }
  ]);

  // --- CA par Famille ---
  const caParFamille = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "categorieData" } },
    { $unwind: "$categorieData" },
    { $lookup: { from: "familles", localField: "categorieData.famille", foreignField: "_id", as: "familleData" } },
    { $unwind: "$familleData" },
    {
      $group: {
        _id: "$familleData._id",
        nom: { $first: "$familleData.nom" },
        ca: { $sum: prixTotalExpr }
      }
    },
    { $sort: { ca: -1 } },
    { $project: { _id: 0, famille_id: "$_id", nom: 1, ca: 1 } }
  ]);

  // --- Top 5 Pannes ---
  const topPannes = await Reparation.aggregate([
    { $match: match },
    { $unwind: "$panneType" },
    { $group: { _id: "$panneType", ca: { $sum: prixTotalExpr } } },
    { $sort: { ca: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", ca: 1 } }
  ]);

  return {
    ...current,
    variations,
    evolution,
    ca_par_famille: caParFamille,
    top_reparations: topPannes,
  };
};

// ============================================================
// 2. FAMILLES
// ============================================================
exports.getFamilles = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  const table = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    {
      $group: {
        _id: "$famData._id",
        nom: { $first: "$famData.nom" },
        ca: { $sum: prixTotalExpr },
        encaisse: { $sum: { $ifNull: ["$acompte", 0] } },
        nb_reparations: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        famille_id: "$_id",
        nom: 1,
        ca: 1,
        encaisse: 1,
        reste: { $subtract: ["$ca", "$encaisse"] },
        nb_reparations: 1
      }
    },
    { $sort: { ca: -1 } }
  ]);

  const treemap = table.map((f) => ({
    famille_id: f.famille_id,
    nom: f.nom,
    ca: f.ca,
  }));

  return { treemap, table };
};

// ============================================================
// 3. CATÉGORIES
// ============================================================
exports.getCategories = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  const table = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    {
      $group: {
        _id: "$catData._id",
        nom: { $first: "$catData.nom" },
        famille: { $first: "$famData.nom" },
        ca: { $sum: prixTotalExpr },
        encaisse: { $sum: { $ifNull: ["$acompte", 0] } },
        nb_reparations: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        categorie_id: "$_id",
        nom: 1,
        famille: 1,
        ca: 1,
        encaisse: 1,
        reste: { $subtract: ["$ca", "$encaisse"] },
        nb_reparations: 1
      }
    },
    { $sort: { ca: -1 } }
  ]);

  const bar = table.map((c) => ({
    categorie_id: c.categorie_id,
    nom: c.nom,
    famille: c.famille,
    ca: c.ca,
  }));

  return { bar, table };
};

// ============================================================
// 4. RÉPARATIONS
// ============================================================
exports.getReparations = async (from, to) => {
  const match = buildMatch(from, to);

  // ============================================================
  // 1. KPI Nombre de réparations
  // ============================================================
  const kpis = await Reparation.aggregate([
    { $match: match },
    { $group: { _id: null, nb_reparations: { $sum: 1 } } }
  ]);
  const current = kpis[0] || { nb_reparations: 0 };

  // ============================================================
  // 2. Calcul du délai moyen (premier changement de statut)
  // ============================================================
  const delais = await Reparation.aggregate([
    { $match: match },
    {
      $project: {
        dateReception: { $ifNull: ["$dateReception", "$createdAt"] },
        firstStatusChange: {
          $first: {
            $filter: {
              input: { $ifNull: ["$modifications", []] },
              as: "mod",
              cond: { $eq: ["$$mod.field", "status"] }
            }
          }
        }
      }
    },
    {
      $project: {
        dateReception: 1,
        dateFin: "$firstStatusChange.modifiedAt"
      }
    },
    { $match: { dateFin: { $ne: null } } },
    {
      $project: {
        delaiEnJours: {
          $divide: [
            { $subtract: ["$dateFin", "$dateReception"] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    { $group: { _id: null, delai_moyen: { $avg: "$delaiEnJours" } } }
  ]);

  const delaiMoyen = delais[0]?.delai_moyen || 0;

  // ============================================================
  // 3. Taux de réussite / échec (✅ CORRIGÉ — aligné avec getStatuts)
  // ============================================================
  // Logique :
  //   - "réussie" : contient "repare"/"réparé" SANS "non"
  //     → repare, sortie repare, sav repare, sav sortie repare
  //   - "échouée" : contient "non repare"/"non reparé"/"non réparé"
  //     → non repare, sortie non repare, sav non repare, sav sortie non repare
  //   - "ignorée" : statuts sans verdict (en cours, sav en cours)
  const allStatuses = await Status.find({}).select('_id label').lean();

  const reussiteStatusIds = allStatuses
    .filter((s) => {
      const l = (s.label || '').toLowerCase().trim();
      return (l.includes('repare') || l.includes('réparé')) && !l.includes('non');
    })
    .map((s) => s._id);

  const echecStatusIds = allStatuses
    .filter((s) => {
      const l = (s.label || '').toLowerCase().trim();
      return (
        l.includes('non repare') ||
        l.includes('non reparé') ||
        l.includes('non réparé')
      );
    })
    .map((s) => s._id);

  const reussiteCount = await Reparation.countDocuments({
    ...match,
    status: { $in: reussiteStatusIds },
  });

  const echecCount = await Reparation.countDocuments({
    ...match,
    status: { $in: echecStatusIds },
  });

  const termineCount = reussiteCount + echecCount;

  const taux_reussite = termineCount > 0
    ? (reussiteCount / termineCount) * 100
    : 0;

  const taux_echec = termineCount > 0
    ? (echecCount / termineCount) * 100
    : 0;

  // ============================================================
  // 4. Période précédente pour les variations
  // ============================================================
  const prevDates = getPreviousPeriod(from, to);
  const prevMatch = buildMatch(prevDates.from, prevDates.to);

  const prevKpis = await Reparation.aggregate([
    { $match: prevMatch },
    { $group: { _id: null, nb_reparations: { $sum: 1 } } }
  ]);
  const prev = prevKpis[0] || { nb_reparations: 0 };

  // Délai moyen période précédente
  const prevDelais = await Reparation.aggregate([
    { $match: prevMatch },
    {
      $project: {
        dateReception: { $ifNull: ["$dateReception", "$createdAt"] },
        firstStatusChange: {
          $first: {
            $filter: {
              input: { $ifNull: ["$modifications", []] },
              as: "mod",
              cond: { $eq: ["$$mod.field", "status"] }
            }
          }
        }
      }
    },
    {
      $project: {
        dateReception: 1,
        dateFin: "$firstStatusChange.modifiedAt"
      }
    },
    { $match: { dateFin: { $ne: null } } },
    {
      $project: {
        delaiEnJours: {
          $divide: [
            { $subtract: ["$dateFin", "$dateReception"] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    { $group: { _id: null, delai_moyen: { $avg: "$delaiEnJours" } } }
  ]);
  const prevDelaiMoyen = prevDelais[0]?.delai_moyen || 0;

  // ✅ Taux de réussite période précédente (même logique corrigée)
  const prevReussiteCount = await Reparation.countDocuments({
    ...prevMatch,
    status: { $in: reussiteStatusIds },
  });

  const prevEchecCount = await Reparation.countDocuments({
    ...prevMatch,
    status: { $in: echecStatusIds },
  });

  const prevTermineCount = prevReussiteCount + prevEchecCount;

  const prevTauxReussite = prevTermineCount > 0
    ? (prevReussiteCount / prevTermineCount) * 100
    : 0;

  const variations = {
    nb_reparations: calcVariation(current.nb_reparations, prev.nb_reparations),
    delai_moyen: calcVariation(delaiMoyen, prevDelaiMoyen),
    taux_reussite: calcVariation(taux_reussite, prevTauxReussite),
  };

  // ============================================================
  // 5. Top Catégories
  // ============================================================
  const topCategories = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $group: { _id: "$catData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 6. Top Objets
  // ============================================================
  const topObjets = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "objets", localField: "objet", foreignField: "_id", as: "objData" } },
    { $unwind: "$objData" },
    { $group: { _id: "$objData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 7. Top Marques
  // ============================================================
  const topMarques = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: "$marqueData" },
    { $group: { _id: "$marqueData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 8. Top Modèles
  // ============================================================
  const topModeles = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: "$modeleData" },
    { $group: { _id: "$modeleData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 9. Par Type d'appareil (camembert)
  // ============================================================
  const parType = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    { $group: { _id: "$famData.nom", count: { $sum: 1 } } },
    { $project: { _id: 0, type: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 10. Par Jour de la semaine
  // ============================================================
  const parJourRaw = await Reparation.aggregate([
    { $match: match },
    { $group: { _id: { $dayOfWeek: { $ifNull: ["$dateReception", "$createdAt"] } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const joursMap = { 1: "Dim", 2: "Lun", 3: "Mar", 4: "Mer", 5: "Jeu", 6: "Ven", 7: "Sam" };
  const parJour = parJourRaw.map(j => ({ jour: joursMap[j._id], count: j.count }));

  // ============================================================
  // ✅ RETOUR
  // ============================================================
  return {
    // ---- KPI ----
    nb_reparations: current.nb_reparations,
    delai_moyen: Math.round(delaiMoyen * 10) / 10,

    // ---- Taux (✅ corrigés) ----
    taux_reussite: Math.round(taux_reussite * 10) / 10,
    taux_echec: Math.round(taux_echec * 10) / 10,   // ✅ NOUVEAU

    // ---- Compteurs debug (✅ NOUVEAU) ----
    nb_reussite: reussiteCount,
    nb_echec: echecCount,
    nb_termine: termineCount,

    // ---- Variations ----
    variations,

    // ---- Tops ----
    top_categories: topCategories,
    top_objets: topObjets,
    top_marques: topMarques,
    top_modeles: topModeles,

    // ---- Graphiques ----
    par_type: parType,
    par_jour: parJour,
  };
};

// ============================================================
// 5. APPAREILS (Marques, Modèles, Objets)
// ============================================================
exports.getAppareils = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  // 1. Top Marques
  const topMarques = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: { path: "$marqueData", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$marqueData.nom", count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 2. Top Modèles
  const topModeles = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: { path: "$modeleData", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$modeleData.nom", count: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 3. Tableau détaillé (Marque + Modèle + Objet + Catégorie)
  const table = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: { path: "$marqueData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: { path: "$modeleData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "objets", localField: "objet", foreignField: "_id", as: "objetData" } },
    { $unwind: { path: "$objetData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: { path: "$catData", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: { path: "$famData", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          marque: "$marqueData.nom",
          modele: "$modeleData.nom",
          objet: "$objetData.nom",
          categorie: "$catData.nom",
          famille: "$famData.nom"
        },
        nb_reparations: { $sum: 1 },
        ca: { $sum: prixTotalExpr },
        encaisse: { $sum: { $ifNull: ["$acompte", 0] } }
      }
    },
    {
      $project: {
        _id: 0,
        marque: { $ifNull: ["$_id.marque", "Non renseigné"] },
        modele: { $ifNull: ["$_id.modele", "Non renseigné"] },
        objet: { $ifNull: ["$_id.objet", "Non renseigné"] },
        categorie: { $ifNull: ["$_id.categorie", "Non renseigné"] },
        famille: { $ifNull: ["$_id.famille", "Non renseigné"] },
        nb_reparations: 1,
        ca: 1,
        encaisse: 1,
        reste: { $subtract: ["$ca", "$encaisse"] }
      }
    },
    { $sort: { nb_reparations: -1 } }
  ]);

  return { topMarques, topModeles, table };
};


// ============================================================
// 5. RÉPARATEURS (Performance & Retours SAV)
// ============================================================
exports.getReparateurs = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  // ✅ ÉTAPE 1 : Trouver tous les statuts contenant "SAV"
  const Status = require("../models/Status");
  const savStatuses = await Status.find({ 
    label: { $regex: /SAV/i } 
  }).select('_id');
  
  const savStatusIds = savStatuses.map(s => s._id);
  
  console.log("🔍 [getReparateurs] Statuts SAV trouvés:", savStatuses.map(s => s.label));
  console.log("🔍 [getReparateurs] IDs SAV:", savStatusIds);

  // ✅ ÉTAPE 2 : Agrégation avec détection directe
  const reparateurs = await Reparation.aggregate([
    { $match: match },
    { $match: { reparateur: { $ne: null } } },
    
    {
      $addFields: {
        // ✅ Détection du SAV en 3 critères
        isSavDetected: {
          $or: [
            // Priorité 1 : isSAV flag
            { $eq: ["$isSAV", true] },
            
            // Priorité 2 : Le statut est dans la liste des statuts SAV
            { $in: ["$status", savStatusIds] },
            
            // Priorité 3 : reparateurSAV est renseigné
            { $ne: [{ $ifNull: ["$reparateurSAV", null] }, null] },
          ]
        }
      }
    },
    
    {
      $group: {
        _id: "$reparateur",
        total_reparations: { $sum: 1 },
        total_sav: { $sum: { $cond: ["$isSavDetected", 1, 0] } },
        ca_total: { $sum: prixTotalExpr },
        encaisse: { $sum: { $ifNull: ["$acompte", 0] } },
      }
    },
    
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userData"
      }
    },
    { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
    
    {
      $project: {
        _id: 0,
        reparateur_id: "$_id",
        nom: {
          $let: {
            vars: {
              fullName: {
                $concat: [
                  { $ifNull: ["$userData.firstName", ""] },
                  " ",
                  { $ifNull: ["$userData.lastName", ""] }
                ]
              }
            },
            in: {
              $cond: [
                { $eq: [{ $trim: { input: "$$fullName" } }, ""] },
                "Utilisateur supprimé",
                { $trim: { input: "$$fullName" } }
              ]
            }
          }
        },
        role: { $ifNull: ["$userData.role", "—"] },
        total_reparations: 1,
        total_sav: 1,
        ca_total: 1,
        encaisse: 1,
        reste: { $subtract: ["$ca_total", "$encaisse"] },
        taux_sav: {
          $cond: [
            { $gt: ["$total_reparations", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$total_sav", "$total_reparations"] }, 100] },
                1
              ]
            },
            0
          ]
        }
      }
    },
    { $sort: { total_sav: -1, taux_sav: -1 } }
  ]);

  console.log("🔍 [getReparateurs] Réparateurs calculés:", 
    reparateurs.map(r => ({ nom: r.nom, total_sav: r.total_sav }))
  );

  const topRetours = reparateurs.slice(0, 10).map((r) => ({
    nom: r.nom || "Non assigné",
    total_sav: r.total_sav,
    taux_sav: r.taux_sav,
  }));

  const totalReparationsGlobal = reparateurs.reduce((s, r) => s + r.total_reparations, 0);
  const totalSAVGlobal = reparateurs.reduce((s, r) => s + r.total_sav, 0);
  const tauxSAVGlobal = totalReparationsGlobal > 0
    ? Math.round((totalSAVGlobal / totalReparationsGlobal) * 1000) / 10
    : 0;

  const pireReparateur =
    reparateurs.length > 0 && reparateurs[0].total_sav > 0
      ? reparateurs[0]
      : null;

  return {
    reparateurs: reparateurs.map((r) => ({
      ...r,
      nom: r.nom || "Non assigné",
    })),
    top_retours: topRetours,
    total_reparateurs: reparateurs.length,
    taux_sav_global: tauxSAVGlobal,
    pire_reparateur: pireReparateur
      ? {
          nom: pireReparateur.nom,
          total_sav: pireReparateur.total_sav,
          taux_sav: pireReparateur.taux_sav,
        }
      : null,
  };
};  


// ============================================================
// 6. STATUTS (Statistiques par statut)
// ============================================================
exports.getStatuts = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  // 1. Récupérer tous les statuts
  const allStatuses = await Status.find({}).select('_id label color').lean();

  // 2. Agréger les réparations par statut
  const agg = await Reparation.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        nb_reparations: { $sum: 1 },
        ca: { $sum: prixTotalExpr },
        encaisse: { $sum: { $ifNull: ['$acompte', 0] } },
      },
    },
  ]);

  // 3. Construire la table par statut
  let totalReparations = 0;
  let totalCA = 0;
  let totalEncaisse = 0;

  const table = allStatuses.map((s) => {
    const found = agg.find((a) => a._id?.toString() === s._id.toString());
    const nb = found?.nb_reparations || 0;
    const ca = found?.ca || 0;
    const encaisse = found?.encaisse || 0;

    totalReparations += nb;
    totalCA += ca;
    totalEncaisse += encaisse;

    return {
      statusId: s._id.toString(),
      label: s.label,
      color: s.color || '#6C757D',
      nb_reparations: nb,
      ca,
      encaisse,
      reste: ca - encaisse,
      percentage: 0, // rempli après
    };
  });

  // 4. Calculer les pourcentages
  table.forEach((row) => {
    row.percentage = totalReparations > 0
      ? Math.round((row.nb_reparations / totalReparations) * 1000) / 10
      : 0;
  });

  // 5. Regrouper en catégories métier
  const categorize = (label) => {
    const l = (label || '').toLowerCase().trim();
    if (l.startsWith('sav')) return 'sav';
    if (l.includes('en cours')) return 'en_cours';
    if (l.includes('sortie') && l.includes('non')) return 'sortie_non_repare';
    if (l.includes('sortie') && (l.includes('repare') || l.includes('réparé'))) return 'sortie_repare';
    if (l.includes('non repare') || l.includes('non reparé') || l.includes('non réparé')) return 'non_repare';
    if (l.includes('repare') || l.includes('réparé')) return 'repare';
    return 'autre';
  };

  const groupDefs = {
    en_cours: { label: '🔧 En cours', color: '#0D6EFD' },
    repare: { label: '✅ Réparé', color: '#198754' },
    non_repare: { label: '❌ Non réparé', color: '#DC3545' },
    sortie_repare: { label: '📤 Sortie réparé', color: '#20C997' },
    sortie_non_repare: { label: '📤 Sortie non réparé', color: '#6C757D' },
    sav: { label: '🔄 SAV', color: '#8B5CF6' },
    autre: { label: '❓ Autre', color: '#9CA3AF' },
  };

  const groups = {};
  Object.keys(groupDefs).forEach((k) => {
    groups[k] = { key: k, ...groupDefs[k], count: 0, ca: 0 };
  });

  table.forEach((row) => {
    const g = categorize(row.label);
    groups[g].count += row.nb_reparations;
    groups[g].ca += row.ca;
  });

  const grouped = Object.values(groups)
    .filter((g) => g.count > 0)
    .map((g) => ({
      ...g,
      percentage: totalReparations > 0
        ? Math.round((g.count / totalReparations) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 6. Détail SAV
  const savTable = table.filter((r) => r.label.toLowerCase().trim().startsWith('sav'));
  const savTotal = savTable.reduce((s, r) => s + r.nb_reparations, 0);

  const sav_breakdown = savTable.map((r) => ({
    ...r,
    percentage: savTotal > 0
      ? Math.round((r.nb_reparations / savTotal) * 1000) / 10
      : 0,
  }));

  // ============================================================
  // 7. Taux de réussite / échec (✅ CORRIGÉ)
  // ============================================================
  // ✅ Logique métier :
  //    - "réussie" : contient "repare" ou "réparé" SANS "non"
  //      → inclut : repare, sortie repare, sav repare, sav sortie repare
  //    - "échouée" : contient "non repare" / "non reparé" / "non réparé"
  //      → inclut : non repare, sortie non repare, sav non repare, sav sortie non repare
  //    - "ignorée" : statuts sans verdict (en cours, sav en cours)
  // ============================================================
  const reussiteCount = table
    .filter((r) => {
      const l = r.label.toLowerCase().trim();
      const isRepare = l.includes('repare') || l.includes('réparé');
      const isNonRepare = l.includes('non');
      return isRepare && !isNonRepare;
    })
    .reduce((s, r) => s + r.nb_reparations, 0);

  const echecCount = table
    .filter((r) => {
      const l = r.label.toLowerCase().trim();
      return (
        l.includes('non repare') ||
        l.includes('non reparé') ||
        l.includes('non réparé')
      );
    })
    .reduce((s, r) => s + r.nb_reparations, 0);

  const termineCount = reussiteCount + echecCount;

  const taux_reussite = termineCount > 0
    ? Math.round((reussiteCount / termineCount) * 1000) / 10
    : 0;

  const taux_echec = termineCount > 0
    ? Math.round((echecCount / termineCount) * 1000) / 10
    : 0;

  // ============================================================
  // 8. Nombre de sorties (livraisons au client)
  // ============================================================
  // ✅ Renommé nb_termine → nb_sorties pour plus de clarté
  //    Compte tous les statuts contenant "sortie" (réparé ou non, SAV inclus)
  const nb_sorties = table
    .filter((r) => r.label.toLowerCase().includes('sortie'))
    .reduce((s, r) => s + r.nb_reparations, 0);

  // ============================================================
  // 9. Taux SAV global
  // ============================================================
  const taux_sav = totalReparations > 0
    ? Math.round((savTotal / totalReparations) * 1000) / 10
    : 0;

  // ============================================================
  // ✅ RETOUR
  // ============================================================
  return {
    // ---- KPI globaux ----
    total_reparations: totalReparations,
    total_ca: totalCA,
    total_encaisse: totalEncaisse,
    total_reste: totalCA - totalEncaisse,

    // ---- Taux ----
    taux_reussite,
    taux_echec,
    taux_sav,

    // ---- Compteurs ----
    nb_reussite: reussiteCount,   // ✅ NOUVEAU : utile pour debug
    nb_echec: echecCount,         // ✅ NOUVEAU
    nb_termine: termineCount,     // ✅ NOUVEAU : réussites + échecs
    nb_sorties,                   // ✅ renommé (au lieu de nb_termine)

    // ---- Détails ----
    table,
    grouped,
    sav_breakdown,
  };
};

// ============================================================
// 7. BÉNÉFICE (Rentabilité : CA - Dépenses)
// ============================================================

exports.getBenefice = async (from, to) => {
  const match = buildMatch(from, to);
  const prixTotalExpr = getPrixTotalExpr();

  const start = new Date(from);
  const end = new Date(to + "T23:59:59.999Z");
  const matchDepense = {
    isDeleted: false,
    statut: { $ne: "annulee" }, // une dépense annulée ne compte pas
    type: { $in: ["REPARATION", "DIVERSE"] }, // achats de stock : via les consommations
    dateDepense: { $gte: start, $lte: end },
  };

  // ----------------------------------------------------------
  // 1. CA et nb réparations
  // ----------------------------------------------------------
  const caAgg = await Reparation.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        ca_total: { $sum: prixTotalExpr },
        encaissements: { $sum: { $ifNull: ["$acompte", 0] } },
        nb_reparations: { $sum: 1 },
      },
    },
  ]);
  const caData = caAgg[0] || { ca_total: 0, encaissements: 0, nb_reparations: 0 };

  // ----------------------------------------------------------
  // 2. Dépenses (réparation + diverse)
  // ----------------------------------------------------------
  const depAgg = await Depense.aggregate([
    { $match: matchDepense },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$montant" },
        count: { $sum: 1 },
      },
    },
  ]);

  const depReparation = depAgg.find((d) => d._id === "REPARATION")?.total || 0;
  const depDiverse = depAgg.find((d) => d._id === "DIVERSE")?.total || 0;
  const nbDepReparation = depAgg.find((d) => d._id === "REPARATION")?.count || 0;
  const nbDepDiverse = depAgg.find((d) => d._id === "DIVERSE")?.count || 0;

  const depenses_total = depReparation + depDiverse;

  // ----------------------------------------------------------
  // 3. Calculs de bénéfice
  // ----------------------------------------------------------
  const marge_brute = caData.ca_total - depReparation;
  const benefice_net = caData.ca_total - depenses_total;

  const taux_marge_brute =
    caData.ca_total > 0 ? (marge_brute / caData.ca_total) * 100 : 0;
  const taux_marge_nette =
    caData.ca_total > 0 ? (benefice_net / caData.ca_total) * 100 : 0;

  const panier_moyen =
    caData.nb_reparations > 0 ? caData.ca_total / caData.nb_reparations : 0;
  const cout_moyen_reparation =
    caData.nb_reparations > 0 ? depReparation / caData.nb_reparations : 0;

  // ----------------------------------------------------------
  // 4. Période précédente pour variations
  // ----------------------------------------------------------
  const prevDates = getPreviousPeriod(from, to);
  const prevMatch = buildMatch(prevDates.from, prevDates.to);
  const prevStart = new Date(prevDates.from);
  const prevEnd = new Date(prevDates.to + "T23:59:59.999Z");

  const prevCaAgg = await Reparation.aggregate([
    { $match: prevMatch },
    { $group: { _id: null, ca_total: { $sum: prixTotalExpr } } },
  ]);
  const prevCa = prevCaAgg[0]?.ca_total || 0;

  const prevDepAgg = await Depense.aggregate([
    {
      $match: {
        isDeleted: false,
        statut: { $ne: "annulee" },
        type: { $in: ["REPARATION", "DIVERSE"] },
        dateDepense: { $gte: prevStart, $lte: prevEnd },
      },
    },
    { $group: { _id: null, total: { $sum: "$montant" } } },
  ]);
  const prevDep = prevDepAgg[0]?.total || 0;
  const prevBenefice = prevCa - prevDep;

  const variations = {
    ca_total: calcVariation(caData.ca_total, prevCa),
    depenses_total: calcVariation(depenses_total, prevDep),
    benefice_net: calcVariation(benefice_net, prevBenefice),
  };

  // ----------------------------------------------------------
  // 5. Évolution journalière (CA / Dépenses / Bénéfice)
  // ----------------------------------------------------------
  const evoCA = await Reparation.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $ifNull: ["$dateReception", "$createdAt"] },
          },
        },
        ca: { $sum: prixTotalExpr },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const evoDep = await Depense.aggregate([
    { $match: matchDepense },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$dateDepense" },
        },
        dep: { $sum: "$montant" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fusion par date
  const evoMap = {};
  evoCA.forEach((r) => {
    evoMap[r._id] = { date: r._id, ca: r.ca, dep: 0 };
  });
  evoDep.forEach((r) => {
    if (!evoMap[r._id]) evoMap[r._id] = { date: r._id, ca: 0, dep: 0 };
    evoMap[r._id].dep = r.dep;
  });

  const evolution = Object.values(evoMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      ca: Math.round(d.ca * 100) / 100,
      depenses: Math.round(d.dep * 100) / 100,
      benefice: Math.round((d.ca - d.dep) * 100) / 100,
    }));

  // ----------------------------------------------------------
  // 6. Marge par famille (CA - dépenses liées)
  // ----------------------------------------------------------
  const margeFamille = await Reparation.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "categories",
        localField: "categorie",
        foreignField: "_id",
        as: "cat",
      },
    },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "familles",
        localField: "cat.famille",
        foreignField: "_id",
        as: "fam",
      },
    },
    { $unwind: { path: "$fam", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$fam.nom", "Non classé"] },
        ca: { $sum: prixTotalExpr },
        nb: { $sum: 1 },
      },
    },
    { $sort: { ca: -1 } },
    {
      $project: {
        _id: 0,
        famille: "$_id",
        ca: 1,
        nb_reparations: "$nb",
      },
    },
  ]);

  // ----------------------------------------------------------
  // 7. Top 5 réparations les plus rentables
  // ----------------------------------------------------------
  const topRentables = await Reparation.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "categories",
        localField: "categorie",
        foreignField: "_id",
        as: "cat",
      },
    },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "marques",
        localField: "marque",
        foreignField: "_id",
        as: "marque",
      },
    },
    { $unwind: { path: "$marque", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        numero: 1,
        prix: { $ifNull: ["$prix", 0] },
        categorie: { $ifNull: ["$cat.nom", "—"] },
        marque: { $ifNull: ["$marque.nom", "—"] },
        date: { $ifNull: ["$dateReception", "$createdAt"] },
      },
    },
    { $sort: { prix: -1 } },
    { $limit: 5 },
  ]);

  // ----------------------------------------------------------
  // 8. ✅ NOUVEAU : Top 5 dépenses (les plus grosses)
  // ----------------------------------------------------------
  const topDepenses = await Depense.aggregate([
    { $match: matchDepense },
    {
      $project: {
        _id: 0,
        numero: 1,
        montant: 1,
        type: 1,
        dateDepense: 1,
        fournisseur: { $ifNull: ["$fournisseur", "—"] },
        categorieDiverse: { $ifNull: ["$categorieDiverse", "—"] },
        motifDiverse: { $ifNull: ["$motifDiverse", ""] },
        factureNumero: { $ifNull: ["$factureNumero", ""] },
      },
    },
    { $sort: { montant: -1 } },
    { $limit: 5 },
  ]);

  // ----------------------------------------------------------
  // ✅ RETOUR
  // ----------------------------------------------------------
  return {
    // ---- KPI principaux ----
    ca_total: Math.round(caData.ca_total * 100) / 100,
    depenses_total: Math.round(depenses_total * 100) / 100,
    depenses_reparation: Math.round(depReparation * 100) / 100,
    depenses_diverse: Math.round(depDiverse * 100) / 100,
    nb_dep_reparation: nbDepReparation,
    nb_dep_diverse: nbDepDiverse,

    marge_brute: Math.round(marge_brute * 100) / 100,
    benefice_net: Math.round(benefice_net * 100) / 100,

    taux_marge_brute: Math.round(taux_marge_brute * 10) / 10,
    taux_marge_nette: Math.round(taux_marge_nette * 10) / 10,

    panier_moyen: Math.round(panier_moyen * 100) / 100,
    cout_moyen_reparation: Math.round(cout_moyen_reparation * 100) / 100,
    nb_reparations: caData.nb_reparations,
    encaissements: Math.round(caData.encaissements * 100) / 100,

    // ---- Variations ----
    variations,

    // ---- Graphiques ----
    evolution,
    marge_par_famille: margeFamille,
    top_rentables: topRentables,
    top_depenses: topDepenses, // ✅ NOUVEAU
  };
};
// ============================================================
// 8. ✅ BÉNÉFICE DÉTAILLÉ PAR FAMILLE (et par catégorie)
// ------------------------------------------------------------
// Même base que l'onglet Bénéfices (réparations reçues sur la période,
// prix TTC + imprévus acceptés ; dépenses réparation + diverses).
//
// Par famille :
//  - Données DIRECTES (propres aux réparations de la famille) :
//      CA, encaissé, reste, coût réel des pièces consommées (dossier +
//      déclarations rattachées), commissions → marge directe.
//  - Dépenses réparation / diverses : non rattachées à une réparation →
//      réparties au prorata du CA (au nombre de réparations si CA = 0).
//      Bénéfice = CA − quote-part des dépenses. La somme des familles
//      est égale au bénéfice net de l'onglet Bénéfices.
// ============================================================
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

exports.getBeneficeFamilles = async (from, to) => {
  const Commission = require("../models/Commission");
  const DeclarationJournaliere = require("../models/DeclarationJournaliere");

  const match = buildMatch(from, to);
  const start = new Date(from);
  const end = new Date(to + "T23:59:59.999Z");

  // ----------------------------------------------------------
  // 1. Réparations de la période (une ligne par réparation)
  // ----------------------------------------------------------
  const reps = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "cat" } },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "familles", localField: "cat.famille", foreignField: "_id", as: "fam" } },
    { $unwind: { path: "$fam", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        famille: { $ifNull: ["$fam.nom", "Non classé"] },
        categorie: { $ifNull: ["$cat.nom", "Sans catégorie"] },
        ca: getPrixTotalExpr(),
        encaisse: { $ifNull: ["$acompte", 0] },
        pieces: {
          $filter: {
            input: { $ifNull: ["$piecesStock", []] },
            as: "p",
            cond: { $eq: ["$$p.statut", "consomme"] },
          },
        },
      },
    },
    {
      $project: {
        famille: 1, categorie: 1, ca: 1, encaisse: 1,
        coutPieces: { $sum: { $map: { input: "$pieces", as: "p", in: { $ifNull: ["$$p.coutTotal", 0] } } } },
        piecesSansCout: {
          $size: { $filter: { input: "$pieces", as: "p", cond: { $eq: [{ $ifNull: ["$$p.coutTotal", null] }, null] } } },
        },
      },
    },
  ]);
  const ids = reps.map((r) => r._id);

  // ----------------------------------------------------------
  // 2. Coûts rattachés aux réparations : déclarations + commissions
  // ----------------------------------------------------------
  const [declAgg, comAgg] = ids.length
    ? await Promise.all([
        DeclarationJournaliere.aggregate([
          { $match: { statut: { $in: ["validee", "cloturee"] }, "lignes.reparation": { $in: ids } } },
          { $unwind: "$lignes" },
          { $match: { "lignes.statut": "active", "lignes.reparation": { $in: ids } } },
          { $group: { _id: "$lignes.reparation", c: { $sum: { $ifNull: ["$lignes.coutTotal", 0] } } } },
        ]),
        // calculées + validées (les contre-écritures négatives sont « validee » → nettes)
        Commission.aggregate([
          { $match: { reparation: { $in: ids }, statut: { $in: ["calculee", "validee"] } } },
          { $group: { _id: "$reparation", c: { $sum: "$montant" } } },
        ]),
      ])
    : [[], []];
  const declMap = new Map(declAgg.map((d) => [String(d._id), d.c]));
  const comMap = new Map(comAgg.map((d) => [String(d._id), d.c]));

  // ----------------------------------------------------------
  // 3. Dépenses à répartir (même règle que l'onglet Bénéfices)
  // ----------------------------------------------------------
  const depAgg = await Depense.aggregate([
    {
      $match: {
        isDeleted: false,
        statut: { $ne: "annulee" },
        type: { $in: ["REPARATION", "DIVERSE"] },
        dateDepense: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$montant" } } },
  ]);
  const depReparation = depAgg.find((d) => d._id === "REPARATION")?.total || 0;
  const depDiverse = depAgg.find((d) => d._id === "DIVERSE")?.total || 0;

  // ----------------------------------------------------------
  // 4. Regroupement famille → catégories
  // ----------------------------------------------------------
  const vide = () => ({ nb: 0, ca: 0, encaisse: 0, cout_pieces: 0, commissions: 0, pieces_sans_cout: 0 });
  const add = (acc, r, coutPieces, com) => {
    acc.nb += 1;
    acc.ca += r.ca;
    acc.encaisse += r.encaisse;
    acc.cout_pieces += coutPieces;
    acc.commissions += com;
    acc.pieces_sans_cout += r.piecesSansCout;
  };
  const familles = new Map();
  const total = vide();
  for (const r of reps) {
    const coutPieces = (r.coutPieces || 0) + (declMap.get(String(r._id)) || 0);
    const com = comMap.get(String(r._id)) || 0;
    if (!familles.has(r.famille)) familles.set(r.famille, { ...vide(), categories: new Map() });
    const f = familles.get(r.famille);
    if (!f.categories.has(r.categorie)) f.categories.set(r.categorie, vide());
    add(f, r, coutPieces, com);
    add(f.categories.get(r.categorie), r, coutPieces, com);
    add(total, r, coutPieces, com);
  }

  // Clé de répartition : CA (ou nombre de réparations si CA total = 0)
  const parCA = total.ca > 0;
  const part = (x) => (parCA ? x.ca / total.ca : total.nb > 0 ? x.nb / total.nb : 0);

  const finaliser = (x, p = part(x)) => {
    const qpRep = depReparation * p;
    const qpDiv = depDiverse * p;
    const margeDirecte = x.ca - x.cout_pieces - x.commissions;
    const benefice = x.ca - qpRep - qpDiv;
    return {
      nb_reparations: x.nb,
      ca: r3(x.ca),
      encaisse: r3(x.encaisse),
      reste: r3(Math.max(0, x.ca - x.encaisse)),
      part_ca: Math.round(p * 1000) / 10,
      cout_pieces: r3(x.cout_pieces),
      commissions: r3(x.commissions),
      marge_directe: r3(margeDirecte),
      taux_marge_directe: pct(margeDirecte, x.ca),
      depenses_reparation: r3(qpRep),
      depenses_diverse: r3(qpDiv),
      depenses_total: r3(qpRep + qpDiv),
      benefice: r3(benefice),
      taux_benefice: pct(benefice, x.ca),
      panier_moyen: x.nb > 0 ? r3(x.ca / x.nb) : 0,
      benefice_moyen: x.nb > 0 ? r3(benefice / x.nb) : 0,
      pieces_sans_cout: x.pieces_sans_cout,
    };
  };

  const lignes = [...familles.entries()]
    .map(([nom, f]) => ({
      famille: nom,
      ...finaliser(f),
      categories: [...f.categories.entries()]
        .map(([cat, c]) => ({ categorie: cat, ...finaliser(c) }))
        .sort((a, b) => b.benefice - a.benefice),
    }))
    .sort((a, b) => b.benefice - a.benefice);

  return {
    periode: { from, to },
    cle_repartition: parCA ? "ca" : "nb_reparations",
    depenses_a_repartir: {
      reparation: r3(depReparation),
      diverse: r3(depDiverse),
      total: r3(depReparation + depDiverse),
    },
    totaux: finaliser(total, 1), // 100 % des dépenses (égal à l'onglet Bénéfices)
    familles: lignes,
  };
};
