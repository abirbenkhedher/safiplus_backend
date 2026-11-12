/* Test d'acceptation E2E — base ISOLÉE (mongod local port 27999), jamais la base configurée. */
const path = require('path');
const { spawn } = require('child_process');
const BACK = path.join(__dirname, '..');
const req = (p) => require(path.join(BACK, p));
const mongoose = req('node_modules/mongoose');
const { runAsSystem } = req('src/config/tenantContext');

// ⚠️ Ce script SUPPRIME la base indiquée : uniquement une base de test dédiée.
// Ex. : mongod --replSet rs0 --port 27999 --dbpath <dossier temporaire>
//       TEST_MONGODB_URI="mongodb://127.0.0.1:27999/safiteck_test_atelier?replicaSet=rs0" npm run test:atelier
const URI = process.env.TEST_MONGODB_URI || '';
const dbName = (URI.split('/')[3] || '').split('?')[0];
if (!URI.startsWith('mongodb://') || !/test/i.test(dbName)) {
  console.error('Refus : TEST_MONGODB_URI doit pointer vers une base dont le nom contient "test".');
  process.exit(2);
}
const RS_HOST = new URL(URI.replace('mongodb://', 'http://')).host;
const PORT = 5999;
const BASE = `http://127.0.0.1:${PORT}/api`;

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ' → ' + JSON.stringify(info)}`);
};

const api = async (method, url, { token, boutique, body, key } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (boutique) headers['X-Boutique-Id'] = String(boutique);
  if (key) headers['Idempotency-Key'] = key;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.arrayBuffer();
  return { status: r.status, body: data, headers: r.headers };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function initReplicaSet() {
  const c = await mongoose.createConnection(`mongodb://${RS_HOST}/admin?directConnection=true`).asPromise();
  try { await c.db.admin().command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: RS_HOST }] } }); } catch (e) { if (!/already initialized/.test(e.message)) throw e; }
  for (let i = 0; i < 60; i++) {
    const h = await c.db.admin().command({ hello: 1 });
    if (h.isWritablePrimary) break;
    await wait(500);
  }
  await c.close();
}

async function seed() {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  const M = (n) => req(`src/models/${n}`);
  const [Organisation, Boutique, User, Famille, Categorie, Objet, Marque, TypeArticle, Status, Client, Reparation] =
    ['Organisation', 'Boutique', 'User', 'Famille', 'Categorie', 'Objet', 'Marque', 'TypeArticle', 'Status', 'Client', 'Reparation'].map(M);
  return runAsSystem(async () => {
    const org = await Organisation.create({ nom: 'Org Test' });
    const org2 = await Organisation.create({ nom: 'Org Autre' });
    const A = await Boutique.create({ organisation: org._id, nom: 'Atelier A', code: 'TSTA' });
    const B = await Boutique.create({ organisation: org._id, nom: 'Atelier B', code: 'TSTB' });
    const C = await Boutique.create({ organisation: org2._id, nom: 'Atelier C', code: 'TSTC' });
    const mk = (u) => User.create({ password: 'secret123', firstName: u.username, lastName: 'T', ...u });
    const owner = await mk({ username: 'owner_t', role: 'ADMIN', isOwner: true, organisation: org._id });
    const rep1 = await mk({ username: 'rep1_t', role: 'REPARATEUR', organisation: org._id, boutiques: [A._id] });
    const rep2 = await mk({ username: 'rep2_t', role: 'REPARATEUR', organisation: org._id, boutiques: [A._id] });
    const other = await mk({ username: 'other_t', role: 'ADMIN', isOwner: true, organisation: org2._id });
    const fam = await Famille.create({ organisation: org._id, nom: 'Téléphonie' });
    const cat = await Categorie.create({ organisation: org._id, nom: 'Smartphone', famille: fam._id });
    const obj = await Objet.create({ organisation: org._id, nom: 'Téléphone' });
    const mar = await Marque.create({ organisation: org._id, nom: 'MarqueX', objet: obj._id });
    const ta = await TypeArticle.create({ organisation: org._id, nom: 'Afficheur' });
    const ta2 = await TypeArticle.create({ organisation: org._id, nom: 'Batterie' });
    const st = await Status.create({ organisation: org._id, label: 'EN COURS' });
    const mkClient = (b) => Client.create({ organisation: org._id, boutique: b, nom: 'Client', phone: '20000000' });
    const cliA = await mkClient(A._id);
    const cliB = await mkClient(B._id);
    const mkRep = (b, cli, extra) => Reparation.create({
      organisation: org._id, boutique: b, client: cli, categorie: cat._id, objet: obj._id, marque: mar._id,
      panneType: ['Ecran'], status: st._id, createdBy: owner._id, prix: 300, ...extra,
    });
    const r1 = await mkRep(A._id, cliA._id, { reparateur: rep1._id });
    const r2 = await mkRep(A._id, cliA._id, { reparateur: rep1._id });
    const r3 = await mkRep(A._id, cliA._id, { reparateur: rep2._id });
    const rB = await mkRep(B._id, cliB._id, { reparateur: owner._id });
    return { A, B, C, owner, rep1, rep2, other, cat, obj, mar, ta, ta2, r1, r2, r3, rB };
  });
}

