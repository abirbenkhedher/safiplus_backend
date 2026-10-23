require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Zone = require('../src/models/Zone');
const logger = require('../src/config/logger');

// ✅ Liste des zones (toutes à ordre 0 → tri secondaire par nom)
const ZONES_SEED = [
  'Bni Khira',
  'Sidi Daoued',
  'El Ghorfa',
  'Sahb El Jebel',
  'Manzel Salm',
  'Haouaria',
  'El Chraf',
  'Aben',
  'Zewyet El Megeyez',
  'Bir el Jady',
  'Zougeg',
  'Menzel Temim',
  'Kélibia',
  'Hamem El Ghzez',
  'Dar Allouch',
  'El kedwa',
  'Farjoun',
  'El argoub',
  'ghormen',
  'Azmour',
  'kerkouen',
  'sidi madhkour',
  'ezzahra',
  'Hamem El Jebli',
];

const seedZones = async ({ force = false } = {}) => {
  try {
    await connectDB();

    const existing = await Zone.countDocuments();
    if (existing > 0 && !force) {
      logger.info(
        `⚠️  ${existing} zone(s) déjà présente(s) — utilisez --force pour ajouter les manquantes`
      );
      return { inserted: 0, skipped: existing };
    }

    let inserted = 0;
    let skipped = 0;

    for (const nom of ZONES_SEED) {
      const trimmed = nom.trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // ✅ Vérifie doublon insensible à la casse ET aux accents
      const exists = await Zone.findOne({
        nom: { $regex: new RegExp(`^${escaped}$`, 'i') },
      });

      if (exists) {
        skipped++;
        continue;
      }

      await Zone.create({ nom: trimmed, ordre: 0 });
      inserted++;
      logger.info(`✅ Zone créée : ${trimmed}`);
    }

    logger.info(`🌱 Seed terminé — ${inserted} créée(s), ${skipped} ignorée(s)`);
    return { inserted, skipped };
  } catch (err) {
    logger.error('❌ Erreur seed zones :', err);
    throw err;
  }
};

// ✅ Exécution en CLI
if (require.main === module) {
  const force = process.argv.includes('--force');
  seedZones({ force })
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedZones, ZONES_SEED };