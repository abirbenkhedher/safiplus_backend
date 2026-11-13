const mongoose = require('mongoose');
const DocumentVente = require('../models/DocumentVente');
const Reglement = require('../models/Reglement');
const Reparation = require('../models/Reparation');
const Client = require('../models/Client');
const Stock = require('../models/Stock');
const Status = require('../models/Status');
const Boutique = require('../models/Boutique');
const Counter = require('../models/Counter');
const valorisation = require('./valorisationService');
const commissionService = require('./commissionService');
const { getParametres, requireBoutiqueId } = require('./atelierService');
const { withTransaction, so } = require('./transaction');
const { toM, fromM, round3 } = require('../utils/money');
const { prixTotalReparation, doitEtreCloturee } = require('../utils/statutReparation');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

// ============================================================
// ✅ GESTION COMMERCIALE — documents de vente et règlements
// ============================================================

const sameId = (a, b) => a && b && String(a) === String(b);
const ACTIFS = ['brouillon', 'valide'];
// Documents qui portent un montant dû (règlements, avoirs, soldes)
const PAYABLES = ['FACTURE', 'TICKET'];

/** Numéro suivant, dans la transaction (pas de trou si elle est annulée). */
const nextSeq = async (key, session) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: key }, { $inc: { seq: 1 } }, so(session, { new: true, upsert: true })
  );
  return doc.seq;
};

const numeroDocument = async (doc, session) => {
  const year = new Date(doc.date || Date.now()).getFullYear();
  const prefix = DocumentVente.PREFIXES[doc.type];
  const seq = await nextSeq(`vente:${doc.type}:${doc.boutique}:${year}`, session);
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
};

const numeroReglement = async (boutique, date, session) => {
  const year = new Date(date || Date.now()).getFullYear();
  const seq = await nextSeq(`reglement:${boutique}:${year}`, session);
  return `RG-${year}-${String(seq).padStart(4, '0')}`;
};

const withSession = (q, session) => (session ? q.session(session) : q);

// ------------------------------------------------------------
// Lignes
// ------------------------------------------------------------
const nomOf = (x) => (x && typeof x === 'object' ? x.nom || x.label || '' : '');

const designationReparation = (r) => {
  const appareil = [nomOf(r.marque), nomOf(r.modele)].filter(Boolean).join(' ');
  const pannes = (r.panneType || []).join(', ');
  return `Réparation ${r.numero || ''}${appareil ? ` — ${appareil}` : ''}${pannes ? ` (${pannes})` : ''}`.trim();
};

const designationStock = (st) =>
  [nomOf(st.typeArticle), nomOf(st.marque), nomOf(st.modele)].filter(Boolean).join(' ') || st.code || 'Article';

const num = (v, def = 0) => (v === undefined || v === null || v === '' ? def : Number(v));

/**
 * Normalise les lignes reçues du client.
 * Les lignes « article » doivent appartenir à la boutique ; les lignes
 * « réparation » au même client et à la même boutique.
 */
const buildLignes = async (raw, { boutique, client, params, type, origines = {} }) => {
  if (!Array.isArray(raw)) throw new AppError('Lignes invalides');
  const tvaDefaut = Number(params.tauxTVA) || 0;
  const coutsBL = origines.coutsBL || new Map();         // `${blId}:${stockId}` → coût (stock déjà sorti)
  const coutsFacture = origines.coutsFacture || new Map(); // avoir : stockId → coût figé de la facture
  const out = [];
  for (const l of raw) {
    const quantite = num(l.quantite, 1);
    if (!(quantite > 0)) throw new AppError('Quantité invalide sur une ligne');
    const remisePct = num(l.remisePct, 0);
    if (!(remisePct >= 0 && remisePct <= 100)) throw new AppError('Remise invalide (0 à 100 %)');
    const tauxTVA = num(l.tauxTVA, tvaDefaut);
    if (!(tauxTVA >= 0 && tauxTVA <= 100)) throw new AppError('Taux de TVA invalide');
    // Jamais pris du client : « stock déjà sorti » et coût viennent du BL / de la facture d'origine
    const cleBL = l.origineDocument && l.stock ? `${l.origineDocument}:${l.stock}` : null;
    const depuisBL = !!cleBL && coutsBL.has(cleBL);
    const base = {
      quantite, remisePct, tauxTVA,
      retourStock: type === 'AVOIR' ? l.retourStock !== false : false,
      stockSorti: depuisBL,
      coutUnitaire: depuisBL ? coutsBL.get(cleBL) : type === 'AVOIR' && l.stock ? coutsFacture.get(String(l.stock)) ?? null : null,
      origineDocument: depuisBL ? l.origineDocument : null,
      mouvementStock: null,
    };

    if (l.type === 'reparation' || l.reparation) {
      if (!mongoose.isValidObjectId(l.reparation)) throw new AppError('Réparation invalide sur une ligne');
      const r = await Reparation.findOne({ _id: l.reparation, isDeleted: { $ne: true } })
        .populate('marque modele', 'nom').lean({ virtuals: false });
      if (!r) throw new AppError('Réparation introuvable');
      if (!sameId(r.boutique, boutique)) throw new AppError(`Réparation ${r.numero} : autre boutique`);
      if (!sameId(r.client, client)) throw new AppError(`Réparation ${r.numero} : autre client`);
      out.push({
        ...base, type: 'reparation', reparation: r._id, stock: null, code: r.numero || '',
        designation: String(l.designation || '').trim() || designationReparation(r),
        quantite: 1, unite: '',
        prixUnitaire: num(l.prixUnitaire, prixTotalReparation(r)),
      });
      continue;
    }

    if (l.type === 'article' || l.stock) {
      if (!mongoose.isValidObjectId(l.stock)) throw new AppError('Article invalide sur une ligne');
      const st = await Stock.findById(l.stock).populate('typeArticle marque modele', 'nom').lean();
      if (!st) throw new AppError('Article introuvable');
      if (!sameId(st.boutique, boutique)) throw new AppError("Article d'une autre boutique");
      // ✅ Une pièce de réparation ne se vend pas seule (sauf usage « les deux »)
      if (type !== 'AVOIR' && !depuisBL && !Stock.utilisablePour(st, 'vente')) {
        throw new AppError(`« ${designationStock(st)} » est une pièce de réparation : changez son usage en « Produit de vente » ou « Les deux » pour la vendre`, 400, 'USAGE_ARTICLE');
      }
      if (!Number.isInteger(quantite)) throw new AppError('La quantité d\'un article doit être un nombre entier');
      const prixUnitaire = num(l.prixUnitaire, st.prixIndicatif || 0);
      if (!(prixUnitaire >= 0)) throw new AppError('Prix unitaire invalide');
      const sansTVA = l.tauxTVA === undefined || l.tauxTVA === null || l.tauxTVA === '';
      out.push({
        ...base,
        // TVA propre à l'article si la ligne n'en précise pas
        tauxTVA: sansTVA && st.tauxTVA !== null && st.tauxTVA !== undefined ? st.tauxTVA : base.tauxTVA,
        type: 'article', stock: st._id, reparation: null, code: st.code || '',
        designation: String(l.designation || '').trim() || designationStock(st),
        unite: st.unite || '', prixUnitaire,
      });
      continue;
    }

    const designation = String(l.designation || '').trim();
    if (!designation) throw new AppError('Désignation obligatoire pour une ligne libre');
    const prixUnitaire = num(l.prixUnitaire, NaN);
    if (!(prixUnitaire >= 0)) throw new AppError('Prix unitaire invalide');
    out.push({
      ...base, type: 'libre', stock: null, reparation: null, code: String(l.code || '').trim(),
      designation, unite: String(l.unite || '').trim(), prixUnitaire, retourStock: false,
    });
  }
  return out;
};

