const SessionCaisse = require('../models/SessionCaisse');
const MouvementCaisse = require('../models/MouvementCaisse');
const Reglement = require('../models/Reglement');
const Reparation = require('../models/Reparation');
const Depense = require('../models/Depense');
const Counter = require('../models/Counter');
const { requireBoutiqueId } = require('./atelierService');
const { withTransaction, so } = require('./transaction');
const { toM, fromM, round3 } = require('../utils/money');
const { AppError } = require('../utils/appError');

// ============================================================
// ✅ CAISSE JOURNALIÈRE (espèces)
// ============================================================
const withSession = (q, session) => (session ? q.session(session) : q);

/** Session ouverte de la boutique (ou null). */
const sessionOuverte = (boutique, session = null) =>
  withSession(SessionCaisse.findOne({ boutique, statut: 'ouverte' }), session);

/**
 * Acomptes saisis directement dans les dossiers de réparation sur [from, to]
 * (création + modifications), hors acomptes reportés par un règlement
 * (déjà comptés via le règlement espèces). Hypothèse : payés en espèces.
 */
const acomptesReparations = async (boutique, from, to) => {
  const inRange = (d) => d && new Date(d) >= from && new Date(d) <= to;
  const reps = await Reparation.find({
    boutique,
    isDeleted: { $ne: true },
    $or: [
      { createdAt: { $gte: from, $lte: to }, acompte: { $gt: 0 } },
      { modifications: { $elemMatch: { field: 'acompte', modifiedAt: { $gte: from, $lte: to } } } },
    ],
  }).select('numero acompte createdAt modifications.field modifications.oldValue modifications.newValue modifications.modifiedAt modifications.source').lean();
  let totalM = 0;
  const details = [];
  for (const r of reps) {
    const mods = (r.modifications || []).filter((m) => m.field === 'acompte')
      .sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt));
    let m = 0;
    if (inRange(r.createdAt)) m += toM(mods.length ? mods[0].oldValue : r.acompte);
    for (const x of mods) {
      if (x.source === 'reglement' || !inRange(x.modifiedAt)) continue;
      m += toM(x.newValue) - toM(x.oldValue);
    }
    if (m !== 0) { totalM += m; details.push({ reparation: r._id, numero: r.numero, montant: fromM(m) }); }
  }
  return { total: fromM(totalM), details };
};

/** Calcul du théorique d'une session (jusqu'à maintenant si ouverte). */
const calculer = async (s) => {
  const fin = s.fermeLe || new Date();
  const [regs, mvts, acomptes, autres] = await Promise.all([
    Reglement.find({ sessionCaisse: s._id, statut: 'valide' }).select('sens montant').lean(),
    MouvementCaisse.find({ session: s._id, statut: 'valide' }).select('type montant').lean(),
    acomptesReparations(s.boutique, s.ouvertureLe, fin),
    Reglement.aggregate([
      { $match: { boutique: s.boutique, statut: 'valide', mode: { $ne: 'ESPECES' }, date: { $gte: s.ouvertureLe, $lte: fin } } },
      { $group: { _id: { mode: '$mode', sens: '$sens' }, total: { $sum: '$montant' } } },
    ]),
  ]);
  const sumM = (list) => list.reduce((t, x) => t + toM(x.montant), 0);
  const encM = sumM(regs.filter((r) => r.sens === 'ENCAISSEMENT'));
  const rembM = sumM(regs.filter((r) => r.sens === 'REMBOURSEMENT'));
  const entM = sumM(mvts.filter((m) => m.type === 'ENTREE'));
  const sorM = sumM(mvts.filter((m) => m.type === 'SORTIE'));
  const acM = toM(acomptes.total);
  const autresModes = {};
  autres.forEach((a) => {
    const k = a._id.mode;
    autresModes[k] = fromM(toM(autresModes[k] || 0) + (a._id.sens === 'REMBOURSEMENT' ? -1 : 1) * toM(a.total));
  });
  return {
    encaissementsEspeces: fromM(encM),
    remboursementsEspeces: fromM(rembM),
    entrees: fromM(entM),
    sorties: fromM(sorM),
    acomptesReparations: acomptes.total,
    acomptesDetails: acomptes.details,
    theorique: fromM(toM(s.fondInitial) + encM - rembM + entM - sorM + acM),
    autresModes,
  };
};

