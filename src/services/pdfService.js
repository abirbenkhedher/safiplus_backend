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
    right: 10,
  },
  fontSizes: {
    small: 7,
    normal: 8,
    medium: 10,
    large: 12,
    title: 14,
  },
};

const formatLine = (left, right, width = 48) => {
  const leftStr = String(left || '');
  const rightStr = String(right || '');
  const spaces = width - leftStr.length - rightStr.length;
  if (spaces < 1) {
    return leftStr.substring(0, width - rightStr.length - 1) + ' ' + rightStr;
  }
  return leftStr + ' '.repeat(spaces) + rightStr;
};

const centerText = (text, width = 48) => {
  const str = String(text || '');
  if (str.length >= width) return str.substring(0, width);
  const padding = Math.floor((width - str.length) / 2);
  return ' '.repeat(padding) + str;
};

const wrapText = (text, width) => {
  if (!text) return [''];
  const words = String(text).split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
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

const getNom = (field) => {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field.nom) return field.nom;
  return null;
};

const formatPannes = (pannes) => {
  if (!pannes) return 'N/A';
  if (typeof pannes === 'string') return pannes;
  if (Array.isArray(pannes) && pannes.length > 0) {
    return pannes.filter(Boolean).join(', ');
  }
  return 'N/A';
};

// ============================================================
// ✅ Helper : lire le logo en base64
// ============================================================
const getLogoDataUrl = () => {
  try {
    const possiblePaths = [
      path.join(__dirname, '..', 'assets', 'logo.png'),
      path.join(__dirname, '..', '..', 'assets', 'logo.png'),
      path.join(__dirname, '..', 'public', 'logo.png'),
    ];

    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const base64 = logoBuffer.toString('base64');
        const ext = path.extname(logoPath).slice(1).toLowerCase();
        const mimeType =
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        return `data:${mimeType};base64,${base64}`;
      }
    }

    console.warn('⚠️ Logo introuvable dans les chemins :', possiblePaths);
    return null;
  } catch (err) {
    console.error('Erreur lecture logo:', err);
    return null;
  }
};

const generateTicketContent = (reparation, options = {}) => {
  const {
    boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO',
    boutiqueAddress = process.env.BOUTIQUE_ADDRESS || 'Adresse non configurée',
    boutiquePhone = process.env.BOUTIQUE_PHONE || 'Tél: XX XXX XXX',
    boutiqueEmail = process.env.BOUTIQUE_EMAIL || '',
    width = 48,
    footerMessage = 'Merci de votre confiance!',
  } = options;

  const lines = [];

  lines.push({
    text: centerText(boutiqueName, width),
    size: 'large',
    bold: true,
  });
  lines.push({
    text: centerText(boutiqueAddress, width),
    size: 'small',
  });
  lines.push({
    text: centerText(boutiquePhone, width),
    size: 'small',
  });
  if (boutiqueEmail) {
    lines.push({
      text: centerText(boutiqueEmail, width),
      size: 'small',
    });
  }
  lines.push({ text: '='.repeat(width), size: 'small' });

  lines.push({
    text: centerText('REÇU DE RÉPARATION', width),
    size: 'medium',
    bold: true,
  });
  lines.push({ text: '='.repeat(width), size: 'small' });

  lines.push({
    text: formatLine('N° Reçu:', reparation.numero, width),
    size: 'normal',
    bold: true,
  });
  lines.push({
    text: formatLine(
      'Date:',
      new Date(reparation.createdAt).toLocaleString('fr-FR'),
      width
    ),
    size: 'small',
  });

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'CLIENT', size: 'normal', bold: true });
  if (reparation.client) {
    lines.push({
      text: formatLine('Nom:', reparation.client.nom, width),
      size: 'small',
    });
    lines.push({
      text: formatLine('Code:', reparation.client.code, width),
      size: 'small',
    });
    lines.push({
      text: formatLine('Tél:', reparation.client.phone, width),
      size: 'small',
    });
    if (reparation.client.phone2) {
      lines.push({
        text: formatLine('Tél 2:', reparation.client.phone2, width),
        size: 'small',
      });
    }
    if (reparation.client.adresse) {
      lines.push({
        text: formatLine('Adresse:', reparation.client.adresse, width),
        size: 'small',
      });
    }
  }

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'APPAREIL', size: 'normal', bold: true });
  if (reparation.objet) {
    lines.push({
      text: formatLine('Type:', reparation.objet.nom, width),
      size: 'small',
    });
  }
  if (reparation.categorie) {
    lines.push({
      text: formatLine('Catégorie:', reparation.categorie.nom, width),
      size: 'small',
    });
  }

  const marqueNom = getNom(reparation.marque);
  lines.push({
    text: formatLine('Marque:', marqueNom || 'N/A', width),
    size: 'small',
  });

  const modeleNom = getNom(reparation.modele);
  if (modeleNom) {
    lines.push({
      text: formatLine('Modèle:', modeleNom, width),
      size: 'small',
    });
  }

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'TYPE DE PANNE', size: 'normal', bold: true });
  const panneText = formatPannes(reparation.panneType);
  const panneLines = wrapText(panneText, width);
  panneLines.forEach((line) => {
    lines.push({ text: line, size: 'small' });
  });

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'FINANCES', size: 'normal', bold: true });
  lines.push({
    text: formatLine(
      'Prix total:',
      `${(reparation.prix || 0).toFixed(2)} DT`,
      width
    ),
    size: 'small',
  });
  lines.push({
    text: formatLine(
      'Acompte:',
      `${(reparation.acompte || 0).toFixed(2)} DT`,
      width
    ),
    size: 'small',
  });
  lines.push({
    text: formatLine(
      'Reste à payer:',
      `${((reparation.prix || 0) - (reparation.acompte || 0)).toFixed(2)} DT`,
      width
    ),
    size: 'normal',
    bold: true,
  });

  return lines;
};

