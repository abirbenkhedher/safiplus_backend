const XLSX = require('xlsx');
const Client = require('../models/Client');
const { avecStats } = require('../services/clientStatsService');
const Reparation = require('../models/Reparation');
const logger = require('../config/logger');

// ============================================================
// ✅ CONSTANTE : numéro par défaut (client sans téléphone)
// ============================================================
const DEFAULT_PHONE = '00000000';

// ============================================================
// ✅ Helper : vérifie si un numéro est le numéro par défaut
// ============================================================
const isDefaultPhone = (phone) => {
  if (!phone) return false;
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  return cleaned === DEFAULT_PHONE;
};

// ============================================================
// ✅ Helper : normalise un téléphone (chiffres uniquement)
// ============================================================
const normalizePhone = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/[^0-9]/g, '').trim();
};

// ============================================================
// ✅ Helper : normalise une chaîne pour comparer les en-têtes
// ============================================================
const normalizeHeader = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

// ============================================================
// ✅ Helper : alias des champs (tolérance aux variations)
// ============================================================
const FIELD_ALIASES = {
  nom: ['nom', 'nomclient', 'nomcomplet', 'name', 'client'],
  phone: ['telephone', 'telephone1', 'tel', 'phone', 'gsm', 'mobile'],
  phone2: ['telephone2', 'tel2', 'phone2', 'gsm2'],
  email: ['email', 'mail', 'email1'],
  adresse: ['adresse', 'address', 'localisation'],
  zone: ['zone', 'region', 'secteur'],
  codeFidelite: ['codefidelite', 'fidelite', 'codefid', 'fidelity'],
};