// ------------------------------------------------------------
// Paiement d'une facture (calcul « en direct »)
// ------------------------------------------------------------
/**
 * Pour des factures validées : réglé = acomptes (réparations liées) + règlements directs.
 * Renvoie Map(id → { du, regle, reste, credit, etat }).
 */
const infosPaiementMany = async (docs, session = null) => {
  const res = new Map();
  const factures = docs.filter((d) => PAYABLES.includes(d.type));
  const repIds = [...new Set(factures.flatMap((d) => (d.reparations || []).map(String)))];
  const acomptes = new Map();
  if (repIds.length) {
    const reps = await withSession(Reparation.find({ _id: { $in: repIds } }).select('acompte').lean(), session);
    reps.forEach((r) => acomptes.set(String(r._id), toM(r.acompte)));
  }
  for (const d of factures) {
    const duM = toM(d.netAPayer) - toM(d.montantAvoirs);
    const regleM = toM(d.montantRegleDirect) + (d.reparations || []).reduce((s, id) => s + (acomptes.get(String(id)) || 0), 0);
    const resteM = Math.max(0, duM - regleM);
    res.set(String(d._id), {
      du: fromM(duM),
      regle: fromM(regleM),
      reste: fromM(resteM),
      credit: fromM(Math.max(0, regleM - duM)),
      etat: d.statut !== 'valide' ? null : resteM === 0 ? 'paye' : regleM > 0 ? 'partiel' : 'non_paye',
    });
  }
  return res;
};

const infosPaiement = async (doc, session = null) => (await infosPaiementMany([doc], session)).get(String(doc._id));

// ------------------------------------------------------------
// Réparations : report d'un montant sur l'acompte (+ clôture auto)
// ------------------------------------------------------------
const majPaymentType = (rep) => {
  const prix = prixTotalReparation(rep);
  const a = Number(rep.acompte) || 0;
  rep.paymentType = a <= 0 ? 'unpaid' : prix > 0 && a >= prix ? 'paid' : 'partial';
};

/** delta > 0 : encaissement ; delta < 0 : annulation. Retourne true si la réparation vient d'être clôturée. */
const ajusterAcompte = async (repId, deltaM, { session, userId }) => {
  const rep = await withSession(Reparation.findById(repId), session);
  if (!rep) return { applique: 0, cloturee: false };
  const prixM = toM(prixTotalReparation(rep));
  const avantM = toM(rep.acompte);
  const apresM = Math.min(prixM, Math.max(0, avantM + deltaM));
  if (apresM === avantM) return { applique: 0, cloturee: false };
  rep.acompte = fromM(apresM);
  majPaymentType(rep);
  rep.modifications.push({ field: 'acompte', oldValue: fromM(avantM), newValue: rep.acompte, modifiedBy: userId, modifiedAt: new Date(), source: 'reglement' });
  let cloturee = false;
  if (!rep.dateCloture && deltaM > 0) {
    const st = rep.status ? await withSession(Status.findById(rep.status).select('label').lean(), session) : null;
    if (doitEtreCloturee(rep, st?.label)) {
      rep.dateCloture = new Date();
      rep.modifications.push({ field: 'dateCloture', oldValue: null, newValue: rep.dateCloture, modifiedBy: userId, modifiedAt: new Date() });
      cloturee = true;
    }
  }
  await rep.save(so(session));
  return { applique: apresM - avantM, cloturee };
};

const syncCommissions = (repIds, userId) => {
  for (const id of new Set(repIds.map(String))) commissionService.syncReparationSafe(id, userId);
};

// ------------------------------------------------------------
// Création / modification des brouillons
// ------------------------------------------------------------
const verifierClient = async (clientId) => {
  if (!mongoose.isValidObjectId(clientId)) throw new AppError('Client invalide');
  const c = await Client.findById(clientId).lean();
  if (!c) throw new AppError('Client introuvable');
  return c;
};

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + Number(n || 0)); return x; };

/** Réparation déjà portée par une facture validée (non entièrement annulée par avoir). */
const factureActiveDeReparation = async (repId, exclude = null, session = null) => {
  const q = { type: 'FACTURE', statut: 'valide', isDeleted: false, reparations: repId };
  if (exclude) q._id = { $ne: exclude };
  const list = await withSession(DocumentVente.find(q).select('numero netAPayer montantAvoirs').lean(), session);
  return list.find((f) => toM(f.montantAvoirs) < toM(f.netAPayer)) || null;
};

/** Coûts connus côté serveur : lignes des BL d'origine, lignes de la facture d'un avoir. */
const contexteOrigines = async (doc) => {
  const coutsBL = new Map();
  const coutsFacture = new Map();
  if (doc.origines?.length) {
    const bls = await DocumentVente.find({ _id: { $in: doc.origines }, type: 'BL' }).select('lignes').lean();
    bls.forEach((bl) => bl.lignes.forEach((l) => {
      if (l.stock && l.stockSorti) coutsBL.set(`${bl._id}:${l.stock}`, l.coutUnitaire ?? null);
    }));
  }
  if (doc.type === 'AVOIR' && doc.factureOrigine) {
    const f = await DocumentVente.findById(doc.factureOrigine).select('lignes').lean();
    (f?.lignes || []).forEach((l) => { if (l.stock) coutsFacture.set(String(l.stock), l.coutUnitaire ?? null); });
  }
  return { coutsBL, coutsFacture };
};

const appliquerChamps = async (doc, body, params, { creation }) => {
  if (body.client !== undefined || creation) {
    await verifierClient(body.client ?? doc.client);
    if (body.client !== undefined) doc.client = body.client;
  }
  if (body.prixSaisis !== undefined) {
    if (!['HT', 'TTC'].includes(body.prixSaisis)) throw new AppError('Prix saisis : HT ou TTC');
    doc.prixSaisis = body.prixSaisis;
  } else if (creation) {
    doc.prixSaisis = params.prixTTC === false ? 'HT' : 'TTC';
  }
  if (body.date !== undefined) doc.date = body.date ? new Date(body.date) : new Date();
  if (body.dateEcheance !== undefined) doc.dateEcheance = body.dateEcheance ? new Date(body.dateEcheance) : null;
  if (body.dateValidite !== undefined) doc.dateValidite = body.dateValidite ? new Date(body.dateValidite) : null;
  if (body.appliquerTimbre !== undefined) doc.appliquerTimbre = !!body.appliquerTimbre;
  ['conditionsPaiement', 'observation'].forEach((k) => { if (body[k] !== undefined) doc[k] = String(body[k] || ''); });
  if (body.lignes !== undefined) {
    doc.lignes = await buildLignes(body.lignes, {
      boutique: doc.boutique, client: doc.client, params, type: doc.type, origines: await contexteOrigines(doc),
    });
  }
  const c = params.commerce || {};
  doc.timbreFiscal = doc.type === 'FACTURE' ? round3(c.timbreFiscal ?? 1) : 0;
  if (creation) {
    if (doc.type === 'DEVIS' && !doc.dateValidite && c.validiteDevisJours) doc.dateValidite = addDays(doc.date, c.validiteDevisJours);
    if (doc.type === 'FACTURE' && !doc.dateEcheance) doc.dateEcheance = addDays(doc.date, c.delaiPaiementJours || 0);
  }
  doc.reparations = [...new Set(doc.lignes.filter((l) => l.reparation).map((l) => String(l.reparation)))];
};

