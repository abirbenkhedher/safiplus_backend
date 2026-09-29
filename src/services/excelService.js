const ExcelJS = require('exceljs');
const logger = require('../config/logger');

/**
 * Crée un classeur Excel
 */
const createWorkbook = () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Atelier Pro';
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
};

/**
 * Ajoute un en-tête stylé
 */
const addHeader = (worksheet, headers) => {
  const headerRow = worksheet.addRow(headers);

  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D6EFD' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  headerRow.height = 25;
  return headerRow;
};

/**
 * Définit la largeur des colonnes
 */
const setColumnWidths = (worksheet, widths) => {
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
};

/**
 * Applique un style aux cellules de données
 */
const styleDataRow = (row, isAlternate = false) => {
  row.eachCell((cell) => {
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
    };

    if (isAlternate) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F9FA' },
      };
    }
  });
  row.height = 20;
};

/**
 * Ajoute un titre
 */
const addTitle = (worksheet, title, subtitle = '', columnsCount = 10) => {
  const titleRow = worksheet.addRow([title]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnsCount);
  titleRow.height = 30;

  titleRow.getCell(1).font = {
    bold: true,
    size: 16,
    color: { argb: 'FF0D6EFD' },
  };
  titleRow.getCell(1).alignment = {
    vertical: 'middle',
    horizontal: 'center',
  };

  if (subtitle) {
    const subtitleRow = worksheet.addRow([subtitle]);
    worksheet.mergeCells(
      subtitleRow.number,
      1,
      subtitleRow.number,
      columnsCount
    );
    subtitleRow.height = 20;

    subtitleRow.getCell(1).font = {
      size: 11,
      italic: true,
      color: { argb: 'FF6C757D' },
    };
    subtitleRow.getCell(1).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
  }

  worksheet.addRow([]);
};

// ============================================================
// ✅ Helper : formater les filtres pour l'affichage
// ============================================================
const formatFilters = (filters = {}) => {
  const labels = {
    search: 'Recherche',
    status: 'Statut',
    categorie: 'Catégorie',
    reparateur: 'Réparateur',
    client: 'Client',
    zone: 'Zone',
    dateDebut: 'Date début',
    dateFin: 'Date fin',
    paymentStatus: 'Paiement',
    hasReparations: 'Réparations',
    topClients: 'Classement',
  };

  const valueLabels = {
    paid: 'Entièrement payés',
    unpaid: 'Aucun paiement',
    partial: 'Partiellement payés',
    yes: 'Avec réparations',
    no: 'Sans réparation',
    all: '',
  };

  const parts = Object.entries(filters)
    .filter(([_, v]) => v && v !== 'all' && String(v).trim() !== '')
    .map(([k, v]) => {
      const label = labels[k] || k;
      const val = valueLabels[v] || v;
      return `${label}: ${val}`;
    });

  return parts.length > 0 ? parts.join(' | ') : null;
};