// ============================================================
// ✅ Helper : analyse un fichier Excel (SANS rien créer)
//    Règles :
//    - Si téléphone existe déjà → "notCreated" (raison: déjà existant)
//    - Si téléphone vide          → "notCreated" (raison: manquant)
//    - Sinon                      → "toCreate"
// ============================================================
async function analyzeImportFile(fileBuffer) {
  // ✅ 1. Valider le buffer
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    return {
      error:
        'Le fichier est vide ou invalide. Vérifiez que vous avez bien sélectionné un fichier Excel.',
    };
  }

  logger.info(`📄 [IMPORT] Taille du buffer: ${fileBuffer.length} octets`);

  // ✅ 2. Lire le workbook
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (err) {
    logger.error('❌ [IMPORT] Erreur XLSX.read:', err);
    return {
      error: `Impossible de lire le fichier Excel: ${err.message}. Le fichier est peut-être corrompu ou dans un format non supporté.`,
    };
  }

  // ✅ 3. Valider le workbook
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    return { error: 'Le fichier ne contient aucune feuille lisible.' };
  }

  if (workbook.SheetNames.length === 0) {
    return { error: 'Le fichier ne contient aucune feuille.' };
  }

  logger.info(
    `📄 [IMPORT] Feuilles détectées (${workbook.SheetNames.length}): ${workbook.SheetNames.join(' | ')}`
  );

  // ✅ 4. Récupérer la première feuille
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return { error: `La feuille "${sheetName}" est introuvable ou vide.` };
  }

  // ✅ 5. Convertir en tableau 2D
  let rawRows;
  try {
    rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });
  } catch (err) {
    logger.error('❌ [IMPORT] Erreur sheet_to_json:', err);
    return {
      error: `Impossible de convertir la feuille en tableau: ${err.message}`,
    };
  }

  // ✅ 6. Valider le résultat
  if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
    return {
      error:
        "Aucune donnée trouvée dans la feuille. Vérifiez que le fichier n'est pas vide.",
    };
  }

  logger.info(`📄 [IMPORT] ${rawRows.length} ligne(s) brutes lues`);

  // ✅ 7. Détection de la ligne d'en-tête
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
    const row = (rawRows[i] || []).map((c) => normalizeHeader(c));
    const hasNom = row.some((c) =>
      ['nom', 'nomclient', 'nomcomplet', 'name', 'client'].includes(c)
    );
    const hasPhone = row.some((c) =>
      ['telephone', 'telephone1', 'tel', 'phone', 'gsm', 'mobile'].includes(c)
    );
    if (hasNom && hasPhone) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      error:
        "Impossible de trouver la ligne d'en-tête. Le fichier doit contenir au minimum les colonnes 'Nom' et 'Téléphone'.",
    };
  }

  const headers = rawRows[headerRowIndex].map((h) => String(h || '').trim());
  const dataRows = rawRows.slice(headerRowIndex + 1);

  logger.info(
    `📄 [IMPORT] En-tête ligne ${headerRowIndex + 1}: ${headers.join(' | ')}`
  );
  logger.info(`📄 [IMPORT] ${dataRows.length} ligne(s) de données`);

  // ✅ 8. Index des colonnes
  const getColumnIndex = (targetField) => {
    const aliases = FIELD_ALIASES[targetField] || [];
    for (let i = 0; i < headers.length; i++) {
      if (aliases.includes(normalizeHeader(headers[i]))) return i;
    }
    return -1;
  };

  const colIndex = {
    nom: getColumnIndex('nom'),
    phone: getColumnIndex('phone'),
    phone2: getColumnIndex('phone2'),
    email: getColumnIndex('email'),
    adresse: getColumnIndex('adresse'),
    zone: getColumnIndex('zone'),
    codeFidelite: getColumnIndex('codeFidelite'),
  };

  logger.info('📄 [IMPORT] Index colonnes:', colIndex);

  if (colIndex.nom === -1) {
    return { error: "La colonne 'Nom' est introuvable dans le fichier" };
  }
  if (colIndex.phone === -1) {
    return { error: "La colonne 'Téléphone' est introuvable dans le fichier" };
  }

  // ✅ 9. Analyse ligne par ligne
  const toCreate = [];
  const notCreated = [];
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i];
    const lineNumber = headerRowIndex + i + 2;

    if (!rawRow || rawRow.every((c) => !c || String(c).trim() === '')) {
      continue;
    }

    const get = (field) => {
      const idx = colIndex[field];
      if (idx === -1) return '';
      const v = rawRow[idx];
      return v === undefined || v === null ? '' : String(v).trim();
    };

    try {
      const nom = get('nom');
      const phoneRaw = get('phone');
      const phone2Raw = get('phone2');
      const email = get('email');
      const adresse = get('adresse');
      const zone = get('zone');
      const codeFidelite = get('codeFidelite');

      if (!nom) {
        errors.push({ line: lineNumber, reason: 'Nom manquant', nom: '?' });
        continue;
      }

      const phone = normalizePhone(phoneRaw);
      const phone2 = normalizePhone(phone2Raw);

      // ✅ RÈGLE 1 : téléphone vide → NON CRÉÉ
      if (!phone) {
        notCreated.push({
          line: lineNumber,
          reason: 'Téléphone manquant',
          nom,
          phone: null,
          phone2: phone2 || null,
          email: email || null,
          adresse: adresse || null,
          zone: zone || null,
          codeFidelite: codeFidelite || null,
        });
        continue;
      }

      // ✅ Validation téléphone (min 6 chiffres)
      if (phone.length < 6) {
        errors.push({
          line: lineNumber,
          reason: `Téléphone invalide: "${phoneRaw}"`,
          nom,
        });
        continue;
      }

      // ✅ RÈGLE 2 : téléphone existe déjà → NON CRÉÉ
      const existing = await Client.findOne({ phone });
      if (existing) {
        notCreated.push({
          line: lineNumber,
          reason: 'Téléphone déjà existant',
          nom,
          phone,
          phone2: phone2 || null,
          email: email || null,
          adresse: adresse || null,
          zone: zone || null,
          codeFidelite: codeFidelite || null,
          existingClient: {
            nom: existing.nom,
            code: existing.code,
            codeFidelite: existing.codeFidelite || null,
          },
        });
        continue;
      }

      // ✅ SINON → À CRÉER
      const clientData = {
        nom,
        phone,
        isActive: true,
      };
      if (phone2) clientData.phone2 = phone2;
      if (email) clientData.email = email;
      if (adresse) clientData.adresse = adresse;
      if (zone) clientData.zone = zone;
      if (codeFidelite) {
        clientData.codeFidelite = codeFidelite.toUpperCase();
      }

      toCreate.push({
        line: lineNumber,
        clientData,
      });
    } catch (err) {
      logger.error(`❌ [IMPORT] Analyse ligne ${lineNumber}:`, err);
      errors.push({
        line: lineNumber,
        reason: err.message,
        nom: rawRow[colIndex.nom] || '?',
      });
    }
  }

  return {
    headers,
    headerRowIndex: headerRowIndex + 1,
    total: dataRows.length,
    toCreate,
    notCreated,
    errors,
  };
}