const creerBrouillon = async (body, userId) => {
  const type = body.type;
  if (!DocumentVente.TYPES.includes(type)) throw new AppError('Type de document invalide');
  if (type === 'AVOIR') throw new AppError("Un avoir se crée depuis une facture validée");
  if (type === 'TICKET') throw new AppError('Un ticket se crée depuis la vente comptoir');
  const boutique = requireBoutiqueId();
  const params = await getParametres(boutique);
  const doc = new DocumentVente({ type, boutique, createdBy: userId, client: body.client });
  await appliquerChamps(doc, body, params, { creation: true });
  await doc.save();
  return doc;
};

const chargerBrouillon = async (id) => {
  const doc = await DocumentVente.findOne({ _id: id, isDeleted: false });
  if (!doc) throw new AppError('Document introuvable', 404);
  if (doc.statut !== 'brouillon') {
    throw new AppError(
      doc.type === 'FACTURE' ? 'Facture validée : modification impossible (faites un avoir).' : 'Document validé : modification impossible.',
      409, 'DOCUMENT_VALIDE'
    );
  }
  return doc;
};

const modifierBrouillon = async (id, body) => {
  const doc = await chargerBrouillon(id);
  const params = await getParametres(doc.boutique);
  // Le client d'un avoir est celui de la facture d'origine
  if (doc.type === 'AVOIR') delete body.client;
  await appliquerChamps(doc, body, params, { creation: false });
  await doc.save();
  return doc;
};

const supprimerBrouillon = async (id) => {
  const doc = await chargerBrouillon(id);
  doc.isDeleted = true;
  await doc.save();
  return doc;
};

// ------------------------------------------------------------
// Conversion : devis → BL/facture, BL → facture, réparations → facture, facture → avoir
// ------------------------------------------------------------
const copieLignes = (src) => src.lignes.map((l) => ({
  type: l.type, stock: l.stock, reparation: l.reparation, code: l.code, designation: l.designation,
  quantite: l.quantite, unite: l.unite, prixUnitaire: l.prixUnitaire, remisePct: l.remisePct, tauxTVA: l.tauxTVA,
  // Lignes d'un BL : stock déjà sorti
  stockSorti: src.type === 'BL' && l.stockSorti, coutUnitaire: l.coutUnitaire,
  origineDocument: src.type === 'BL' ? src._id : null,
}));

const TRANSFORMATIONS = { DEVIS: ['BL', 'FACTURE'], BL: ['FACTURE'] };

const assertSourceTransformable = async (src, typeCible) => {
  if (!(TRANSFORMATIONS[src.type] || []).includes(typeCible)) {
    throw new AppError(`Transformation ${src.type} → ${typeCible} impossible`);
  }
  if (!['valide', 'accepte'].includes(src.statut)) {
    throw new AppError(`Le document ${src.numero || ''} doit être validé (statut actuel : ${src.statut})`, 409);
  }
  const deja = await DocumentVente.findOne({ origines: src._id, statut: { $in: ACTIFS }, isDeleted: false })
    .select('type numero statut').lean();
  if (deja) throw new AppError(`Déjà transformé : ${deja.type} ${deja.numero || '(brouillon)'}`, 409, 'DEJA_TRANSFORME');
};

const transformer = async (id, typeCible, userId) => {
  const src = await DocumentVente.findOne({ _id: id, isDeleted: false });
  if (!src) throw new AppError('Document introuvable', 404);
  await assertSourceTransformable(src, typeCible);
  const params = await getParametres(src.boutique);
  const doc = new DocumentVente({
    type: typeCible, boutique: src.boutique, client: src.client, createdBy: userId,
    prixSaisis: src.prixSaisis, origines: [src._id], conditionsPaiement: src.conditionsPaiement,
    observation: src.observation, appliquerTimbre: src.appliquerTimbre,
  });
  doc.lignes = copieLignes(src);
  await appliquerChamps(doc, { prixSaisis: src.prixSaisis }, params, { creation: true });
  await doc.save();
  return doc;
};

/** Facture (ou devis) groupée depuis des réparations et/ou des BL d'un même client. */
const depuis = async ({ type = 'FACTURE', client, reparations = [], bls = [] }, userId) => {
  if (!['FACTURE', 'DEVIS'].includes(type)) throw new AppError('Type invalide');
  if (!reparations.length && !bls.length) throw new AppError('Choisissez au moins une réparation ou un BL');
  if (type === 'DEVIS' && bls.length) throw new AppError('Un devis ne se crée pas depuis un BL');
  const boutique = requireBoutiqueId();
  const params = await getParametres(boutique);
  const lignes = [];
  const origines = [];
  let clientId = client || null;
  for (const id of bls) {
    const bl = await DocumentVente.findOne({ _id: id, type: 'BL', isDeleted: false });
    if (!bl) throw new AppError('BL introuvable', 404);
    await assertSourceTransformable(bl, 'FACTURE');
    clientId = clientId || bl.client;
    if (!sameId(bl.client, clientId)) throw new AppError(`BL ${bl.numero} : autre client`);
    origines.push(bl._id);
    lignes.push(...copieLignes(bl));
  }
  for (const rid of reparations) {
    if (!clientId) {
      const r = await Reparation.findById(rid).select('client').lean();
      if (!r) throw new AppError('Réparation introuvable', 404);
      clientId = r.client;
    }
    if (type === 'FACTURE') {
      const f = await factureActiveDeReparation(rid);
      if (f) throw new AppError(`Réparation déjà facturée (${f.numero})`, 409, 'DEJA_FACTUREE');
    }
    lignes.push({ type: 'reparation', reparation: rid });
  }
  const doc = new DocumentVente({ type, boutique, client: clientId, createdBy: userId, origines });
  await appliquerChamps(doc, { lignes: [] }, params, { creation: true });
  // buildLignes : réparations normalisées, lignes de BL conservées (stock déjà sorti)
  doc.lignes = await buildLignes(lignes, { boutique, client: clientId, params, type, origines: await contexteOrigines(doc) });
  doc.reparations = [...new Set(doc.lignes.filter((l) => l.reparation).map((l) => String(l.reparation)))];
  await doc.save();
  return doc;
};