// ============================================
// EXPORT RÉPARATIONS
// ============================================
const exportReparations = async (reparations, filters = {}) => {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet('Réparations');

  // Définir les colonnes
  const headers = [
    'N°', 'Date création', 'Client', 'Code client', 'Téléphone',
    'Zone', 'Catégorie', 'Objet', 'Marque', 'Modèle',
    'Problème', 'Statut', 'Prix (DT)', 'Acompte (DT)', 'Reste (DT)',
    'Réparateur', 'Créé par', 'Date modification', 'Observation',
  ];

  const widths = [
    15, 18, 20, 12, 15,
    15, 15, 15, 15, 15,
    30, 15, 12, 12, 12,
    20, 20, 18, 30,
  ];

  // Titre
  addTitle(
    worksheet,
    '📋 LISTE DES RÉPARATIONS',
    `Exporté le ${new Date().toLocaleString('fr-FR')} | Total: ${
      reparations.length
    } réparation(s)`,
    headers.length
  );

  // En-têtes
  addHeader(worksheet, headers);
  setColumnWidths(worksheet, widths);

  // Couleurs des statuts
  const statusColors = {
    'En attente': 'FFFFC107',
    Diagnostic: 'FF17A2B8',
    'En réparation': 'FF0D6EFD',
    'En cours': 'FF0D6EFD',
    Réparé: 'FF198754',
    Livré: 'FF28A745',
    'Non réparable': 'FFDC3545',
    'Non réparé': 'FFDC3545',
    Annulé: 'FF6C757D',
    Prêt: 'FF20C997',
    Devis: 'FF6F42C1',
    'Attente validation': 'FFFD7E14',
    SAV: 'FF8B5CF6',
  };

  let totalPrix = 0;
  let totalAcompte = 0;
  let totalReste = 0;

  // Ajouter les données
  reparations.forEach((rep, index) => {
    const prix = rep.prix || 0;
    const acompte = rep.acompte || 0;
    const reste = prix - acompte;

    totalPrix += prix;
    totalAcompte += acompte;
    totalReste += reste;

    // ✅ Extraire les noms (au cas où ce sont des objets populate)
    const marqueNom =
      typeof rep.marque === 'object' && rep.marque !== null
        ? rep.marque.nom
        : rep.marque || 'N/A';
    const modeleNom =
      typeof rep.modele === 'object' && rep.modele !== null
        ? rep.modele.nom
        : rep.modele || '-';

    // ✅ Pannes : gérer tableau OU string
    const pannesTexte = Array.isArray(rep.panneType)
      ? rep.panneType.join(', ')
      : rep.panneType || 'N/A';

    const rowData = [
      rep.numero || 'N/A',
      rep.createdAt
        ? new Date(rep.createdAt).toLocaleDateString('fr-FR')
        : 'N/A',
      rep.client?.nom || 'N/A',
      rep.client?.code || 'N/A',
      rep.client?.phone || 'N/A',
      rep.client?.zone || '-',                  // ✅ NOUVEAU : Zone
      rep.categorie?.nom || 'N/A',
      rep.objet?.nom || 'N/A',
      marqueNom,
      modeleNom,
      pannesTexte,                              // ✅ Pannes multi
      rep.status?.label || 'N/A',
      prix,
      acompte,
      reste,
      rep.reparateur
        ? `${rep.reparateur.firstName} ${rep.reparateur.lastName}`
        : 'Non assigné',
      rep.createdBy
        ? `${rep.createdBy.firstName} ${rep.createdBy.lastName}`
        : 'N/A',
      rep.updatedAt
        ? new Date(rep.updatedAt).toLocaleDateString('fr-FR')
        : 'N/A',
      rep.observation || '-',
    ];

    const row = worksheet.addRow(rowData);
    styleDataRow(row, index % 2 === 1);

    // Colorer la colonne Statut (colonne 12 maintenant)
    const statusCell = row.getCell(12);
    if (rep.status?.label && statusColors[rep.status.label]) {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: statusColors[rep.status.label] },
      };
      statusCell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      statusCell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
    }

    // Formater les montants (colonnes 13, 14, 15)
    [13, 14, 15].forEach((colIndex) => {
      const cell = row.getCell(colIndex);
      cell.numFmt = '#,##0.00" DT"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  });

  // Ligne de totaux
  if (reparations.length > 0) {
    const totalRowData = new Array(headers.length).fill('');
    totalRowData[11] = 'TOTAUX';
    totalRowData[12] = totalPrix;
    totalRowData[13] = totalAcompte;
    totalRowData[14] = totalReste;

    const totalRow = worksheet.addRow(totalRowData);

    totalRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7F1FF' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0D6EFD' } },
        bottom: { style: 'medium', color: { argb: 'FF0D6EFD' } },
        left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
      };
    });

    totalRow.getCell(12).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };

    [13, 14, 15].forEach((colIndex) => {
      const cell = totalRow.getCell(colIndex);
      cell.numFmt = '#,##0.00" DT"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  // ✅ Filtres appliqués (avec formatFilters)
  const activeFilters = formatFilters(filters);

  if (activeFilters) {
    worksheet.addRow([]);
    const filterRow = worksheet.addRow([`Filtres appliqués: ${activeFilters}`]);
    worksheet.mergeCells(filterRow.number, 1, filterRow.number, headers.length);
    filterRow.getCell(1).font = {
      italic: true,
      size: 9,
      color: { argb: 'FF6C757D' },
    };
  }

  // Figer les en-têtes (lignes 1-4)
  worksheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook;
};

// ============================================
// EXPORT CLIENTS
// ============================================
const exportClients = async (clients, filters = {}) => {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet('Clients');

  const headers = [
    'Code', 'Code fidélité', 'Nom', 'Téléphone', 'Téléphone 2',
    'Email', 'Adresse', 'Zone', 'Statut',
    'Nb réparations', 'Total payé (DT)', 'Total restant (DT)', 'Date inscription',
  ];

  const widths = [
    12, 15, 25, 15, 15,
    25, 30, 15, 12,
    15, 15, 15, 18,
  ];

  addTitle(
    worksheet,
    '👥 LISTE DES CLIENTS',
    `Exporté le ${new Date().toLocaleString('fr-FR')} | Total: ${
      clients.length
    } client(s)`,
    headers.length
  );

  addHeader(worksheet, headers);
  setColumnWidths(worksheet, widths);

  let totalPaye = 0;
  let totalRestant = 0;

  clients.forEach((client, index) => {
    const rowData = [
      client.code || 'N/A',
      client.codeFidelite || '-',              // ✅ NOUVEAU : Code fidélité
      client.nom || 'N/A',
      client.phone || 'N/A',
      client.phone2 || '-',                    // ✅ NOUVEAU : Téléphone 2
      client.email || '-',
      client.adresse || '-',
      client.zone || '-',                      // ✅ NOUVEAU : Zone
      client.isActive ? 'Actif' : 'Inactif',
      client.totalReparations || 0,
      client.totalPaye || 0,
      client.totalRestant || 0,
      client.createdAt
        ? new Date(client.createdAt).toLocaleDateString('fr-FR')
        : 'N/A',
    ];

    const row = worksheet.addRow(rowData);
    styleDataRow(row, index % 2 === 1);

    // Statut (colonne 9)
    const statusCell = row.getCell(9);
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: client.isActive ? 'FF198754' : 'FF6C757D' },
    };
    statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Montants (colonnes 11 et 12)
    [11, 12].forEach((colIndex) => {
      const cell = row.getCell(colIndex);
      cell.numFmt = '#,##0.00" DT"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });

    totalPaye += client.totalPaye || 0;
    totalRestant += client.totalRestant || 0;
  });

  // Totaux
  if (clients.length > 0) {
    const totalRowData = new Array(headers.length).fill('');
    totalRowData[2] = 'TOTAUX';
    totalRowData[9] = clients.length;
    totalRowData[10] = totalPaye;
    totalRowData[11] = totalRestant;

    const totalRow = worksheet.addRow(totalRowData);

    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7F1FF' },
      };
    });

    [11, 12].forEach((colIndex) => {
      const cell = totalRow.getCell(colIndex);
      cell.numFmt = '#,##0.00" DT"';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  // ✅ Filtres appliqués
  const activeFilters = formatFilters(filters);

  if (activeFilters) {
    worksheet.addRow([]);
    const filterRow = worksheet.addRow([`Filtres appliqués: ${activeFilters}`]);
    worksheet.mergeCells(filterRow.number, 1, filterRow.number, headers.length);
    filterRow.getCell(1).font = {
      italic: true,
      size: 9,
      color: { argb: 'FF6C757D' },
    };
  }

  worksheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook;
};

// ============================================
// EXPORT UTILISATEURS
// ============================================
const exportUsers = async (users) => {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet('Utilisateurs');

  const headers = [
    '#', 'Nom complet', "Nom d'utilisateur", 'Email', 'Rôle',
    'Statut', 'Nb réparations', 'Dernière connexion', 'Date création',
  ];

  const widths = [8, 25, 18, 30, 18, 12, 15, 22, 18];

  addTitle(
    worksheet,
    '👤 LISTE DES UTILISATEURS',
    `Exporté le ${new Date().toLocaleString('fr-FR')} | Total: ${
      users.length
    } utilisateur(s)`,
    headers.length
  );

  addHeader(worksheet, headers);
  setColumnWidths(worksheet, widths);

  const roleLabels = {
    ADMIN: '👑 Administrateur',
    COMMERCIAL: '💼 Commercial',
    REPARATEUR: '🔧 Réparateur',
  };

  const roleColors = {
    ADMIN: 'FFDC3545',
    COMMERCIAL: 'FF0D6EFD',
    REPARATEUR: 'FFFFC107',
  };

  users.forEach((user, index) => {
    const rowData = [
      index + 1,
      `${user.firstName} ${user.lastName}`,
      user.username,
      user.email,
      roleLabels[user.role] || user.role,
      user.isActive ? 'Actif' : 'Inactif',
      user.reparationsCount || 0,
      user.lastLogin
        ? new Date(user.lastLogin).toLocaleString('fr-FR')
        : 'Jamais connecté',
      user.createdAt
        ? new Date(user.createdAt).toLocaleDateString('fr-FR')
        : 'N/A',
    ];

    const row = worksheet.addRow(rowData);
    styleDataRow(row, index % 2 === 1);

    // Rôle (colonne 5)
    const roleCell = row.getCell(5);
    if (roleColors[user.role]) {
      roleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: roleColors[user.role] },
      };
      roleCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      roleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Statut (colonne 6)
    const statusCell = row.getCell(6);
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: user.isActive ? 'FF198754' : 'FF6C757D' },
    };
    statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  worksheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook;
};