// ============================================================
// GET - Liste des clients avec recherche + pagination serveur
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      isActive,
      paymentStatus = 'all',
      hasReparations = 'all',
      topClients = 'all',
      limit = 20,
      page = 1,
    } = req.query;

    // limit=all → toutes les lignes (option « Tous » de la pagination)
    const showAll = String(limit) === 'all';
    const safeLimit = showAll ? 0 : Math.min(Math.max(parseInt(limit) || 20, 1), 200);
    const safePage = showAll ? 1 : Math.max(parseInt(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (search) {
      const rx = new RegExp(
        String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.$or = [
        { nom: rx },
        { phone: rx },
        { phone2: rx },
        { email: rx },
        { code: rx },
        { adresse: rx },
        { zone: rx },
        { codeFidelite: rx },
      ];
    }

    const needsAggregation =
      paymentStatus !== 'all' ||
      hasReparations !== 'all' ||
      topClients !== 'all';

    let clientIdsFilter = null;

    if (needsAggregation) {
      const statsMap = await Reparation.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$client',
            totalReparations: { $sum: 1 },
            totalPaye: { $sum: '$acompte' },
            totalRestant: {
              $sum: { $subtract: ['$prix', '$acompte'] },
            },
          },
        },
      ]);

      let filtered = statsMap.filter((s) => s._id);

      if (paymentStatus !== 'all') {
        filtered = filtered.filter((s) => {
          const restant = s.totalRestant || 0;
          const paye = s.totalPaye || 0;
          if (paymentStatus === 'paid') return restant === 0 && paye > 0;
          if (paymentStatus === 'unpaid') return restant > 0 && paye === 0;
          if (paymentStatus === 'partial') return restant > 0 && paye > 0;
          return true;
        });
      }

      if (hasReparations !== 'all') {
        filtered = filtered.filter((s) => {
          const count = s.totalReparations || 0;
          return hasReparations === 'yes' ? count > 0 : count === 0;
        });
      }

      if (topClients !== 'all') {
        const limitTop = parseInt(topClients);
        filtered = filtered
          .filter((s) => (s.totalReparations || 0) > 0)
          .sort(
            (a, b) => (b.totalReparations || 0) - (a.totalReparations || 0)
          )
          .slice(0, limitTop);
      }

      clientIdsFilter = filtered.map((s) => s._id);

      if (clientIdsFilter.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: 1, pages: 0, limit: safeLimit },
        });
      }

      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { _id: { $in: clientIdsFilter } },
        ];
        delete query.$or;
      } else {
        query._id = { $in: clientIdsFilter };
      }
    }

    const [clients, total] = await Promise.all([
      Client.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Client.countDocuments(query),
    ]);

    // ✅ Statistiques en une seule requête ; stats=0 (sélecteur du formulaire de
    //    réparation) : pas de statistiques du tout
    const clientsWithStats = String(req.query.stats) === '0' ? clients : await avecStats(clients);

    res.json({
      success: true,
      data: clientsWithStats,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: showAll ? (total ? 1 : 0) : Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    logger.error('Erreur getAll clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des clients',
    });
  }
};