async function main() {
  await initReplicaSet();
  const S = await seed();
  const Reparation = req('src/models/Reparation');
  const setCloture = (id, date = new Date()) => runAsSystem(async () => { await Reparation.updateOne({ _id: id }, { $set: { dateCloture: date } }); });

  const server = spawn(process.execPath, ['server.js'], {
    cwd: BACK, env: { ...process.env, MONGODB_URI: URI, PORT: String(PORT), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d; });
  try {
    for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/auth/login', { method: 'POST' }); break; } catch { await wait(500); } }

    const login = async (u) => (await api('POST', '/auth/login', { body: { username: u, password: 'secret123' } })).body;
    const L = await login('owner_t');
    const T = L.accessToken || L.token || L.data?.accessToken;
    check('Login propriétaire', !!T, L);
    const T1 = (await login('rep1_t')); const tRep1 = T1.accessToken || T1.data?.accessToken;
    const TO = (await login('other_t')); const tOther = TO.accessToken || TO.data?.accessToken;
    const A = String(S.A._id); const B = String(S.B._id);
    const o = (extra = {}) => ({ token: T, boutique: A, ...extra });
    const today = new Date();
    const d = (x) => x.toISOString().slice(0, 10);
    const pad = (n) => String(n).padStart(2, '0');
    const jour = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const from = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    const range = { from, to: jour };

    // ---------- Paramètres ----------
    let r = await api('PUT', '/atelier/parametres', o({ body: { modeStock: 'detaille', prixTTC: false } }));
    check('Changement mode stock sans confirmation refusé (409)', r.status === 409, r.body);
    r = await api('PUT', '/atelier/parametres', o({ body: { modeStock: 'detaille', confirmationModeStock: true, prixTTC: false } }));
    check('Mode stock détaillé activé (boutique A)', r.status === 200 && r.body.data.modeStock === 'detaille', r.body);
    r = await api('GET', '/atelier/parametres', { token: T, boutique: B });
    check('Boutique B garde ses propres paramètres (simplifie)', r.body.data.modeStock === 'simplifie', r.body);

    // ---------- Article + achats + CMP ----------
    r = await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta._id, marque: S.mar._id, quantite: 0, prixIndicatif: 200, code: 'aff1' } }));
    const aff = r.body.data?._id;
    check('Création article (code, prix de vente)', r.status === 201 && r.body.data.code === 'AFF1', r.body);

    const achat = async (lignes, bq = A) => {
      const c = await api('POST', '/depenses', { token: T, boutique: bq, body: { type: 'ACHAT', lignes, fournisseur: 'F1' } });
      return c.body.data;
    };
    const f1 = await achat([{ stock: aff, quantite: 10, prixUnitaire: 60 }]);
    check('Facture achat créée en brouillon (montant 600)', f1?.statut === 'brouillon' && f1.montant === 600, f1);
    r = await api('POST', `/depenses/${f1._id}/validate`, o({ key: 'k-f1' }));
    check('Validation facture 1', r.status === 200, r.body);
    const r2b = await api('POST', `/depenses/${f1._id}/validate`, o({ key: 'k-f1' }));
    check('Idempotence : rejeu même clé = même réponse', r2b.status === 200 && r2b.headers.get('idempotent-replay') === 'true', r2b.status);
    const r3b = await api('POST', `/depenses/${f1._id}/validate`, o({ key: 'k-f1-bis' }));
    check('Double validation refusée (409)', r3b.status === 409, r3b.body);
    const f2 = await achat([{ stock: aff, quantite: 10, prixUnitaire: 70 }]);
    await api('POST', `/depenses/${f2._id}/validate`, o());
    r = await api('GET', `/stock/${aff}/cout`, o());
    check('CMP : 10 à 60 + 10 à 70 = 65', r.body.data?.cmp === 65, r.body.data);

    // ---------- Règles ----------
    const vf = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    r = await api('POST', '/remuneration/regles', o({ body: { nom: 'Afficheur 30%', article: aff, typeCalcul: 'pourcentage', base: 'prix_vente', taux: 30, validFrom: vf } }));
    const regle30 = r.body.data?._id;
    check('Règle article 30 %', r.status === 201, r.body);
    r = await api('POST', '/remuneration/regles', o({ body: { nom: 'rep2 forfait', reparateur: S.rep2._id, article: aff, typeCalcul: 'fixe_unite', montantFixe: 8, validFrom: vf } }));
    check('Règle réparateur+article forfait 8/unité', r.status === 201, r.body);

    // ---------- Consommation par réparation ----------
    r = await api('POST', '/stock/consommer', o({ body: { reparationId: S.r1._id, stockId: aff, quantite: 2 } }));
    check('Consommation 2 unités au CMP 65 → coût 130', r.body.cout?.total === 130 && r.body.cout?.source === 'CMP', r.body);
    check('Stock physique décrémenté (18)', r.body.data?.quantite === 18, r.body.data);

    // r1 : rep1 (30% × 400 = 120) ; r3 : rep2 (forfait 8 × 1)
    await api('POST', '/stock/consommer', o({ body: { reparationId: S.r3._id, stockId: aff, quantite: 1 } }));
    await setCloture(S.r1._id); await setCloture(S.r3._id);
    r = await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    check('Calcul des commissions', r.status === 200, r.body);
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    const comR1 = r.body.data.find((c) => String(c.reparation?._id) === String(S.r1._id));
    const comR3 = r.body.data.find((c) => String(c.reparation?._id) === String(S.r3._id));
    check('Afficheur à 30 % : rep1 = 120', comR1?.montant === 120 && comR1.regleSnapshot.taux === 30, comR1);
    check('Réparateur+article prioritaire : rep2 = 8 (forfait/unité)', comR3?.montant === 8 && comR3.regleSnapshot.niveau === 'reparateur+article', comR3);
    r = await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    check('Recalcul idempotent (0 créée)', r.body.data.crees === 0, r.body.data);

    // Validation + modification future du taux
    r = await api('POST', '/remuneration/commissions/valider', o({ body: range }));
    check('Validation des commissions', r.body.data?.validees === 2, r.body);
    const demain = new Date(Date.now() + 1000).toISOString();
    r = await api('PUT', `/remuneration/regles/${regle30}`, o({ body: { taux: 40, validFrom: demain } }));
    check('Modification taux d\'une règle utilisée → nouvelle version', r.status === 200 && r.body.data.version === 2, r.body);
    await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    const after = r.body.data.find((c) => c._id === comR1._id);
    check('Historique validé inchangé après modification du taux', after?.montant === 120 && after.statut === 'validee', after);

    // ---------- Intervention partagée + salaire fixe ----------
    r = await api('POST', '/remuneration/contrats', o({ body: { reparateur: S.rep2._id, mode: 'salaire', salaire: 1450, validFrom: from } }));
    check('Contrat salaire fixe 1450 (rep2)', r.status === 201, r.body);
    await api('PUT', `/reparations/${S.r2._id}`, o({ body: { repartitionCommission: [{ reparateur: S.rep1._id, pourcentage: 60 }, { reparateur: S.rep2._id, pourcentage: 40 }] } }));
    await wait(1500); // attente de la mise à jour du taux (validFrom futur proche)
    await api('POST', '/stock/consommer', o({ body: { reparationId: S.r2._id, stockId: aff, quantite: 1 } }));
    await setCloture(S.r2._id);
    await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    const shared = r.body.data.filter((c) => String(c.reparation?._id) === String(S.r2._id) && c.statut !== 'annulee');
    const sRep1 = shared.find((c) => String(c.reparateur._id) === String(S.rep1._id));
    check('Intervention partagée : rep1 = 40% × 200 × 60% = 48 (nouvelle version)', sRep1?.montant === 48, shared);
    check('Salaire fixe : aucune commission automatique pour rep2', !shared.some((c) => String(c.reparateur._id) === String(S.rep2._id)), shared);

    // ---------- Annulation consommation après validation → contre-écriture ----------
    const pieces = (await api('GET', `/stock/pieces/${S.r1._id}`, o())).body.data.pieces;
    r = await api('PATCH', `/stock/pieces/${S.r1._id}/${pieces[0]._id}/annuler`, o({ body: { motif: 'erreur' } }));
    check('Annulation consommation : remise en stock', r.status === 200, r.body);
    await wait(800);
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    const rev = r.body.data.find((c) => c.annule === comR1._id);
    check('Annulation : contre-écriture −120, original conservé', rev?.montant === -120 && r.body.data.some((c) => c._id === comR1._id && c.statut === 'validee'), rev);

    // ---------- Consommation uniquement par dossier (déclarations journalières supprimées) ----------
    r = await api('GET', '/declarations', o());
    check('Déclarations journalières supprimées : /declarations → 404', r.status === 404, r.status);
    r = await api('GET', `/rapports/reparation/${S.r2._id}/rentabilite`, o());
    check('Rentabilité r2 : coûts uniquement issus du dossier', r.body.data?.lignes.length > 0 && r.body.data.lignes.every((l) => l.source === 'reparation'), r.body.data?.lignes);
    const rent = r.body.data;
    check('Rentabilité r2 : marge = CA HT − coût pièces', rent && rent.margeAvantCommission === Math.round((rent.caHT - rent.coutPieces) * 1000) / 1000, rent);
    r = await api('GET', '/atelier/parametres', o());
    check('Paramètres : plus de mode de saisie des consommations', r.status === 200 && !('modeSaisieConsommation' in r.body.data) && !('lienDeclarationReparation' in (r.body.options || {})), r.body);
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    check('Commissions : toutes issues des dossiers', r.body.data.every((c) => ['PIECE_REPARATION', 'INTERVENTION', 'AJUSTEMENT'].includes(c.sourceType)), r.body.data.map((c) => c.sourceType));

    // ---------- FIFO ----------
    await api('PUT', '/atelier/parametres', o({ body: { methodeValorisation: 'FIFO' } }));
    const bat = (await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta2._id, quantite: 0, prixIndicatif: 50 } }))).body.data._id;
    const fa = await achat([{ stock: bat, quantite: 2, prixUnitaire: 10 }, { stock: bat, quantite: 2, prixUnitaire: 20 }]);
    await api('POST', `/depenses/${fa._id}/validate`, o());
    r = await api('POST', '/stock/consommer', o({ body: { reparationId: S.r2._id, stockId: bat, quantite: 3 } }));
    check('FIFO : 2×10 + 1×20 = 40', r.body.cout?.total === 40 && r.body.cout?.source === 'FIFO', r.body.cout);
    await api('PUT', '/atelier/parametres', o({ body: { methodeValorisation: 'CMP' } }));

    // ---------- Annulation facture d'achat ----------
    const sav = (await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta2._id, marque: S.mar._id, quantite: 0 } }))).body.data._id;
    const fx = await achat([{ stock: sav, quantite: 3, prixUnitaire: 100, remise: 30, fraisImputables: 6 }]);
    check('Ligne achat : remise et frais → coût de revient 92', fx.lignes[0].coutUnitaireRevient === 92 && fx.montant === 276, fx.lignes[0]);
    await api('POST', `/depenses/${fx._id}/validate`, o());
    r = await api('POST', `/depenses/${fx._id}/annuler`, o({ body: { motif: 'retour fournisseur' } }));
    const stx = (await api('GET', `/stock/${sav}/cout`, o())).body.data;
    check('Annulation achat : contre-écriture, stock à 0', r.status === 200 && r.body.data.statut === 'annulee', r.body);
    r = await api('GET', `/stock/${sav}/mouvements`, o());
    check('Mouvement ANNULATION_ACHAT tracé', JSON.stringify(r.body).includes('ANNULATION_ACHAT'), stx);

    // ---------- Mode stock désactivé (boutique B) ----------
    await api('PUT', '/atelier/parametres', { token: T, boutique: B, body: { modeStock: 'desactive', confirmationModeStock: true } });
    const artB = (await api('POST', '/stock', { token: T, boutique: B, body: { categorie: S.cat._id, typeArticle: S.ta._id, quantite: 0 } })).body.data._id;
    const fb = await achat([{ stock: artB, quantite: 5, prixUnitaire: 10 }], B);
    await api('POST', `/depenses/${fb._id}/validate`, { token: T, boutique: B });
    r = await api('POST', '/stock/consommer', { token: T, boutique: B, body: { reparationId: S.rB._id, stockId: artB, quantite: 2 } });
    check('Stock désactivé : saisie possible sans mouvement physique (coût 20)', r.status === 200 && r.body.data.quantite === 0 && r.body.cout.total === 20, r.body);

    // ---------- Isolation multi-tenant ----------
    r = await api('GET', `/depenses/${f1._id}`, { token: tOther });
    check('Isolation : autre organisation ne voit pas la facture (404)', r.status === 404, r.status);
    r = await api('POST', '/stock/consommer', { token: tOther, body: { reparationId: S.r1._id, stockId: aff, quantite: 1 } });
    check('Isolation : consommation inter-organisation refusée', r.status === 404, r.body);
    r = await api('GET', '/stock', { token: tRep1, boutique: B });
    check('Isolation : réparateur sans accès à la boutique B (403)', r.status === 403, r.status);
    r = await api('GET', `/stock/${artB}/cout`, o());
    check('Isolation boutique : article B invisible depuis A (404)', r.status === 404, r.status);

    // ---------- Permissions ----------
    r = await api('POST', '/remuneration/paiements', { token: tRep1, boutique: A, body: { reparateur: S.rep1._id, type: 'paiement', montant: 10 } });
    check('Permission : réparateur ne peut pas payer (403)', r.status === 403, r.status);
    r = await api('GET', '/remuneration/me', { token: tRep1, boutique: A });
    check('Réparateur : consulte sa propre rémunération', r.status === 200 && Array.isArray(r.body.data.commissions), r.body);

    // ---------- Avances / paiements ----------
    await api('POST', '/remuneration/paiements', o({ body: { reparateur: S.rep2._id, type: 'avance', montant: 200 } }));
    r = await api('POST', '/remuneration/paiements', o({ body: { reparateur: S.rep2._id, type: 'paiement', montant: 500 } }));
    check('Paiement partiel enregistré', r.status === 201, r.body);

    // ---------- Règle créée aujourd'hui, utilisée, puis modifiée le même jour ----------
    // (bug : la prise d'effet par défaut « aujourd'hui » = 00:00 était refusée)
    r = await api('POST', '/remuneration/regles', o({ body: { nom: 'Jour J', reparateur: S.rep1._id, article: aff, typeCalcul: 'pourcentage', base: 'prix_vente', taux: 30, validFrom: jour } }));
    const regleJour = r.body.data?._id;
    await api('POST', '/stock/consommer', o({ body: { reparationId: S.r1._id, stockId: aff, quantite: 1 } }));
    await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    check('Règle du jour utilisée par une commission', r.body.data.some((c) => String(c.regle) === String(regleJour) || c.regleSnapshot?.nom === 'Jour J'), r.body.data.map((c) => c.regleSnapshot?.nom));
    r = await api('PUT', `/remuneration/regles/${regleJour}`, o({ body: { taux: 35, validFrom: jour } }));
    check('Modification le jour même (prise d\'effet = aujourd\'hui) → version 2 effective maintenant', r.status === 200 && r.body.data?.version === 2, r.body);
    const regleJourV2 = r.body.data?._id;
    r = await api('PUT', `/remuneration/regles/${regleJourV2}`, o({ body: { taux: 40, validFrom: '2000-01-01' } }));
    check('Version non utilisée déplacée avant la précédente → refusée (400)', r.status === 400, r.body);
    r = await api('PUT', `/remuneration/regles/${regleJourV2}`, o({ body: { taux: 40, validFrom: jour } }));
    check('Version non utilisée modifiée le jour même → OK (taux 40)', r.status === 200 && r.body.data?.taux === 40, r.body);

    // Même requête que l'écran (editRegle + saveRegle) sur une règle GÉNÉRALE sans nom, utilisée
    r = await api('POST', '/remuneration/regles', o({ body: { nom: '', typeCalcul: 'pourcentage', base: 'prix_vente', taux: 10, validFrom: jour } }));
    const generale = r.body.data?._id;
    await api('POST', '/stock/consommer', o({ body: { reparationId: S.r1._id, stockId: aff, quantite: 1 } }));
    await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
    const lue = (await api('GET', '/remuneration/regles', o())).body.data.find((x) => String(x._id) === String(generale));
    const f = {
      ...lue, reparateur: lue.reparateur?._id || '', article: lue.article?._id, categorie: lue.categorie?._id, typeArticle: lue.typeArticle?._id,
      validFrom: jour, validTo: lue.validTo ? jour : '', base: 'marge',
    };
    for (const k of ['article', 'categorie', 'typeArticle', 'panne']) f[k] = null;
    f.reparateur = f.reparateur || null;
    r = await api('PUT', `/remuneration/regles/${generale}`, o({ body: f }));
    check('Écran : modifier une règle générale utilisée le jour même (payload du formulaire)', r.status === 200, r.body);
    r = await api('PUT', `/remuneration/regles/${r.body.data?._id}`, { token: T, boutique: 'all', body: { ...f, taux: 12 } });
    // Règles = niveau SOCIÉTÉ (comme les familles) : modifiables aussi en vue globale
    check('Vue globale : règle de la société modifiable (niveau société)', r.status === 200, { status: r.status, body: r.body });

    // ---------- Un commercial est aussi réparateur (choix de l'atelier) ----------
    {
      const com = await api('POST', '/users', o({ body: {
        username: 'com_rep_t', password: 'test1234', firstName: 'Com', lastName: 'Rep', role: 'COMMERCIAL', boutiques: [A],
      } }));
      check('Commercial créé', com.status === 201, com.body);
      r = await api('GET', '/remuneration/reparateurs', o());
      check('Rémunération : le commercial figure dans la liste des réparateurs', r.body.data.some((u) => u.username === 'com_rep_t'), r.body.data.map((u) => u.username));
      r = await api('POST', '/remuneration/contrats', o({ body: { reparateur: com.body.data._id, mode: 'commission', validFrom: from } }));
      check('Contrat commission pour le commercial', r.status === 201, r.body);
      const lc = await api('POST', '/auth/login', { body: { username: 'com_rep_t', password: 'test1234' } });
      const tCom = lc.body.data?.accessToken;
      r = await api('GET', '/remuneration/me', { token: tCom, boutique: A });
      check('Commercial : consulte « Ma rémunération »', r.status === 200 && r.body.data?.contrat?.mode === 'commission', r.body);
    }

    // ---------- Statistiques Bénéfice : achats, ventes, dépenses et réparations cohérents ----------
    {
      const near = (a, b, tol = 0.02) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
      const qs = '?' + new URLSearchParams(range);
      const stats = async () => {
        const rb = await api('GET', '/statistiques/benefice' + qs, o());
        const rf = await api('GET', '/statistiques/benefice-familles' + qs, o());
        if (rb.status !== 200 || rf.status !== 200) throw new Error(`stats ${rb.status}/${rf.status} ${JSON.stringify(rb.body).slice(0, 300)} ${JSON.stringify(rf.body).slice(0, 300)}`);
        return { b: rb.body, f: rf.body }; // réponses non enveloppées (format attendu par le frontend)
      };
      const avant = await stats();

      // Familles : Téléphonie (réparations du test) + Informatique (aucune réparation)
      const fams = (await api('GET', '/familles', o())).body.data;
      const tel = fams.find((x) => x.nom === 'Téléphonie');
      const info = (await api('POST', '/familles', o({ body: { nom: 'Informatique' } }))).body.data;
      check('Famille Informatique créée', !!info?._id, info);

      // Dépenses : famille / générale / supprimée / annulée
      const dRepTel = await api('POST', '/depenses', o({ body: { type: 'REPARATION', montant: 50, famille: tel._id, dateDepense: jour } }));
      check('Dépense réparation rattachée à la famille Téléphonie', dRepTel.status === 201 && String(dRepTel.body.data.famille) === String(tel._id), dRepTel.body);
      await api('POST', '/depenses', o({ body: { type: 'REPARATION', montant: 40, famille: info._id, dateDepense: jour } }));
      await api('POST', '/depenses', o({ body: { type: 'DIVERSE', categorieDiverse: 'Loyer', montant: 30, dateDepense: jour } }));
      const dSup = await api('POST', '/depenses', o({ body: { type: 'DIVERSE', categorieDiverse: 'Autre', montant: 999, dateDepense: jour } }));
      await api('DELETE', `/depenses/${dSup.body.data._id}`, o());
      const dAnn = await api('POST', '/depenses', o({ body: { type: 'DIVERSE', categorieDiverse: 'Autre', montant: 777, famille: tel._id, dateDepense: jour } }));
      await api('POST', `/depenses/${dAnn.body.data._id}/annuler`, o({ body: { motif: 'test' } }));
      // Facture d'achat : 1 ligne hors stock (10) famille Informatique + 1 ligne stock (non comptée à l'achat)
      const fa = (await api('POST', '/depenses', o({ body: {
        type: 'ACHAT', famille: info._id, dateDepense: jour,
        lignes: [{ designation: 'Câble', quantite: 2, prixUnitaire: 5 }, { stock: aff, quantite: 1, prixUnitaire: 70 }],
      } }))).body.data;
      // Facture d'achat restée en brouillon : ne compte pas
      await api('POST', '/depenses', o({ body: { type: 'ACHAT', dateDepense: jour, lignes: [{ designation: 'Brouillon', quantite: 1, prixUnitaire: 500 }] } }));
      r = await api('POST', `/depenses/${fa._id}/validate`, o());
      check('Facture d\'achat (ligne libre + ligne stock) validée', r.status === 200, r.body);
      // Famille d'une autre société refusée
      const famOther = (await api('POST', '/familles', { token: tOther, body: { nom: 'Autre société' } })).body.data;
      r = await api('POST', '/depenses', o({ body: { type: 'DIVERSE', categorieDiverse: 'Autre', montant: 1, famille: famOther?._id } }));
      check('Famille d\'une autre société refusée (400)', r.status === 400, r.body);

      const apres = await stats();
      const b = apres.b;
      const f = apres.f;

      // Écarts attendus (dépenses supprimée / annulée / brouillon ignorées, ligne stock ignorée)
      check('Dépenses réparation +90 (50 Téléphonie + 40 Informatique)', near(b.depenses_reparation - avant.b.depenses_reparation, 90), [avant.b.depenses_reparation, b.depenses_reparation]);
      check('Dépenses diverses +30 (supprimée 999 et annulée 777 exclues)', near(b.depenses_diverse - avant.b.depenses_diverse, 30), [avant.b.depenses_diverse, b.depenses_diverse]);
      check('Achats hors stock +10 (ligne libre ; brouillon exclu)', near(b.achats_hors_stock - avant.b.achats_hors_stock, 10), [avant.b.achats_hors_stock, b.achats_hors_stock]);
      check('Ligne d\'achat stock non comptée en dépense (achats stock de la période +70 en information)', near(b.achats_stock_periode - avant.b.achats_stock_periode, 70), [avant.b.achats_stock_periode, b.achats_stock_periode]);
      check('Bénéfice net −130 après ces dépenses', near(b.benefice_net - avant.b.benefice_net, -130), [avant.b.benefice_net, b.benefice_net]);

      // Identité du bénéfice
      check('Bénéfice net = CA − pièces − commissions − dép. réparation − dép. diverses − achats hors stock',
        near(b.benefice_net, b.ca_total - b.cout_pieces - b.commissions - b.depenses_reparation - b.depenses_diverse - b.achats_hors_stock), b);

      // Croisement avec les données brutes des dossiers
      const ids = [S.r1._id, S.r2._id, S.r3._id].map(String);
      let pieces = 0;
      for (const id of ids) pieces += (await api('GET', `/rapports/reparation/${id}/rentabilite`, o())).body.data?.coutPieces || 0;
      check('Coût des pièces = somme des pièces consommées des dossiers (rentabilité)', near(b.cout_pieces, pieces), [b.cout_pieces, pieces]);
      const coms = (await api('GET', '/remuneration/commissions?' + new URLSearchParams({ ...range, from: '2000-01-01' }), o())).body.data
        .filter((c) => ids.includes(String(c.reparation?._id || c.reparation)) && ['calculee', 'validee'].includes(c.statut));
      const comTotal = coms.reduce((s, c) => s + c.montant, 0);
      check('Commissions = somme des commissions des dossiers', near(b.commissions, comTotal), [b.commissions, comTotal]);

      // Bénéfice détaillé = même total, ventilé par famille
      const somme = f.familles.reduce((s, x) => s + x.benefice, 0);
      check('Bénéfice détaillé : total = bénéfice net de l\'onglet Bénéfices', near(f.totaux.benefice, b.benefice_net) && near(f.totaux.ca, b.ca_total), [f.totaux.benefice, b.benefice_net]);
      check('Bénéfice détaillé : somme des familles = total', near(somme, f.totaux.benefice), [somme, f.totaux.benefice]);
      const fTel = f.familles.find((x) => x.famille === 'Téléphonie');
      const fTelAvant = avant.f.familles.find((x) => x.famille === 'Téléphonie') || { depenses_directes: 0 };
      check('Téléphonie : dépense de la famille +50', near(fTel.depenses_directes - fTelAvant.depenses_directes, 50), [fTelAvant.depenses_directes, fTel.depenses_directes]);
      const fInfo = f.familles.find((x) => x.famille === 'Informatique');
      check('Informatique (sans réparation) : dépenses 50 (40 + achat 10), aucune part des générales, bénéfice −50',
        fInfo && near(fInfo.depenses_directes, 50) && near(fInfo.depenses_generales, 0) && near(fInfo.benefice, -50) && fInfo.ca === 0, fInfo);
      check('Dépenses générales (sans famille) à répartir +30', near(f.depenses_a_repartir.total - avant.f.depenses_a_repartir.total, 30), f.depenses_a_repartir);
      const telCats = fTel.categories.reduce((s, c) => s + c.benefice, 0);
      check('Téléphonie : somme des catégories = famille', near(telCats, fTel.benefice), [telCats, fTel.benefice]);
      const pInfo = b.depenses_par_famille.find((x) => x.famille === 'Informatique');
      check('Onglet Bénéfices : dépenses par famille (Informatique 50 dont achats 10)', pInfo && near(pInfo.total, 50) && near(pInfo.achats_hors_stock, 10), b.depenses_par_famille);
      const mInfo = b.marge_par_famille.find((x) => x.famille === 'Informatique');
      check('Onglet Bénéfices : marge par famille (Informatique −50)', mInfo && near(mInfo.marge, -50), b.marge_par_famille);
      const evo = b.evolution.reduce((s, x) => s + x.benefice, 0);
      check('Évolution journalière : somme = bénéfice net', near(evo, b.benefice_net, 0.05), [evo, b.benefice_net]);

      // Consommer une pièce : le coût des pièces augmente du coût d'achat, le bénéfice baisse d'autant (hors commission)
      const c1 = (await api('POST', '/stock/consommer', o({ body: { reparationId: S.r3._id, stockId: aff, quantite: 1 } }))).body;
      await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
      const b2 = (await api('GET', '/statistiques/benefice' + qs, o())).body;
      check('Consommation dans un dossier : coût des pièces + coût d\'achat de la pièce', near(b2.cout_pieces - b.cout_pieces, c1.cout?.total), [b.cout_pieces, b2.cout_pieces, c1.cout]);
      check('Consommation : bénéfice net −(coût pièce + nouvelle commission)',
        near(b2.benefice_net - b.benefice_net, -((b2.cout_pieces - b.cout_pieces) + (b2.commissions - b.commissions))), [b.benefice_net, b2.benefice_net]);
    }

    // ---------- Rémunération au niveau de la SOCIÉTÉ (boutiques A + B) ----------
    {
      const oB = (extra = {}) => ({ token: T, boutique: B, ...extra });
      const sameId = (x, y) => String(x?._id || x) === String(y?._id || y);
      r = await api('GET', '/remuneration/contrats', oB());
      check('Contrat créé dans A visible depuis B (un contrat par employé)', r.body.data.some((c) => sameId(c.reparateur, S.rep2._id)), r.body.data);
      r = await api('POST', '/remuneration/contrats', oB({ body: { reparateur: S.rep1._id, mode: 'commission', validFrom: from } }));
      check('Contrat créé depuis B pour un employé affecté à A (employé de la société)', r.status === 201 && sameId(r.body.data.boutiqueRattachement, B), r.body);
      const rgB = (await api('POST', '/remuneration/regles', oB({ body: {
        nom: 'B seulement', reparateur: S.rep1._id, boutiqueCible: B, typeCalcul: 'pourcentage', base: 'prix_vente', taux: 50, validFrom: from,
      } }))).body.data;
      check('Règle d\'exception pour la boutique B', rgB && sameId(rgB.boutiqueCible, B), rgB);
      r = await api('POST', '/remuneration/regles', o({ body: { nom: 'Mauvaise boutique', boutiqueCible: '000000000000000000000000', typeCalcul: 'pourcentage', base: 'prix_vente', taux: 1, validFrom: from } }));
      check('Règle : boutique hors société refusée (400)', r.status === 400, r.body);

      // Réparation de rep1 dans B + pièce consommée → commission calculée dans B avec la règle de B
      await api('PUT', `/reparations/${S.rB._id}`, oB({ body: { reparateur: S.rep1._id } }));
      r = await api('POST', '/stock/consommer', oB({ body: { reparationId: S.rB._id, stockId: artB, quantite: 1 } }));
      check('Consommation dans un dossier de B', r.status === 200, r.body);
      await setCloture(S.rB._id);
      await api('POST', '/remuneration/commissions/calculate', oB({ body: range }));
      const comB = (await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), oB())).body.data
        .filter((c) => sameId(c.reparation, S.rB._id) && sameId(c.reparateur, S.rep1._id) && c.statut !== 'annulee');
      check('Commission de rep1 dans B calculée avec la règle propre à B', comB.length > 0 && comB.every((c) => sameId(c.regle, rgB._id)), comB);
      await api('POST', '/remuneration/commissions/calculate', o({ body: range }));
      const comA = (await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o())).body.data;
      check('La règle de B ne s\'applique pas dans A', !comA.some((c) => sameId(c.regle, rgB._id)), comA.map((c) => c.regle));

      // Un seul solde par employé, détaillé par boutique, identique depuis A et depuis B
      const q = '?' + new URLSearchParams({ ...range, reparateur: String(S.rep1._id) });
      const sA = (await api('GET', '/remuneration/summary' + q, o())).body.data[0];
      const sB = (await api('GET', '/remuneration/summary' + q, oB())).body.data[0];
      check('Solde de rep1 : détail par boutique (A et B)', sA && sA.parBoutique.length >= 2 && sA.parBoutique.some((x) => sameId(x.boutique, B)), sA?.parBoutique);
      const somme = (sA?.parBoutique || []).reduce((t, x) => t + x.commissionsValidees + x.commissionsEnAttente, 0);
      check('Solde : somme des boutiques = commissions de la période', Math.abs(somme - (sA.periode.commissionsValidees + sA.periode.commissionsEnAttente)) < 0.002, [somme, sA.periode]);
      check('Solde identique vu depuis A et depuis B (niveau société)', sB && sA.cumul.soldeDu === sB.cumul.soldeDu && sA.periode.commissionsEnAttente === sB.periode.commissionsEnAttente, [sA?.cumul, sB?.cumul]);
      r = await api('GET', '/remuneration/me?' + new URLSearchParams(range), { token: tRep1, boutique: A });
      check('Ma rémunération (connecté dans A) inclut les commissions de B', r.status === 200 && r.body.data.commissions.some((c) => sameId(c.boutique, B)), { B, n: r.body.data?.commissions?.length, codes: r.body.data?.commissions?.map((c) => `${c.boutique?.code}:${c.reparation?.numero}:${c.dateSource}`), comB: comB.map((c) => `${c.dateSource}:${c.reparateur?._id || c.reparateur}`), rep1: String(S.rep1._id), range });
    }

    // ---------- Clôtures ----------
    r = await api('POST', '/remuneration/clotures/jour', o({ body: { jour } }));
    check('Clôture journalière', r.status === 200, r.body);
    r = await api('POST', '/stock/consommer', o({ body: { reparationId: S.r2._id, stockId: aff, quantite: 1 } }));
    check('Période clôturée : consommation refusée (409)', r.status === 409 && r.body.code === 'PERIODE_CLOTUREE', r.body);
    const clo = (await api('GET', '/remuneration/clotures', o())).body.data[0];
    r = await api('POST', `/remuneration/clotures/${clo._id}/rouvrir`, o({ body: { motif: 'correction' } }));
    check('Réouverture avec motif (historisée)', r.status === 200 && r.body.data.historique.length === 2, r.body);
    r = await api('POST', '/remuneration/clotures/mois', o({ body: { periode: from.slice(0, 7) } }));
    check('Clôture mensuelle (salaires générés)', r.status === 200 && r.body.data.salaires === 1, r.body);
    r = await api('POST', '/remuneration/clotures/mois', { token: T, boutique: B, body: { periode: from.slice(0, 7) } });
    check('Clôture mensuelle de B : salaire de rep2 (rattaché à A) non généré une 2e fois', r.status === 200 && r.body.data.salaires === 0, r.body);
    r = await api('GET', '/remuneration/summary?' + new URLSearchParams({ from, to: d(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)) }), o());
    const s2 = r.body.data.find((x) => x.reparateur === String(S.rep2._id));
    check('Solde rep2 = 1450 − 200 − 500 = 750', s2?.cumul.soldeDu === 750 && s2.periode.salaires === 1450, s2);

    // ---------- Tableau de bord personnel ----------
    {
      const tRep2 = (await login('rep2_t')).data?.accessToken || (await login('rep2_t')).accessToken;
      r = await api('GET', '/dashboard/me', { token: tRep1, boutique: A });
      const d1 = r.body.data;
      check('Mon tableau de bord (réparateur) : 200', r.status === 200 && !!d1?.compteurs, r.body);
      const mesNum = [S.r1, S.r2].map((x) => x.numero);
      const vus = [...d1.aTraiter, ...d1.pretes].map((x) => x.numero);
      check('Réparateur : uniquement ses dossiers (pas ceux de rep2)', vus.length > 0 && vus.every((n) => mesNum.includes(n)) && !vus.includes(S.r3.numero), vus);
      // Passage à « REPARE » → date de fin renseignée, dossier prêt à livrer
      const stRep = (await api('POST', '/statuses', o({ body: { label: 'REPARE', color: '#10b981', order: 5 } }))).body.data;
      r = await api('PATCH', `/reparations/${S.r1._id}/status`, o({ body: { status: stRep._id } }));
      check('Changement de statut vers « REPARE »', r.status === 200, r.body);
      const d2 = (await api('GET', '/dashboard/me', { token: tRep1, boutique: A })).body.data;
      check('« REPARE » → dossier dans « Prêtes à livrer » et plus « À traiter »',
        d2.pretes.some((x) => x.numero === S.r1.numero) && !d2.aTraiter.some((x) => x.numero === S.r1.numero), { pretes: d2.pretes.map((x) => x.numero), aTraiter: d2.aTraiter.map((x) => x.numero) });
      check('Date de fin renseignée : terminée aujourd\'hui et dans la période, délai moyen calculé',
        d2.compteurs.termineesAujourdhui >= 1 && d2.atelier.terminees >= 1 && d2.atelier.delaiMoyenHeures !== null, d2.compteurs);
      check('Rémunération du réparateur présente (montants numériques)',
        ['commissionsValidees', 'commissionsEnAttente', 'gainsBruts', 'soldeDu'].every((k) => typeof d2.remuneration[k] === 'number'), d2.remuneration);
      r = await api('GET', `/dashboard/me?user=${S.rep2._id}`, { token: tRep1, boutique: A });
      check('Réparateur : tableau de bord d\'un autre refusé (403)', r.status === 403, r.status);
      r = await api('GET', `/dashboard/me?user=${S.rep1._id}`, o());
      check('Admin : voit le tableau de bord de rep1 (mêmes dossiers)',
        r.status === 200 && r.body.data.utilisateur._id === String(S.rep1._id) && r.body.data.pretes.length === d2.pretes.length, r.body);
      r = await api('GET', '/dashboard/me', o());
      check('Admin (créateur des dossiers) : partie accueil renseignée', r.status === 200 && r.body.data.accueil.receptionnees >= 3, r.body.data?.accueil);
      if (tRep2) {
        r = await api('GET', '/dashboard/me', { token: tRep2, boutique: A });
        check('rep2 : ne voit pas les dossiers de rep1', r.status === 200 && ![...r.body.data.aTraiter, ...r.body.data.pretes].some((x) => mesNum.includes(x.numero)), r.body.data?.aTraiter);
      }
      // Réouverture → plus terminée
      const stCours = (await api('GET', '/statuses', o())).body.data.find((s) => !/REPARE|SORTIE/i.test(s.label));
      await api('PATCH', `/reparations/${S.r1._id}/status`, o({ body: { status: stCours._id } }));
      const d3 = (await api('GET', '/dashboard/me', { token: tRep1, boutique: A })).body.data;
      check('Réouverture (« en cours ») → de nouveau « À traiter »', d3.aTraiter.some((x) => x.numero === S.r1.numero), d3.aTraiter.map((x) => x.numero));
    }

    // ---------- Rapports ----------
    r = await api('GET', '/rapports/consommations?' + new URLSearchParams({ ...range, groupBy: 'reparateur' }), o());
    check('Rapport consommations par réparateur', r.status === 200 && r.body.data.lignes.length > 0, r.body);
    r = await api('GET', '/rapports/rentabilite-reparations?' + new URLSearchParams({ ...range, format: 'xlsx' }), o());
    check('Export Excel', r.status === 200 && r.headers.get('content-type').includes('spreadsheet'), r.status);
    r = await api('GET', '/rapports/dashboard?' + new URLSearchParams(range), o());
    check('Dashboard atelier', r.status === 200 && r.body.data.rentabilite.caHT >= 0, r.body);
    r = await api('GET', '/depenses/stats', o());
    check('Stats dépenses existantes (compatibilité) + achats', r.status === 200 && r.body.data.achat.count >= 1, r.body);
  } catch (e) {
    console.error('ERREUR TEST', e);
    check('Exécution sans exception', false, e.message);
  } finally {
    server.kill();
    await mongoose.disconnect();
    const ko = results.filter((x) => !x.ok);
    console.log(`\n${results.length - ko.length}/${results.length} OK`);
    if (serverErr.trim()) console.log('STDERR serveur:\n' + serverErr.slice(-3000));
    process.exit(ko.length ? 1 : 0);
  }
}
main();
