const Reparation = require('../models/Reparation');
const Commission = require('../models/Commission');
const RegleCommission = require('../models/RegleCommission');
const ContratReparateur = require('../models/ContratReparateur');
const Boutique = require('../models/Boutique');
const Stock = require('../models/Stock');
const Categorie = require('../models/Categorie');
const Depense = require('../models/Depense');
const money = require('../utils/money');
const logger = require('../config/logger');
const { getParametres, isPeriodeCloturee } = require('./atelierService');
const { coutReference } = require('./valorisationService');
const { periodeKey } = require('../utils/appError');

// ============================================================
// ✅ MOTEUR DE COMMISSIONS (§3, §8, §12)
// ------------------------------------------------------------
// 1. Chaque source (pièce consommée, intervention, ligne de
//    déclaration) produit un "souhait" identifié par cleBase.
// 2. La réconciliation compare souhaits / commissions existantes :
//    - nouvelle source          → commission "calculee" (cleBase#n)
//    - source modifiée, non validée → recalcul
//    - commission validée       → JAMAIS recalculée (figée)
//    - source disparue          → annulation (calculee) ou
//                                 contre-écriture (validee)
// 3. Index unique (boutique, cleSource) : aucune double commission.
// ============================================================

const sid = (v) => (v ? String(v._id || v) : null);
const norm = (s) => String(s || '').trim().toLowerCase();

const NIVEAUX = {
  5: 'reparateur+article', 4: 'article', 3: 'reparateur+categorie',
  2: 'categorie', 1: 'reparateur', 0: 'generale',
};

// ✅ Une règle « main-d'œuvre » porte sur la réparation (une fois par dossier), même
//    sans panne choisie : appliquée aux pièces, sa base vaudrait toujours 0.
//    (une ancienne règle main-d'œuvre ciblant un article reste au niveau article)
const niveauRegle = (r) => {
  if (r.base === 'benefice_net') return 'benefice'; // calcul mensuel, hors réparation
  if (r.typeCalcul === 'forfait_intervention' || r.panne) return 'intervention';
  if (r.base === 'main_oeuvre' && ['pourcentage', 'palier'].includes(r.typeCalcul)
    && !r.article && !r.categorie && !r.typeArticle) return 'intervention';
  return 'article';
};

const specificite = (r) => {
  let t = 0;
  if (r.article) t = 4;
  else if (r.categorie || r.typeArticle || r.panne) t = 2;
  else if (r.famille) t = 1.5; // famille : plus large qu'une catégorie
  return t + (r.reparateur ? 1 : 0) + (r.boutiqueCible ? 0.5 : 0); // ✅ exception boutique prioritaire
};

// Date « jour seul » saisie sans heure (stockée à 00:00 UTC) → début du jour en heure locale.
// Une date précise (nouvelle version de règle en cours de journée) est conservée telle quelle.
const debutJour = (d) => {
  const x = new Date(d);
  if (!x.getUTCHours() && !x.getUTCMinutes() && !x.getUTCSeconds() && !x.getUTCMilliseconds()) x.setHours(0, 0, 0, 0);
  return x;
};
const estValide = (r, date) =>
  r.actif !== false && debutJour(r.validFrom) <= date && (!r.validTo || new Date(r.validTo) >= date);

/** Règle la plus spécifique applicable (ou null). */
const resoudreRegle = (rules, { reparateur, stock, panne, date, niveau, boutique }) => {
  const cands = rules.filter((r) => {
    if (!estValide(r, date) || niveauRegle(r) !== niveau) return false;
    if (r.boutiqueCible && boutique && sid(r.boutiqueCible) !== sid(boutique)) return false;
    if (r.reparateur && sid(r.reparateur) !== sid(reparateur)) return false;
    if (niveau === 'article') {
      if (r.article) return sid(r.article) === sid(stock?._id);
      if (r.categorie) return sid(r.categorie) === sid(stock?.categorie);
      if (r.typeArticle) return sid(r.typeArticle) === sid(stock?.typeArticle);
      return true;
    }
    return r.panne ? norm(r.panne) === norm(panne) : true;
  });
  cands.sort((a, b) =>
    specificite(b) - specificite(a)
    || (b.priorite || 0) - (a.priorite || 0)
    || new Date(b.validFrom) - new Date(a.validFrom));
  return cands[0] || null;
};

