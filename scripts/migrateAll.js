// scripts/migrateAll.js
require('dotenv').config();
const mongoose = require('mongoose');
const Reparation = require('../src/models/Reparation');
const Marque = require('../src/models/Marque');
const Modele = require('../src/models/Modele');
const logger = require('../src/config/logger');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ Connecté à MongoDB');
    logger.info('');

    // ⚠️ Important : on récupère les documents SANS validation Mongoose
    const reparations = await Reparation.collection.find({}).toArray();

    logger.info(`🔍 ${reparations.length} réparation(s) à analyser`);
    logger.info('');

    let migrated = 0;
    let marquesCrees = 0;
    let modelesCrees = 0;

    for (const rep of reparations) {
      const updates = {};
      let changed = false;

      // ============================================================
      // 1. MIGRER panneType : string → tableau
      // ============================================================
      if (typeof rep.panneType === 'string') {
        updates.panneType = rep.panneType.trim() !== '' ? [rep.panneType.trim()] : [];
        changed = true;
      } else if (!Array.isArray(rep.panneType)) {
        updates.panneType = [];
        changed = true;
      }

      // ============================================================
      // 2. MIGRER marque : string → ObjectId
      // ============================================================
      if (typeof rep.marque === 'string' && rep.marque.trim() !== '') {
        const marqueNom = rep.marque.trim();
        let marque = await Marque.findOne({
          nom: { $regex: new RegExp(`^${marqueNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          objet: rep.objet,
        });

        if (!marque) {
          // Créer la marque avec l'objet de la réparation
          marque = await Marque.create({
            nom: marqueNom,
            objet: rep.objet,
            ordre: 0,
          });
          marquesCrees++;
          logger.info(`   🏷️  Marque créée : "${marqueNom}"`);
        }

        updates.marque = marque._id;
        changed = true;
      }

      // ============================================================
      // 3. MIGRER modele : string → ObjectId
      // ============================================================
      if (typeof rep.modele === 'string' && rep.modele.trim() !== '') {
        const modeleNom = rep.modele.trim();

        // Le modèle a besoin d'une marque
        const marqueId = updates.marque || rep.marque;

        if (marqueId && mongoose.Types.ObjectId.isValid(marqueId)) {
          let modele = await Modele.findOne({
            nom: { $regex: new RegExp(`^${modeleNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            marque: marqueId,
          });

          if (!modele) {
            modele = await Modele.create({
              nom: modeleNom,
              marque: marqueId,
              ordre: 0,
            });
            modelesCrees++;
            logger.info(`   📱 Modèle créé : "${modeleNom}"`);
          }

          updates.modele = modele._id;
          changed = true;
        } else {
          logger.warn(`   ⚠️  Impossible de migrer le modèle "${modeleNom}" pour ${rep.numero} — marque manquante`);
        }
      }

      // ============================================================
      // 4. Appliquer les updates via collection.updateOne (bypass validation)
      // ============================================================
      if (changed) {
        await Reparation.collection.updateOne(
          { _id: rep._id },
          { $set: updates }
        );
        migrated++;
        logger.info(`✅ ${rep.numero || rep._id} migré`);
      }
    }

    // Résumé
    logger.info('');
    logger.info('═══════════════════════════════════════════');
    logger.info('📊 RÉSUMÉ DE LA MIGRATION');
    logger.info('═══════════════════════════════════════════');
    logger.info(`   ✅ Réparations migrées : ${migrated} / ${reparations.length}`);
    logger.info(`   🏷️  Marques créées      : ${marquesCrees}`);
    logger.info(`   📱 Modèles créés       : ${modelesCrees}`);
    logger.info('═══════════════════════════════════════════');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
};

migrate();