// ============================================================
// ✅ GET - Clients passagers (numéro 00000000)
// ============================================================
exports.getPassengers = async (req, res) => {
  try {
    const passengers = await Client.find({
      phone: DEFAULT_PHONE,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: passengers,
      count: passengers.length,
    });
  } catch (error) {
    logger.error('Erreur getPassengers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des clients passagers',
    });
  }
};

// ============================================================
// GET - Un client par ID
// ============================================================
exports.getOne = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    const reparations = await Reparation.find({
      client: client._id,
      isDeleted: false,
    })
      .populate('status', 'label color')
      .populate('objet', 'nom')
      .populate('categorie', 'nom')
      .populate('marque', 'nom')
      .populate('modele', 'nom')
      .sort({ createdAt: -1 });

    const totalPaye = reparations.reduce((sum, r) => sum + r.acompte, 0);
    const totalRestant = reparations.reduce(
      (sum, r) => sum + (r.prix - r.acompte),
      0
    );

    res.json({
      success: true,
      data: {
        client,
        reparations,
        stats: {
          totalReparations: reparations.length,
          totalPaye,
          totalRestant,
        },
      },
    });
  } catch (error) {
    logger.error('Erreur getOne client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du client',
    });
  }
};

// ============================================================
// POST - Créer un client
// ============================================================
exports.create = async (req, res) => {
  try {
    const { nom, phone, phone2, email, adresse, zone, codeFidelite } = req.body;

    if (!nom || !nom.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Le nom est obligatoire' });
    }
    if (!phone || !phone.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Le téléphone est obligatoire' });
    }

    if (!isDefaultPhone(phone)) {
      const existing = await Client.findOne({ phone: phone.trim() });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà',
        });
      }
    }

    if (codeFidelite && codeFidelite.trim()) {
      const existingFid = await Client.findOne({
        codeFidelite: codeFidelite.trim().toUpperCase(),
      });
      if (existingFid) {
        return res.status(400).json({
          success: false,
          message: 'Ce code fidélité existe déjà',
        });
      }
    }

    const clientData = {
      nom: nom.trim(),
      phone: phone.trim(),
      adresse: adresse?.trim() || undefined,
      zone: zone?.trim() || undefined,
    };

    if (codeFidelite && codeFidelite.trim()) {
      clientData.codeFidelite = codeFidelite.trim().toUpperCase();
    }
    if (phone2 && phone2.trim() !== '') {
      clientData.phone2 = phone2.trim();
    }
    if (email && email.trim() !== '') {
      clientData.email = email.trim();
    }

    const client = new Client(clientData);
    await client.save();

    logger.info(
      `Client créé: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.status(201).json({
      success: true,
      message: 'Client créé avec succès',
      data: client,
    });
  } catch (error) {
    logger.error('Erreur create client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création du client',
    });
  }
};

// ============================================================
// PUT - Modifier un client
// ============================================================
exports.update = async (req, res) => {
  try {
    const {
      nom,
      phone,
      phone2,
      email,
      adresse,
      zone,
      codeFidelite,
      isActive,
    } = req.body;

    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    if (phone && phone !== client.phone && !isDefaultPhone(phone)) {
      const existing = await Client.findOne({
        phone,
        _id: { $ne: client._id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Un client avec ce téléphone existe déjà',
        });
      }
    }

    if (codeFidelite !== undefined && codeFidelite !== client.codeFidelite) {
      if (codeFidelite && codeFidelite.trim()) {
        const existingFid = await Client.findOne({
          codeFidelite: codeFidelite.trim().toUpperCase(),
          _id: { $ne: client._id },
        });
        if (existingFid) {
          return res.status(400).json({
            success: false,
            message: 'Ce code fidélité existe déjà',
          });
        }
      }
    }

    client.nom = nom || client.nom;
    client.phone = phone || client.phone;
    client.adresse = adresse !== undefined ? adresse : client.adresse;
    client.zone = zone !== undefined ? zone : client.zone;

    if (codeFidelite !== undefined) {
      client.codeFidelite = codeFidelite
        ? codeFidelite.trim().toUpperCase()
        : client.codeFidelite;
    }

    client.isActive = isActive !== undefined ? isActive : client.isActive;

    if (phone2 !== undefined) {
      client.phone2 = phone2 && phone2.trim() !== '' ? phone2.trim() : null;
    }
    if (email !== undefined) {
      client.email = email && email.trim() !== '' ? email.trim() : null;
    }

    await client.save();

    logger.info(
      `Client modifié: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.json({
      success: true,
      message: 'Client modifié avec succès',
      data: client,
    });
  } catch (error) {
    logger.error('Erreur update client:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la modification du client',
    });
  }
};

