require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Status = require('./src/models/Status');
const Objet = require('./src/models/Objet');
const Marque = require('./src/models/Marque');
const Modele = require('./src/models/Modele');
const logger = require('./src/config/logger');
const { objets } = require('./seed/data');

// ============================================================
// ✅ FONCTION : Seed Objets + Marques + Modèles
// ============================================================
const seedObjetsMarquesModeles = async () => {
  logger.info('');
  logger.info('═══════════════════════════════════════════');
  logger.info('📦 IMPORTATION OBJETS / MARQUES / MODÈLES');
  logger.info('═══════════════════════════════════════════');

  let totalObjets = 0;
  let totalMarques = 0;
  let totalModeles = 0;

  for (const objetData of objets) {
    // 1. Créer ou récupérer l'objet
    let objet = await Objet.findOne({
      nom: { $regex: new RegExp(`^${objetData.nom}$`, 'i') },
    });

    if (!objet) {
      objet = await Objet.create({
        nom: objetData.nom,
        ordre: objetData.ordre || 0,
      });
      totalObjets++;
      logger.info(`   📦 Objet créé : ${objet.nom}`);
    } else {
      // Mettre à jour l'ordre si nécessaire
      if (objet.ordre !== objetData.ordre) {
        objet.ordre = objetData.ordre || 0;
        await objet.save();
      }
      logger.info(`   ℹ️  Objet existant : ${objet.nom}`);
    }

    // 2. Parcourir les marques de l'objet
    for (const marqueData of objetData.marques || []) {
      let marque = await Marque.findOne({
        nom: { $regex: new RegExp(`^${marqueData.nom}$`, 'i') },
        objet: objet._id,
      });

      if (!marque) {
        marque = await Marque.create({
          nom: marqueData.nom,
          objet: objet._id,
          ordre: marqueData.ordre || 0,
        });
        totalMarques++;
        logger.info(`      🏷️  Marque créée : ${marque.nom}`);
      } else {
        // Mettre à jour l'ordre si nécessaire
        if (marque.ordre !== marqueData.ordre) {
          marque.ordre = marqueData.ordre || 0;
          await marque.save();
        }
      }

      // 3. Parcourir les modèles de la marque
      for (const modeleNom of marqueData.modeles || []) {
        const existingModele = await Modele.findOne({
          nom: { $regex: new RegExp(`^${modeleNom}$`, 'i') },
          marque: marque._id,
        });

        if (!existingModele) {
          await Modele.create({
            nom: modeleNom,
            marque: marque._id,
            ordre: 0,
          });
          totalModeles++;
        }
      }
    }
  }

  logger.info('');
  logger.info('───────────────────────────────────────────');
  logger.info(`   📦 Objets créés    : ${totalObjets}`);
  logger.info(`   🏷️  Marques créées  : ${totalMarques}`);
  logger.info(`   📱 Modèles créés   : ${totalModeles}`);
  logger.info('───────────────────────────────────────────');
  logger.info('');
};

