const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const QRCode = require('qrcode');

// Configuration du ticket
const TICKET_CONFIG = {
  width: 226, // 80mm par défaut
  margins: {
    top: 10,
    bottom: 10,
    left: 10,
    right: 10
  },
  fontSizes: {
    small: 7,
    normal: 8,
    medium: 10,
    large: 12,
    title: 14
  }
};

/**
 * Formate un texte pour qu'il tienne dans une largeur donnée
 */
const formatLine = (left, right, width = 48) => {
  const leftStr = String(left || '');
  const rightStr = String(right || '');
  const spaces = width - leftStr.length - rightStr.length;
  if (spaces < 1) {
    return leftStr.substring(0, width - rightStr.length - 1) + ' ' + rightStr;
  }
  return leftStr + ' '.repeat(spaces) + rightStr;
};

/**
 * Centre un texte
 */
const centerText = (text, width = 48) => {
  const str = String(text || '');
  if (str.length >= width) return str.substring(0, width);
  const padding = Math.floor((width - str.length) / 2);
  return ' '.repeat(padding) + str;
};

/**
 * Coupe un texte en lignes de largeur donnée
 */
const wrapText = (text, width) => {
  if (!text) return [''];
  const words = String(text).split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + word).length <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word.length > width ? word.substring(0, width) : word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [''];
};

/**
 * ✅ Helper : extrait le nom d'un champ populé (objet ou string)
 */
const getNom = (field) => {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field.nom) return field.nom;
  return null;
};

/**
 * Génère le contenu du ticket pour une réparation
 */
const generateTicketContent = (reparation, options = {}) => {
  const {
    boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO',
    boutiqueAddress = process.env.BOUTIQUE_ADDRESS || 'Adresse non configurée',
    boutiquePhone = process.env.BOUTIQUE_PHONE || 'Tél: XX XXX XXX',
    boutiqueEmail = process.env.BOUTIQUE_EMAIL || '',
    width = 48,
    footerMessage = 'Merci de votre confiance!'
  } = options;

  const lines = [];

  // En-tête
  lines.push({ text: centerText(boutiqueName, width), size: 'large', bold: true });
  lines.push({ text: centerText(boutiqueAddress, width), size: 'small' });
  lines.push({ text: centerText(boutiquePhone, width), size: 'small' });
  if (boutiqueEmail) {
    lines.push({ text: centerText(boutiqueEmail, width), size: 'small' });
  }
  lines.push({ text: '='.repeat(width), size: 'small' });

  // Titre
  lines.push({ text: centerText('REÇU DE RÉPARATION', width), size: 'medium', bold: true });
  lines.push({ text: '='.repeat(width), size: 'small' });

  // Informations du reçu
  lines.push({ text: formatLine('N° Reçu:', reparation.numero, width), size: 'normal', bold: true });
  lines.push({ text: formatLine('Date:', new Date(reparation.createdAt).toLocaleString('fr-FR'), width), size: 'small' });

  // Séparateur
  lines.push({ text: '-'.repeat(width), size: 'small' });

  // Client
  lines.push({ text: 'CLIENT', size: 'normal', bold: true });
  if (reparation.client) {
    lines.push({ text: formatLine('Nom:', reparation.client.nom, width), size: 'small' });
    lines.push({ text: formatLine('Code:', reparation.client.code, width), size: 'small' });
    lines.push({ text: formatLine('Tél:', reparation.client.phone, width), size: 'small' });
    if (reparation.client.phone2) {
      lines.push({ text: formatLine('Tél 2:', reparation.client.phone2, width), size: 'small' });
    }
    if (reparation.client.email) {
      lines.push({ text: formatLine('Email:', reparation.client.email, width), size: 'small' });
    }
    if (reparation.client.adresse) {
      lines.push({ text: formatLine('Adresse:', reparation.client.adresse, width), size: 'small' });
    }
  }

  // Séparateur
  lines.push({ text: '-'.repeat(width), size: 'small' });

  // Appareil
  lines.push({ text: 'APPAREIL', size: 'normal', bold: true });
  if (reparation.objet) {
    lines.push({ text: formatLine('Type:', reparation.objet.nom, width), size: 'small' });
  }
  if (reparation.categorie) {
    lines.push({ text: formatLine('Catégorie:', reparation.categorie.nom, width), size: 'small' });
  }

  // ✅ Marque : extraction du nom
  const marqueNom = getNom(reparation.marque);
  lines.push({
    text: formatLine('Marque:', marqueNom || 'N/A', width),
    size: 'small'
  });

  // ✅ Modèle : extraction du nom
  const modeleNom = getNom(reparation.modele);
  if (modeleNom) {
    lines.push({ text: formatLine('Modèle:', modeleNom, width), size: 'small' });
  }

  if (reparation.accessoires) {
    lines.push({ text: formatLine('Accessoires:', reparation.accessoires, width), size: 'small' });
  }

  // Séparateur
  lines.push({ text: '-'.repeat(width), size: 'small' });

  // TYPE DE PANNE
  lines.push({ text: 'TYPE DE PANNE', size: 'normal', bold: true });
  const panneLines = wrapText(reparation.panneType, width);
  panneLines.forEach(line => {
    lines.push({ text: line, size: 'small' });
  });

  // Séparateur
  lines.push({ text: '-'.repeat(width), size: 'small' });

  // Finances
  lines.push({ text: 'FINANCES', size: 'normal', bold: true });
  lines.push({ text: formatLine('Prix total:', `${(reparation.prix || 0).toFixed(2)} DT`, width), size: 'small' });
  lines.push({ text: formatLine('Acompte:', `${(reparation.acompte || 0).toFixed(2)} DT`, width), size: 'small' });
  lines.push({ text: formatLine('Reste à payer:', `${((reparation.prix || 0) - (reparation.acompte || 0)).toFixed(2)} DT`, width), size: 'normal', bold: true });

  // Séparateur
  lines.push({ text: '-'.repeat(width), size: 'small' });

  // Statut
  lines.push({ text: 'STATUT', size: 'normal', bold: true });
  if (reparation.status) {
    lines.push({ text: centerText(reparation.status.label.toUpperCase(), width), size: 'medium', bold: true });
  }

  // Observation
  if (reparation.observation) {
    lines.push({ text: '-'.repeat(width), size: 'small' });
    lines.push({ text: 'OBSERVATION', size: 'normal', bold: true });
    const obsLines = wrapText(reparation.observation, width);
    obsLines.forEach(line => {
      lines.push({ text: line, size: 'small' });
    });
  }

  // Séparateur
  lines.push({ text: '='.repeat(width), size: 'small' });

  // Signatures
  lines.push({ text: formatLine('Signature client:', 'Signature commercial:', width), size: 'small' });
  lines.push({ text: '', size: 'small' });
  lines.push({ text: '', size: 'small' });
  lines.push({ text: '', size: 'small' });
  lines.push({ text: '_'.repeat(20) + '  ' + '_'.repeat(20), size: 'small' });

  // Séparateur
  lines.push({ text: '='.repeat(width), size: 'small' });

  // Pied de page
  lines.push({ text: centerText(footerMessage, width), size: 'small' });
  lines.push({ text: centerText('Conservez ce reçu', width), size: 'small' });
  lines.push({ text: centerText(`Imprimé le ${new Date().toLocaleString('fr-FR')}`, width), size: 'small' });

  return lines;
};