/** Montant d'une commission selon la règle. */
const calculerMontant = (rule, { bases, quantite = 1, rangDebut = 0 }) => {
  const base = bases[rule.base] ?? 0;
  switch (rule.typeCalcul) {
    case 'pourcentage': return money.pct(base, rule.taux);
    case 'fixe_unite': return money.mul(rule.montantFixe, quantite);
    case 'forfait_intervention': return money.round3(rule.montantFixe);
    case 'palier': {
      const unitM = quantite > 0 ? money.toM(base) / quantite : 0;
      let totalM = 0;
      for (let i = 1; i <= quantite; i++) {
        const rang = rangDebut + i;
        const p = (rule.paliers || []).find((x) => rang >= x.de && (x.a === null || x.a === undefined || rang <= x.a));
        if (!p) continue;
        if (p.montant !== null && p.montant !== undefined) totalM += money.toM(p.montant);
        else if (p.taux !== null && p.taux !== undefined) totalM += Math.round((unitM * p.taux) / 100);
      }
      return money.fromM(totalM);
    }
    default: return 0;
  }
};

const prixTotalReparation = (rep) => {
  const imprevus = (rep.diagnosticImprevus?.imprevus || [])
    .filter((i) => i.accepte === true)
    .reduce((s, i) => s + money.toM(i.prixSupplementaire), 0);
  return money.fromM(money.toM(rep.prix) + imprevus);
};

const toHT = (params, ttc) => (params.prixTTC ? money.ht(ttc, params.tauxTVA) : money.round3(ttc));

/** Réparateurs et parts (%) d'une réparation (intervention partagée). */
const repartition = (rep) => {
  if ((rep.repartitionCommission || []).length > 0) {
    return rep.repartitionCommission.map((r) => ({ reparateur: sid(r.reparateur), part: Number(r.pourcentage) }));
  }
  const tech = rep.isSAV ? (rep.reparateurSAV || rep.reparateur) : rep.reparateur;
  return tech ? [{ reparateur: sid(tech), part: 100 }] : [];
};

// ------------------------------------------------------------
// Contexte de calcul (par boutique, mis en cache pour un lot)
// ------------------------------------------------------------
const buildCtxFactory = () => {
  const cache = new Map();
  const stocks = new Map();
  const alertes = [];
  const getCtx = async (boutiqueId) => {
    const key = sid(boutiqueId);
    if (!cache.has(key)) {
      // ✅ Règles et contrats : communs à la SOCIÉTÉ de la boutique
      const shop = await Boutique.findById(boutiqueId).select('organisation').lean();
      const org = shop?.organisation;
      const [params, rules, contrats] = await Promise.all([
        getParametres(boutiqueId),
        RegleCommission.find({ organisation: org, actif: true, $or: [{ boutiqueCible: null }, { boutiqueCible: boutiqueId }] }).lean(),
        ContratReparateur.find({ organisation: org }).lean(),
      ]);
      cache.set(key, { params, rules, contrats, boutique: boutiqueId });
    }
    return cache.get(key);
  };
  const getStock = async (id) => {
    const k = sid(id);
    if (!k) return null;
    if (!stocks.has(k)) stocks.set(k, await Stock.findById(k).lean());
    return stocks.get(k);
  };
  return { getCtx, getStock, alertes };
};

const modeContrat = (ctx, reparateur, date) => {
  const c = ctx.contrats
    .filter((x) => sid(x.reparateur) === sid(reparateur)
      && debutJour(x.validFrom) <= date && (!x.validTo || new Date(x.validTo) >= date))
    .sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom))[0];
  return c ? c.mode : null;
};