// ============================================================
// ✅ FONCTION : Seed Utilisateurs + Statuts (votre code actuel)
// ============================================================
const seedUsersAndStatuses = async () => {
  // Créer les statuts par défaut
  const defaultStatuses = [
    { label: 'En attente', parDefault: true, order: 0, color: '#ffc107', isTerminal: false },
    { label: 'Diagnostic', parDefault: false, order: 1, color: '#17a2b8', isTerminal: false },
    { label: 'Devis', parDefault: false, order: 2, color: '#6f42c1', isTerminal: false },
    { label: 'Attente validation', parDefault: false, order: 3, color: '#fd7e14', isTerminal: false },
    { label: 'En réparation', parDefault: false, order: 4, color: '#0d6efd', isTerminal: false },
    { label: 'Réparé', parDefault: false, order: 5, color: '#198754', isTerminal: false },
    { label: 'Non réparable', parDefault: false, order: 6, color: '#dc3545', isTerminal: true },
    { label: 'Prêt', parDefault: false, order: 7, color: '#20c997', isTerminal: false },
    { label: 'Livré', parDefault: false, order: 8, color: '#28a745', isTerminal: true },
    { label: 'Annulé', parDefault: false, order: 9, color: '#6c757d', isTerminal: true }
  ];

  for (const statusData of defaultStatuses) {
    await Status.findOneAndUpdate(
      { label: statusData.label },
      statusData,
      { upsert: true, returnDocument: 'after' }
    );
  }
  logger.info('✅ Statuts par défaut créés');

  // Créer l'utilisateur admin par défaut
  const adminData = {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@atelier.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
    lastName: process.env.ADMIN_LAST_NAME || 'System',
    role: 'ADMIN',
    isActive: true
  };

  const existingAdmin = await User.findOne({
    $or: [{ username: adminData.username }, { email: adminData.email }]
  });

  if (!existingAdmin) {
    const admin = new User(adminData);
    await admin.save();
    logger.info(`✅ Admin créé: ${adminData.username}`);
  } else {
    logger.info('✅ Admin déjà existant');
  }

  // Créer un utilisateur commercial par défaut
  const commercialData = {
    username: 'commercial',
    email: 'commercial@atelier.com',
    password: 'commercial123',
    firstName: 'Commercial',
    lastName: 'Test',
    role: 'COMMERCIAL',
    isActive: true
  };

  const existingCommercial = await User.findOne({
    $or: [{ username: commercialData.username }, { email: commercialData.email }]
  });

  if (!existingCommercial) {
    const commercial = new User(commercialData);
    await commercial.save();
    logger.info('✅ Commercial créé');
  } else {
    logger.info('✅ Commercial déjà existant');
  }

  // Créer un utilisateur réparateur par défaut
  const reparateurData = {
    username: 'reparateur',
    email: 'reparateur@atelier.com',
    password: 'reparateur123',
    firstName: 'Reparateur',
    lastName: 'Test',
    role: 'REPARATEUR',
    isActive: true
  };

  const existingReparateur = await User.findOne({
    $or: [{ username: reparateurData.username }, { email: reparateurData.email }]
  });

  if (!existingReparateur) {
    const reparateur = new User(reparateurData);
    await reparateur.save();
    logger.info('✅ Réparateur créé');
  } else {
    logger.info('✅ Réparateur déjà existant');
  }
};

// ============================================================
// ✅ FONCTION PRINCIPALE
// ============================================================
const seedDatabase = async () => {
  try {
    // Connexion
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ Connecté à MongoDB');
    logger.info('');

    // 1. Seed Objets / Marques / Modèles
    await seedObjetsMarquesModeles();

    // 2. Seed Users / Statuses
    await seedUsersAndStatuses();

    // Résumé
    const userCount = await User.countDocuments();
    const statusCount = await Status.countDocuments();
    const objetCount = await Objet.countDocuments();
    const marqueCount = await Marque.countDocuments();
    const modeleCount = await Modele.countDocuments();

    logger.info('');
    logger.info('═══════════════════════════════════════════');
    logger.info('📊 RÉSUMÉ DE L\'INITIALISATION');
    logger.info('═══════════════════════════════════════════');
    logger.info(`   👤 Utilisateurs : ${userCount}`);
    logger.info(`   🏷️  Statuts      : ${statusCount}`);
    logger.info(`   📦 Objets       : ${objetCount}`);
    logger.info(`   🏷️  Marques      : ${marqueCount}`);
    logger.info(`   📱 Modèles      : ${modeleCount}`);
    logger.info('═══════════════════════════════════════════');
    logger.info('');
    logger.info('🎉 Base de données initialisée avec succès !');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Erreur lors du seed:', error);
    process.exit(1);
  }
};

// ============================================================
// Gestion des erreurs non capturées
// ============================================================
process.on('unhandledRejection', (error) => {
  logger.error('❌ Rejet non géré:', error);
  process.exit(1);
});

seedDatabase();