// ============================================
// EXPORT HISTORIQUE
// ============================================
const exportHistory = async (history) => {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet('Historique');

  const headers = ['Date', 'Utilisateur', 'Type', 'Action', 'Détails'];
  const widths = [20, 25, 15, 18, 60];

  addTitle(
    worksheet,
    '📜 HISTORIQUE DES ACTIONS',
    `Exporté le ${new Date().toLocaleString('fr-FR')} | Total: ${
      history.length
    } action(s)`,
    headers.length
  );

  addHeader(worksheet, headers);
  setColumnWidths(worksheet, widths);

  const actionLabels = {
    CREATE: 'Création',
    UPDATE: 'Modification',
    DELETE: 'Suppression',
    STATUS_CHANGE: 'Changement statut',
    ASSIGN: 'Assignation',
    PAYMENT: 'Paiement',
  };

  history.forEach((item, index) => {
    let details = '';

    if (item.action === 'STATUS_CHANGE') {
      details = `${item.oldStatus?.label || 'N/A'} → ${
        item.newStatus?.label || 'N/A'
      }`;
    } else if (item.action === 'UPDATE' && item.changes) {
      details = Object.entries(item.changes)
        .map(([key, val]) => `${key}: ${val.old} → ${val.new}`)
        .join(' | ');
    } else if (item.action === 'CREATE') {
      details = `Création de ${item.entityType}`;
    } else if (item.action === 'DELETE') {
      details = `Suppression de ${item.entityType}`;
    } else if (item.action === 'ASSIGN') {
      details = 'Assignation du réparateur';
    }

    if (item.comment) {
      details += ` | ${item.comment}`;
    }

    const rowData = [
      new Date(item.createdAt).toLocaleString('fr-FR'),
      item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Système',
      item.entityType,
      actionLabels[item.action] || item.action,
      details || '-',
    ];

    const row = worksheet.addRow(rowData);
    styleDataRow(row, index % 2 === 1);
  });

  worksheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook;
};

/**
 * Envoie le classeur en réponse HTTP
 */
const sendWorkbook = async (res, workbook, filename) => {
  try {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Erreur envoi Excel:', error);
    throw error;
  }
};

module.exports = {
  exportReparations,
  exportClients,
  exportUsers,
  exportHistory,
  sendWorkbook,
};