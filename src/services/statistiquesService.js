const Reparation = require("../models/Reparation");
const Status = require("../models/Status");

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

  // 1. KPI Nombre de réparations
  const kpis = await Reparation.aggregate([
    { $match: match },
    { $group: { _id: null, nb_reparations: { $sum: 1 } } }
  ]);
  const current = kpis[0] || { nb_reparations: 0 };

  // 2. Calcul du délai moyen basé sur le PREMIER changement de statut
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

  // 3. Taux de réussite (basé sur les statuts contenant "REPARE")
  const statutsSucces = await Status.find({ label: { $regex: /REPARE/i } });
  const statutSuccesIds = statutsSucces.map(s => s._id);
  const succesCount = await Reparation.countDocuments({ 
    ...match, 
    status: { $in: statutSuccesIds } 
  });
  const taux_reussite = current.nb_reparations > 0 
    ? (succesCount / current.nb_reparations) * 100 
    : 0;

  // 4. Période précédente pour les variations
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

  // Taux de réussite période précédente
  const prevSuccesCount = await Reparation.countDocuments({ 
    ...prevMatch, 
    status: { $in: statutSuccesIds } 
  });
  const prevTauxReussite = prev.nb_reparations > 0 ? (prevSuccesCount / prev.nb_reparations) * 100 : 0;

  const variations = {
    nb_reparations: calcVariation(current.nb_reparations, prev.nb_reparations),
    delai_moyen: calcVariation(delaiMoyen, prevDelaiMoyen),
    taux_reussite: calcVariation(taux_reussite, prevTauxReussite),
  };

  // ============================================================
  // ✅ NOUVEAUX TOPS (remplacent par_etat)
  // ============================================================

  // 5. Top Catégories
  const topCategories = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $group: { _id: "$catData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 6. Top Objets
  const topObjets = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "objets", localField: "objet", foreignField: "_id", as: "objData" } },
    { $unwind: "$objData" },
    { $group: { _id: "$objData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 7. Top Marques
  const topMarques = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: "$marqueData" },
    { $group: { _id: "$marqueData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 8. Top Modèles
  const topModeles = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: "$modeleData" },
    { $group: { _id: "$modeleData.nom", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 9. Par Type d'appareil (pour le camembert)
  const parType = await Reparation.aggregate([
    { $match: match },
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    { $group: { _id: "$famData.nom", count: { $sum: 1 } } },
    { $project: { _id: 0, type: "$_id", count: 1 } }
  ]);

  // 10. Par Jour de la semaine
  const parJourRaw = await Reparation.aggregate([
    { $match: match },
    { $group: { _id: { $dayOfWeek: { $ifNull: ["$dateReception", "$createdAt"] } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const joursMap = { 1: "Dim", 2: "Lun", 3: "Mar", 4: "Mer", 5: "Jeu", 6: "Ven", 7: "Sam" };
  const parJour = parJourRaw.map(j => ({ jour: joursMap[j._id], count: j.count }));

  return {
    nb_reparations: current.nb_reparations,
    delai_moyen: Math.round(delaiMoyen * 10) / 10,
    taux_reussite: Math.round(taux_reussite * 10) / 10,
    variations,
    top_categories: topCategories,
    top_objets: topObjets,
    top_marques: topMarques,
    top_modeles: topModeles,
    par_type: parType,
    par_jour: parJour
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