const creerAvoir = async (factureId, userId) => {
  const f = await DocumentVente.findOne({ _id: factureId, type: { $in: PAYABLES }, isDeleted: false });
  if (!f) throw new AppError('Facture introuvable', 404);
  if (f.statut !== 'valide') throw new AppError('Seule une facture (ou un ticket) validée peut recevoir un avoir', 409);
  if (toM(f.montantAvoirs) >= toM(f.netAPayer)) throw new AppError('Facture déjà entièrement annulée par avoir', 409);
  const doc = new DocumentVente({
    type: 'AVOIR', boutique: f.boutique, client: f.client, createdBy: userId, prixSaisis: f.prixSaisis,
    factureOrigine: f._id, observation: `Avoir sur facture ${f.numero}`,
  });
  doc.lignes = f.lignes.map((l) => ({
    type: l.type, stock: l.stock, reparation: l.reparation, code: l.code, designation: l.designation,
    quantite: l.quantite, unite: l.unite, prixUnitaire: l.prixUnitaire, remisePct: l.remisePct, tauxTVA: l.tauxTVA,
    retourStock: l.type === 'article' && l.stockSorti, coutUnitaire: l.coutUnitaire,
  }));
  doc.reparations = f.reparations;
  await doc.save();
  return doc;
};

// ------------------------------------------------------------
// Validation (numérotation + stock + liens)
// ------------------------------------------------------------
const snapshotClient = (c) => ({
  code: c.code || '', nom: c.nom || '', phone: c.phone || '', email: c.email || '',
  adresse: c.adresse || '', matriculeFiscal: c.matriculeFiscal || '',
});

const snapshotVendeur = (params, boutique) => {
  const c = params.commerce || {};
  return {
    raisonSociale: c.raisonSociale || boutique?.nom || '', matriculeFiscal: c.matriculeFiscal || '',
    registreCommerce: c.registreCommerce || '', adresse: c.adresse || boutique?.adresse || '',
    telephone: c.telephone || boutique?.telephone || '', email: c.email || boutique?.email || '',
    rib: c.rib || '', piedPage: c.piedPage || '', boutique: boutique?.nom || '',
  };
};

/** Quantités d'articles déjà retournées par avoir sur une facture. */
const quantitesRetournees = async (factureId, excludeId, session) => {
  const avoirs = await withSession(DocumentVente.find({
    factureOrigine: factureId, type: 'AVOIR', statut: 'valide', isDeleted: false, _id: { $ne: excludeId },
  }).select('lignes').lean(), session);
  const m = new Map();
  avoirs.forEach((a) => a.lignes.forEach((l) => {
    if (l.stock) m.set(String(l.stock), (m.get(String(l.stock)) || 0) + l.quantite);
  }));
  return m;
};

const valider = async (id, userId) => {
  // Contrôles préalables hors transaction (messages clairs, pas de numéro consommé)
  const pre = await DocumentVente.findOne({ _id: id, isDeleted: false }).lean();
  if (!pre) throw new AppError('Document introuvable', 404);
  if (pre.statut !== 'brouillon') throw new AppError(`Document déjà ${pre.statut}`, 409, 'DEJA_TRAITE');
  if (!pre.lignes?.length) throw new AppError('Le document ne contient aucune ligne');

  return withTransaction((session) => validerSession(id, userId, session));
};

/** Validation dans une transaction existante (utilisée aussi par la vente comptoir). */
const validerSession = async (id, userId, session) => {
  {
    const doc = await withSession(DocumentVente.findOne({ _id: id, isDeleted: false, statut: 'brouillon' }), session);
    if (!doc) throw new AppError('Document déjà traité', 409, 'DEJA_TRAITE');
    const params = await getParametres(doc.boutique, session);
    const client = await withSession(Client.findById(doc.client).lean(), session);
    if (!client) throw new AppError('Client introuvable');
    const boutique = await withSession(Boutique.findById(doc.boutique).select('nom adresse telephone email').lean(), session);

    if (['FACTURE', 'AVOIR', 'TICKET'].includes(doc.type)) doc.date = new Date(); // numérotation chronologique
    if (doc.type === 'FACTURE') doc.timbreFiscal = round3(params.commerce?.timbreFiscal ?? 1);
    doc.calculer();

    // Réparations : une seule facture active par réparation
    if (doc.type === 'FACTURE') {
      for (const rid of doc.reparations || []) {
        const f = await factureActiveDeReparation(rid, doc._id, session);
        if (f) throw new AppError(`Réparation déjà facturée (${f.numero})`, 409, 'DEJA_FACTUREE');
      }
    }

    // Avoir : plafonné au reste de la facture d'origine
    let facture = null;
    if (doc.type === 'AVOIR') {
      facture = await withSession(DocumentVente.findOne({ _id: doc.factureOrigine, type: { $in: PAYABLES }, statut: 'valide' }), session);
      if (!facture) throw new AppError("Facture d'origine introuvable ou non validée");
      if (!sameId(facture.client, doc.client)) throw new AppError("Client différent de celui de la facture");
      const dispoM = toM(facture.netAPayer) - toM(facture.montantAvoirs);
      if (toM(doc.netAPayer) > dispoM) {
        throw new AppError(`Montant de l'avoir (${doc.netAPayer}) supérieur au montant restant de la facture (${fromM(dispoM)})`);
      }
      const deja = await quantitesRetournees(facture._id, doc._id, session);
      const factures = new Map();
      facture.lignes.forEach((l) => { if (l.stock) factures.set(String(l.stock), (factures.get(String(l.stock)) || 0) + l.quantite); });
      for (const l of doc.lignes) {
        if (!l.stock || !l.retourStock) continue;
        const max = (factures.get(String(l.stock)) || 0) - (deja.get(String(l.stock)) || 0);
        if (l.quantite > max) throw new AppError(`« ${l.designation} » : retour ${l.quantite} > quantité facturée restante ${max}`);
      }
    }

    // Stock : BL, facture directe et ticket comptoir → sortie ; avoir → retour
    if (['BL', 'FACTURE', 'TICKET'].includes(doc.type)) {
      for (const l of doc.lignes) {
        if (l.type !== 'article' || l.stockSorti) continue;
        const s = await valorisation.sortie({
          stockId: l.stock, quantite: l.quantite, params, session, userId, type: 'SORTIE_VENTE',
          motif: `Vente ${client.nom}`, sourceType: 'DocumentVente', sourceId: doc._id,
        });
        l.stockSorti = true;
        l.coutUnitaire = s.coutUnitaire;
        l.mouvementStock = s.mouvementId;
      }
    }
    if (doc.type === 'AVOIR') {
      const physique = (facture.modeStockApplique || params.modeStock) !== 'desactive';
      for (const l of doc.lignes) {
        if (l.type !== 'article' || !l.retourStock) continue;
        const r = await valorisation.retour({
          stockId: l.stock, quantite: l.quantite, coutUnitaire: l.coutUnitaire, stockPhysique: physique,
          params, session, userId, type: 'RETOUR_VENTE', motif: `Avoir sur ${facture.numero}`,
          sourceType: 'DocumentVente', sourceId: doc._id,
        });
        l.mouvementStock = r.mouvementId;
      }
    }

    doc.numero = await numeroDocument(doc, session);
    doc.statut = 'valide';
    doc.valideLe = new Date();
    doc.validePar = userId;
    doc.clientSnapshot = snapshotClient(client);
    doc.vendeurSnapshot = snapshotVendeur(params, boutique);
    doc.modeStockApplique = params.modeStock;
    await doc.save(so(session));

    if (facture) {
      await DocumentVente.updateOne({ _id: facture._id }, { $inc: { montantAvoirs: doc.netAPayer } }, so(session));
    }
    if (doc.origines?.length) {
      await DocumentVente.updateMany(
        { _id: { $in: doc.origines }, statut: { $in: ['valide', 'accepte'] } },
        { $set: { statut: 'transforme' } }, so(session)
      );
    }
    return doc;
  }
};

