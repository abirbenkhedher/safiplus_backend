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

    // ---------- Déclaration journalière ----------
    r = await api('POST', '/declarations', o({ body: { reparateur: S.rep1._id, jour, lignes: [
      { stock: aff, quantite: 1, reparation: S.r2._id }, // déjà dans le dossier r2 → doublon
      { stock: aff, quantite: 1 }, // non liée
    ] } }));
    const decl = r.body.data;
    check('Déclaration journalière créée (brouillon)', r.status === 201 && decl.statut === 'brouillon', r.body);
    r = await api('POST', `/declarations/${decl._id}/validate`, o());
    const lines = r.body.data?.lignes || [];
    check('Anti-doublon : ligne déjà saisie dans le dossier exclue', lines[0]?.statut === 'doublon_exclu', lines);
    check('Ligne non liée valorisée au coût', lines[1]?.coutTotal > 0 && lines[1]?.statut === 'active', lines);
    await wait(500);
    r = await api('GET', `/rapports/reparation/${S.r2._id}/rentabilite`, o());
    check('Déclaration non liée : aucun coût attribué au dossier r2', r.body.data?.lignes.every((l) => l.source === 'reparation'), r.body.data?.lignes);
    const rent = r.body.data;
    check('Rentabilité r2 : marge = CA HT − coût pièces', rent && rent.margeAvantCommission === Math.round((rent.caHT - rent.coutPieces) * 1000) / 1000, rent);
    r = await api('GET', '/remuneration/commissions?' + new URLSearchParams(range), o());
    check('Déclaration : commission selon la version en vigueur le jour déclaré (30% × 200 = 60)', r.body.data.some((c) => c.declaration === decl._id && c.montant === 60), r.body.data.filter((c) => c.declaration));

    // ---------- Doublon inverse : consommation d'une pièce déjà déclarée pour le dossier ----------
    const decl2 = (await api('POST', '/declarations', o({ body: { reparateur: S.rep2._id, jour, lignes: [{ stock: aff, quantite: 1, reparation: S.r3._id }] } }))).body.data;
    await api('POST', `/declarations/${decl2._id}/validate`, o());
    // r3 a déjà la pièce aff → la ligne doit être exclue ; on teste le sens inverse sur r1 (pièce annulée)
    const decl3 = (await api('POST', '/declarations', o({ body: { reparateur: S.owner._id, jour, lignes: [{ stock: aff, quantite: 1, reparation: S.r1._id }] } }))).body.data;
    await api('POST', `/declarations/${decl3._id}/validate`, o());
    r = await api('POST', '/stock/consommer', o({ body: { reparationId: S.r1._id, stockId: aff, quantite: 1 } }));
    check('Consommation refusée si déjà déclarée pour le dossier (409)', r.status === 409, r.body);

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
    r = await api('GET', '/declarations', { token: tRep1, boutique: B });
    check('Isolation : réparateur sans accès à la boutique B (403)', r.status === 403, r.status);
    r = await api('GET', `/stock/${artB}/cout`, o());
    check('Isolation boutique : article B invisible depuis A (404)', r.status === 404, r.status);

    // ---------- Permissions ----------
    r = await api('POST', '/remuneration/paiements', { token: tRep1, boutique: A, body: { reparateur: S.rep1._id, type: 'paiement', montant: 10 } });
    check('Permission : réparateur ne peut pas payer (403)', r.status === 403, r.status);
    r = await api('GET', '/remuneration/me', { token: tRep1, boutique: A });
    check('Réparateur : consulte sa propre rémunération', r.status === 200 && Array.isArray(r.body.data.commissions), r.body);
    r = await api('GET', '/declarations', { token: tRep1, boutique: A });
    check('Réparateur : ne voit que ses déclarations', r.status === 200 && r.body.data.every((x) => String(x.reparateur._id) === String(S.rep1._id)), r.body.data?.length);

    // ---------- Avances / paiements ----------
    await api('POST', '/remuneration/paiements', o({ body: { reparateur: S.rep2._id, type: 'avance', montant: 200 } }));
    r = await api('POST', '/remuneration/paiements', o({ body: { reparateur: S.rep2._id, type: 'paiement', montant: 500 } }));
    check('Paiement partiel enregistré', r.status === 201, r.body);

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
    r = await api('GET', '/remuneration/summary?' + new URLSearchParams({ from, to: d(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)) }), o());
    const s2 = r.body.data.find((x) => x.reparateur === String(S.rep2._id));
    check('Solde rep2 = 1450 − 200 − 500 = 750', s2?.cumul.soldeDu === 750 && s2.periode.salaires === 1450, s2);

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