// ============================================================
// GET - Rechercher un client par téléphone
// ============================================================
exports.findByPhone = async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone ou le code fidélité est obligatoire',
      });
    }

    const input = String(phone).trim();
    const isFideliteSearch = /^FID-/i.test(input) || /[A-Za-z]/.test(input);

    if (isFideliteSearch) {
      const client = await Client.findOne({
        codeFidelite: { $regex: `^${input}$`, $options: 'i' },
      });

      if (client) {
        return res.json({ success: true, data: client, exists: true });
      }
      return res.json({ success: true, data: null, exists: false });
    }

    const cleanPhone = input.replace(/[^0-9]/g, '');

    if (cleanPhone === DEFAULT_PHONE) {
      const passengers = await Client.find({
        phone: DEFAULT_PHONE,
      }).sort({ createdAt: -1 });

      return res.json({
        success: true,
        data: passengers,
        exists: passengers.length > 0,
        isPassenger: true,
        count: passengers.length,
      });
    }

    if (cleanPhone.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Numéro trop court',
      });
    }

    // ✅ Recherche faite par la base (avant : tous les clients chargés en mémoire).
    //    Ordre : numéro exact, puis numéro contenant la saisie, puis numéro contenu dans la saisie.
    const notPassenger = { phone: { $ne: DEFAULT_PHONE } };
    const sousChaines = [];
    for (let len = 6; len < cleanPhone.length; len += 1) {
      for (let i = 0; i + len <= cleanPhone.length; i += 1) sousChaines.push(cleanPhone.slice(i, i + len));
    }
    const foundClient =
      (await Client.findOne({ ...notPassenger, $or: [{ phone: cleanPhone }, { phone2: cleanPhone }] })) ||
      (await Client.findOne({ ...notPassenger, $or: [{ phone: { $regex: cleanPhone } }, { phone2: { $regex: cleanPhone } }] })) ||
      (sousChaines.length
        ? await Client.findOne({ ...notPassenger, $or: [{ phone: { $in: sousChaines } }, { phone2: { $in: sousChaines } }] })
        : null);

    if (foundClient) {
      return res.json({ success: true, data: foundClient, exists: true });
    }

    res.json({ success: true, data: null, exists: false });
  } catch (error) {
    logger.error('Erreur findByPhone:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche',
    });
  }
};

// ============================================================
// ✅ DELETE - Supprimer un client (+ réparations en cascade)
// ============================================================
exports.delete = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    const reparationsCount = await Reparation.countDocuments({
      client: client._id,
      isDeleted: false,
    });

    if (reparationsCount > 0) {
      await Reparation.updateMany(
        { client: client._id, isDeleted: false },
        { $set: { isDeleted: true } }
      );

      logger.info(
        `${reparationsCount} réparation(s) supprimée(s) en cascade pour le client ${client.nom}`
      );
    }

    await client.deleteOne();

    logger.info(
      `Client supprimé: ${client.nom} (${client.code}) par ${req.user.username}`
    );

    res.json({
      success: true,
      message:
        reparationsCount > 0
          ? `Client "${client.nom}" supprimé ainsi que ${reparationsCount} réparation(s)`
          : `Client "${client.nom}" supprimé avec succès`,
      deletedReparations: reparationsCount,
    });
  } catch (error) {
    logger.error('Erreur delete client:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du client',
    });
  }
};

