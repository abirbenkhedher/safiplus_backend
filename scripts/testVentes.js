/* Test E2E gestion commerciale — base ISOLÉE (jamais la base configurée). */
const path = require('path');
const { spawn } = require('child_process');
const BACK = path.join(__dirname, '..');
const req = (p) => require(path.join(BACK, p));
const mongoose = req('node_modules/mongoose');
const { runAsSystem } = req('src/config/tenantContext');

// ⚠️ Ce script SUPPRIME la base indiquée : uniquement une base de test dédiée.
// TEST_MONGODB_URI="mongodb://127.0.0.1:27999/safiteck_test_ventes?replicaSet=rs0" npm run test:ventes
const URI = process.env.TEST_MONGODB_URI || '';
const dbName = (URI.split('/')[3] || '').split('?')[0];
if (!URI.startsWith('mongodb://') || !/test/i.test(dbName)) {
  console.error('Refus : TEST_MONGODB_URI doit pointer vers une base dont le nom contient "test".');
  process.exit(2);
}
const RS_HOST = new URL(URI.replace('mongodb://', 'http://')).host;
const PORT = 5998;
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
  return { status: r.status, body: ct.includes('json') ? await r.json() : null, headers: r.headers };
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
    await Boutique.create({ organisation: org2._id, nom: 'Atelier C', code: 'TSTC' });
    const mk = (u) => User.create({ password: 'secret123', firstName: u.username, lastName: 'T', ...u });
    const owner = await mk({ username: 'owner_v', role: 'ADMIN', isOwner: true, organisation: org._id });
    await mk({ username: 'rep_v', role: 'REPARATEUR', organisation: org._id, boutiques: [A._id] });
    await mk({ username: 'vend_v', role: 'COMMERCIAL', organisation: org._id, boutiques: [A._id], permissions: ['ventes', 'reglements'] });
    await mk({ username: 'other_v', role: 'ADMIN', isOwner: true, organisation: org2._id });
    await mk({ username: 'caisse_v', role: 'COMMERCIAL', organisation: org._id, boutiques: [A._id], permissions: ['comptoir'] });
    const fam = await Famille.create({ organisation: org._id, nom: 'Téléphonie' });
    const cat = await Categorie.create({ organisation: org._id, nom: 'Smartphone', famille: fam._id });
    const obj = await Objet.create({ organisation: org._id, nom: 'Téléphone' });
    const mar = await Marque.create({ organisation: org._id, nom: 'MarqueX', objet: obj._id });
    const ta = await TypeArticle.create({ organisation: org._id, nom: 'Coque' });
    const stSortie = await Status.create({ organisation: org._id, label: 'Sortie réparée' });
    const cli = await Client.create({ organisation: org._id, boutique: A._id, nom: 'Client Pro', phone: '20000001', matriculeFiscal: '1234567/A/M/000' });
    const cli2 = await Client.create({ organisation: org._id, boutique: A._id, nom: 'Client Deux', phone: '20000002' });
    const mkRep = (extra) => Reparation.create({
      organisation: org._id, boutique: A._id, client: cli._id, categorie: cat._id, objet: obj._id, marque: mar._id,
      panneType: ['Ecran'], status: stSortie._id, createdBy: owner._id, prix: 300, acompte: 100, ...extra,
    });
    const r1 = await mkRep({});
    const r2 = await mkRep({ client: cli2._id, prix: 80, acompte: 0 });
    const ta2 = await TypeArticle.create({ organisation: org._id, nom: 'Câble' });
    return { org, A, B, cat, mar, ta, ta2, cli, cli2, r1, r2 };
  });
}