/** Devis : accepté / refusé. */
const changerStatutDevis = async (id, statut) => {
  if (!['accepte', 'refuse', 'valide'].includes(statut)) throw new AppError('Statut invalide');
  const doc = await DocumentVente.findOneAndUpdate(
    { _id: id, type: 'DEVIS', isDeleted: false, statut: { $in: ['valide', 'accepte', 'refuse'] } },
    { $set: { statut } }, { new: true }
  );
  if (!doc) throw new AppError('Devis introuvable ou non modifiable', 409);
  return doc;
};

/** Annulation : devis et BL seulement (une facture se corrige par avoir). */
const annuler = async (id, motif, userId) => {
  if (!String(motif || '').trim()) throw new AppError("Le motif d'annulation est obligatoire");
  const pre = await DocumentVente.findOne({ _id: id, isDeleted: false }).lean();
  if (!pre) throw new AppError('Document introuvable', 404);
  if (['FACTURE', 'AVOIR', 'TICKET'].includes(pre.type)) {
    throw new AppError('Une facture, un ticket ou un avoir validé ne s\'annule pas : créez un avoir.', 409);
  }
  if (pre.statut === 'brouillon') throw new AppError('Brouillon : supprimez-le.', 409);
  if (pre.statut === 'transforme') throw new AppError('Document déjà transformé : annulez d\'abord le document créé.', 409);
  return withTransaction(async (session) => {
    const doc = await withSession(DocumentVente.findOneAndUpdate(
      { _id: id, statut: { $in: ['valide', 'accepte', 'refuse'] } },
      { $set: { statut: 'annule', annuleLe: new Date(), annulePar: userId, motifAnnulation: motif } },
      { new: true }
    ), session);
    if (!doc) throw new AppError('Document déjà traité', 409);
    if (doc.type === 'BL') {
      const params = await getParametres(doc.boutique, session);
      const physique = (doc.modeStockApplique || params.modeStock) !== 'desactive';
      for (const l of doc.lignes) {
        if (l.type !== 'article' || !l.stockSorti) continue;
        await valorisation.retour({
          stockId: l.stock, quantite: l.quantite, coutUnitaire: l.coutUnitaire, stockPhysique: physique,
          params, session, userId, type: 'RETOUR_VENTE', motif: `Annulation ${doc.numero} : ${motif}`,
          sourceType: 'DocumentVente', sourceId: doc._id,
        });
      }
    }
    return doc;
  });
};

// ------------------------------------------------------------
// Règlements
// ------------------------------------------------------------
/** Affecte un montant (millimes) à une facture. Retourne l'affectation (ou null). */
const affecterFacture = async (factureId, montantM, { clientId, boutique, session, userId, cloturees }) => {
  const f = await withSession(DocumentVente.findOne({ _id: factureId, type: { $in: PAYABLES }, isDeleted: false }), session);
  if (!f || f.statut !== 'valide') throw new AppError('Facture introuvable ou non validée');
  if (!sameId(f.client, clientId)) throw new AppError(`Facture ${f.numero} : autre client`);
  if (!sameId(f.boutique, boutique)) throw new AppError(`Facture ${f.numero} : autre boutique`);
  const info = await infosPaiement(f, session);
  let resteM = Math.min(montantM, toM(info.reste));
  if (resteM <= 0) return null;
  const total = resteM;
  const reparations = [];
  for (const rid of f.reparations || []) {
    if (resteM <= 0) break;
    const r = await ajusterAcompte(rid, resteM, { session, userId });
    if (r.applique > 0) {
      reparations.push({ reparation: rid, montant: fromM(r.applique) });
      resteM -= r.applique;
    }
    if (r.cloturee) cloturees.push(rid);
  }
  if (resteM > 0) {
    await DocumentVente.updateOne({ _id: f._id }, { $inc: { montantRegleDirect: fromM(resteM) } }, so(session));
  }
  return { document: f._id, montant: fromM(total), direct: fromM(Math.max(0, resteM)), reparations };
};

const facturesImpayees = async (clientId, session) => {
  const fs = await withSession(DocumentVente.find({
    client: clientId, type: { $in: PAYABLES }, statut: 'valide', isDeleted: false,
  }).sort({ date: 1, numero: 1 }).lean(), session);
  const infos = await infosPaiementMany(fs, session);
  return fs.filter((f) => infos.get(String(f._id)).reste > 0).map((f) => ({ ...f, paiement: infos.get(String(f._id)) }));
};

/** Répartit `disponibleM` sur des factures (explicites, ou les plus anciennes impayées). */
const repartir = async (reg, disponibleM, { affectations, auto, session, userId, cloturees }) => {
  const out = [];
  let resteM = disponibleM;
  let cibles = [];
  if (Array.isArray(affectations) && affectations.length) {
    cibles = affectations.map((a) => ({ id: a.document, montantM: toM(a.montant) }));
    const totalM = cibles.reduce((s, c) => s + c.montantM, 0);
    if (cibles.some((c) => !(c.montantM > 0))) throw new AppError('Montant affecté invalide');
    if (totalM > disponibleM) throw new AppError('Le total affecté dépasse le montant disponible du règlement');
  } else if (auto) {
    const fs = await facturesImpayees(reg.client, session);
    cibles = fs.map((f) => ({ id: f._id, montantM: Infinity }));
  }
  for (const c of cibles) {
    if (resteM <= 0) break;
    const a = await affecterFacture(c.id, Math.min(c.montantM, resteM), {
      clientId: reg.client, boutique: reg.boutique, session, userId, cloturees,
    });
    if (!a) {
      if (Number.isFinite(c.montantM)) throw new AppError('Facture déjà réglée');
      continue;
    }
    if (Number.isFinite(c.montantM) && toM(a.montant) < c.montantM) {
      throw new AppError(`Montant affecté supérieur au reste à payer de la facture`);
    }
    out.push(a);
    resteM -= toM(a.montant);
  }
  return out;
};

