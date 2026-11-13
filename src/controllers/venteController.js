const mongoose = require('mongoose');
const DocumentVente = require('../models/DocumentVente');
const Reglement = require('../models/Reglement');
const Reparation = require('../models/Reparation');
const svc = require('../services/venteService');
const { getParametres, requireBoutiqueId } = require('../services/atelierService');
const { logAction } = require('../services/historyService');
const { prixTotalReparation } = require('../utils/statutReparation');
const { AppError, rangeFromQuery } = require('../utils/appError');

// ============================================================
// ✅ GESTION COMMERCIALE — documents de vente
// ============================================================
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const oid = (id, label = 'Identifiant') => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} invalide`);
  return new mongoose.Types.ObjectId(String(id));
};
const log = (req, doc, action, comment) => logAction({
  entityType: 'DocumentVente', entityId: doc._id, action, userId: req.user._id, req,
  comment: comment || `${doc.type} ${doc.numero || '(brouillon)'}`,
});

/** Réponse d'un brouillon : client renseigné (libellé dans le formulaire). */
const avecClient = (doc) => doc.populate('client', 'code nom phone matriculeFiscal');

const populateDoc = (q) => q
  .populate('client', 'code nom phone email adresse matriculeFiscal')
  .populate('createdBy', 'username firstName lastName')
  .populate('validePar', 'username firstName lastName')
  .populate('origines', 'type numero statut')
  .populate('factureOrigine', 'numero netAPayer montantAvoirs');

// GET /api/ventes
exports.list = async (req, res) => {
  const q = { isDeleted: false };
  const { type, statut, client, search, paiement } = req.query;
  if (type && DocumentVente.TYPES.includes(type)) q.type = type;
  if (statut) q.statut = statut;
  if (client) q.client = oid(client, 'Client');
  if (req.query.from || req.query.to) {
    const [from, to] = rangeFromQuery(req.query);
    q.date = { $gte: from, $lte: to };
  }
  if (search) {
    const s = esc(search);
    q.$or = [
      { numero: { $regex: s, $options: 'i' } },
      { 'clientSnapshot.nom': { $regex: s, $options: 'i' } },
      { 'lignes.designation': { $regex: s, $options: 'i' } },
    ];
  }
  const all = String(req.query.limit) === 'all';
  const limit = all ? 0 : Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  let docs = await DocumentVente.find(q)
    .select('-lignes -vendeurSnapshot')
    .populate('client', 'code nom phone')
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .lean();
  const infos = await svc.infosPaiementMany(docs);
  docs = docs.map((d) => ({ ...d, paiement: infos.get(String(d._id)) || null }));
  if (paiement) docs = docs.filter((d) => d.paiement?.etat === paiement || (paiement === 'impaye' && d.paiement && d.paiement.reste > 0));
  res.json({ success: true, data: docs });
};

// GET /api/ventes/:id
exports.getOne = async (req, res) => {
  const doc = await populateDoc(DocumentVente.findOne({ _id: oid(req.params.id), isDeleted: false })).lean();
  if (!doc) throw new AppError('Document introuvable', 404);
  const payable = ['FACTURE', 'TICKET'].includes(doc.type);
  const [paiement, reglements, avoirs, derives] = await Promise.all([
    payable && doc.statut === 'valide' ? svc.infosPaiement(doc) : null,
    payable
      ? Reglement.find({ 'affectations.document': doc._id }).select('numero date mode montant reference statut affectations sens').sort({ date: 1 }).lean()
      : [],
    payable
      ? DocumentVente.find({ factureOrigine: doc._id, isDeleted: false }).select('numero statut netAPayer date').lean()
      : [],
    DocumentVente.find({ origines: doc._id, isDeleted: false }).select('type numero statut').lean(),
  ]);
  const regl = reglements.map((r) => ({
    ...r,
    montantFacture: (r.affectations || []).filter((a) => String(a.document) === String(doc._id)).reduce((s, a) => s + a.montant, 0),
    affectations: undefined,
  }));
  res.json({ success: true, data: { ...doc, paiement, reglements: regl, avoirs, derives } });
};

// POST /api/ventes
exports.create = async (req, res) => {
  const doc = await svc.creerBrouillon(req.body, req.user._id);
  await log(req, doc, 'CREATE');
  res.status(201).json({ success: true, message: 'Brouillon créé', data: await avecClient(doc) });
};

// PUT /api/ventes/:id
exports.update = async (req, res) => {
  const doc = await svc.modifierBrouillon(oid(req.params.id), { ...req.body });
  await log(req, doc, 'UPDATE');
  res.json({ success: true, message: 'Brouillon enregistré', data: await avecClient(doc) });
};

// DELETE /api/ventes/:id
exports.remove = async (req, res) => {
  const doc = await svc.supprimerBrouillon(oid(req.params.id));
  await log(req, doc, 'DELETE');
  res.json({ success: true, message: 'Brouillon supprimé' });
};

// POST /api/ventes/:id/valider
exports.valider = async (req, res) => {
  const doc = await svc.valider(oid(req.params.id), req.user._id);
  await log(req, doc, 'VALIDATE', `${doc.type} ${doc.numero} validé(e) — ${doc.netAPayer} DT`);
  res.json({ success: true, message: `${doc.numero} validé`, data: doc });
};

// POST /api/ventes/:id/statut  { statut: accepte | refuse | valide }
exports.statutDevis = async (req, res) => {
  const doc = await svc.changerStatutDevis(oid(req.params.id), req.body.statut);
  await log(req, doc, 'STATUS_CHANGE', `Devis ${doc.numero} : ${doc.statut}`);
  res.json({ success: true, data: doc });
};

// POST /api/ventes/:id/annuler  { motif }
exports.annuler = async (req, res) => {
  const doc = await svc.annuler(oid(req.params.id), String(req.body.motif || '').trim(), req.user._id);
  await log(req, doc, 'CANCEL', `${doc.type} ${doc.numero} annulé : ${doc.motifAnnulation}`);
  res.json({ success: true, message: 'Document annulé', data: doc });
};

// POST /api/ventes/:id/transformer  { type: BL | FACTURE }
exports.transformer = async (req, res) => {
  const doc = await svc.transformer(oid(req.params.id), req.body.type, req.user._id);
  await log(req, doc, 'CREATE', `${doc.type} (brouillon) créé par transformation`);
  res.status(201).json({ success: true, message: 'Brouillon créé', data: await avecClient(doc) });
};

// POST /api/ventes/:id/avoir
exports.avoir = async (req, res) => {
  const doc = await svc.creerAvoir(oid(req.params.id), req.user._id);
  await log(req, doc, 'CREATE', 'Avoir (brouillon) créé');
  res.status(201).json({ success: true, message: 'Avoir créé en brouillon', data: await avecClient(doc) });
};

// POST /api/ventes/depuis  { type, client, reparations: [], bls: [] }
exports.depuis = async (req, res) => {
  const { type, client, reparations, bls } = req.body;
  const doc = await svc.depuis({
    type, client: client ? oid(client, 'Client') : null,
    reparations: (reparations || []).map((x) => oid(x, 'Réparation')),
    bls: (bls || []).map((x) => oid(x, 'BL')),
  }, req.user._id);
  await log(req, doc, 'CREATE', `${doc.type} (brouillon) créé depuis ${(reparations || []).length} réparation(s) / ${(bls || []).length} BL`);
  res.status(201).json({ success: true, message: 'Brouillon créé', data: await avecClient(doc) });
};

// GET /api/ventes/a-facturer?client=  → réparations et BL non facturés du client
exports.aFacturer = async (req, res) => {
  const client = oid(req.query.client, 'Client');
  const boutique = requireBoutiqueId();
  const reps = await Reparation.find({ client, boutique, isDeleted: { $ne: true } })
    .select('numero prix acompte diagnosticImprevus dateReception dateCloture panneType marque modele status')
    .populate('marque modele', 'nom').populate('status', 'label')
    .sort({ dateReception: -1 }).limit(200).lean();
  const facturees = new Set((await DocumentVente.distinct('reparations', {
    type: 'FACTURE', statut: { $in: ['brouillon', 'valide'] }, isDeleted: false, reparations: { $in: reps.map((r) => r._id) },
  })).map(String));
  const bls = await DocumentVente.find({ client, type: 'BL', statut: 'valide', isDeleted: false })
    .select('numero date netAPayer').sort({ date: -1 }).lean();
  res.json({
    success: true,
    data: {
      reparations: reps.filter((r) => !facturees.has(String(r._id))).map((r) => ({
        _id: r._id, numero: r.numero, date: r.dateReception, cloturee: !!r.dateCloture, statut: r.status?.label || '',
        appareil: [r.marque?.nom, r.modele?.nom].filter(Boolean).join(' '), pannes: (r.panneType || []).join(', '),
        prixTotal: prixTotalReparation(r), acompte: r.acompte || 0,
      })),
      bls,
    },
  });
};

// GET /api/ventes/reparation/:id  → documents liés à une réparation
exports.parReparation = async (req, res) => {
  const id = oid(req.params.id, 'Réparation');
  const docs = await DocumentVente.find({ reparations: id, isDeleted: false })
    .select('type numero statut date netAPayer montantAvoirs montantRegleDirect reparations').sort({ createdAt: -1 }).lean();
  const infos = await svc.infosPaiementMany(docs);
  res.json({ success: true, data: docs.map((d) => ({ ...d, paiement: infos.get(String(d._id)) || null })) });
};

// GET /api/ventes/parametres → en-tête + valeurs par défaut (pour les formulaires / impression)
exports.parametres = async (req, res) => {
  const p = await getParametres(requireBoutiqueId());
  res.json({ success: true, data: { prixTTC: p.prixTTC, tauxTVA: p.tauxTVA, commerce: p.commerce, modeStock: p.modeStock } });
};

// ============================================================
// VENTE COMPTOIR
// ============================================================
// GET /api/ventes/comptoir/articles?search=  → articles vendables de la boutique
exports.articlesComptoir = async (req, res) => {
  const Stock = require('../models/Stock');
  const boutique = requireBoutiqueId();
  const q = { boutique, isActive: { $ne: false }, ...Stock.filtreUsage('vente') };
  const list = await Stock.find(q)
    .select('code quantite prixIndicatif unite typeArticle marque modele categorie tauxTVA')
    .populate('typeArticle marque modele categorie', 'nom')
    .lean();
  const s = String(req.query.search || '').trim().toLowerCase();
  const label = (a) => [a.typeArticle?.nom, a.marque?.nom, a.modele?.nom].filter(Boolean).join(' ');
  const data = list
    .map((a) => ({ _id: a._id, code: a.code || '', designation: label(a) || a.code || 'Article', categorie: a.categorie?.nom || '', quantite: a.quantite, prix: a.prixIndicatif || 0, unite: a.unite || '', tauxTVA: a.tauxTVA ?? null }))
    .filter((a) => !s || a.code.toLowerCase() === s || `${a.code} ${a.designation} ${a.categorie}`.toLowerCase().includes(s))
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
    .slice(0, 50);
  res.json({ success: true, data });
};

// POST /api/ventes/comptoir  { client?, lignes, paiements: [{ mode, montant, reference }] }
exports.venteComptoir = async (req, res) => {
  const body = { ...req.body };
  if (body.client) body.client = oid(body.client, 'Client');
  const r = await svc.venteComptoir(body, req.user._id);
  await log(req, r.ticket, 'CREATE', `Vente comptoir ${r.ticket.numero} — ${r.ticket.netAPayer} DT`);
  for (const reg of r.reglements) {
    await logR(req, reg, 'PAYMENT', `Règlement ${reg.numero} : ${reg.montant} DT (${reg.mode}) — ${r.ticket.numero}`);
  }
  const ticket = await populateDoc(DocumentVente.findById(r.ticket._id)).lean();
  res.status(201).json({
    success: true,
    message: `Vente ${ticket.numero} enregistrée`,
    data: {
      ...r,
      ticket: {
        ...ticket,
        paiement: await svc.infosPaiement(ticket),
        reglements: r.reglements.map((x) => ({ ...x.toObject(), montantFacture: x.montant })),
      },
    },
  });
};

// GET /api/ventes/comptoir/jour?from&to  (défaut : aujourd'hui)
exports.comptoirJour = async (req, res) => {
  const { jourKey } = require('../utils/appError');
  const q = { from: req.query.from || jourKey(), to: req.query.to || req.query.from || jourKey() };
  const [from, to] = rangeFromQuery(q);
  res.json({ success: true, data: await svc.comptoirJour({ from, to }) });
};

// ============================================================
// RÈGLEMENTS
// ============================================================
const logR = (req, r, action, comment) => logAction({
  entityType: 'Reglement', entityId: r._id, action, userId: req.user._id, req, comment,
});

// GET /api/reglements
exports.listReglements = async (req, res) => {
  const q = {};
  if (req.query.client) q.client = oid(req.query.client, 'Client');
  if (req.query.mode) q.mode = req.query.mode;
  if (req.query.statut) q.statut = req.query.statut;
  if (req.query.etatCheque) q.etatCheque = req.query.etatCheque;
  if (req.query.from || req.query.to) {
    const [from, to] = rangeFromQuery(req.query);
    q.date = { $gte: from, $lte: to };
  }
  const data = await Reglement.find(q)
    .populate('client', 'code nom phone').populate('affectations.document', 'numero')
    .populate('createdBy', 'username firstName lastName')
    .sort({ date: -1, createdAt: -1 }).limit(1000).lean();
  res.json({ success: true, data });
};

// POST /api/reglements
exports.createReglement = async (req, res) => {
  const body = { ...req.body };
  if (Array.isArray(body.affectations)) {
    body.affectations = body.affectations.map((a) => ({ document: oid(a.document, 'Facture'), montant: a.montant }));
  }
  const r = await svc.creerReglement(body, req.user._id);
  await logR(req, r, 'PAYMENT', `${r.sens === 'REMBOURSEMENT' ? 'Remboursement' : 'Règlement'} ${r.numero} : ${r.montant} DT (${r.mode})`);
  res.status(201).json({ success: true, message: `Règlement ${r.numero} enregistré`, data: r });
};

// POST /api/reglements/:id/affecter
exports.affecterReglement = async (req, res) => {
  const body = { ...req.body };
  if (Array.isArray(body.affectations)) {
    body.affectations = body.affectations.map((a) => ({ document: oid(a.document, 'Facture'), montant: a.montant }));
  }
  const r = await svc.affecterReste(oid(req.params.id), body, req.user._id);
  await logR(req, r, 'UPDATE', `Règlement ${r.numero} affecté`);
  res.json({ success: true, message: 'Affectation enregistrée', data: r });
};

// POST /api/reglements/:id/annuler  { motif }
exports.annulerReglement = async (req, res) => {
  const r = await svc.annulerReglement(oid(req.params.id), String(req.body.motif || '').trim(), req.user._id);
  await logR(req, r, 'CANCEL', `Règlement ${r.numero} annulé : ${r.motifAnnulation}`);
  res.json({ success: true, message: 'Règlement annulé', data: r });
};

// POST /api/reglements/:id/cheque  { etat }
exports.etatCheque = async (req, res) => {
  const r = await svc.changerEtatCheque(oid(req.params.id), req.body.etat, req.user._id);
  await logR(req, r, req.body.etat === 'impaye' ? 'CANCEL' : 'UPDATE', `Chèque ${r.numero} : ${req.body.etat}`);
  res.json({ success: true, data: r });
};

// GET /api/reglements/impayees?client=
exports.impayees = async (req, res) => {
  const data = await svc.facturesImpayees(oid(req.query.client, 'Client'));
  res.json({ success: true, data });
};

// GET /api/reglements/releve/:clientId
exports.releve = async (req, res) => {
  res.json({ success: true, data: await svc.releve(oid(req.params.clientId, 'Client')) });
};

// GET /api/reglements/solde/:clientId
exports.solde = async (req, res) => {
  res.json({ success: true, data: await svc.soldeClient(oid(req.params.clientId, 'Client')) });
};

// GET /api/reglements/creances
exports.creances = async (req, res) => {
  res.json({ success: true, data: await svc.creances() });
};

// GET /api/reglements/journal?from&to
exports.journal = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  res.json({ success: true, data: await svc.journal({ from, to }) });
};

// GET /api/reglements/synthese?from&to
exports.synthese = async (req, res) => {
  const [from, to] = rangeFromQuery(req.query);
  res.json({ success: true, data: await svc.synthese({ from, to }) });
};