const nextNumero = async (boutique, session) => {
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate({ _id: `caisse:${boutique}:${year}` }, { $inc: { seq: 1 } }, so(session, { new: true, upsert: true }));
  return `CA-${year}-${String(c.seq).padStart(4, '0')}`;
};

const ouvrir = async ({ fondInitial, observation }, userId) => {
  const boutique = requireBoutiqueId();
  if (await sessionOuverte(boutique)) throw new AppError('Une caisse est déjà ouverte pour cette boutique', 409, 'CAISSE_OUVERTE');
  const fond = round3(fondInitial);
  if (!(fond >= 0)) throw new AppError('Fond de caisse invalide');
  const derniere = await SessionCaisse.findOne({ boutique, statut: 'fermee' }).sort({ fermeLe: -1 }).select('fondLaisse').lean();
  return withTransaction(async (session) => {
    const s = new SessionCaisse({
      boutique, ouvertPar: userId, fondInitial: fond, fondPropose: derniere?.fondLaisse ?? null,
      observationOuverture: String(observation || '').trim(),
    });
    s.numero = await nextNumero(boutique, session);
    try {
      await s.save(so(session));
    } catch (e) {
      if (e.code === 11000) throw new AppError('Une caisse est déjà ouverte pour cette boutique', 409, 'CAISSE_OUVERTE');
      throw e;
    }
    return s;
  });
};

const assertOuverte = async (id) => {
  const s = await SessionCaisse.findById(id);
  if (!s) throw new AppError('Session de caisse introuvable', 404);
  if (s.statut !== 'ouverte') throw new AppError('Caisse fermée', 409, 'CAISSE_FERMEE');
  return s;
};

const ajouterMouvement = async (sessionId, body, userId) => {
  const s = await assertOuverte(sessionId);
  const type = body.type === 'ENTREE' ? 'ENTREE' : body.type === 'SORTIE' ? 'SORTIE' : null;
  if (!type) throw new AppError('Type : ENTREE ou SORTIE');
  const montant = round3(body.montant);
  if (!(montant > 0)) throw new AppError('Montant invalide');
  const motif = String(body.motif || '').trim();
  if (!motif) throw new AppError('Le motif est obligatoire');
  const categorie = MouvementCaisse.CATEGORIES.includes(body.categorie) ? body.categorie : 'autre';
  if (type === 'SORTIE') {
    const t = await calculer(s);
    if (toM(montant) > toM(t.theorique)) throw new AppError(`Sortie supérieure aux espèces théoriques en caisse (${t.theorique})`);
  }
  return withTransaction(async (session) => {
    const m = new MouvementCaisse({ session: s._id, boutique: s.boutique, type, categorie, montant, motif, createdBy: userId });
    // Petite dépense payée en espèces : enregistrée aussi dans les dépenses
    if (type === 'SORTIE' && categorie === 'depense') {
      const [d] = await Depense.create([{
        type: 'DIVERSE', montant, categorieDiverse: 'Autre', motifDiverse: motif, modePaiement: 'ESPECES',
        boutique: s.boutique, createdBy: userId, observation: `Caisse ${s.numero}`,
      }], so(session));
      m.depense = d._id;
    }
    await m.save(so(session));
    return m;
  });
};

const annulerMouvement = async (id, motif) => {
  if (!String(motif || '').trim()) throw new AppError("Le motif d'annulation est obligatoire");
  const m = await MouvementCaisse.findById(id);
  if (!m || m.statut !== 'valide') throw new AppError('Mouvement introuvable ou déjà annulé', 404);
  await assertOuverte(m.session);
  return withTransaction(async (session) => {
    const x = await withSession(MouvementCaisse.findOneAndUpdate(
      { _id: id, statut: 'valide' }, { $set: { statut: 'annule', motifAnnulation: motif } }, { new: true }
    ), session);
    if (!x) throw new AppError('Mouvement déjà annulé', 409);
    if (x.depense) await Depense.updateOne({ _id: x.depense }, { $set: { isDeleted: true } }, so(session));
    return x;
  });
};