const creerReglement = async (body, userId) => {
  const boutique = requireBoutiqueId();
  const sens = body.sens === 'REMBOURSEMENT' ? 'REMBOURSEMENT' : 'ENCAISSEMENT';
  const montantM = toM(body.montant);
  if (!(montantM > 0)) throw new AppError('Montant invalide');
  if (!Reglement.MODES.includes(body.mode)) throw new AppError('Mode de paiement invalide');
  const client = await verifierClient(body.client);
  if (sens === 'REMBOURSEMENT') {
    const s = await soldeClient(client._id);
    if (montantM > toM(-s.solde)) throw new AppError(`Remboursement supérieur au crédit du client (${fromM(Math.max(0, toM(-s.solde)))})`);
  }

  const cloturees = [];
  const reg = await withTransaction(async (session) => {
    cloturees.length = 0;
    return enregistrerReglement(session, { boutique, clientId: client._id, sens, montantM, body, userId, cloturees });
  });
  if (cloturees.length) syncCommissions(cloturees, userId);
  return reg;
};

/** Création d'un règlement dans une transaction existante. */
const enregistrerReglement = async (session, { boutique, clientId, sens, montantM, body, userId, cloturees }) => {
  const date = body.date ? new Date(body.date) : new Date();
  // Espèces : rattachées à la caisse ouverte (obligatoire si paramétré)
  let sessionCaisse = null;
  if (body.mode === 'ESPECES') {
    const SessionCaisse = require('../models/SessionCaisse');
    const sc = await withSession(SessionCaisse.findOne({ boutique, statut: 'ouverte' }).select('_id'), session);
    if (sc) sessionCaisse = sc._id;
    else {
      const params = await getParametres(boutique, session);
      if (params.commerce?.caisseObligatoire) {
        throw new AppError('Caisse fermée : ouvrez la caisse avant d\'encaisser ou de rembourser en espèces.', 409, 'CAISSE_FERMEE');
      }
    }
  }
  const r = new Reglement({
    boutique, client: clientId, sens, date, mode: body.mode, montant: fromM(montantM),
    reference: String(body.reference || '').trim(), banque: String(body.banque || '').trim(),
    dateEcheance: body.dateEcheance ? new Date(body.dateEcheance) : null,
    etatCheque: body.mode === 'CHEQUE' ? (['encaisse', 'en_portefeuille'].includes(body.etatCheque) ? body.etatCheque : 'en_portefeuille') : null,
    observation: String(body.observation || '').trim(), createdBy: userId, sessionCaisse,
  });
  if (sens === 'ENCAISSEMENT') {
    r.affectations = await repartir(r, montantM, {
      affectations: body.affectations, auto: body.auto !== false, session, userId, cloturees,
    });
    r.montantAffecte = fromM(r.affectations.reduce((s, a) => s + toM(a.montant), 0));
  }
  r.numero = await numeroReglement(boutique, date, session);
  await r.save(so(session));
  return r;
};

// ------------------------------------------------------------
// Vente comptoir : ticket créé, validé (sortie de stock) et encaissé
// en une seule transaction. Sans client : « Client comptoir ».
// ------------------------------------------------------------
const clientComptoir = async () => {
  const c = await Client.findOneAndUpdate(
    { comptoir: true },
    { $setOnInsert: { nom: 'Client comptoir', phone: '00000000', comptoir: true, isActive: true } },
    { upsert: true, new: true }
  ).lean();
  return c;
};

const venteComptoir = async (body, userId) => {
  const boutique = requireBoutiqueId();
  const params = await getParametres(boutique);
  const lignesBrutes = Array.isArray(body.lignes) ? body.lignes : [];
  if (!lignesBrutes.length) throw new AppError('Ajoutez au moins un article');
  if (lignesBrutes.some((l) => l.reparation || l.type === 'reparation')) {
    throw new AppError('Une réparation se facture depuis son dossier, pas au comptoir');
  }
  const client = body.client ? await verifierClient(body.client) : await clientComptoir();
  const anonyme = !!client.comptoir;

  // Paiements (plusieurs modes possibles) — la monnaie rendue n'est pas encaissée
  const paiements = (Array.isArray(body.paiements) ? body.paiements : [])
    .map((p) => ({ ...p, montantM: toM(p.montant) }))
    .filter((p) => p.montantM > 0);
  for (const p of paiements) if (!Reglement.MODES.includes(p.mode)) throw new AppError('Mode de paiement invalide');

  const doc = new DocumentVente({ type: 'TICKET', boutique, client: client._id, createdBy: userId });
  doc.prixSaisis = body.prixSaisis === 'HT' ? 'HT' : (body.prixSaisis === 'TTC' ? 'TTC' : (params.prixTTC === false ? 'HT' : 'TTC'));
  doc.observation = String(body.observation || '').trim();
  doc.lignes = await buildLignes(lignesBrutes, { boutique, client: client._id, params, type: 'TICKET' });
  doc.calculer();
  const netM = toM(doc.netAPayer);
  const recuM = paiements.reduce((s, p) => s + p.montantM, 0);
  const especesM = paiements.filter((p) => p.mode === 'ESPECES').reduce((s, p) => s + p.montantM, 0);
  const renduM = Math.max(0, recuM - netM);
  if (renduM > especesM) throw new AppError('Seules les espèces peuvent dépasser le total (monnaie rendue)');
  if (anonyme && recuM < netM) {
    throw new AppError(`Paiement incomplet : ${fromM(recuM)} reçu pour ${fromM(netM)}. Choisissez un client pour vendre à crédit.`);
  }

  const cloturees = [];
  const result = await withTransaction(async (session) => {
    cloturees.length = 0;
    const brouillon = new DocumentVente(doc.toObject());
    brouillon.isNew = true;
    await brouillon.save(so(session));
    const valide = await validerSession(brouillon._id, userId, session);
    // Montants encaissés : la monnaie rendue est retirée des espèces
    let aRendreM = renduM;
    const reglements = [];
    for (const p of paiements) {
      let m = p.montantM;
      if (p.mode === 'ESPECES' && aRendreM > 0) { const x = Math.min(m, aRendreM); m -= x; aRendreM -= x; }
      if (m <= 0) continue;
      reglements.push(await enregistrerReglement(session, {
        boutique, clientId: client._id, sens: 'ENCAISSEMENT', montantM: m, userId, cloturees,
        body: { mode: p.mode, reference: p.reference, banque: p.banque, etatCheque: 'encaisse', affectations: [{ document: valide._id, montant: fromM(m) }] },
      }));
    }
    return { ticket: valide, reglements };
  });
  return {
    ...result,
    recu: fromM(recuM),
    rendu: fromM(renduM),
    reste: fromM(Math.max(0, netM - (recuM - renduM))),
  };
};

/** Ventes comptoir du jour (ou d'une période) : tickets, totaux par mode, marge. */
const comptoirJour = async ({ from, to }) => {
  const tickets = await DocumentVente.find({ type: 'TICKET', statut: 'valide', isDeleted: false, date: { $gte: from, $lte: to } })
    .select('numero date client clientSnapshot netAPayer totalHT lignes createdBy montantAvoirs')
    .populate('createdBy', 'username firstName lastName').sort({ date: -1 }).lean();
  const ids = tickets.map((t) => t._id);
  const regs = ids.length
    ? await Reglement.find({ statut: 'valide', 'affectations.document': { $in: ids } }).select('mode affectations').lean()
    : [];
  const parMode = {};
  const idSet = new Set(ids.map(String));
  regs.forEach((r) => r.affectations.forEach((a) => {
    if (idSet.has(String(a.document))) parMode[r.mode] = fromM(toM(parMode[r.mode] || 0) + toM(a.montant));
  }));
  const marge = margeArticles(tickets);
  return {
    tickets: tickets.map(({ lignes, ...t }) => ({ ...t, nbArticles: lignes.reduce((s, l) => s + (l.quantite || 0), 0) })),
    totaux: {
      nombre: tickets.length,
      ttc: fromM(tickets.reduce((s, t) => s + toM(t.netAPayer), 0)),
      ht: fromM(tickets.reduce((s, t) => s + toM(t.totalHT), 0)),
      ...marge,
      parMode,
    },
  };
};