// ------------------------------------------------------------
// Souhaits (sources) d'une ligne consommée
// ------------------------------------------------------------
const souhaitLigne = async (f, ctx, { cleBase, sourceType, reparation, ligne, reparateur, part, date }) => {
  const stock = await f.getStock(ligne.stock);
  if (!stock || stock.commissionActive === false) return null;
  const rule = resoudreRegle(ctx.rules, { boutique: ctx.boutique, reparateur, stock, date, niveau: 'article' });
  if (!rule) {
    f.alertes.push({ type: 'AUCUNE_REGLE', cleBase, reparateur, article: sid(stock._id), message: `Aucune règle applicable (article ${stock.code || sid(stock._id)})` });
    return null;
  }
  const q = Number(ligne.quantite) || 0;
  // ✅ Le prix de réparation de l'article est INDICATIF : la valeur de vente d'une pièce
  //    est sa part du PRIX DU DOSSIER (au prorata du coût des pièces), calculée par l'appelant.
  const pvHT = ligne.valeurDossierHT ?? 0;
  const cout = ligne.coutTotal ?? money.mul(coutReference(stock).cout, q);
  return {
    cleBase, sourceType, reparation, sourceLigneId: ligne._id,
    article: stock._id, panne: null, reparateur, dateSource: date, quantite: q, part, rule,
    bases: { prix_vente: pvHT, cout_achat: cout, marge: money.sub(pvHT, cout), main_oeuvre: 0 },
  };
};

const souhaitsReparation = async (f, rep) => {
  if (!rep || rep.isDeleted || !rep.dateCloture) return [];
  const ctx = await f.getCtx(rep.boutique);
  if (rep.isSAV && !ctx.params.commissionSurSAV) return [];
  const date = new Date(rep.dateCloture);
  const parts = repartition(rep);
  if (parts.length === 0) {
    f.alertes.push({ type: 'SANS_REPARATEUR', reparation: sid(rep._id), message: `Réparation ${rep.numero} sans réparateur` });
    return [];
  }
  const piecesBrutes = (rep.piecesStock || []).filter((p) => p.statut === 'consomme');
  const prixHT = toHT(ctx.params, prixTotalReparation(rep));
  // ✅ Seul le PRIX DU DOSSIER compte (le prix de réparation des articles est indicatif) :
  //    chaque pièce reçoit une part du prix du dossier au prorata de son coût (à défaut : quantité).
  const couts = [];
  for (const p of piecesBrutes) {
    const st = await f.getStock(p.stock);
    couts.push(money.toM(p.coutTotal ?? money.mul(st ? coutReference(st).cout : 0, p.quantite)));
  }
  const coutPiecesM = couts.reduce((s, c) => s + c, 0);
  const qteTotale = piecesBrutes.reduce((s, p) => s + (Number(p.quantite) || 0), 0);
  const prixHTM = money.toM(prixHT);
  const pieces = piecesBrutes.map((p, i) => {
    const poids = coutPiecesM > 0 ? couts[i] / coutPiecesM : (qteTotale > 0 ? (Number(p.quantite) || 0) / qteTotale : 0);
    return { ...p, valeurDossierHT: money.fromM(Math.round(prixHTM * poids)) };
  });
  const coutPieces = money.fromM(coutPiecesM);
  const basesInterv = {
    prix_vente: prixHT,
    cout_achat: coutPieces,
    marge: money.sub(prixHT, coutPieces),
    // Main-d'œuvre = prix du dossier HT − coût d'achat HT des pièces
    main_oeuvre: Math.max(0, money.sub(prixHT, coutPieces)),
  };

  const out = [];
  for (const { reparateur, part } of parts) {
    if (modeContrat(ctx, reparateur, date) === 'salaire') continue; // salaire fixe : aucune commission
    const avant = out.length;
    for (const p of pieces) {
      const s = await souhaitLigne(f, ctx, {
        cleBase: `P:${sid(rep._id)}:${sid(p._id)}:${reparateur}`, sourceType: 'PIECE_REPARATION',
        reparation: rep._id, ligne: p, reparateur, part, date,
      });
      if (s) out.push(s);
    }
    // Interventions : forfait par panne ; autres règles une seule fois par réparation
    const pannes = [...new Set((rep.panneType || []).map(norm).filter(Boolean))];
    let unique = null;
    for (const panne of pannes.length ? pannes : ['']) {
      const rule = resoudreRegle(ctx.rules, { boutique: ctx.boutique, reparateur, panne, date, niveau: 'intervention' });
      if (!rule) continue;
      if (rule.typeCalcul === 'forfait_intervention') {
        out.push({
          cleBase: `I:${sid(rep._id)}:${panne || '*'}:${reparateur}`, sourceType: 'INTERVENTION',
          reparation: rep._id, sourceLigneId: null, article: null, panne: panne || null,
          reparateur, dateSource: date, quantite: 1, part, rule, bases: basesInterv,
        });
      } else if (!unique || specificite(rule) > specificite(unique)) {
        unique = rule;
      }
    }
    if (unique) {
      out.push({
        cleBase: `I:${sid(rep._id)}:*:${reparateur}:${unique.typeCalcul}`, sourceType: 'INTERVENTION',
        reparation: rep._id, sourceLigneId: null, article: null, panne: unique.panne || null,
        reparateur, dateSource: date, quantite: 1, part, rule: unique, bases: basesInterv,
      });
    }
    if (out.length === avant && !pieces.length) {
      f.alertes.push({ type: 'AUCUNE_REGLE', reparation: sid(rep._id), reparateur, message: `Réparation ${rep.numero} : aucune règle de commission applicable` });
    }
  }
  return out;
};

