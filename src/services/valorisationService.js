const Stock = require('../models/Stock');
const MouvementStock = require('../models/MouvementStock');
const LotStock = require('../models/LotStock');
const money = require('../utils/money');
const { so } = require('./transaction');
const { AppError } = require('../utils/appError');

// ============================================================
// ✅ VALORISATION DU STOCK (CMP / FIFO / coût manuel) — §5, §7
// ------------------------------------------------------------
// - CMP mis à jour à chaque entrée valorisée (achat validé, retour).
//   Q de référence = quantité physique (stock simplifié/détaillé)
//   ou cmpQuantiteBase (stock désactivé : achats − consommations).
// - Lots d'entrée toujours tenus (permet FIFO à tout moment).
// - Mode "desactive" : aucun mouvement physique.
// - Mises à jour optimistes (filtre updatedAt/quantite/cmp) : sûres
//   avec ou sans transaction.
// ============================================================

const MAX_RETRY = 8;
const isDesactive = (params) => params.modeStock === 'desactive';

const loadStock = async (id, session) => {
  const q = Stock.findById(id);
  if (session) q.session(session);
  const s = await q;
  if (!s) throw new AppError('Article (ligne de stock) introuvable', 404);
  return s;
};

const createOne = async (Model, doc, session) => {
  const [created] = await Model.create([doc], so(session));
  return created;
};

/** Coût de référence courant d'un article (sans consommer). */
const coutReference = (stock) => {
  if (stock.cmp !== null && stock.cmp !== undefined) return { cout: stock.cmp, source: 'CMP' };
  if (stock.coutManuel !== null && stock.coutManuel !== undefined) return { cout: stock.coutManuel, source: 'MANUEL' };
  return { cout: 0, source: 'ESTIME' };
};

const floorBase = (stockId, session) =>
  Stock.updateOne({ _id: stockId, cmpQuantiteBase: { $lt: 0 } }, { $set: { cmpQuantiteBase: 0 } }, so(session));

/** Consomme les lots FIFO. Retourne la valeur (millimes) et la quantité couverte. */
const consommerLots = async (stockId, quantite, session) => {
  let reste = quantite;
  let valeurM = 0;
  let couvert = 0;
  for (let guard = 0; reste > 0 && guard < 100; guard++) {
    const q = LotStock.findOne({ stock: stockId, isAnnule: false, quantiteRestante: { $gt: 0 } })
      .sort({ dateEntree: 1, _id: 1 });
    if (session) q.session(session);
    const lot = await q;
    if (!lot) break;
    const take = Math.min(reste, lot.quantiteRestante);
    const r = await LotStock.updateOne(
      { _id: lot._id, quantiteRestante: { $gte: take } },
      { $inc: { quantiteRestante: -take } },
      so(session)
    );
    if (!r.modifiedCount) continue; // modifié en parallèle : on relit
    valeurM += take * money.toM(lot.coutUnitaire);
    couvert += take;
    reste -= take;
  }
  return { valeurM, couvert };
};

/**
 * Entrée valorisée : achat, retour de consommation, transfert entrant.
 * @returns {{ cmp, mouvementId, quantiteApres }}
 */
const entree = async ({
  stockId, quantite, coutUnitaire, params, session = null, userId,
  physique = !isDesactive(params), type = 'ENTREE_ACHAT', motif = '',
  reparationId = null, sourceType = null, sourceId = null, lotSource = '',
  majDernierCout = false, majCmp = true,
}) => {
  const q = Number(quantite);
  if (!(q > 0)) throw new AppError('Quantité invalide');
  const c = money.round3(coutUnitaire);

  let s; let newCmp; let ok = false;
  for (let i = 0; i < MAX_RETRY && !ok; i++) {
    s = await loadStock(stockId, session);
    const Q = isDesactive(params) ? (s.cmpQuantiteBase || 0) : s.quantite;
    const prev = s.cmp ?? null; // sans coût connu : les unités existantes prennent le coût de l'entrée
    newCmp = !majCmp ? s.cmp : (prev === null ? c : money.cmp(Q, prev, q, c));
    const update = { $set: { cmp: newCmp }, $inc: { cmpQuantiteBase: q } };
    if (physique) update.$inc.quantite = q;
    if (majDernierCout) update.$set.dernierCoutAchat = c;
    const r = await Stock.updateOne(
      { _id: s._id, updatedAt: s.updatedAt, quantite: s.quantite, cmp: s.cmp ?? null },
      update,
      so(session)
    );
    ok = r.matchedCount === 1;
  }
  if (!ok) throw new AppError('Conflit de mise à jour du stock. Réessayez.', 409);

  await createOne(LotStock, {
    stock: s._id, boutique: s.boutique, quantiteInitiale: q, quantiteRestante: q,
    coutUnitaire: c, source: lotSource,
  }, session);

  let mouvementId = null;
  if (physique) {
    const mv = await createOne(MouvementStock, {
      stock: s._id, boutique: s.boutique, type, quantite: q,
      quantiteAvant: s.quantite, quantiteApres: s.quantite + q,
      coutUnitaire: c, reparationId, sourceType, sourceId, motif, createdBy: userId,
    }, session);
    mouvementId = mv._id;
  }
  return { cmp: newCmp, mouvementId, quantiteApres: physique ? s.quantite + q : s.quantite };
};

/**
 * Sortie valorisée (consommation). Le coût retenu est figé par l'appelant.
 * @returns {{ coutUnitaire, coutTotal, sourceCout, stockPhysique, mouvementId, prixVenteUnitaire, stock }}
 */
