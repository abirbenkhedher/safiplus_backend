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

// ✅ PERFORMANCE : pré-regroupe les réparations par identifiants AVANT les jointures
//    ($lookup sur quelques dizaines de lignes au lieu d'une par réparation).
//    Fournit _n (nombre), _ca (CA) et _enc (encaissé) à sommer ensuite.
const compact = (keys) => [
  {
    $group: {
      _id: Object.fromEntries(keys.map((k) => [k, "$" + k])),
      _n: { $sum: 1 },
      _ca: { $sum: getPrixTotalExpr() },
      _enc: { $sum: { $ifNull: ["$acompte", 0] } },
    },
  },
  { $replaceRoot: { newRoot: { $mergeObjects: ["$_id", { _n: "$_n", _ca: "$_ca", _enc: "$_enc" }] } } },
];

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
    ...compact(["categorie"]),
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "categorieData" } },
    { $unwind: "$categorieData" },
    { $lookup: { from: "familles", localField: "categorieData.famille", foreignField: "_id", as: "familleData" } },
    { $unwind: "$familleData" },
    {
      $group: {
        _id: "$familleData._id",
        nom: { $first: "$familleData.nom" },
        ca: { $sum: "$_ca" }
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
    ...compact(["categorie"]),
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    {
      $group: {
        _id: "$famData._id",
        nom: { $first: "$famData.nom" },
        ca: { $sum: "$_ca" },
        encaisse: { $sum: "$_enc" },
        nb_reparations: { $sum: "$_n" }
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
    ...compact(["categorie"]),
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    {
      $group: {
        _id: "$catData._id",
        nom: { $first: "$catData.nom" },
        famille: { $first: "$famData.nom" },
        ca: { $sum: "$_ca" },
        encaisse: { $sum: "$_enc" },
        nb_reparations: { $sum: "$_n" }
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
    ...compact(["categorie"]),
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $group: { _id: "$catData.nom", count: { $sum: "$_n" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 6. Top Objets
  // ============================================================
  const topObjets = await Reparation.aggregate([
    { $match: match },
    ...compact(["objet"]),
    { $lookup: { from: "objets", localField: "objet", foreignField: "_id", as: "objData" } },
    { $unwind: "$objData" },
    { $group: { _id: "$objData.nom", count: { $sum: "$_n" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 7. Top Marques
  // ============================================================
  const topMarques = await Reparation.aggregate([
    { $match: match },
    ...compact(["marque"]),
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: "$marqueData" },
    { $group: { _id: "$marqueData.nom", count: { $sum: "$_n" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 8. Top Modèles
  // ============================================================
  const topModeles = await Reparation.aggregate([
    { $match: match },
    ...compact(["modele"]),
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: "$modeleData" },
    { $group: { _id: "$modeleData.nom", count: { $sum: "$_n" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // ============================================================
  // 9. Par Type d'appareil (camembert)
  // ============================================================
  const parType = await Reparation.aggregate([
    { $match: match },
    ...compact(["categorie"]),
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "catData" } },
    { $unwind: "$catData" },
    { $lookup: { from: "familles", localField: "catData.famille", foreignField: "_id", as: "famData" } },
    { $unwind: "$famData" },
    { $group: { _id: "$famData.nom", count: { $sum: "$_n" } } },
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
    ...compact(["marque"]),
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marqueData" } },
    { $unwind: { path: "$marqueData", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$marqueData.nom", count: { $sum: "$_n" } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 2. Top Modèles
  const topModeles = await Reparation.aggregate([
    { $match: match },
    ...compact(["modele"]),
    { $lookup: { from: "modeles", localField: "modele", foreignField: "_id", as: "modeleData" } },
    { $unwind: { path: "$modeleData", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$modeleData.nom", count: { $sum: "$_n" } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, nom: "$_id", count: 1 } }
  ]);

  // 3. Tableau détaillé (Marque + Modèle + Objet + Catégorie)
  const table = await Reparation.aggregate([
    { $match: match },
    ...compact(["marque","modele","objet","categorie"]),
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
        nb_reparations: { $sum: "$_n" },
        ca: { $sum: "$_ca" },
        encaisse: { $sum: "$_enc" }
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

// ============================================================
// ✅ BASE COMMUNE DU BÉNÉFICE (onglets « Bénéfices » et « Bénéfice détaillé »)
// ------------------------------------------------------------
// Bénéfice net = CA HT (prix TTC des réparations ramenés en HT selon les paramètres de la boutique)
//              − coût des pièces consommées dans les dossiers (à leur coût d'achat)
//              − commissions des réparateurs (calculées + validées)
//              − dépenses réparation − dépenses diverses
//              − achats HORS stock (lignes libres des factures d'achat validées, coût HT)
// - Les pièces sont au coût HT de la facture d'achat (TVA récupérable).
// - Une pièce achetée POUR LE STOCK compte quand elle est consommée dans un
//   dossier, jamais à l'achat (sinon elle serait comptée deux fois).
// - Une dépense rattachée à une famille est imputée à cette famille ;
//   sans famille elle est « générale » (répartie au prorata du CA).
// ============================================================
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const SANS_FAMILLE = "__sans_famille__";
const dayExpr = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field } });

const baseBenefice = async (from, to) => {
  const Commission = require("../models/Commission");
  const match = buildMatch(from, to);
  const start = new Date(from);
  const end = new Date(to + "T23:59:59.999Z");

  // 1. Réparations de la période (une ligne par réparation)
  // ✅ PERFORMANCE : catégories / familles (petits référentiels) lues une fois et
  //    associées en mémoire, au lieu de 2 jointures par réparation
  const Categorie = require("../models/Categorie");
  const FamilleModel = require("../models/Famille");
  const [cats, fams] = await Promise.all([
    Categorie.find().select("nom famille").lean(),
    FamilleModel.find().select("nom").lean(),
  ]);
  const catMap = new Map(cats.map((c) => [String(c._id), c]));
  const famMap = new Map(fams.map((x) => [String(x._id), x]));

  const reps = await Reparation.aggregate([
    { $match: match },
    {
      $project: {
        boutique: 1,
        categorieId: "$categorie",
        jour: dayExpr({ $ifNull: ["$dateReception", "$createdAt"] }),
        ca: getPrixTotalExpr(),
        encaisse: { $ifNull: ["$acompte", 0] },
        pieces: {
          $filter: { input: { $ifNull: ["$piecesStock", []] }, as: "p", cond: { $eq: ["$$p.statut", "consomme"] } },
        },
      },
    },
    {
      $project: {
        boutique: 1, categorieId: 1, jour: 1, ca: 1, encaisse: 1,
        coutPieces: { $sum: { $map: { input: "$pieces", as: "p", in: { $ifNull: ["$$p.coutTotal", 0] } } } },
        piecesSansCout: {
          $size: { $filter: { input: "$pieces", as: "p", cond: { $eq: [{ $ifNull: ["$$p.coutTotal", null] }, null] } } },
        },
      },
    },
  ]);

  for (const r of reps) {
    const cat = r.categorieId ? catMap.get(String(r.categorieId)) : null;
    const fam = cat?.famille ? famMap.get(String(cat.famille)) : null;
    r.familleId = fam?._id;
    r.famille = fam?.nom || "Non classé";
    r.categorie = cat?.nom || "Sans catégorie";
    delete r.categorieId;
  }

  // 1b. CA HT : chaque boutique dit si ses prix sont TTC et à quel taux de TVA
  const { getParametres } = require("./atelierService");
  const { toHT } = require("./commissionService");
  const paramsBoutique = new Map();
  for (const b of new Set(reps.map((r) => String(r.boutique)))) paramsBoutique.set(b, await getParametres(b));
  for (const r of reps) {
    r.caTTC = r.ca;
    r.ca = toHT(paramsBoutique.get(String(r.boutique)), r.ca);
  }

  // 2. Commissions rattachées à ces réparations (contre-écritures négatives incluses → nettes)
  const ids = reps.map((r) => r._id);
  const comAgg = ids.length
    ? await Commission.aggregate([
        { $match: { reparation: { $in: ids }, statut: { $in: ["calculee", "validee"] } } },
        { $group: { _id: "$reparation", c: { $sum: "$montant" } } },
      ])
    : [];
  const comMap = new Map(comAgg.map((d) => [String(d._id), d.c]));
  for (const r of reps) {
    r.cle = r.familleId ? String(r.familleId) : SANS_FAMILLE;
    r.commissions = comMap.get(String(r._id)) || 0;
  }

  // 3. Dépenses réparation / diverses (par famille, type et jour)
  const depAgg = await Depense.aggregate([
    {
      $match: {
        isDeleted: false, statut: { $ne: "annulee" },
        type: { $in: ["REPARATION", "DIVERSE"] }, dateDepense: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: { famille: "$famille", type: "$type", jour: dayExpr("$dateDepense") }, total: { $sum: "$montant" }, count: { $sum: 1 } } },
  ]);

  // 4. Factures d'achat validées : lignes hors stock = dépense ; lignes stock = information
  const achAgg = await Depense.aggregate([
    { $match: { isDeleted: false, type: "ACHAT", statut: "validee", dateDepense: { $gte: start, $lte: end } } },
    { $unwind: "$lignes" },
    {
      $group: {
        _id: { famille: "$famille", jour: dayExpr("$dateDepense"), stock: { $ne: [{ $ifNull: ["$lignes.stock", null] }, null] } },
        // coût HT (anciennes factures sans TVA : montant de la ligne)
        total: { $sum: { $ifNull: ["$lignes.coutHT", { $ifNull: ["$lignes.montant", 0] }] } },
        count: { $sum: 1 },
      },
    },
  ]);

  const depenses = [
    ...depAgg.map((d) => ({ cle: d._id.famille ? String(d._id.famille) : null, type: d._id.type, jour: d._id.jour, total: d.total, count: d.count })),
    ...achAgg.filter((a) => !a._id.stock)
      .map((a) => ({ cle: a._id.famille ? String(a._id.famille) : null, type: "ACHAT_HORS_STOCK", jour: a._id.jour, total: a.total, count: a.count })),
  ];
  const achatsStock = achAgg.filter((a) => a._id.stock).reduce((s, a) => s + a.total, 0);

  // Noms des familles citées par des dépenses (même sans réparation sur la période)
  const Famille = require("../models/Famille");
  const nomsFamilles = new Map(reps.filter((r) => r.familleId).map((r) => [r.cle, r.famille]));
  const manquantes = [...new Set(depenses.map((d) => d.cle).filter((c) => c && !nomsFamilles.has(c)))];
  if (manquantes.length) {
    const fams = await Famille.find({ _id: { $in: manquantes } }).select("nom").lean();
    fams.forEach((f) => nomsFamilles.set(String(f._id), f.nom));
  }

  return { reps, depenses, achatsStock, nomsFamilles };
};

/** Totaux d'une base (période complète). */
const totauxBenefice = ({ reps, depenses }) => {
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const dep = (t) => sum(depenses.filter((d) => d.type === t), (d) => d.total);
  const t = {
    ca: sum(reps, (r) => r.ca),
    caTTC: sum(reps, (r) => r.caTTC),
    encaisse: sum(reps, (r) => r.encaisse),
    nb: reps.length,
    coutPieces: sum(reps, (r) => r.coutPieces),
    commissions: sum(reps, (r) => r.commissions),
    depReparation: dep("REPARATION"),
    depDiverse: dep("DIVERSE"),
    achatsHorsStock: dep("ACHAT_HORS_STOCK"),
    nbDepReparation: sum(depenses.filter((d) => d.type === "REPARATION"), (d) => d.count),
    nbDepDiverse: sum(depenses.filter((d) => d.type === "DIVERSE"), (d) => d.count),
  };
  t.coutsDirects = t.coutPieces + t.commissions + t.depReparation + t.achatsHorsStock;
  t.margeBrute = t.ca - t.coutsDirects;
  t.beneficeNet = t.margeBrute - t.depDiverse;
  t.depensesTotal = t.depReparation + t.depDiverse + t.achatsHorsStock;
  return t;
};

exports.getBenefice = async (from, to) => {
  const base = await baseBenefice(from, to);
  const t = totauxBenefice(base);
  const { reps, depenses, nomsFamilles } = base;
  const nomFamille = (cle) => (cle && cle !== SANS_FAMILLE ? nomsFamilles.get(cle) || "Famille supprimée" : cle === SANS_FAMILLE ? "Non classé" : "Générale (toutes familles)");

  // Période précédente (même calcul) pour les variations
  const prevDates = getPreviousPeriod(from, to);
  const prev = totauxBenefice(await baseBenefice(prevDates.from, prevDates.to));
  const variations = {
    ca_total: calcVariation(t.ca, prev.ca),
    depenses_total: calcVariation(t.coutsDirects + t.depDiverse, prev.coutsDirects + prev.depDiverse),
    benefice_net: calcVariation(t.beneficeNet, prev.beneficeNet),
  };

  // Évolution journalière : « dépenses » = tous les coûts (pièces, commissions, dépenses, achats hors stock)
  const evoMap = {};
  const jourRow = (j) => (evoMap[j] = evoMap[j] || { date: j, ca: 0, couts: 0 });
  for (const r of reps) {
    const row = jourRow(r.jour);
    row.ca += r.ca;
    row.couts += r.coutPieces + r.commissions;
  }
  for (const d of depenses) jourRow(d.jour).couts += d.total;
  const evolution = Object.values(evoMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      ca: Math.round(d.ca * 100) / 100,
      depenses: Math.round(d.couts * 100) / 100,
      benefice: Math.round((d.ca - d.couts) * 100) / 100,
    }));

  // Marge par famille (coûts directs de la famille ; les dépenses générales ne sont pas réparties ici)
  const famMap = new Map();
  const famRow = (cle, nom) => {
    if (!famMap.has(cle)) famMap.set(cle, { famille: nom, ca: 0, nb_reparations: 0, cout_pieces: 0, commissions: 0, depenses_directes: 0 });
    return famMap.get(cle);
  };
  for (const r of reps) {
    const f = famRow(r.cle, r.famille);
    f.ca += r.ca; f.nb_reparations += 1; f.cout_pieces += r.coutPieces; f.commissions += r.commissions;
  }
  for (const d of depenses.filter((x) => x.cle)) famRow(d.cle, nomFamille(d.cle)).depenses_directes += d.total;
  const margeFamille = [...famMap.values()]
    .map((f) => ({ ...f, ca: r3(f.ca), cout_pieces: r3(f.cout_pieces), commissions: r3(f.commissions), depenses_directes: r3(f.depenses_directes), marge: r3(f.ca - f.cout_pieces - f.commissions - f.depenses_directes) }))
    .sort((a, b) => b.ca - a.ca);

  // Dépenses par famille (réparation + diverses + achats hors stock)
  const parFam = new Map();
  for (const d of depenses) {
    const cle = d.cle || "";
    if (!parFam.has(cle)) parFam.set(cle, { famille: nomFamille(d.cle), generale: !d.cle, reparation: 0, diverse: 0, achats_hors_stock: 0, total: 0 });
    const row = parFam.get(cle);
    if (d.type === "REPARATION") row.reparation += d.total;
    else if (d.type === "DIVERSE") row.diverse += d.total;
    else row.achats_hors_stock += d.total;
    row.total += d.total;
  }
  const depensesParFamille = [...parFam.values()]
    .map((x) => ({ ...x, reparation: r3(x.reparation), diverse: r3(x.diverse), achats_hors_stock: r3(x.achats_hors_stock), total: r3(x.total) }))
    .sort((a, b) => b.total - a.total);

  // Top 5 réparations (prix)
  const topRentables = await Reparation.aggregate([
    { $match: buildMatch(from, to) },
    { $sort: { prix: -1, numero: 1 } },
    { $limit: 5 }, // ✅ jointures sur 5 lignes seulement (tri départagé par numéro)
    { $lookup: { from: "categories", localField: "categorie", foreignField: "_id", as: "cat" } },
    { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "marques", localField: "marque", foreignField: "_id", as: "marque" } },
    { $unwind: { path: "$marque", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0, numero: 1, prix: { $ifNull: ["$prix", 0] },
        categorie: { $ifNull: ["$cat.nom", "—"] }, marque: { $ifNull: ["$marque.nom", "—"] },
        date: { $ifNull: ["$dateReception", "$createdAt"] },
      },
    },
    { $sort: { prix: -1 } },
    { $limit: 5 },
  ]);

  // Top 5 dépenses (réparation + diverses), avec la famille
  const start = new Date(from);
  const end = new Date(to + "T23:59:59.999Z");
  const topDepenses = await Depense.aggregate([
    { $match: { isDeleted: false, statut: { $ne: "annulee" }, type: { $in: ["REPARATION", "DIVERSE"] }, dateDepense: { $gte: start, $lte: end } } },
    { $lookup: { from: "familles", localField: "famille", foreignField: "_id", as: "fam" } },
    { $unwind: { path: "$fam", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0, numero: 1, montant: 1, type: 1, dateDepense: 1,
        famille: { $ifNull: ["$fam.nom", ""] },
        fournisseur: { $ifNull: ["$fournisseur", "—"] },
        categorieDiverse: { $ifNull: ["$categorieDiverse", "—"] },
        motifDiverse: { $ifNull: ["$motifDiverse", ""] },
        factureNumero: { $ifNull: ["$factureNumero", ""] },
      },
    },
    { $sort: { montant: -1 } },
    { $limit: 5 },
  ]);

  const m2 = (n) => Math.round((n || 0) * 100) / 100;
  return {
    // ---- KPI principaux ----
    ca_total: m2(t.ca), // HT
    ca_ttc: m2(t.caTTC),
    tva_collectee: m2(t.caTTC - t.ca),
    cout_pieces: m2(t.coutPieces),
    commissions: m2(t.commissions),
    depenses_reparation: m2(t.depReparation),
    depenses_diverse: m2(t.depDiverse),
    achats_hors_stock: m2(t.achatsHorsStock),
    achats_stock_periode: m2(base.achatsStock), // information : comptés via les pièces consommées
    depenses_total: m2(t.depensesTotal),
    couts_directs: m2(t.coutsDirects),
    nb_dep_reparation: t.nbDepReparation,
    nb_dep_diverse: t.nbDepDiverse,

    marge_brute: m2(t.margeBrute),
    benefice_net: m2(t.beneficeNet),
    taux_marge_brute: t.ca > 0 ? Math.round((t.margeBrute / t.ca) * 1000) / 10 : 0,
    taux_marge_nette: t.ca > 0 ? Math.round((t.beneficeNet / t.ca) * 1000) / 10 : 0,

    panier_moyen: t.nb > 0 ? m2(t.ca / t.nb) : 0,
    cout_moyen_reparation: t.nb > 0 ? m2(t.coutsDirects / t.nb) : 0,
    nb_reparations: t.nb,
    encaissements: m2(t.encaisse),

    variations,
    evolution,
    marge_par_famille: margeFamille,
    depenses_par_famille: depensesParFamille,
    top_rentables: topRentables,
    top_depenses: topDepenses,
  };
};

// ============================================================
// 8. ✅ BÉNÉFICE DÉTAILLÉ PAR FAMILLE (et par catégorie)
// ------------------------------------------------------------
// Même base et même total que l'onglet Bénéfices (baseBenefice).
// Par famille :
//   marge directe = CA − coût des pièces − commissions
//   bénéfice      = marge directe − dépenses DE LA FAMILLE − quote-part des
//                   dépenses GÉNÉRALES (sans famille, au prorata du CA)
// Dans une famille, ses dépenses propres sont réparties entre ses catégories
// au prorata de leur CA. Somme des familles = bénéfice net de l'onglet Bénéfices.
// ============================================================
exports.getBeneficeFamilles = async (from, to) => {
  const base = await baseBenefice(from, to);
  const { reps, depenses, nomsFamilles } = base;

  const vide = () => ({ nb: 0, ca: 0, caTTC: 0, encaisse: 0, cout_pieces: 0, commissions: 0, pieces_sans_cout: 0 });
  const add = (acc, r) => {
    acc.nb += 1; acc.ca += r.ca; acc.caTTC += r.caTTC; acc.encaisse += r.encaisse;
    acc.cout_pieces += r.coutPieces; acc.commissions += r.commissions; acc.pieces_sans_cout += r.piecesSansCout;
  };
  const videDep = () => ({ reparation: 0, diverse: 0, achats: 0 });
  const addDep = (acc, d) => {
    if (d.type === "REPARATION") acc.reparation += d.total;
    else if (d.type === "DIVERSE") acc.diverse += d.total;
    else acc.achats += d.total;
  };

  const familles = new Map();
  const famille = (cle, nom) => {
    if (!familles.has(cle)) familles.set(cle, { nom, ...vide(), dep: videDep(), categories: new Map() });
    return familles.get(cle);
  };
  const total = vide();
  for (const r of reps) {
    const f = famille(r.cle, r.famille);
    if (!f.categories.has(r.categorie)) f.categories.set(r.categorie, vide());
    add(f, r); add(f.categories.get(r.categorie), r); add(total, r);
  }
  // Dépenses rattachées à une famille (même si elle n'a aucune réparation sur la période)
  const generales = videDep();
  const directesTotal = videDep();
  for (const d of depenses) {
    if (!d.cle) { addDep(generales, d); continue; }
    addDep(famille(d.cle, nomsFamilles.get(d.cle) || "Famille supprimée").dep, d);
    addDep(directesTotal, d);
  }

  // Clé de répartition des dépenses générales : CA (ou nombre de réparations si CA = 0)
  const parCA = total.ca > 0;
  const part = (x, ref = total) => (ref.ca > 0 ? x.ca / ref.ca : ref.nb > 0 ? x.nb / ref.nb : 0);

  const finaliser = (x, p, dir) => {
    const gen = { reparation: generales.reparation * p, diverse: generales.diverse * p, achats: generales.achats * p };
    const depDirectes = dir.reparation + dir.diverse + dir.achats;
    const depGenerales = gen.reparation + gen.diverse + gen.achats;
    const margeDirecte = x.ca - x.cout_pieces - x.commissions;
    const benefice = margeDirecte - depDirectes - depGenerales;
    return {
      nb_reparations: x.nb,
      ca: r3(x.ca),
      encaisse: r3(x.encaisse),
      reste: r3(Math.max(0, x.caTTC - x.encaisse)), // encaissements TTC
      part_ca: Math.round(p * 1000) / 10,
      cout_pieces: r3(x.cout_pieces),
      commissions: r3(x.commissions),
      marge_directe: r3(margeDirecte),
      taux_marge_directe: pct(margeDirecte, x.ca),
      depenses_directes: r3(depDirectes),
      depenses_generales: r3(depGenerales),
      depenses_reparation: r3(dir.reparation + gen.reparation),
      depenses_diverse: r3(dir.diverse + gen.diverse),
      achats_hors_stock: r3(dir.achats + gen.achats),
      depenses_total: r3(depDirectes + depGenerales),
      benefice: r3(benefice),
      taux_benefice: pct(benefice, x.ca),
      panier_moyen: x.nb > 0 ? r3(x.ca / x.nb) : 0,
      benefice_moyen: x.nb > 0 ? r3(benefice / x.nb) : 0,
      pieces_sans_cout: x.pieces_sans_cout,
    };
  };
  const scale = (dep, k) => ({ reparation: dep.reparation * k, diverse: dep.diverse * k, achats: dep.achats * k });

  const lignes = [...familles.values()]
    .map((f) => {
      const p = part(f);
      return {
        famille: f.nom,
        ...finaliser(f, p, f.dep),
        categories: [...f.categories.entries()]
          .map(([cat, c]) => {
            const k = part(c, f); // part de la catégorie dans sa famille
            return { categorie: cat, ...finaliser(c, p * k, scale(f.dep, k)) };
          })
          .sort((a, b) => b.benefice - a.benefice),
      };
    })
    .sort((a, b) => b.benefice - a.benefice);

  return {
    periode: { from, to },
    cle_repartition: parCA ? "ca" : "nb_reparations",
    depenses_a_repartir: {
      reparation: r3(generales.reparation),
      diverse: r3(generales.diverse),
      achats_hors_stock: r3(generales.achats),
      total: r3(generales.reparation + generales.diverse + generales.achats),
    },
    depenses_directes: r3(directesTotal.reparation + directesTotal.diverse + directesTotal.achats),
    totaux: finaliser(total, 1, directesTotal), // = bénéfice net de l'onglet Bénéfices
    familles: lignes,
  };
};