// ------------------------------------------------------------
// Réconciliation
// ------------------------------------------------------------
const rangAvant = async (reparateur, periode, regleId, before) => {
  const list = await Commission.find({
    reparateur, periode, regle: regleId, annule: null, statut: { $ne: 'annulee' },
    ...(before ? { createdAt: { $lt: before } } : {}),
  }).select('_id quantite').lean();
  if (list.length === 0) return 0;
  const reversed = await Commission.find({ annule: { $in: list.map((x) => x._id) } }).select('annule').lean();
  const rev = new Set(reversed.map((x) => sid(x.annule)));
  return list.filter((x) => !rev.has(sid(x._id))).reduce((s, x) => s + (x.quantite || 0), 0);
};

const snapshotRegle = (rule) => ({
  typeCalcul: rule.typeCalcul, base: rule.base, taux: rule.taux, montantFixe: rule.montantFixe,
  paliers: rule.paliers || [], version: rule.version || 1, niveau: NIVEAUX[specificite(rule)],
});

const montantSouhait = async (s, existingCreatedAt = null) => {
  const periode = periodeKey(s.dateSource);
  const rangDebut = s.rule.typeCalcul === 'palier'
    ? await rangAvant(s.reparateur, periode, s.rule._id, existingCreatedAt)
    : 0;
  const brut = calculerMontant(s.rule, { bases: s.bases, quantite: s.quantite, rangDebut });
  const montant = s.part === 100 ? brut : money.pct(brut, s.part);
  return { montant, baseMontant: s.bases[s.rule.base] ?? 0 };
};