async function main() {
  await initReplicaSet();
  const S = await seed();
  const Reparation = req('src/models/Reparation');
  const getRep = (id) => runAsSystem(async () => Reparation.findById(id).lean().exec());

  const server = spawn(process.execPath, ['server.js'], {
    cwd: BACK, env: { ...process.env, MONGODB_URI: URI, PORT: String(PORT), NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d; });
  try {
    for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/auth/login', { method: 'POST' }); break; } catch { await wait(500); } }
    const login = async (u) => {
      const b = (await api('POST', '/auth/login', { body: { username: u, password: 'secret123' } })).body;
      return b.accessToken || b.token || b.data?.accessToken;
    };
    const T = await login('owner_v');
    const tRep = await login('rep_v');
    const tVend = await login('vend_v');
    const tOther = await login('other_v');
    check('Logins', T && tRep && tVend && tOther);
    const A = String(S.A._id); const B = String(S.B._id);
    const o = (extra = {}) => ({ token: T, boutique: A, ...extra });
    const year = new Date().getFullYear();

    // ---------- Paramètres + stock ----------
    let r = await api('PUT', '/atelier/parametres', o({ body: {
      modeStock: 'detaille', confirmationModeStock: true, prixTTC: true, tauxTVA: 19,
      commerce: { raisonSociale: 'Atelier A SARL', matriculeFiscal: '0000000/X', timbreFiscal: 1, validiteDevisJours: 10 },
    } }));
    check('Paramètres commerce enregistrés', r.status === 200 && r.body.data?.commerce?.raisonSociale === 'Atelier A SARL', r.body);
    r = await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta._id, marque: S.mar._id, quantite: 0, prixIndicatif: 100, code: 'coq1', usage: 'vente' } }));
    const coque = r.body.data?._id;
    check('Article créé comme « produit de vente »', r.body.data?.usage === 'vente', r.body);

    // ---------- Usage des articles : pièce de réparation / produit de vente ----------
    r = await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta._id, quantite: 3, prixIndicatif: 80, code: 'ECR1' } }));
    const piece = r.body.data?._id;
    check('Article sans usage = pièce de réparation (défaut)', r.body.data?.usage === 'reparation', r.body);
    r = await api('GET', '/stock?usage=vente', o());
    const vendables = (r.body.data || []).map((x) => String(x._id));
    check('Liste « vente » : produit présent, pièce absente', vendables.includes(String(coque)) && !vendables.includes(String(piece)), vendables);
    r = await api('GET', '/stock?usage=reparation', o());
    const pieces = (r.body.data || []).map((x) => String(x._id));
    check('Liste « réparation » : pièce présente, produit absent', pieces.includes(String(piece)) && !pieces.includes(String(coque)), pieces);
    r = await api('POST', '/stock/consommer', o({ body: { reparationId: S.r2._id, stockId: coque, quantite: 1 } }));
    check('Produit de vente refusé dans une réparation', r.status === 400 && r.body.code === 'USAGE_ARTICLE', r.body);
    r = await api('POST', '/ventes', o({ body: { type: 'DEVIS', client: S.cli._id, lignes: [{ stock: piece, quantite: 1 }] } }));
    check('Pièce de réparation refusée dans un document de vente', r.status === 400 && r.body.code === 'USAGE_ARTICLE', r.body);
    r = await api('GET', '/ventes/comptoir/articles?search=ecr1', o());
    check('Comptoir : la pièce n\'est pas proposée', r.status === 200 && (r.body.data || []).length === 0, r.body);
    r = await api('PUT', `/stock/${piece}`, o({ body: { usage: 'mixte' } }));
    r = await api('GET', '/ventes/comptoir/articles?search=ecr1', o());
    check('Usage « les deux » : proposée au comptoir', (r.body.data || []).length === 1, r.body);
    r = await api('GET', '/stock/referentiels', o());
    check('Référentiels : familles + famille des catégories', Array.isArray(r.body.data?.familles) && r.body.data.categories.some((x) => x.famille), r.body.data?.categories);
    r = await api('POST', '/stock', o({ body: { categorie: S.cat._id, typeArticle: S.ta2._id, quantite: 5, prixIndicatif: 30, code: 'CABLE1', usage: 'vente', tauxTVA: 7, coutUnitaire: 20 } }));
    const cable = r.body.data?._id;
    check('Produit : TVA 7 %, coût d\'achat 20 → CMP et dernier coût 20', r.body.data?.tauxTVA === 7 && r.body.data.cmp === 20 && r.body.data.dernierCoutAchat === 20, r.body.data);
    r = await api('POST', '/ventes', o({ body: { type: 'DEVIS', client: S.cli._id, lignes: [{ stock: cable, quantite: 1 }] } }));
    check('Ligne sans TVA précisée : TVA de l\'article (7 %)', r.body.data?.lignes?.[0]?.tauxTVA === 7, r.body.data?.lignes);
    await api('DELETE', `/ventes/${r.body.data?._id}`, o());
    const ach = await api('POST', '/depenses', o({ body: { type: 'ACHAT', lignes: [{ stock: coque, quantite: 10, prixUnitaire: 40 }] } }));
    await api('POST', `/depenses/${ach.body.data._id}/validate`, o());
    const Stock = req('src/models/Stock');
    const qte = () => runAsSystem(async () => Stock.findById(coque).lean().exec());
    check('Stock initial 10 (CMP 40)', (await qte())?.quantite === 10, await qte());

    // ---------- Permissions / isolation ----------
    r = await api('GET', '/ventes', { token: tRep, boutique: A });
    check('Réparateur sans permission ventes → 403', r.status === 403, r.status);

    // ---------- Devis ----------
    r = await api('POST', '/ventes', o({ body: { type: 'DEVIS', client: S.cli._id, lignes: [
      { stock: coque, quantite: 2 }, { designation: 'Main d\'oeuvre', quantite: 1, prixUnitaire: 50 },
    ] } }));
    const devis = r.body.data;
    check('Devis brouillon : TTC 250, sans timbre, sans numéro', r.status === 201 && devis.netAPayer === 250 && devis.timbreFiscal === 0 && !devis.numero, r.body);
    check('Devis : HT = 250/1.19 ≈ 210.084, TVA 39.916', devis.totalHT === 210.084 && devis.totalTVA === 39.916, devis);
    check('Devis : date de validité = +10 jours', !!devis.dateValidite, devis.dateValidite);
    r = await api('POST', `/ventes/${devis._id}/valider`, o({ key: 'v-devis' }));
    check(`Devis validé → DV-${year}-0001`, r.status === 200 && r.body.data.numero === `DV-${year}-0001`, r.body);
    const rep = await api('POST', `/ventes/${devis._id}/valider`, o({ key: 'v-devis' }));
    check('Idempotence validation (rejeu)', rep.headers.get('idempotent-replay') === 'true', rep.status);
    r = await api('PUT', `/ventes/${devis._id}`, o({ body: { observation: 'x' } }));
    check('Devis validé non modifiable (409)', r.status === 409, r.body);
    check('Stock inchangé par un devis', (await qte()).quantite === 10);
    r = await api('POST', `/ventes/${devis._id}/statut`, o({ body: { statut: 'accepte' } }));
    check('Devis accepté', r.body.data?.statut === 'accepte', r.body);

    // ---------- Devis → BL → Facture ----------
    r = await api('POST', `/ventes/${devis._id}/transformer`, o({ body: { type: 'BL' } }));
    const bl = r.body.data;
    check('Devis → BL brouillon', r.status === 201 && bl.type === 'BL' && bl.prixSaisis === 'TTC', r.body);
    r = await api('POST', `/ventes/${devis._id}/transformer`, o({ body: { type: 'FACTURE' } }));
    check('Deuxième transformation du même devis refusée (409)', r.status === 409, r.body);
    r = await api('POST', `/ventes/${bl._id}/valider`, o());
    check(`BL validé → BL-${year}-0001, stock 10 → 8`, r.body.data?.numero === `BL-${year}-0001` && (await qte()).quantite === 8, r.body);
    r = await api('GET', `/ventes/${devis._id}`, o());
    check('Devis marqué « transformé »', r.body.data.statut === 'transforme', r.body.data.statut);
    r = await api('POST', `/ventes/${bl._id}/transformer`, o({ body: { type: 'FACTURE' } }));
    const fa1 = r.body.data;
    check('BL → facture brouillon (lignes « stock déjà sorti »)', fa1?.lignes?.[0]?.stockSorti === true, r.body);
    r = await api('POST', `/ventes/${fa1._id}/valider`, o());
    const fa1v = r.body.data;
    check(`Facture FA-${year}-0001 : net 251 (timbre 1), stock reste 8`, fa1v?.numero === `FA-${year}-0001` && fa1v.netAPayer === 251 && (await qte()).quantite === 8, r.body);
    check('Snapshot client (matricule fiscal) figé', fa1v.clientSnapshot?.matriculeFiscal === '1234567/A/M/000', fa1v.clientSnapshot);
    r = await api('PUT', `/ventes/${fa1._id}`, o({ body: { observation: 'x' } }));
    check('Facture validée non modifiable (409)', r.status === 409, r.body);
    r = await api('POST', `/ventes/${fa1._id}/annuler`, o({ body: { motif: 'test' } }));
    check('Facture : annulation refusée (avoir obligatoire)', r.status === 409, r.body);

    // ---------- Facture directe (stock) + tentative de fraude ----------
    r = await api('POST', '/ventes', o({ body: { type: 'FACTURE', client: S.cli2._id, lignes: [
      { stock: coque, quantite: 1, stockSorti: true, origineDocument: bl._id, coutUnitaire: 0 },
    ] } }));
    const fa2 = r.body.data;
    check('Champs « stock déjà sorti » forgés ignorés', fa2?.lignes?.[0]?.stockSorti === false && fa2.lignes[0].coutUnitaire === null, r.body);
    r = await api('POST', `/ventes/${fa2._id}/valider`, o());
    check(`Facture directe FA-${year}-0002 : stock 8 → 7, coût figé 40`, r.body.data?.numero === `FA-${year}-0002` && (await qte()).quantite === 7 && r.body.data.lignes[0].coutUnitaire === 40, r.body);

    // ---------- Facture depuis réparation ----------
    r = await api('GET', `/ventes/a-facturer?client=${S.cli._id}`, o());
    check('Réparation proposée à la facturation', r.body.data?.reparations?.some((x) => String(x._id) === String(S.r1._id)), r.body);
    r = await api('POST', '/ventes/depuis', o({ body: { type: 'FACTURE', reparations: [S.r1._id] } }));
    const fa3 = r.body.data;
    check('Facture brouillon depuis réparation (300 TTC + timbre)', r.status === 201 && fa3.netAPayer === 301 && fa3.lignes[0].type === 'reparation', r.body);
    r = await api('POST', '/ventes/depuis', o({ body: { type: 'FACTURE', reparations: [S.r2._id], client: S.cli._id } }));
    check('Réparation d\'un autre client refusée', r.status === 400, r.body);
    r = await api('POST', `/ventes/${fa3._id}/valider`, o());
    check(`Facture réparation FA-${year}-0003`, r.body.data?.numero === `FA-${year}-0003`, r.body);
    r = await api('GET', `/ventes/${fa3._id}`, o());
    check('Acompte réparation (100) compté : reste 201', r.body.data.paiement?.regle === 100 && r.body.data.paiement.reste === 201, r.body.data.paiement);
    r = await api('POST', '/ventes/depuis', o({ body: { type: 'FACTURE', reparations: [S.r1._id] } }));
    check('Réparation déjà facturée refusée (409)', r.status === 409, r.body);
    r = await api('PUT', `/reparations/${S.r1._id}`, o({ body: { prix: 350 } }));
    check('Prix d\'une réparation facturée non modifiable (409)', r.status === 409, r.body);

    // ---------- Règlements ----------
    r = await api('POST', '/reglements', { token: tVend, boutique: A, key: 'reg-1', body: {
      client: S.cli._id, mode: 'ESPECES', montant: 201, affectations: [{ document: fa3._id, montant: 201 }],
    } });
    const reg1 = r.body.data;
    check(`Règlement RG-${year}-0001 (201) sur facture réparation`, r.status === 201 && reg1.numero === `RG-${year}-0001` && reg1.montantAffecte === 201, r.body);
    let rp = await getRep(S.r1._id);
    check('Report sur l\'acompte réparation : 300, payée, clôturée', rp.acompte === 300 && rp.paymentType === 'paid' && !!rp.dateCloture, rp);
    check('Part directe sur la facture = 1 (timbre)', reg1.affectations[0].direct === 1, reg1.affectations);
    r = await api('GET', `/ventes/${fa3._id}`, o());
    check('Facture réparation payée', r.body.data.paiement?.etat === 'paye', r.body.data.paiement);
    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, mode: 'ESPECES', montant: 10, affectations: [{ document: fa3._id, montant: 10 }] } }));
    check('Surpaiement d\'une facture refusé', r.status === 400, r.body);

    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, mode: 'CARTE', montant: 300 } }));
    const reg2 = r.body.data;
    check('Règlement auto 300 : 251 affectés à FA-0001, 49 en avance', reg2?.montantAffecte === 251, r.body);
    r = await api('GET', `/reglements/solde/${S.cli._id}`, o());
    check('Solde client = −49 (crédit)', r.body.data.solde === -49, r.body.data);

    // ---------- Avoir ----------
    r = await api('POST', `/ventes/${fa1._id}/avoir`, o());
    const av = r.body.data;
    check('Avoir brouillon depuis facture', r.status === 201 && av.type === 'AVOIR' && av.factureOrigine === fa1._id, r.body);
    r = await api('PUT', `/ventes/${av._id}`, o({ body: { lignes: [{ stock: coque, quantite: 1, prixUnitaire: 100, retourStock: true, coutUnitaire: 999 }] } }));
    check('Avoir : coût forgé ignoré (coût de la facture)', r.body.data?.lignes?.[0]?.coutUnitaire === null || r.body.data?.lignes?.[0]?.coutUnitaire !== 999, r.body);
    r = await api('POST', `/ventes/${av._id}/valider`, o());
    check(`Avoir AV-${year}-0001 (100) : stock 7 → 8`, r.body.data?.numero === `AV-${year}-0001` && (await qte()).quantite === 8, r.body);
    r = await api('GET', `/reglements/solde/${S.cli._id}`, o());
    check('Solde client = −149 après avoir', r.body.data.solde === -149, r.body.data);
    r = await api('POST', `/ventes/${fa1._id}/avoir`, o());
    const av2 = r.body.data;
    await api('PUT', `/ventes/${av2._id}`, o({ body: { lignes: [{ designation: 'Geste', quantite: 1, prixUnitaire: 200 }] } }));
    r = await api('POST', `/ventes/${av2._id}/valider`, o());
    check('Avoir supérieur au restant de la facture refusé', r.status === 400, r.body);
    await api('DELETE', `/ventes/${av2._id}`, o());

    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, sens: 'REMBOURSEMENT', mode: 'ESPECES', montant: 200 } }));
    check('Remboursement > crédit refusé', r.status === 400, r.body);
    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, sens: 'REMBOURSEMENT', mode: 'ESPECES', montant: 149 } }));
    check('Remboursement du crédit (149)', r.status === 201, r.body);
    r = await api('GET', `/reglements/releve/${S.cli._id}`, o());
    const rel = r.body.data;
    const last = rel.ecritures[rel.ecritures.length - 1];
    check('Relevé : solde final = 0 et cohérent', rel.solde.solde === 0 && last.solde === 0, { solde: rel.solde, last });

    // ---------- Annulation / chèque impayé ----------
    r = await api('POST', `/reglements/${reg1._id}/annuler`, { token: tVend, boutique: A, body: { motif: 'erreur' } });
    check('Annulation sans permission operations_annuler → 403', r.status === 403, r.status);
    r = await api('POST', `/reglements/${reg1._id}/annuler`, o({ body: { motif: 'erreur de saisie' } }));
    rp = await getRep(S.r1._id);
    check('Annulation règlement : acompte réparation revient à 100', r.status === 200 && rp.acompte === 100, { s: r.status, acompte: rp.acompte });
    r = await api('GET', `/ventes/${fa3._id}`, o());
    check('Facture réparation : reste 201 à nouveau', r.body.data.paiement?.reste === 201, r.body.data.paiement);
    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, mode: 'CHEQUE', montant: 201, reference: 'CHQ1', affectations: [{ document: fa3._id, montant: 201 }] } }));
    const chq = r.body.data;
    check('Chèque en portefeuille', chq?.etatCheque === 'en_portefeuille', r.body);
    r = await api('POST', `/reglements/${chq._id}/cheque`, o({ body: { etat: 'impaye' } }));
    check('Chèque impayé → annulé, facture de nouveau due', r.body.data?.statut === 'annule' && r.body.data.etatCheque === 'impaye', r.body);
    r = await api('GET', '/reglements/creances', o());
    check('Créances : client à 201', r.body.data?.find((x) => x.client === String(S.cli._id))?.solde === 201, r.body.data);

    // ---------- Isolation ----------
    r = await api('GET', `/ventes/${fa1._id}`, { token: T, boutique: B });
    check('Boutique B ne voit pas la facture de A (404)', r.status === 404, r.status);
    r = await api('GET', `/ventes/${fa1._id}`, { token: tOther });
    check('Autre organisation : 404', r.status === 404 || r.status === 403, r.status);
    r = await api('POST', '/ventes', { token: T, boutique: 'all', body: { type: 'DEVIS', client: S.cli._id, lignes: [] } });
    check('Vue globale : création refusée', r.status >= 400, r.status);

    r = await api('GET', '/reglements/synthese', o());
    check('Synthèse : 3 factures, 1 avoir', r.body.data?.factures?.nombre === 3 && r.body.data.avoirs.nombre === 1, r.body.data);

    // ---------- Vente comptoir ----------
    const tCaisse = await login('caisse_v');
    const c = (extra = {}) => ({ token: tCaisse, boutique: A, ...extra });
    r = await api('GET', '/ventes/comptoir/articles?search=coq1', c());
    check('Caissier : recherche article par code', r.body.data?.[0]?.code === 'COQ1' && r.body.data[0].prix === 100, r.body);
    r = await api('GET', '/ventes', c());
    check('Caissier (permission comptoir seule) : pas d\'accès aux factures', r.status === 403, r.status);
    r = await api('POST', '/ventes', o({ body: { type: 'TICKET', client: S.cli._id, lignes: [] } }));
    check('Ticket non créable par la route générique', r.status === 400, r.body);
    const stock0 = (await qte()).quantite;
    r = await api('POST', '/ventes/comptoir', c({ key: 'tk-1', body: { lignes: [{ stock: coque, quantite: 2 }], paiements: [{ mode: 'ESPECES', montant: 250 }] } }));
    const tk1 = r.body.data;
    check(`Ticket TK-${year}-0001 : 200 TTC sans timbre, rendu 50`, r.status === 201 && tk1.ticket.numero === `TK-${year}-0001` && tk1.ticket.netAPayer === 200 && tk1.rendu === 50, r.body);
    check('Ticket : client comptoir, payé, 1 règlement espèces de 200', tk1?.ticket?.client?.nom === 'Client comptoir' && tk1.ticket.paiement?.etat === 'paye' && tk1.reglements.length === 1 && tk1.reglements[0].montant === 200, tk1?.ticket);
    check('Ticket : stock −2, coût figé 40', (await qte()).quantite === stock0 - 2 && tk1.ticket.lignes[0].coutUnitaire === 40, tk1?.ticket?.lignes);
    const rep2 = await api('POST', '/ventes/comptoir', c({ key: 'tk-1', body: { lignes: [{ stock: coque, quantite: 2 }], paiements: [{ mode: 'ESPECES', montant: 250 }] } }));
    check('Double clic (même clé) : pas de second ticket', rep2.headers.get('idempotent-replay') === 'true' && (await qte()).quantite === stock0 - 2, rep2.status);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ stock: coque, quantite: 1 }], paiements: [{ mode: 'ESPECES', montant: 50 }] } }));
    check('Sans client : paiement incomplet refusé, stock inchangé', r.status === 400 && (await qte()).quantite === stock0 - 2, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ stock: coque, quantite: 1 }], paiements: [{ mode: 'CARTE', montant: 150 }] } }));
    check('Carte supérieure au total refusée', r.status === 400, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ stock: coque, quantite: 1 }], paiements: [{ mode: 'CARTE', montant: 60 }, { mode: 'ESPECES', montant: 40 }] } }));
    check(`Paiement mixte : TK-${year}-0002, 2 règlements (carte 60, espèces 40)`, r.body.data?.ticket?.numero === `TK-${year}-0002` && r.body.data.reglements.length === 2, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { client: S.cli2._id, lignes: [{ stock: coque, quantite: 1 }], paiements: [{ mode: 'ESPECES', montant: 30 }] } }));
    const tk3 = r.body.data;
    check('Client nommé : vente à crédit (reste 70)', tk3?.ticket?.paiement?.reste === 70 && tk3.reste === 70, r.body);
    r = await api('GET', `/reglements/solde/${S.cli2._id}`, o());
    check('Solde client 2 = facture 101 + ticket 70 = 171', r.body.data.solde === 171, r.body.data);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ stock: coque, quantite: 99 }], paiements: [{ mode: 'ESPECES', montant: 9900 }] } }));
    check('Stock insuffisant : vente refusée', r.status === 400 && r.body.code === 'STOCK_INSUFFISANT', r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ reparation: S.r1._id }], paiements: [] } }));
    check('Ligne réparation refusée au comptoir', r.status === 400, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ designation: 'Collage film', quantite: 1, prixUnitaire: 10 }], paiements: [{ mode: 'ESPECES', montant: 10 }] } }));
    check(`Numérotation sans trou après échec : TK-${year}-0004`, r.body.data?.ticket?.numero === `TK-${year}-0004`, r.body);
    r = await api('GET', '/ventes/comptoir/jour', c());
    const j = r.body.data?.totaux;
    check('Ventes du jour : 4 tickets, 410 TTC, espèces 280, carte 60', j?.nombre === 4 && j.ttc === 410 && j.parMode.ESPECES === 280 && j.parMode.CARTE === 60, j);
    check('Marge articles du jour = 336.135 − 160 = 176.135', j?.margeArticles === 176.135 && j.coutArticles === 160, j);
    r = await api('POST', `/ventes/${tk1.ticket._id}/avoir`, o());
    r = await api('POST', `/ventes/${r.body.data._id}/valider`, o());
    check('Avoir sur ticket : stock remis (+2)', r.status === 200 && (await qte()).quantite === stock0 - 2 - 1 - 1 + 2, r.body);
    r = await api('GET', '/reglements/synthese', o());
    check('Synthèse : 4 tickets, marge articles nette des retours', r.body.data?.tickets?.nombre === 4 && r.body.data.articles.marge > 0, r.body.data);

    // ---------- Caisse journalière ----------
    const params0 = (await api('GET', '/atelier/parametres', o())).body.data;
    await api('PUT', '/atelier/parametres', o({ body: { commerce: { ...params0.commerce, caisseObligatoire: true } } }));
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ designation: 'Service', quantite: 1, prixUnitaire: 5 }], paiements: [{ mode: 'ESPECES', montant: 5 }] } }));
    check('Caisse obligatoire et fermée : espèces refusées (409)', r.status === 409 && r.body.code === 'CAISSE_FERMEE', r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ designation: 'Service', quantite: 1, prixUnitaire: 5 }], paiements: [{ mode: 'CARTE', montant: 5 }] } }));
    check('Caisse fermée : carte acceptée', r.status === 201, r.body);
    r = await api('POST', '/caisse/ouvrir', c({ body: { fondInitial: 100 } }));
    check('Caissier sans permission caisse : ouverture refusée (403)', r.status === 403, r.status);
    r = await api('POST', '/caisse/ouvrir', o({ body: { fondInitial: 100 } }));
    const sess = r.body.data;
    check(`Ouverture caisse CA-${year}-0001 (fond 100)`, r.status === 201 && sess.numero === `CA-${year}-0001`, r.body);
    r = await api('POST', '/caisse/ouvrir', o({ body: { fondInitial: 0 } }));
    check('Deuxième caisse ouverte refusée (409)', r.status === 409, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ stock: coque, quantite: 1 }], paiements: [{ mode: 'ESPECES', montant: 150 }] } }));
    check('Vente espèces rattachée à la caisse (rendu 50)', r.status === 201 && String(r.body.data.reglements[0].sessionCaisse) === String(sess._id) && r.body.data.rendu === 50, r.body);
    await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ designation: 'Service carte', quantite: 1, prixUnitaire: 5 }], paiements: [{ mode: 'CARTE', montant: 5 }] } }));
    r = await api('PUT', `/reparations/${S.r2._id}`, o({ body: { acompte: 30 } }));
    check('Acompte 30 saisi dans un dossier de réparation', r.status === 200, r.body);
    r = await api('POST', '/reglements', o({ body: { client: S.cli._id, mode: 'ESPECES', montant: 201, affectations: [{ document: fa3._id, montant: 201 }] } }));
    check('Règlement espèces 201 (reporté sur l\'acompte réparation)', r.status === 201, r.body);
    r = await api('POST', `/caisse/sessions/${sess._id}/mouvements`, o({ body: { type: 'SORTIE', categorie: 'depense', montant: 20, motif: 'Café' } }));
    check('Sortie « dépense » 20 → dépense créée', r.status === 201 && !!r.body.data.depense, r.body);
    r = await api('POST', `/caisse/sessions/${sess._id}/mouvements`, o({ body: { type: 'ENTREE', categorie: 'apport', montant: 10, motif: 'Monnaie' } }));
    const mvtEntree = r.body.data;
    r = await api('POST', `/caisse/sessions/${sess._id}/mouvements`, o({ body: { type: 'SORTIE', montant: 5000, motif: 'Trop' } }));
    check('Sortie supérieure aux espèces refusée', r.status === 400, r.body);
    r = await api('GET', '/caisse/courante', c());
    let calc = r.body.data?.calcul;
    check('Théorique = 100 + 301 espèces − 20 + 10 + 30 acompte dossier = 421 (pas de double compte)', calc?.theorique === 421 && calc.acomptesReparations === 30 && calc.encaissementsEspeces === 301, calc);
    check('Autres modes : carte du jour visible', calc?.autresModes?.CARTE > 0, calc?.autresModes);
    await api('POST', `/caisse/mouvements/${mvtEntree._id}/annuler`, o({ body: { motif: 'erreur' } }));
    r = await api('GET', '/caisse/courante', o());
    calc = r.body.data?.calcul;
    check('Annulation de l\'entrée : théorique 411', calc?.theorique === 411, calc);
    r = await api('POST', `/caisse/sessions/${sess._id}/fermer`, o({ body: { comptage: [{ valeur: 50, quantite: 8 }, { valeur: 10, quantite: 1 }], fondLaisse: 100 } }));
    check('Fermeture : compté 410, écart −1, remise banque 310', r.body.data?.montantCompte === 410 && r.body.data.ecart === -1 && r.body.data.remiseBanque === 310, r.body);
    r = await api('POST', '/ventes/comptoir', c({ body: { lignes: [{ designation: 'Service', quantite: 1, prixUnitaire: 5 }], paiements: [{ mode: 'ESPECES', montant: 5 }] } }));
    check('Après fermeture : espèces refusées', r.status === 409, r.body);
    r = await api('POST', '/caisse/ouvrir', o({ body: { fondInitial: 100 } }));
    check('Nouvelle caisse : fond proposé = 100 laissé la veille', r.body.data?.fondPropose === 100, r.body);
    r = await api('POST', `/caisse/sessions/${sess._id}/rouvrir`, o({ body: { motif: 'test' } }));
    check('Réouverture d\'une ancienne session refusée', r.status === 409, r.body);
    await api('PUT', '/atelier/parametres', o({ body: { commerce: { ...params0.commerce, caisseObligatoire: false } } }));

    // ---------- Rapport commercial ----------
    r = await api('GET', '/rapport-commercial', o());
    const rap = r.body.data;
    check('Rapport : 7 tickets, TVA nette = collectée − déductible', rap?.ca?.tickets?.nombre === 7 && Math.abs(rap.tva.nette - (rap.tva.collectee - rap.tva.deductible)) < 0.0005, rap?.tva);
    check('Rapport : écart de caisse −1, top articles', rap?.caisse?.totalEcarts === -1 && rap.articles.top[0]?.code === 'COQ1', rap?.caisse);
    r = await api('GET', '/rapport-commercial?format=xlsx', o());
    check('Export Excel du rapport', r.status === 200 && (r.headers.get('content-type') || '').includes('spreadsheet'), r.status);
    r = await api('GET', '/rapport-commercial', c());
    check('Caissier : pas d\'accès au rapport (403)', r.status === 403, r.status);

    // ---------- Tableau de bord Commerce + vue globale ----------
    r = await api('GET', '/rapport-commercial/tableau-de-bord', o());
    const tdb = r.body.data;
    check('Tableau de bord commerce (jour, mois, caisse, dernières ventes)', r.status === 200 && tdb.jour?.tickets?.nombre >= 1 && tdb.caisse?.ouverte === true && tdb.dernieresVentes.length > 0, tdb);
    r = await api('GET', '/rapport-commercial/global', o());
    const g = r.body.data?.totaux;
    check('Vue globale : réparations comptées une seule fois (CA dossiers 380, facturées 300 exclues du commerce)', g?.reparations?.ca === 380 && g.reparations.facturees === 300, g);
    check('Vue globale : total = atelier + commerce', g && Math.abs(g.total.ca - (g.reparations.ca + g.commerce.ca)) < 0.0005 && Math.abs(g.total.encaisse - (g.reparations.encaisse + g.commerce.encaisse)) < 0.0005, g);

    // ---------- Module commercial désactivable (formule SaaS) ----------
    const Organisation = req('src/models/Organisation');
    await runAsSystem(async () => Organisation.updateOne({ _id: S.org._id }, { $set: { 'modules.commercial': false } }).exec());
    r = await api('GET', '/ventes', o());
    check('Module désactivé : routes commerciales refusées (MODULE_INACTIF)', r.status === 403 && r.body.code === 'MODULE_INACTIF', r.body);
    r = await api('GET', '/caisse/courante', o());
    check('Module désactivé : caisse refusée', r.status === 403, r.status);
    r = await api('GET', '/reparations', o());
    check('Module désactivé : réparations toujours accessibles', r.status === 200, r.status);
    const lg = (await api('POST', '/auth/login', { body: { username: 'owner_v', password: 'secret123' } })).body;
    const orgInfo = lg.data?.user?.organisation || lg.user?.organisation || lg.data?.organisation;
    check('Connexion : modules de l\'organisation transmis au frontend', orgInfo?.modules?.commercial === false, lg.data || lg);
    await runAsSystem(async () => Organisation.updateOne({ _id: S.org._id }, { $set: { 'modules.commercial': true } }).exec());
    r = await api('GET', '/ventes', o());
    check('Module réactivé : accès rétabli', r.status === 200, r.status);
  } finally {
    server.kill();
    await mongoose.disconnect();
  }
  const ko = results.filter((x) => !x.ok);
  console.log(`\n${results.length - ko.length}/${results.length} OK`);
  if (ko.length && serverErr) console.log(serverErr.slice(-3000));
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