/** Marge sur les lignes d'articles (HT − coût figé à la sortie). */
const margeArticles = (docs, signe = 1) => {
  let htM = 0; let coutM = 0;
  docs.forEach((d) => (d.lignes || []).forEach((l) => {
    if (l.type !== 'article' || l.coutUnitaire === null || l.coutUnitaire === undefined) return;
    if (d.type === 'AVOIR' && !l.retourStock) return;
    htM += toM(l.montantHT);
    coutM += Math.round(toM(l.coutUnitaire) * Number(l.quantite));
  }));
  return { venteArticlesHT: fromM(signe * htM), coutArticles: fromM(signe * coutM), margeArticles: fromM(signe * (htM - coutM)) };
};

/** Affecte la partie non affectée d'un règlement (avance) à des factures. */
const affecterReste = async (id, body, userId) => {
  const cloturees = [];
  const reg = await withTransaction(async (session) => {
    cloturees.length = 0;
    const r = await withSession(Reglement.findOne({ _id: id, statut: 'valide', sens: 'ENCAISSEMENT' }), session);
    if (!r) throw new AppError('Règlement introuvable ou annulé', 404);
    const dispoM = toM(r.montant) - toM(r.montantAffecte);
    if (dispoM <= 0) throw new AppError('Règlement déjà entièrement affecté', 409);
    const nouvelles = await repartir(r, dispoM, {
      affectations: body.affectations, auto: !body.affectations?.length, session, userId, cloturees,
    });
    if (!nouvelles.length) throw new AppError('Aucune facture impayée à régler', 409);
    r.affectations.push(...nouvelles);
    r.montantAffecte = fromM(r.affectations.reduce((s, a) => s + toM(a.montant), 0));
    await r.save(so(session));
    return r;
  });
  if (cloturees.length) syncCommissions(cloturees, userId);
  return reg;
};

/** Annulation (ou chèque impayé) : contre-écriture des affectations. */
const annulerReglement = async (id, motif, userId) => {
  if (!String(motif || '').trim()) throw new AppError("Le motif d'annulation est obligatoire");
  return withTransaction(async (session) => {
    const r = await withSession(Reglement.findOneAndUpdate(
      { _id: id, statut: 'valide' },
      { $set: { statut: 'annule', motifAnnulation: motif, annuleLe: new Date(), annulePar: userId } },
      { new: true }
    ), session);
    if (!r) throw new AppError('Règlement introuvable ou déjà annulé', 409);
    for (const a of r.affectations) {
      if (toM(a.direct) > 0) {
        await DocumentVente.updateOne({ _id: a.document }, { $inc: { montantRegleDirect: -a.direct } }, so(session));
      }
      for (const x of a.reparations || []) {
        await ajusterAcompte(x.reparation, -toM(x.montant), { session, userId });
      }
    }
    if (r.mode === 'CHEQUE' && /impay/i.test(motif)) {
      r.etatCheque = 'impaye';
      await r.save(so(session));
    }
    return r;
  });
};

const changerEtatCheque = async (id, etat, userId) => {
  if (etat === 'impaye') return annulerReglement(id, 'Chèque impayé', userId);
  if (!['encaisse', 'en_portefeuille'].includes(etat)) throw new AppError('État de chèque invalide');
  const r = await Reglement.findOneAndUpdate(
    { _id: id, mode: 'CHEQUE', statut: 'valide' }, { $set: { etatCheque: etat } }, { new: true }
  );
  if (!r) throw new AppError('Chèque introuvable ou annulé', 404);
  return r;
};

// ------------------------------------------------------------
// Solde, relevé, créances
// ------------------------------------------------------------
/** Données de paiement d'un ensemble de clients (scope boutique courant). */
const donneesClients = async (clientIds = null) => {
  const fMatch = { type: { $in: [...PAYABLES, 'AVOIR'] }, statut: 'valide', isDeleted: false };
  const rMatch = { statut: 'valide' };
  if (clientIds) { fMatch.client = { $in: clientIds }; rMatch.client = { $in: clientIds }; }
  const [docs, regs] = await Promise.all([
    DocumentVente.find(fMatch).select('type numero date client netAPayer montantAvoirs montantRegleDirect reparations factureOrigine statut').lean(),
    Reglement.find(rMatch).select('numero date client sens mode montant montantAffecte affectations reference').lean(),
  ]);
  const factures = docs.filter((d) => PAYABLES.includes(d.type));
  const infos = await infosPaiementMany(factures);
  return { docs, factures, regs, infos };
};

const calculerSoldes = ({ factures, regs, infos }) => {
  const m = new Map();
  const get = (id) => {
    const k = String(id);
    if (!m.has(k)) m.set(k, { client: k, factureM: 0, regleM: 0, avanceM: 0, nbImpayees: 0, plusAncienne: null });
    return m.get(k);
  };
  for (const f of factures) {
    const i = infos.get(String(f._id));
    const x = get(f.client);
    x.factureM += toM(i.du);
    x.regleM += toM(i.regle);
    if (i.reste > 0) {
      x.nbImpayees += 1;
      if (!x.plusAncienne || f.date < x.plusAncienne) x.plusAncienne = f.date;
    }
  }
  for (const r of regs) {
    const x = get(r.client);
    if (r.sens === 'REMBOURSEMENT') x.avanceM -= toM(r.montant);
    else x.avanceM += toM(r.montant) - toM(r.montantAffecte);
  }
  return [...m.values()].map((x) => ({
    client: x.client,
    totalFacture: fromM(x.factureM),
    totalRegle: fromM(x.regleM),
    avance: fromM(x.avanceM),
    solde: fromM(x.factureM - x.regleM - x.avanceM), // > 0 : le client doit ; < 0 : crédit client
    nbImpayees: x.nbImpayees,
    plusAncienne: x.plusAncienne,
  }));
};

const soldeClient = async (clientId) => {
  const d = await donneesClients([new mongoose.Types.ObjectId(String(clientId))]);
  return calculerSoldes(d)[0] || { client: String(clientId), totalFacture: 0, totalRegle: 0, avance: 0, solde: 0, nbImpayees: 0 };
};