const reconcilier = async (f, souhaits, scopeFilter, userId) => {
  const stats = { crees: 0, recalculees: 0, annulees: 0, contrePassations: 0 };
  const existing = await Commission.find({ ...scopeFilter, sourceType: { $ne: 'AJUSTEMENT' } });
  const groups = new Map();
  for (const e of existing) {
    if (!groups.has(e.cleBase)) groups.set(e.cleBase, []);
    groups.get(e.cleBase).push(e);
  }
  const wanted = new Map(souhaits.map((s) => [s.cleBase, s]));
  const keys = new Set([...groups.keys(), ...wanted.keys()]);

  for (const cleBase of keys) {
    const list = groups.get(cleBase) || [];
    const reversed = new Set(list.filter((e) => e.annule).map((e) => sid(e.annule)));
    const active = list.find((e) => !e.annule && e.statut !== 'annulee' && !reversed.has(sid(e._id)));
    const s = wanted.get(cleBase);

    try {
      if (s) {
        if (!active) {
          const ctx = await f.getCtx(s.boutique || (await Reparation.findById(s.reparation).select('boutique').lean())?.boutique);
          let dateSource = s.dateSource;
          if (await isPeriodeCloturee(ctx.boutique, dateSource)) dateSource = new Date(); // régularisation
          const { montant, baseMontant } = await montantSouhait({ ...s, dateSource });
          const n = list.filter((e) => !e.annule).length + 1;
          await Commission.create({
            boutique: ctx.boutique, reparateur: s.reparateur, sourceType: s.sourceType,
            reparation: s.reparation, sourceLigneId: s.sourceLigneId,
            article: s.article, panne: s.panne, cleBase, cleSource: `${cleBase}#${n}`,
            dateSource, periode: periodeKey(dateSource), quantite: s.quantite, partPourcentage: s.part,
            regle: s.rule._id, regleSnapshot: snapshotRegle(s.rule), baseMontant, montant,
            details: s.details || null, statut: 'calculee', createdBy: userId || null,
          });
          stats.crees++;
        } else if (active.statut === 'calculee') {
          const { montant, baseMontant } = await montantSouhait({ ...s, dateSource: active.dateSource }, active.createdAt);
          const detailsChanges = s.details && JSON.stringify(s.details) !== JSON.stringify(active.details || null);
          if (montant !== active.montant || sid(active.regle) !== sid(s.rule._id) || active.quantite !== s.quantite || detailsChanges) {
            active.set({
              montant, baseMontant, regle: s.rule._id, regleSnapshot: snapshotRegle(s.rule),
              quantite: s.quantite, partPourcentage: s.part, ...(s.details ? { details: s.details } : {}),
            });
            await active.save();
            stats.recalculees++;
          }
        }
        // validée : figée, jamais recalculée silencieusement
      } else if (active) {
        if (active.statut === 'calculee') {
          active.statut = 'annulee';
          active.motif = 'Source annulée ou devenue non éligible';
          await active.save();
          stats.annulees++;
        } else {
          const now = new Date();
          await Commission.create({
            boutique: active.boutique, reparateur: active.reparateur, sourceType: active.sourceType,
            reparation: active.reparation, sourceLigneId: active.sourceLigneId,
            article: active.article, panne: active.panne, cleBase, cleSource: `${active.cleSource}:annul`,
            dateSource: now, periode: periodeKey(now), quantite: -active.quantite,
            partPourcentage: active.partPourcentage, regle: active.regle, regleSnapshot: active.regleSnapshot,
            baseMontant: -active.baseMontant, montant: -active.montant, statut: 'validee',
            annule: active._id, motif: 'Contre-écriture : source annulée après validation',
            valideeLe: now, valideePar: userId || null, createdBy: userId || null,
          });
          stats.contrePassations++;
        }
      }
    } catch (err) {
      if (err.code === 11000) continue; // déjà traité en parallèle
      throw err;
    }
  }
  return stats;
};

const addStats = (a, b) => {
  for (const k of Object.keys(b)) a[k] = (a[k] || 0) + b[k];
  return a;
};

// ------------------------------------------------------------
// API publique
// ------------------------------------------------------------

/** Recalcule les commissions d'une réparation (appel non bloquant possible). */
const syncReparation = async (reparationId, userId) => {
  const f = buildCtxFactory();
  const rep = await Reparation.findById(reparationId).lean();
  if (!rep) return { alertes: [] };
  const souhaits = (await souhaitsReparation(f, rep)).map((s) => ({ ...s, boutique: rep.boutique }));
  const stats = await reconcilier(f, souhaits, {
    reparation: rep._id, sourceType: { $in: ['PIECE_REPARATION', 'INTERVENTION'] },
  }, userId);
  return { ...stats, alertes: f.alertes };
};

/** Variante "fire and forget" : n'interrompt jamais l'action principale. */
const syncReparationSafe = (reparationId, userId) =>
  syncReparation(reparationId, userId).catch((err) =>
    logger.error(`Commission sync réparation ${reparationId}:`, err));

// ------------------------------------------------------------
// ✅ BÉNÉFICE NET MENSUEL (base « benefice_net »), en TTC
//   Pour chaque mois, boutique et réparateur :
//   marge = Σ (prix du dossier TTC − coût TTC des pièces) × part du réparateur
//           sur ses réparations clôturées du mois (famille / catégorie de la règle)
//   dépenses = dépenses du mois imputées à la famille (hors factures d'achat de stock,
//              déjà comptées via le coût des pièces) × (marge du réparateur / marge de
//              toute la famille ce mois)
//   commission = taux × max(0, marge − dépenses)
// ------------------------------------------------------------
const ttcDe = (params, montant, taux) => (params.prixTTC !== false ? money.round3(montant)
  : money.round3(Number(montant) * (1 + (Number(taux ?? params.tauxTVA) || 0) / 100)));
