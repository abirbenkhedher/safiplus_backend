// scripts/migrateMultiTenant.js
// ============================================================
// ✅ MIGRATION MULTI-TENANT (idempotente : peut être relancée)
// ------------------------------------------------------------
// 1. Crée l'organisation + la boutique par défaut (si absentes)
// 2. Rattache toutes les données existantes à cette organisation/boutique
// 3. Rattache les utilisateurs existants (les ADMIN deviennent propriétaires)
// 4. Crée le compte SUPER_ADMIN (si SUPER_ADMIN_PASSWORD est défini)
// 5. Reconstruit les index (unicité par organisation / boutique)
//
// Variables d'environnement (optionnelles) :
//   MIGRATION_ORG_NAME        (défaut : "Organisation principale")
//   MIGRATION_BOUTIQUE_NAME   (défaut : "Boutique principale")
//   MIGRATION_BOUTIQUE_CODE   (défaut : "BP")
//   SUPER_ADMIN_USERNAME      (défaut : "superadmin")
//   SUPER_ADMIN_PASSWORD      (obligatoire pour créer le super admin)
//
// ⚠️ Faites une sauvegarde (mongodump) avant de lancer ce script.
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const { runAsSystem } = require('../src/config/tenantContext');

const Organisation = require('../src/models/Organisation');
const Boutique = require('../src/models/Boutique');
const User = require('../src/models/User');
require('../src/models/Counter');

// Données partagées au niveau de l'organisation
const ORG_MODELS = [
  'Famille', 'Categorie', 'Objet', 'Marque', 'Modele',
  'Panne', 'Status', 'Zone', 'TypeArticle',
];
// Données propres à une boutique
const BOUTIQUE_MODELS = [
  'Client', 'Reparation', 'Stock', 'MouvementStock', 'Depense', 'History', 'TeamMessage',
];

[...ORG_MODELS, ...BOUTIQUE_MODELS].forEach((m) => require(`../src/models/${m}`));

const missing = (field) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }] });

const migrate = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connecté à MongoDB\n');

  // ----------------------------------------------------------
  // 1. Organisation + boutique par défaut
  // ----------------------------------------------------------
  const orgName = process.env.MIGRATION_ORG_NAME || 'Organisation principale';
  let org = await Organisation.findOne().sort({ createdAt: 1 });
  if (!org) {
    org = await Organisation.create({ nom: orgName });
    console.log(`🏢 Organisation créée : ${org.nom}`);
  } else {
    console.log(`🏢 Organisation existante : ${org.nom}`);
  }

  let boutique = await Boutique.findOne({ organisation: org._id }).sort({ createdAt: 1 });
  if (!boutique) {
    boutique = await Boutique.create({
      organisation: org._id,
      nom: process.env.MIGRATION_BOUTIQUE_NAME || 'Boutique principale',
      code: (process.env.MIGRATION_BOUTIQUE_CODE || 'BP').toUpperCase(),
    });
    console.log(`🏪 Boutique créée : ${boutique.nom} (${boutique.code})`);
  } else {
    console.log(`🏪 Boutique existante : ${boutique.nom} (${boutique.code})`);
  }
  console.log('');

  // ----------------------------------------------------------
  // 2. Rattachement des données (accès brut, sans hooks)
  // ----------------------------------------------------------
  for (const name of ORG_MODELS) {
    const res = await mongoose.model(name).collection.updateMany(
      missing('organisation'),
      { $set: { organisation: org._id } }
    );
    console.log(`   ${name.padEnd(15)} → organisation : ${res.modifiedCount}`);
  }
  for (const name of BOUTIQUE_MODELS) {
    const col = mongoose.model(name).collection;
    const r1 = await col.updateMany(missing('organisation'), { $set: { organisation: org._id } });
    // Documents sans boutique → 1re boutique de LEUR organisation
    let r2 = 0;
    const orgIds = await col.distinct('organisation', missing('boutique'));
    for (const orgId of orgIds) {
      const first = await Boutique.findOne({ organisation: orgId }).sort({ createdAt: 1 }).select('_id').lean();
      if (!first) continue;
      const r = await col.updateMany(
        { organisation: orgId, ...missing('boutique') },
        { $set: { boutique: first._id } }
      );
      r2 += r.modifiedCount;
    }
    console.log(`   ${name.padEnd(15)} → organisation : ${r1.modifiedCount}, boutique : ${r2}`);
  }
  console.log('');

  // ----------------------------------------------------------
  // 3. Utilisateurs existants
  // ----------------------------------------------------------
  const users = User.collection;
  const baseFilter = { role: { $ne: 'SUPER_ADMIN' }, ...missing('organisation') };
  const admins = await users.updateMany(
    { ...baseFilter, role: 'ADMIN' },
    { $set: { organisation: org._id, isOwner: true, boutiques: [boutique._id] } }
  );
  const others = await users.updateMany(
    baseFilter,
    { $set: { organisation: org._id, isOwner: false, boutiques: [boutique._id] } }
  );
  console.log(`👤 Utilisateurs rattachés : ${admins.modifiedCount} admin(s) → propriétaires, ${others.modifiedCount} autre(s)`);

  // Nouveau module "stock" : les réparateurs y avaient accès par leur rôle → on le leur donne
  //    (une seule fois : un admin doit pouvoir la retirer ensuite)
  const done = mongoose.connection.db.collection('migrations');
  if (!(await done.findOne({ _id: 'permission-stock-reparateurs' }))) {
    const rep = await users.updateMany(
      { role: 'REPARATEUR', permissions: { $ne: 'stock' } },
      { $addToSet: { permissions: 'stock' } }
    );
    await done.insertOne({ _id: 'permission-stock-reparateurs', at: new Date() });
    console.log(`🔑 Permission "stock" ajoutée à ${rep.modifiedCount} réparateur(s)`);
  }

  // ----------------------------------------------------------
  // 4. SUPER_ADMIN
  // ----------------------------------------------------------
  const superUsername = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
  const superExists = await User.findOne({ role: 'SUPER_ADMIN' });
  if (superExists) {
    console.log(`🛡️  SUPER_ADMIN existant : ${superExists.username}`);
  } else if (process.env.SUPER_ADMIN_PASSWORD) {
    await User.create({
      username: superUsername,
      password: process.env.SUPER_ADMIN_PASSWORD,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    });
    console.log(`🛡️  SUPER_ADMIN créé : ${superUsername}`);
  } else {
    console.log('⚠️  SUPER_ADMIN non créé : définissez SUPER_ADMIN_PASSWORD puis relancez le script.');
  }
  console.log('');

  // ----------------------------------------------------------
  // 5. Index (supprime les anciens index uniques globaux)
  // ----------------------------------------------------------
  console.log('🔧 Reconstruction des index...');
  const all = ['Organisation', 'Boutique', 'User', 'Counter', ...ORG_MODELS, ...BOUTIQUE_MODELS];
  for (const name of all) {
    try {
      const dropped = await mongoose.model(name).syncIndexes();
      console.log(`   ${name.padEnd(15)} ✓${dropped.length ? ` (supprimés : ${dropped.join(', ')})` : ''}`);
    } catch (err) {
      console.log(`   ${name.padEnd(15)} ❌ ${err.message}`);
    }
  }

  console.log('\n🎉 Migration multi-tenant terminée.');
};

runAsSystem(migrate)
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erreur migration :', err);
    process.exit(1);
  });
