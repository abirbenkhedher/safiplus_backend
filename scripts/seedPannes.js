// scripts/seedPannes.js
require('dotenv').config();
const mongoose = require('mongoose');
const Panne = require('../src/models/Panne');
const Categorie = require('../src/models/Categorie');
const logger = require('../src/config/logger');
const pannesData = require('../seed/pannes');

const seedPannes = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ Connecté à MongoDB');
    logger.info('');

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalCategories = 0;
    const categoriesNotFound = [];

    // Parcourir chaque catégorie du fichier de données
    for (const [categorieNom, pannes] of Object.entries(pannesData)) {
      // 1. Trouver la catégorie par nom (insensible à la casse)
      const categorie = await Categorie.findOne({
        nom: { $regex: new RegExp(`^${categorieNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });

      if (!categorie) {
        logger.warn(`⚠️  Catégorie "${categorieNom}" NON TROUVÉE en base — ignorée`);
        categoriesNotFound.push(categorieNom);
        continue;
      }

      totalCategories++;
      logger.info(`📂 Catégorie : ${categorie.nom}`);

      // 2. Parcourir les pannes de cette catégorie
      for (let i = 0; i < pannes.length; i++) {
        const panneNom = pannes[i];
        const ordre = i + 1;

        // Vérifier si la panne existe déjà
        const existing = await Panne.findOne({
          nom: { $regex: new RegExp(`^${panneNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          categorie: categorie._id,
        });

        if (existing) {
          totalSkipped++;
          continue;
        }

        // Créer la panne
        await Panne.create({
          nom: panneNom,
          categorie: categorie._id,
          ordre,
          isActive: true,
        });

        totalCreated++;
        logger.info(`   ✅ ${panneNom}`);
      }

      logger.info('');
    }

    // Résumé
    logger.info('═══════════════════════════════════════════');
    logger.info('📊 RÉSUMÉ');
    logger.info('═══════════════════════════════════════════');
    logger.info(`   📂 Catégories traitées   : ${totalCategories}`);
    logger.info(`   ✅ Pannes créées          : ${totalCreated}`);
    logger.info(`   ⏭️  Pannes déjà existantes : ${totalSkipped}`);

    if (categoriesNotFound.length > 0) {
      logger.info('');
      logger.warn('⚠️  Catégories non trouvées (noms exacts dans le seed) :');
      categoriesNotFound.forEach((c) => logger.warn(`   ❌ "${c}"`));
      logger.info('');
      logger.info('💡 Vérifiez que le nom dans seed/pannes.js correspond EXACTEMENT à celui en base.');
    }

    logger.info('═══════════════════════════════════════════');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Erreur lors du seed des pannes:', error);
    process.exit(1);
  }
};

seedPannes();