const fermer = async (sessionId, body, userId) => {
  const s = await assertOuverte(sessionId);
  const comptage = Array.isArray(body.comptage)
    ? body.comptage.map((c) => ({ valeur: Number(c.valeur), quantite: Number(c.quantite) }))
      .filter((c) => c.valeur > 0 && Number.isInteger(c.quantite) && c.quantite > 0)
    : [];
  let compte;
  if (comptage.length) {
    compte = fromM(comptage.reduce((t, c) => t + Math.round(toM(c.valeur) * c.quantite), 0));
  } else {
    if (body.montantCompte === undefined || body.montantCompte === null || body.montantCompte === '') {
      throw new AppError('Montant compté obligatoire');
    }
    compte = round3(body.montantCompte);
  }
  if (!(compte >= 0)) throw new AppError('Montant compté invalide');
  const fondLaisse = body.fondLaisse === undefined || body.fondLaisse === '' ? 0 : round3(body.fondLaisse);
  if (!(fondLaisse >= 0) || toM(fondLaisse) > toM(compte)) throw new AppError('Le fond laissé doit être entre 0 et le montant compté');

  s.fermeLe = new Date();
  const t = await calculer(s);
  const { acomptesDetails, ...totaux } = t;
  void acomptesDetails;
  const r = await SessionCaisse.findOneAndUpdate(
    { _id: s._id, statut: 'ouverte' },
    {
      $set: {
        statut: 'fermee', fermeLe: s.fermeLe, fermePar: userId, comptage, montantCompte: compte,
        fondLaisse, remiseBanque: fromM(toM(compte) - toM(fondLaisse)), totaux,
        ecart: fromM(toM(compte) - toM(t.theorique)), observationFermeture: String(body.observation || '').trim(),
      },
    },
    { new: true }
  );
  if (!r) throw new AppError('Caisse déjà fermée', 409);
  return r;
};

const rouvrir = async (id, motif, userId) => {
  if (!String(motif || '').trim()) throw new AppError('Le motif est obligatoire');
  const s = await SessionCaisse.findById(id);
  if (!s || s.statut !== 'fermee') throw new AppError('Session introuvable ou déjà ouverte', 404);
  const derniere = await SessionCaisse.findOne({ boutique: s.boutique }).sort({ ouvertureLe: -1 }).select('_id').lean();
  if (String(derniere._id) !== String(s._id)) throw new AppError('Seule la dernière session peut être rouverte', 409);
  try {
    return await SessionCaisse.findOneAndUpdate(
      { _id: id, statut: 'fermee' },
      {
        $set: { statut: 'ouverte', fermeLe: null, fermePar: null, montantCompte: null, ecart: null, fondLaisse: null, remiseBanque: null, comptage: [] },
        $push: { rouvertures: { date: new Date(), par: userId, motif } },
      },
      { new: true }
    );
  } catch (e) {
    if (e.code === 11000) throw new AppError('Une autre caisse est déjà ouverte', 409, 'CAISSE_OUVERTE');
    throw e;
  }
};

/** Session (courante ou donnée) avec détail en direct. */
const detail = async (s) => {
  const [mouvements, reglements] = await Promise.all([
    MouvementCaisse.find({ session: s._id }).populate('createdBy', 'username firstName lastName').sort({ createdAt: -1 }).lean(),
    Reglement.find({ sessionCaisse: s._id }).select('numero date sens montant statut client').populate('client', 'nom').sort({ date: -1 }).lean(),
  ]);
  const live = s.statut === 'ouverte' ? await calculer(s) : { ...(s.totaux || {}), acomptesDetails: (await acomptesReparations(s.boutique, s.ouvertureLe, s.fermeLe)).details };
  return { ...(s.toObject ? s.toObject() : s), calcul: live, mouvements, reglements };
};

module.exports = {
  sessionOuverte, acomptesReparations, calculer, ouvrir, ajouterMouvement, annulerMouvement, fermer, rouvrir, detail,
};