const debutMois = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const finMois = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const beneficeMois = async (f, boutique, mois, userId) => {
  const from = debutMois(mois); const to = finMois(mois);
  const periode = periodeKey(from);
  const ctx = await f.getCtx(boutique);
  const regles = ctx.rules.filter((r) => niveauRegle(r) === 'benefice' && estValide(r, to));

  const souhaits = [];
  if (regles.length) {
    const reps = await Reparation.find({ boutique, isDeleted: { $ne: true }, dateCloture: { $gte: from, $lte: to } })
      .select('numero boutique categorie prix diagnosticImprevus piecesStock repartitionCommission reparateur reparateurSAV isSAV').lean();
    const catIds = [...new Set(reps.map((r) => sid(r.categorie)).filter(Boolean))];
    const cats = await Categorie.find({ _id: { $in: catIds } }).select('famille nom').lean();
    const familleDe = new Map(cats.map((c) => [sid(c._id), sid(c.famille)]));

    // Marge TTC de chaque réparation
    const lignes = [];
    for (const rep of reps) {
      if (rep.isSAV && !ctx.params.commissionSurSAV) continue;
      let coutTTCM = 0;
      for (const p of (rep.piecesStock || []).filter((x) => x.statut === 'consomme')) {
        const st = await f.getStock(p.stock);
        const coutHT = p.coutTotal ?? money.mul(st ? coutReference(st).cout : 0, p.quantite);
        const t = st?.tauxTVA ?? ctx.params.tauxTVA ?? 0;
        coutTTCM += Math.round(money.toM(coutHT) * (1 + (Number(t) || 0) / 100));
      }
      const prixTTCM = money.toM(ttcDe(ctx.params, prixTotalReparation(rep)));
      lignes.push({ rep, famille: familleDe.get(sid(rep.categorie)) || null, margeM: prixTTCM - coutTTCM, parts: repartition(rep) });
    }

    // Marge totale par famille (tous réparateurs) : clé de répartition des dépenses
    const margeFamilleM = new Map();
    for (const l of lignes) margeFamilleM.set(l.famille, (margeFamilleM.get(l.famille) || 0) + l.margeM);
    const deps = await Depense.find({
      boutique, type: { $ne: 'ACHAT' }, statut: { $ne: 'annulee' }, isDeleted: { $ne: true },
      famille: { $ne: null }, dateDepense: { $gte: from, $lte: to },
    }).select('famille montant').lean();
    const depFamilleM = new Map();
    for (const d of deps) depFamilleM.set(sid(d.famille), (depFamilleM.get(sid(d.famille)) || 0) + money.toM(d.montant));

    // Regroupement : (réparateur, règle la plus précise) → marge par famille
    const groupes = new Map();
    for (const l of lignes) {
      for (const { reparateur, part } of l.parts) {
        if (modeContrat(ctx, reparateur, to) === 'salaire') continue;
        const cands = regles.filter((r) => {
          if (r.boutiqueCible && sid(r.boutiqueCible) !== sid(boutique)) return false;
          if (r.reparateur && sid(r.reparateur) !== sid(reparateur)) return false;
          if (r.categorie) return sid(r.categorie) === sid(l.rep.categorie);
          if (r.famille) return sid(r.famille) === l.famille;
          return true;
        }).sort((a, b) => specificite(b) - specificite(a) || (b.priorite || 0) - (a.priorite || 0)
          || new Date(b.validFrom) - new Date(a.validFrom));
        const rule = cands[0];
        if (!rule) continue;
        const k = `${reparateur}|${sid(rule._id)}`;
        if (!groupes.has(k)) groupes.set(k, { reparateur, rule, parFamille: new Map(), reparations: new Set() });
        const g = groupes.get(k);
        g.parFamille.set(l.famille, (g.parFamille.get(l.famille) || 0) + Math.round((l.margeM * part) / 100));
        g.reparations.add(l.rep.numero || sid(l.rep._id));
      }
    }

    for (const g of groupes.values()) {
      let margeM = 0; let depM = 0;
      for (const [fam, m] of g.parFamille) {
        margeM += m;
        const totalFam = margeFamilleM.get(fam) || 0;
        const depFam = fam ? (depFamilleM.get(fam) || 0) : 0;
        if (depFam && totalFam > 0) depM += Math.round((depFam * m) / totalFam);
        else if (depFam && totalFam <= 0) depM += depFam; // marge nulle : toute la dépense pèse
      }
      const beneficeM = margeM - depM;
      souhaits.push({
        cleBase: `B:${sid(boutique)}:${periode}:${g.reparateur}:${sid(g.rule._id)}`, sourceType: 'BENEFICE_NET',
        boutique, reparation: null, sourceLigneId: null, article: null, panne: null,
        reparateur: g.reparateur, dateSource: to, quantite: 1, part: 100, rule: g.rule,
        bases: { benefice_net: money.fromM(Math.max(0, beneficeM)) },
        details: {
          periode, marge: money.fromM(margeM), depenses: money.fromM(depM), benefice: money.fromM(beneficeM),
          nbReparations: g.reparations.size, reparations: [...g.reparations].slice(0, 50),
          famille: sid(g.rule.famille), categorie: sid(g.rule.categorie), ttc: true,
        },
      });
    }
  }
  return reconcilier(f, souhaits, {
    sourceType: 'BENEFICE_NET', boutique, cleBase: { $regex: `^B:${sid(boutique)}:${periode}:` },
  }, userId);
};