/**
 * Génère un PDF au format ticket thermique
 */
const generateTicketPDF = (reparation, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [TICKET_CONFIG.width, 1000],
        margins: TICKET_CONFIG.margins,
        autoFirstPage: true
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      const content = generateTicketContent(reparation, options);

      content.forEach(item => {
        const fontSize = TICKET_CONFIG.fontSizes[item.size] || TICKET_CONFIG.fontSizes.normal;
        doc.fontSize(fontSize);

        if (item.bold) {
          doc.font('Helvetica-Bold');
        } else {
          doc.font('Helvetica');
        }

        doc.text(item.text || '', {
          align: 'left',
          lineGap: 0
        });
      });

      doc.end();
    } catch (error) {
      logger.error('Erreur génération PDF:', error);
      reject(error);
    }
  });
};

/**
 * Génère le contenu HTML pour impression navigateur (format ticket)
 * ✅ Le QR code contient la MÊME URL que la page détails
 */
const generateTicketHTML = async (reparation, options = {}) => {
  const {
    boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO',
    boutiqueAddress = process.env.BOUTIQUE_ADDRESS || 'Adresse non configurée',
    boutiquePhone = process.env.BOUTIQUE_PHONE || 'Tél: XX XXX XXX',
    boutiqueEmail = process.env.BOUTIQUE_EMAIL || '',
    footerMessage = 'Merci de votre confiance!'
  } = options;

  const reparationData = reparation.toObject ? reparation.toObject() : reparation;

  // ============================================================
  // ✅ QR CODE : EXACTEMENT la même URL que la page détails
  // ============================================================
  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:5173';

  const qrData = `${frontendUrl}/suivi/${reparationData.numero}`;

  console.log('🎫 QR Code ticket généré:', qrData);

  // ✅ Générer le QR code en base64
  let qrCodeDataUrl = '';
  try {
    qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Erreur génération QR:', err);
  }

  // ✅ Extraction des noms de marque et modèle
  const marqueNom = getNom(reparationData.marque) || 'N/A';
  const modeleNom = getNom(reparationData.modele);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reçu ${reparationData.numero}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.2;
      width: 80mm;
      padding: 5mm 2mm;
      background: white;
      color: black;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 14px; }
    .medium { font-size: 12px; }
    .small { font-size: 10px; }
    .separator { 
      border-top: 1px dashed #000; 
      margin: 4px 0;
    }
    .double-separator { 
      border-top: 2px solid #000; 
      margin: 4px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .section-title {
      font-weight: bold;
      margin: 6px 0 3px;
      text-transform: uppercase;
    }
    .signature {
      margin-top: 15px;
      display: flex;
      justify-content: space-between;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 35mm;
      padding-top: 2px;
      font-size: 9px;
      text-align: center;
    }
    .status-box {
      border: 2px solid #000;
      padding: 3px;
      text-align: center;
      font-weight: bold;
      margin: 5px 0;
    }
    @media print {
      body { 
        width: 80mm;
        margin: 0;
      }
      .no-print { display: none; }
    }

    .qr-code {
      text-align: center;
      margin: 8px 0;
      padding: 4px;
    }
    .qr-code img {
      width: 100px;
      height: 100px;
    }
    .qr-code-url {
      font-size: 7px;
      color: #666;
      margin-top: 2px;
      word-break: break-all;
      line-height: 1.1;
    }

  </style>
</head>
<body>
  <!-- En-tête -->
  <div class="center large bold">${boutiqueName}</div>
  <div class="center small">${boutiqueAddress}</div>
  <div class="center small">${boutiquePhone}</div>
  ${boutiqueEmail ? `<div class="center small">${boutiqueEmail}</div>` : ''}
  <div class="double-separator"></div>
  <div class="center medium bold">REÇU DE RÉPARATION</div>
  <div class="double-separator"></div>

  <!-- Infos reçu -->
  <div class="row">
    <span class="bold">N° Reçu:</span>
    <span class="bold">${reparationData.numero || 'N/A'}</span>
  </div>
  <div class="row small">
    <span>Date:</span>
    <span>${new Date(reparationData.createdAt).toLocaleString('fr-FR')}</span>
  </div>
  <div class="separator"></div>

  <!-- Client -->
  <div class="section-title">Client</div>
  <div class="row small"><span>Nom:</span><span>${reparationData.client?.nom || 'N/A'}</span></div>
  <div class="row small"><span>Code:</span><span>${reparationData.client?.code || 'N/A'}</span></div>
  <div class="row small"><span>Tél:</span><span>${reparationData.client?.phone || 'N/A'}</span></div>
  ${reparationData.client?.phone2 ? `<div class="row small"><span>Tél 2:</span><span>${reparationData.client.phone2}</span></div>` : ''}
  ${reparationData.client?.email ? `<div class="row small"><span>Email:</span><span>${reparationData.client.email}</span></div>` : ''}
  ${reparationData.client?.adresse ? `<div class="row small"><span>Adresse:</span><span>${reparationData.client.adresse}</span></div>` : ''}
  <div class="separator"></div>

  <!-- Appareil -->
  <div class="section-title">Appareil</div>
  ${reparationData.objet ? `<div class="row small"><span>Type:</span><span>${reparationData.objet.nom}</span></div>` : ''}
  ${reparationData.categorie ? `<div class="row small"><span>Catégorie:</span><span>${reparationData.categorie.nom}</span></div>` : ''}
  <div class="row small"><span>Marque:</span><span>${marqueNom}</span></div>
  ${modeleNom ? `<div class="row small"><span>Modèle:</span><span>${modeleNom}</span></div>` : ''}
  ${reparationData.accessoires ? `<div class="row small"><span>Accessoires:</span><span>${reparationData.accessoires}</span></div>` : ''}
  <div class="separator"></div>

  <!-- TYPE DE PANNE -->
  <div class="section-title">Type de panne</div>
  <div class="small">${reparationData.panneType || 'N/A'}</div>
  <div class="separator"></div>

  <!-- Finances -->
  <div class="section-title">Finances</div>
  <div class="row small"><span>Prix total:</span><span>${(reparationData.prix || 0).toFixed(2)} DT</span></div>
  <div class="row small"><span>Acompte:</span><span>${(reparationData.acompte || 0).toFixed(2)} DT</span></div>
  <div class="row bold"><span>Reste à payer:</span><span>${((reparationData.prix || 0) - (reparationData.acompte || 0)).toFixed(2)} DT</span></div>
  <div class="separator"></div>

  <!-- Statut -->
  <div class="section-title">Statut</div>
  <div class="status-box">${reparationData.status?.label?.toUpperCase() || 'N/A'}</div>

  <!-- Observation -->
  ${reparationData.observation ? `
  <div class="separator"></div>
  <div class="section-title">Observation</div>
  <div class="small">${reparationData.observation}</div>
  ` : ''}

  <!-- ✅ QR CODE identique à la page détails -->
  ${qrCodeDataUrl ? `
  <div class="separator"></div>
  <div class="qr-code">
    <img src="${qrCodeDataUrl}" alt="QR Code" />
    <div class="small">📱 Scannez pour suivre votre réparation</div>
    <div class="qr-code-url">${qrData}</div>
  </div>
  ` : ''}

  <div class="double-separator"></div>

  <!-- Signatures -->
  <div class="signature">
    <div class="signature-line">Signature client</div>
    <div class="signature-line">Signature commercial</div>
  </div>

  <div class="double-separator"></div>

  <!-- Pied de page -->
  <div class="center small">${footerMessage}</div>
  <div class="center small">Conservez ce reçu</div>
  <div class="center small">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
</body>
</html>
  `;

  return html;
};

module.exports = {
  generateTicketPDF,
  generateTicketHTML,
  generateTicketContent,
  TICKET_CONFIG
};