// ============================================================
// ✅ DELETE - Supprimer plusieurs clients (+ réparations en cascade)
// ============================================================
exports.deleteMany = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client à supprimer',
      });
    }

    const clients = await Client.find({ _id: { $in: ids } });
    const validIds = clients.map((c) => c._id);

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun client valide trouvé',
      });
    }

    const reparationsResult = await Reparation.updateMany(
      { client: { $in: validIds }, isDeleted: false },
      { $set: { isDeleted: true } }
    );

    const result = await Client.deleteMany({ _id: { $in: validIds } });

    logger.info(
      `${result.deletedCount} client(s) et ${reparationsResult.modifiedCount} réparation(s) supprimé(s) par ${req.user.username}`
    );

    res.json({
      success: true,
      message: `${result.deletedCount} client(s) supprimé(s)${
        reparationsResult.modifiedCount > 0
          ? ` avec ${reparationsResult.modifiedCount} réparation(s) en cascade`
          : ''
      }`,
      deletedCount: result.deletedCount,
      deletedReparations: reparationsResult.modifiedCount,
    });
  } catch (error) {
    logger.error('Erreur deleteMany clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression multiple',
    });
  }
};

// ============================================================
// ✅ POST - Aperçu de l'import (SANS création)
// ============================================================
exports.previewImportClients = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'Aucun fichier fourni' });
    }

    const analysis = await analyzeImportFile(req.file.buffer);

    if (analysis.error) {
      return res
        .status(400)
        .json({ success: false, message: analysis.error });
    }

    res.json({
      success: true,
      message: `Aperçu: ${analysis.toCreate.length} à créer, ${analysis.notCreated.length} non créés, ${analysis.errors.length} erreur(s)`,
      data: analysis,
    });
  } catch (error) {
    logger.error('Erreur previewImportClients:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'analyse",
      error: error.message,
    });
  }
};

// ============================================================
// ✅ POST - Confirmer et exécuter l'import
// ============================================================
exports.confirmImportClients = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: 'Aucun fichier fourni' });
    }

    const analysis = await analyzeImportFile(req.file.buffer);

    if (analysis.error) {
      return res
        .status(400)
        .json({ success: false, message: analysis.error });
    }

    const created = [];
    const errors = [...analysis.errors];

    // ✅ Créer uniquement les clients valides
    for (const item of analysis.toCreate) {
      try {
        const newClient = await Client.create(item.clientData);

        created.push({
          line: item.line,
          nom: newClient.nom,
          code: newClient.code,
          codeFidelite: newClient.codeFidelite,
          phone: newClient.phone,
          zone: newClient.zone || null,
        });
      } catch (err) {
        logger.error(`❌ [IMPORT] Erreur création ligne ${item.line}:`, err);
        errors.push({
          line: item.line,
          reason: err.message,
          nom: item.clientData?.nom || '?',
        });
      }
    }

    logger.info(
      `📥 [IMPORT] Terminé: ${created.length} créés, ${analysis.notCreated.length} non créés, ${errors.length} erreurs`
    );

    res.json({
      success: true,
      message: `Import terminé: ${created.length} créé(s), ${analysis.notCreated.length} non créé(s), ${errors.length} erreur(s)`,
      data: {
        created,
        notCreated: analysis.notCreated,
        errors,
        total: analysis.total,
      },
    });
  } catch (error) {
    logger.error('Erreur confirmImportClients:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'import",
      error: error.message,
    });
  }
};