// scripts/migrateMultiBoutique.js
// ============================================================
// ✅ MIGRATION MULTI-BOUTIQUE (v2)
//  - clients communs à toutes les boutiques d'une organisation
//  - dépenses administratives : nouvel index de numérotation
// ------------------------------------------------------------
// Avant : codes clients (C001...) numérotés PAR BOUTIQUE → doublons possibles
//         entre boutiques d'une même organisation.
// Après : codes uniques par organisation.
//
// 1. Codes en double dans une organisation : le client le plus ancien garde
//    son code, les autres reçoivent un nouveau code (suite de l'organisation).
// 2. Codes fidélité en double : signalés (non modifiés) → à corriger à la main.
// 3. Compteurs "client:o:<org>" initialisés au plus grand code.
// 4. Index : suppression des anciens index par boutique, création des nouveaux.
// 5. Rapport des clients probablement identiques (même téléphone) : AUCUNE fusion.
//
// Par défaut : simulation (rien n'est écrit). Pour appliquer : --apply
//   npm run migrate:multiboutique            (simulation)
//   npm run migrate:multiboutique -- --apply (exécution)
//
// ⚠️ Faites une sauvegarde (mongodump) avant --apply.
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const { runAsSystem } = require('../src/config/tenantContext');
const Client = require('../src/models/Client');
const Counter = require('../src/models/Counter');
const Depense = require('../src/models/Depense');

const APPLY = process.argv.includes('--apply');

const migrate = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connecté — mode ${APPLY ? 'EXÉCUTION' : 'SIMULATION (ajoutez --apply)'}\n`);
  const col = Client.collection;
  let hasFidDup = false;

  const orgIds = await col.distinct('organisation');
  for (const orgId of orgIds) {
    console.log(`🏢 Organisation ${orgId}`);
    let next = (await Client.maxCodeNumber(orgId)) + 1;

    // 1. Codes en double
    const dups = await col.aggregate([
      { $match: { organisation: orgId, code: { $type: 'string' } } },
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: '$code', ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]).toArray();
    let renamed = 0;
    for (const d of dups) {
      for (const id of d.ids.slice(1)) {
        const code = `C${String(next).padStart(3, '0')}`;
        next += 1;
        console.log(`   code ${d._id} en double → client ${id} devient ${code}`);
        if (APPLY) await col.updateOne({ _id: id }, { $set: { code } });
        renamed += 1;
      }
    }
    console.log(`   Codes renumérotés : ${renamed}`);

    // 2. Codes fidélité en double (signalement)
    const fid = await col.aggregate([
      { $match: { organisation: orgId, codeFidelite: { $type: 'string' } } },
      { $group: { _id: '$codeFidelite', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]).toArray();
    if (fid.length) {
      hasFidDup = true;
      console.log(`   ⚠️ Codes fidélité en double (à corriger à la main) : ${fid.map((f) => f._id).join(', ')}`);
    }

    // 3. Compteur de l'organisation
    if (APPLY) {
      await Counter.updateOne(
        { _id: `client:o:${orgId}` },
        { $max: { seq: next - 1 } },
        { upsert: true }
      );
    }

    // 5. Clients probablement identiques (même téléphone)
    const same = await col.aggregate([
      { $match: { organisation: orgId, phone: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$phone', codes: { $push: '$code' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 50 },
    ]).toArray();
    if (same.length) {
      console.log(`   ℹ️ Même téléphone (non fusionnés, ${same.length} premier(s)) :`);
      same.forEach((s) => console.log(`      ${s._id} → ${s.codes.join(', ')}`));
    }
    console.log('');
  }

  // 4. Index
  if (APPLY) {
    // Dépenses : { boutique, numero } → { organisation, boutique, numero }
    // (nécessaire pour les dépenses administratives, boutique = null)
    const droppedDep = await Depense.syncIndexes();
    console.log(`🔧 Index dépenses ✓${droppedDep.length ? ` (supprimés : ${droppedDep.join(', ')})` : ''}`);

    if (hasFidDup) {
      console.log('⚠️ Index non reconstruits : corrigez d\'abord les codes fidélité en double.');
    } else {
      const dropped = await Client.syncIndexes();
      console.log(`🔧 Index clients ✓${dropped.length ? ` (supprimés : ${dropped.join(', ')})` : ''}`);
    }
  }
  console.log('\n🎉 Terminé.');
};

runAsSystem(migrate)
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erreur migration :', err);
    process.exit(1);
  });
