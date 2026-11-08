// scripts/tenantScript.js
// ============================================================
// ✅ Exécuter un script (seed...) dans le contexte d'une organisation
// ------------------------------------------------------------
// Organisation ciblée :
//   - variable d'environnement ORG_ID, sinon
//   - la première organisation créée (celle de la migration)
// Exemple : ORG_ID=665f... node scripts/seedPannes.js
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const Organisation = require('../src/models/Organisation');
const Boutique = require('../src/models/Boutique');
const { runWithTenant } = require('../src/config/tenantContext');

const runInOrganisation = async (fn) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const org = process.env.ORG_ID
    ? await Organisation.findById(process.env.ORG_ID)
    : await Organisation.findOne().sort({ createdAt: 1 });

  if (!org) {
    throw new Error(
      "Aucune organisation trouvée. Lancez d'abord : npm run migrate:tenant"
    );
  }

  const boutiques = (await Boutique.find({ organisation: org._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean()).map((b) => b._id);

  const ctx = {
    organisation: org._id,
    boutiques,
    boutique: boutiques[0] || null,
    allowed: boutiques,
    isOwner: true,
  };

  console.log(`🏢 Organisation ciblée : ${org.nom} (${org._id})`);
  return runWithTenant(ctx, () => fn({ organisation: org, boutiques }));
};

module.exports = { runInOrganisation };