/** Relevé client : écritures chronologiques (débit / crédit) + factures + réparations non facturées. */
const releve = async (clientId) => {
  const id = new mongoose.Types.ObjectId(String(clientId));
  const client = await verifierClient(id);
  const d = await donneesClients([id]);
  const solde = calculerSoldes(d)[0] || { totalFacture: 0, totalRegle: 0, avance: 0, solde: 0, nbImpayees: 0 };

  // Acomptes des réparations facturées non issus d'un règlement (saisis dans le dossier)
  const repIds = [...new Set(d.factures.flatMap((f) => (f.reparations || []).map(String)))];
  const reps = repIds.length ? await Reparation.find({ _id: { $in: repIds } }).select('acompte').lean() : [];
  const acompte = new Map(reps.map((r) => [String(r._id), toM(r.acompte)]));
  const reportes = new Map();
  d.regs.forEach((r) => r.affectations?.forEach((a) => a.reparations?.forEach((x) => {
    reportes.set(String(x.reparation), (reportes.get(String(x.reparation)) || 0) + toM(x.montant));
  })));

  const ecritures = [];
  for (const doc of d.docs) {
    if (PAYABLES.includes(doc.type)) {
      ecritures.push({ date: doc.date, libelle: `${doc.type === 'TICKET' ? 'Ticket' : 'Facture'} ${doc.numero}`, ref: doc._id, debit: doc.netAPayer, credit: 0 });
      const horsReglM = (doc.reparations || []).reduce((s, rid) => s + (acompte.get(String(rid)) || 0) - (reportes.get(String(rid)) || 0), 0);
      if (horsReglM !== 0) {
        ecritures.push({ date: doc.date, libelle: `Acomptes reçus sur réparations (${doc.numero})`, ref: doc._id, debit: 0, credit: fromM(horsReglM) });
      }
    } else {
      ecritures.push({ date: doc.date, libelle: `Avoir ${doc.numero}`, ref: doc._id, debit: 0, credit: doc.netAPayer });
    }
  }
  for (const r of d.regs) {
    const lib = `${r.sens === 'REMBOURSEMENT' ? 'Remboursement' : 'Règlement'} ${r.numero} (${r.mode}${r.reference ? ` ${r.reference}` : ''})`;
    ecritures.push(r.sens === 'REMBOURSEMENT'
      ? { date: r.date, libelle: lib, ref: r._id, debit: r.montant, credit: 0 }
      : { date: r.date, libelle: lib, ref: r._id, debit: 0, credit: r.montant });
  }
  ecritures.sort((a, b) => new Date(a.date) - new Date(b.date));
  let runM = 0;
  ecritures.forEach((e) => { runM += toM(e.debit) - toM(e.credit); e.solde = fromM(runM); });

  // Réparations non facturées avec reste à payer (information)
  const toutes = await Reparation.find({ client: id, isDeleted: { $ne: true } })
    .select('numero prix acompte diagnosticImprevus dateReception boutique').sort({ dateReception: -1 }).lean();
  const facturees = new Set(repIds);
  const nonFacturees = toutes.filter((r) => !facturees.has(String(r._id)))
    .map((r) => ({ _id: r._id, numero: r.numero, date: r.dateReception, prixTotal: prixTotalReparation(r), acompte: r.acompte || 0,
      reste: fromM(Math.max(0, toM(prixTotalReparation(r)) - toM(r.acompte))) }))
    .filter((r) => r.reste > 0);

  const factures = d.factures.map((f) => ({
    _id: f._id, numero: f.numero, date: f.date, netAPayer: f.netAPayer, ...d.infos.get(String(f._id)),
  })).sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    client: { _id: client._id, code: client.code, nom: client.nom, phone: client.phone, matriculeFiscal: client.matriculeFiscal || '' },
    solde, ecritures, factures, reparationsNonFacturees: nonFacturees,
    totalNonFacture: fromM(nonFacturees.reduce((s, r) => s + toM(r.reste), 0)),
  };
};

const creances = async () => {
  const d = await donneesClients();
  const soldes = calculerSoldes(d).filter((s) => s.solde !== 0);
  const clients = await Client.find({ _id: { $in: soldes.map((s) => s.client) } }).select('code nom phone').lean();
  const cm = new Map(clients.map((c) => [String(c._id), c]));
  return soldes.map((s) => ({ ...s, clientInfo: cm.get(s.client) || null })).sort((a, b) => b.solde - a.solde);
};

const journal = async ({ from, to }) => {
  const regs = await Reglement.find({ date: { $gte: from, $lte: to } })
    .populate('client', 'code nom').populate('createdBy', 'username firstName lastName')
    .populate('affectations.document', 'numero').sort({ date: -1 }).lean();
  const parMode = {};
  let encM = 0; let rembM = 0;
  regs.filter((r) => r.statut === 'valide').forEach((r) => {
    const s = r.sens === 'REMBOURSEMENT' ? -1 : 1;
    parMode[r.mode] = fromM(toM(parMode[r.mode] || 0) + s * toM(r.montant));
    if (s > 0) encM += toM(r.montant); else rembM += toM(r.montant);
  });
  return { reglements: regs, totaux: { encaisse: fromM(encM), rembourse: fromM(rembM), net: fromM(encM - rembM), parMode } };
};

/** Synthèse de la période : facturé, avoirs, encaissé, reste dû. */
const synthese = async ({ from, to }) => {
  const docs = await DocumentVente.find({ type: { $in: [...PAYABLES, 'AVOIR'] }, statut: 'valide', isDeleted: false, date: { $gte: from, $lte: to } })
    .select('type totalHT totalTVA netAPayer lignes').lean();
  const sumM = (list, k) => list.reduce((s, x) => s + toM(x[k]), 0);
  const f = docs.filter((d) => d.type === 'FACTURE');
  const t = docs.filter((d) => d.type === 'TICKET');
  const a = docs.filter((d) => d.type === 'AVOIR');
  const j = await journal({ from, to });
  const all = await creances();
  const plus = margeArticles([...f, ...t]);
  const moins = margeArticles(a);
  const bloc = (list) => ({ nombre: list.length, ht: fromM(sumM(list, 'totalHT')), tva: fromM(sumM(list, 'totalTVA')), ttc: fromM(sumM(list, 'netAPayer')) });
  return {
    factures: bloc(f),
    tickets: bloc(t),
    avoirs: bloc(a),
    caNetHT: fromM(sumM(f, 'totalHT') + sumM(t, 'totalHT') - sumM(a, 'totalHT')),
    // Marge sur les articles vendus (prix HT − coût CMP/FIFO figé à la sortie), nette des retours
    articles: {
      venteHT: fromM(toM(plus.venteArticlesHT) - toM(moins.venteArticlesHT)),
      cout: fromM(toM(plus.coutArticles) - toM(moins.coutArticles)),
      marge: fromM(toM(plus.margeArticles) - toM(moins.margeArticles)),
    },
    encaissements: j.totaux,
    creancesClients: fromM(all.filter((x) => x.solde > 0).reduce((s, x) => s + toM(x.solde), 0)),
  };
};

module.exports = {
  buildLignes, infosPaiement, infosPaiementMany, factureActiveDeReparation,
  creerBrouillon, modifierBrouillon, supprimerBrouillon, transformer, depuis, creerAvoir,
  valider, changerStatutDevis, annuler,
  creerReglement, affecterReste, annulerReglement, changerEtatCheque, facturesImpayees,
  soldeClient, releve, creances, journal, synthese,
  venteComptoir, comptoirJour, clientComptoir,
  _log: logger,
};
