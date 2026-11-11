// scripts/rattrapageClotures.js
// ============================================================
// ✅ RATTRAPAGE DES CLÔTURES DE RÉPARATIONS
// ------------------------------------------------------------
// Règle : statut « réparé / sortie réparé(e) » ET reste à payer = 0
//         → la réparation est clôturée (dateCloture).
// Les réparations déjà dans ce cas mais sans date de clôture (libellé de
// statut non reconnu auparavant, prix 0...) sont clôturées :
//   dateCloture = date du passage à ce statut (historique), sinon updatedAt.
// Puis les commissions de ces réparations sont recalculées.
//
// Par défaut : simulation (rien n'est écrit). Pour appliquer : --apply
//   npm run rattrapage:clotures            (simulation)
//   npm run rattrapage:clotures -- --apply (exécution)
//
// ⚠️ Faites une sauvegarde (mongodump) avant --apply.
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const { runAsSystem, runWithTenant } = require('../src/config/tenantContext');
const Reparation = require('../src/models/Reparation');
const Status = require('../src/models/Status');
const commissionService = require('../src/services/commissionService');
const { doitEtreCloturee, resteAPayer } = require('../src/utils/statutReparation');

const APPLY = process.argv.includes('--apply');

/** Date du dernier passage au statut actuel (historique des modifications). */
const dateDuStatut = (rep) => {
  const mods = (rep.modifications || [])
    .filter((m) => m.field === 'status' && String(m.newValue) === String(rep.status) && m.modifiedAt)
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return mods[0]?.modifiedAt || rep.updatedAt || new Date();
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connecté — mode ${APPLY ? 'EXÉCUTION' : 'SIMULATION (ajoutez --apply)'}\n`);

  const statuses = await runAsSystem(async () => Status.find({}).select('label').lean());
  const labelOf = new Map(statuses.map((s) => [String(s._id), s.label]));

  const candidats = await runAsSystem(async () =>
    Reparation.find({ isDeleted: { $ne: true }, dateCloture: null, status: { $ne: null } })
      .select('numero status prix acompte diagnosticImprevus modifications updatedAt organisation boutique')
      .lean()
  );

  const aClore = candidats.filter((r) => doitEtreCloturee(r, labelOf.get(String(r.status))));
  console.log(`🔎 ${candidats.length} réparation(s) non clôturée(s), ${aClore.length} à clôturer :`);

  let faites = 0;
  for (const r of aClore) {
    const date = dateDuStatut(r);
    console.log(`   ${r.numero || r._id} · « ${labelOf.get(String(r.status))} » · reste ${resteAPayer(r)} → clôture ${new Date(date).toISOString().slice(0, 10)}`);
    if (!APPLY) continue;

    await runAsSystem(async () => Reparation.collection.updateOne(
      { _id: r._id, dateCloture: null },
      {
        $set: { dateCloture: new Date(date) },
        $push: {
          modifications: {
            field: 'dateCloture', oldValue: null, newValue: new Date(date),
            modifiedBy: null, modifiedAt: new Date(), comment: 'Rattrapage clôture (réparé + reste 0)',
          },
        },
      }
    ));

    // Commissions : dans le contexte de la boutique de la réparation
    const ctx = { organisation: r.organisation, boutiques: [r.boutique], boutique: r.boutique, allowed: [r.boutique] };
    try {
      await runWithTenant(ctx, async () => commissionService.syncReparation(r._id, null));
    } catch (err) {
      console.log(`      ⚠️ commissions non recalculées : ${err.message}`);
    }
    faites += 1;
  }

  console.log(`\n🎉 Terminé${APPLY ? ` : ${faites} réparation(s) clôturée(s).` : ' (simulation).'}`);
};

run()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erreur :', err);
    process.exit(1);
  });