const sortie = async ({
  stockId, quantite, params, session = null, userId, type = 'RETRAIT_REPARATION',
  motif = '', reparationId = null, sourceType = null, sourceId = null, coutManuel = null,
}) => {
  const q = Number(quantite);
  if (!(q > 0) || !Number.isInteger(q)) throw new AppError('Quantité invalide');
  const physique = !isDesactive(params);
  const s = await loadStock(stockId, session);

  let quantiteAvant = s.quantite;
  if (physique) {
    const updated = await Stock.findOneAndUpdate(
      { _id: s._id, quantite: { $gte: q } },
      { $inc: { quantite: -q, cmpQuantiteBase: -q } },
      so(session, { new: true })
    );
    if (!updated) {
      throw new AppError(`Stock insuffisant (disponible : ${s.quantite})`, 400, 'STOCK_INSUFFISANT');
    }
    quantiteAvant = updated.quantite + q;
  } else {
    await Stock.updateOne({ _id: s._id }, { $inc: { cmpQuantiteBase: -q } }, so(session));
  }
  await floorBase(s._id, session);

  const fifo = await consommerLots(s._id, q, session);
  const ref = coutReference(s);
  let cu; let src; let totalExact = null;

  if (params.methodeValorisation === 'FIFO') {
    const resteM = (q - fifo.couvert) * money.toM(ref.cout);
    totalExact = money.fromM(fifo.valeurM + resteM); // total exact des lots (pas d'erreur d'arrondi)
    cu = money.fromM(Math.round((fifo.valeurM + resteM) / q));
    src = fifo.couvert >= q ? 'FIFO' : (ref.source === 'ESTIME' ? 'ESTIME' : 'FIFO');
  } else if (params.methodeValorisation === 'MANUEL') {
    const man = coutManuel ?? s.coutManuel;
    if (man !== null && man !== undefined && man !== '') { cu = money.round3(man); src = 'MANUEL'; }
    else { cu = ref.cout; src = 'ESTIME'; }
  } else {
    cu = ref.cout;
    src = ref.source === 'CMP' ? 'CMP' : 'ESTIME';
  }

  let mouvementId = null;
  if (physique) {
    const mv = await createOne(MouvementStock, {
      stock: s._id, boutique: s.boutique, type, quantite: -q,
      quantiteAvant, quantiteApres: quantiteAvant - q,
      coutUnitaire: cu, reparationId, sourceType, sourceId, motif, createdBy: userId,
    }, session);
    mouvementId = mv._id;
  }

  return {
    coutUnitaire: cu,
    coutTotal: totalExact ?? money.mul(cu, q),
    sourceCout: src,
    stockPhysique: physique,
    mouvementId,
    prixVenteUnitaire: money.round3(s.prixIndicatif || 0), // prix de vente / réparation
    stock: s,
  };
};

/**
 * Retour d'une consommation (annulation / restauration) au coût d'origine.
 * Ne remet en stock physique que si la sortie avait été physique.
 */
const retour = async ({
  stockId, quantite, coutUnitaire, stockPhysique = true, params, session = null, userId,
  type = 'ANNULATION_CONSOMMATION', motif = '', reparationId = null, sourceType = null, sourceId = null,
}) => {
  const hasCost = coutUnitaire !== null && coutUnitaire !== undefined;
  return entree({
    stockId, quantite, coutUnitaire: hasCost ? coutUnitaire : 0, params, session, userId,
    physique: stockPhysique !== false, type, motif, reparationId, sourceType, sourceId,
    lotSource: `RETOUR:${sourceType || ''}:${sourceId || ''}`, majCmp: hasCost,
  });
};

/** Annulation d'une entrée d'achat validée (contre-écriture). */
const annulerEntree = async ({
  stockId, quantite, coutUnitaire, params, physique, session = null, userId,
  motif = '', sourceType = null, sourceId = null, lotSource = '',
}) => {
  const q = Number(quantite);
  let s; let ok = false;
  for (let i = 0; i < MAX_RETRY && !ok; i++) {
    s = await loadStock(stockId, session);
    if (physique && s.quantite < q) {
      throw new AppError(
        `Impossible d'annuler : stock actuel ${s.quantite} < quantité achetée ${q} (pièces déjà consommées). Faites d'abord un ajustement.`,
        409
      );
    }
    const Q = isDesactive(params) ? (s.cmpQuantiteBase || 0) : s.quantite;
    const newCmp = s.cmp === null || s.cmp === undefined ? null : money.cmpRemove(Q, s.cmp, q, coutUnitaire);
    const update = { $set: { cmp: newCmp }, $inc: { cmpQuantiteBase: -q } };
    if (physique) update.$inc.quantite = -q;
    const r = await Stock.updateOne(
      { _id: s._id, updatedAt: s.updatedAt, quantite: s.quantite, cmp: s.cmp ?? null },
      update,
      so(session)
    );
    ok = r.matchedCount === 1;
  }
  if (!ok) throw new AppError('Conflit de mise à jour du stock. Réessayez.', 409);
  await floorBase(s._id, session);
  if (lotSource) {
    await LotStock.updateMany({ stock: s._id, source: lotSource }, { $set: { isAnnule: true, quantiteRestante: 0 } }, so(session));
  }
  if (physique) {
    await createOne(MouvementStock, {
      stock: s._id, boutique: s.boutique, type: 'ANNULATION_ACHAT', quantite: -q,
      quantiteAvant: s.quantite, quantiteApres: s.quantite - q,
      coutUnitaire: money.round3(coutUnitaire), sourceType, sourceId, motif, createdBy: userId,
    }, session);
  }
};

module.exports = { coutReference, entree, sortie, retour, annulerEntree, consommerLots };