const generateTicketPDF = (reparation, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [TICKET_CONFIG.width, 1000],
        margins: TICKET_CONFIG.margins,
        autoFirstPage: true,
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      const content = generateTicketContent(reparation, options);

      content.forEach((item) => {
        const fontSize =
          TICKET_CONFIG.fontSizes[item.size] || TICKET_CONFIG.fontSizes.normal;
        doc.fontSize(fontSize);

        if (item.bold) {
          doc.font('Helvetica-Bold');
        } else {
          doc.font('Helvetica');
        }

        doc.text(item.text || '', {
          align: 'left',
          lineGap: 0,
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
 * ✅ Génère le HTML du ticket
 * Police plus grande et espacement amélioré pour une meilleure lisibilité
 */
const generateTicketHTML = async (reparation, options = {}) => {
  const {
    boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO',
    boutiqueAddress = process.env.BOUTIQUE_ADDRESS || 'Adresse non configurée',
    boutiquePhone = process.env.BOUTIQUE_PHONE || 'Tél: XX XXX XXX',
    boutiqueEmail = process.env.BOUTIQUE_EMAIL || '',
    footerMessage = 'Merci de votre confiance!',
    offsetTop = 4,
    offsetLeft = 0,
    offsetRight = 0,
    ticketWidth = 74,
    paperWidth = 80,
    fontSize = 12,           // ✅ Police plus grande par défaut (12 au lieu de 10)
  } = options;

  const reparationData = reparation.toObject
    ? reparation.toObject()
    : reparation;

  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:5173';

  const qrData = `${frontendUrl}/suivi/${reparationData.numero}`;

  let qrCodeDataUrl = '';
  try {
    qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 220,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Erreur génération QR:', err);
  }

  const logoDataUrl = getLogoDataUrl();
  const marqueNom = getNom(reparationData.marque) || 'N/A';
  const modeleNom = getNom(reparationData.modele);
  const pannesTexte = formatPannes(reparationData.panneType);

  const createurNom = reparationData.createdBy
    ? `${reparationData.createdBy.firstName || ''} ${
        reparationData.createdBy.lastName || ''
      }`.trim() ||
      reparationData.createdBy.username ||
      'N/A'
    : 'N/A';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reçu ${reparationData.numero}</title>
  <style>
    @page {
      size: ${paperWidth}mm auto;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      width: ${paperWidth}mm;
      background: white;
      color: black;
    }

    /* ✅ WRAPPER CENTRÉ */
    .ticket-wrapper {
      width: ${ticketWidth}mm;
      margin: 0 auto;
      padding-top: ${offsetTop}mm;
      padding-left: ${offsetLeft}mm;
      padding-right: ${offsetRight}mm;
      padding-bottom: 4mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize}px;
      line-height: 1.35;                 /* ✅ Espacement augmenté */
      box-sizing: border-box;
      font-weight: 500;                  /* ✅ Texte légèrement plus épais */
    }

    .center { text-align: center; }
    .bold { font-weight: 700; }
    .large { font-size: ${fontSize + 4}px; }    /* ✅ Plus grand */
    .medium { font-size: ${fontSize + 2}px; }   /* ✅ Plus grand */
    .small { font-size: ${fontSize - 1}px; }
    .xsmall { font-size: ${fontSize - 2}px; }
    .tiny { font-size: ${fontSize - 3}px; }

    .separator {
      border-top: 1px dashed #000;
      margin: 6px 0;                    /* ✅ Plus d'espace */
    }

    .double-separator {
      border-top: 2px solid #000;
      margin: 6px 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;                    /* ✅ Plus d'espace vertical */
      gap: 6px;
      align-items: baseline;
    }

    .row span:first-child {
      flex-shrink: 0;
      color: #333;
    }

    .row span:last-child {
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;                 /* ✅ Valeur en gras */
    }

    .section-title {
      font-weight: 800;                 /* ✅ Titre plus gras */
      margin: 8px 0 4px;                /* ✅ Plus d'espace */
      text-transform: uppercase;
      font-size: ${fontSize - 1}px;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #000;    /* ✅ Ligne sous le titre */
      padding-bottom: 2px;
    }

    /* ✅ EN-TÊTE LOGO + INFOS */
    .header-logo-block {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 8px;
      padding-bottom: 6px;
    }

    .header-logo-block img {
      width: 60px;                     /* ✅ Logo plus grand */
      height: 60px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .header-infos {
      flex: 0 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;                        /* ✅ Plus d'espace entre les lignes */
      text-align: left;
    }

    .header-infos .info-line {
      font-size: ${fontSize - 1}px;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-infos .info-line .label {
      color: #333;
    }

    .header-infos .info-line .value {
      font-weight: 700;
    }

    /* ✅ QR CODE */
    .qr-code {
      text-align: center;
      margin: 10px 0;
      padding: 6px;
    }

    .qr-code img {
      width: 110px;                    /* ✅ QR plus grand */
      height: 110px;
    }

    .qr-code-url {
      font-size: ${fontSize - 4}px;
      color: #555;
      margin-top: 3px;
      word-break: break-all;
      line-height: 1.2;
    }

    /* ✅ PHRASE ARABE */
    .arabic-block {
      direction: rtl;
      text-align: right;
      font-family: 'Arial', 'Tahoma', sans-serif;
      font-size: ${fontSize - 1}px;
      line-height: 1.6;                /* ✅ Plus espacé pour l'arabe */
      margin: 8px 0;
      padding: 6px 3px;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      font-weight: 600;
    }

    .arabic-block .line {
      margin-bottom: 4px;
    }

    /* ✅ INFOS BOUTIQUE */
    .shop-info {
      text-align: center;
      font-size: ${fontSize - 1}px;
      line-height: 1.5;
      margin-top: 10px;
      font-weight: 700;
    }

    .shop-info .shop-name {
      font-size: ${fontSize + 1}px;
      margin-bottom: 3px;
      font-weight: 800;
    }

    .shop-info .shop-address {
      font-size: ${fontSize - 1}px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .shop-info .shop-phones {
      font-size: ${fontSize - 2}px;
      font-weight: 600;
      line-height: 1.4;
    }

    /* ✅ IMPRESSION */
    @media print {
      @page {
        size: ${paperWidth}mm auto;
        margin: 0;
      }

      html, body {
        width: ${paperWidth}mm;
        margin: 0;
        padding: 0;
      }

      .ticket-wrapper {
        width: ${ticketWidth}mm;
        margin: 0 auto;
        padding-top: ${offsetTop}mm;
        padding-left: ${offsetLeft}mm;
        padding-right: ${offsetRight}mm;
        padding-bottom: 4mm;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="ticket-wrapper">

    <!-- EN-TÊTE : Logo + N° + Date + Créé par -->
    <div class="header-logo-block">
      ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" />` : ''}
      <div class="header-infos">
        <div class="info-line">
          <span class="label">N° :</span>
          <span class="value">${reparationData.numero || 'N/A'}</span>
        </div>
        <div class="info-line">
          <span class="label">Créé le :</span>
          <span class="value">${new Date(
            reparationData.createdAt
          ).toLocaleDateString('fr-FR')}</span>
        </div>
        <div class="info-line">
          <span class="label">Créé par :</span>
          <span class="value">${createurNom}</span>
        </div>
      </div>
    </div>

    <div class="double-separator"></div>

    <!-- CLIENT -->
    <div class="section-title">Client</div>
    <div class="row small"><span>Nom:</span><span>${
      reparationData.client?.nom || 'N/A'
    }</span></div>
    <div class="row small"><span>Code:</span><span>${
      reparationData.client?.code || 'N/A'
    }</span></div>
    <div class="row small"><span>Tél:</span><span>${
      reparationData.client?.phone || 'N/A'
    }</span></div>
    <div class="separator"></div>

    <!-- APPAREIL -->
    <div class="section-title">Appareil</div>
    ${
      reparationData.objet
        ? `<div class="row small"><span>Type:</span><span>${reparationData.objet.nom}</span></div>`
        : ''
    }
    ${
      reparationData.categorie
        ? `<div class="row small"><span>Catégorie:</span><span>${reparationData.categorie.nom}</span></div>`
        : ''
    }
    <div class="row small"><span>Marque:</span><span>${marqueNom}</span></div>
    <div class="separator"></div>

    <!-- PANNE -->
    <div class="section-title">Type de panne</div>
    <div class="small" style="font-weight: 600; margin: 4px 0;">${pannesTexte}</div>
    <div class="separator"></div>

    <!-- FINANCES -->
    <div class="section-title">Finances</div>
    <div class="row small"><span>Prix total:</span><span>${(
      reparationData.prix || 0
    ).toFixed(2)} DT</span></div>
    <div class="row small"><span>Acompte:</span><span>${(
      reparationData.acompte || 0
    ).toFixed(2)} DT</span></div>
    <div class="row bold"><span>Reste à payer:</span><span>${(
      (reparationData.prix || 0) - (reparationData.acompte || 0)
    ).toFixed(2)} DT</span></div>

    ${
      reparationData.observation
        ? `
    <div class="separator"></div>
    <div class="section-title">Observation</div>
    <div class="small" style="font-weight: 600;">${reparationData.observation}</div>
    `
        : ''
    }

    <!-- QR CODE -->
    ${
      qrCodeDataUrl
        ? `
    <div class="separator"></div>
    <div class="qr-code">
      <img src="${qrCodeDataUrl}" alt="QR Code" />
      <div class="small" style="margin-top: 4px; font-weight: 600;">📱 Scannez pour suivre votre réparation</div>
      <div class="qr-code-url">${qrData}</div>
    </div>
    `
        : ''
    }

    <!-- PHRASE ARABE -->
    <div class="arabic-block">
      <div class="line">يجب الاستظهار بهذا الوصل لاستلام الهاتف أو الحاسوب.</div>
      <div class="line">المحل لا يتحمّل مسؤولية الهاتف أو الحاسوب بعد مرور 3 أشهر من تاريخ الاستلام.</div>
    </div>

    <!-- INFOS BOUTIQUE -->
    <div class="shop-info">
      <div class="shop-name">${boutiqueName}</div>
      <div class="shop-address">Avenue Habib Bourguiba - Haouaria 8045</div>
      <div class="shop-phones">
        GSM Technique Haouaria : 20 417 056<br/>
        GSM Technique Saheb Jebel : 95 832 935
      </div>
    </div>

  </div>
</body>
</html>
  `;

  return html;
};

module.exports = {
  generateTicketPDF,
  generateTicketHTML,
  generateTicketContent,
  TICKET_CONFIG,
};