/** Bénéfice net : recalcul de chaque mois couvert par [from, to], pour les boutiques concernées. */
const calculerBeneficeNet = async ({ from, to, userId }) => {
  const f = buildCtxFactory();
  const total = { crees: 0, recalculees: 0, annulees: 0, contrePassations: 0 };
  const boutiques = new Set([
    ...(await Reparation.distinct('boutique', { dateCloture: { $gte: debutMois(new Date(from)), $lte: finMois(new Date(to)) } })).map(String),
    ...(await Commission.distinct('boutique', { sourceType: 'BENEFICE_NET', dateSource: { $gte: debutMois(new Date(from)), $lte: finMois(new Date(to)) } })).map(String),
  ]);
  for (let m = debutMois(new Date(from)); m <= new Date(to); m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    for (const b of boutiques) addStats(total, await beneficeMois(f, b, m, userId));
  }
  return { ...total, alertes: f.alertes };
};

/** Calcul (idempotent) de toutes les commissions d'une période. */
const calculerPeriode = async ({ from, to, reparateur = null, userId }) => {
  const total = { crees: 0, recalculees: 0, annulees: 0, contrePassations: 0, alertes: [] };
  const repFilter = { $or: [{ dateCloture: { $gte: from, $lte: to } }] };
  const fromCommissions = await Commission.distinct('reparation', {
    dateSource: { $gte: from, $lte: to }, reparation: { $ne: null },
  });
  if (fromCommissions.length) repFilter.$or.push({ _id: { $in: fromCommissions } });
  const repIds = await Reparation.distinct('_id', repFilter);

  for (const id of repIds) {
    const r = await syncReparation(id, userId);
    addStats(total, { crees: r.crees || 0, recalculees: r.recalculees || 0, annulees: r.annulees || 0, contrePassations: r.contrePassations || 0 });
    total.alertes.push(...(r.alertes || []));
  }
  // ✅ Commissions mensuelles « bénéfice net »
  const bn = await calculerBeneficeNet({ from, to, userId });
  addStats(total, { crees: bn.crees || 0, recalculees: bn.recalculees || 0, annulees: bn.annulees || 0, contrePassations: bn.contrePassations || 0 });

  if (reparateur) total.alertes = total.alertes.filter((a) => !a.reparateur || sid(a.reparateur) === sid(reparateur));
  return total;
};

/** Valide les commissions "calculee" correspondant au filtre (hors périodes clôturées). */
const valider = async (filter, userId) => {
  const r = await Commission.updateMany(
    { ...filter, statut: 'calculee' },
    { $set: { statut: 'validee', valideeLe: new Date(), valideePar: userId } }
  );
  return r.modifiedCount;
};

module.exports = {
  resoudreRegle, calculerMontant, specificite, niveauRegle, NIVEAUX, repartition,
  prixTotalReparation, toHT,
  syncReparation, syncReparationSafe, calculerPeriode, calculerBeneficeNet, valider,
};
