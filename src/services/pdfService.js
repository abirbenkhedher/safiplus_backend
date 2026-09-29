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
    // Chercher dans plusieurs emplacements possibles
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
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
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

  lines.push({ text: centerText(boutiqueName, width), size: 'large', bold: true });
  lines.push({ text: centerText(boutiqueAddress, width), size: 'small' });
  lines.push({ text: centerText(boutiquePhone, width), size: 'small' });
  if (boutiqueEmail) {
    lines.push({ text: centerText(boutiqueEmail, width), size: 'small' });
  }
  lines.push({ text: '='.repeat(width), size: 'small' });

  lines.push({ text: centerText('REÇU DE RÉPARATION', width), size: 'medium', bold: true });
  lines.push({ text: '='.repeat(width), size: 'small' });

  lines.push({ text: formatLine('N° Reçu:', reparation.numero, width), size: 'normal', bold: true });
  lines.push({ text: formatLine('Date:', new Date(reparation.createdAt).toLocaleString('fr-FR'), width), size: 'small' });

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'CLIENT', size: 'normal', bold: true });
  if (reparation.client) {
    lines.push({ text: formatLine('Nom:', reparation.client.nom, width), size: 'small' });
    lines.push({ text: formatLine('Code:', reparation.client.code, width), size: 'small' });
    lines.push({ text: formatLine('Tél:', reparation.client.phone, width), size: 'small' });
    if (reparation.client.phone2) {
      lines.push({ text: formatLine('Tél 2:', reparation.client.phone2, width), size: 'small' });
    }
    if (reparation.client.adresse) {
      lines.push({ text: formatLine('Adresse:', reparation.client.adresse, width), size: 'small' });
    }
  }

  lines.push({ text: '-'.repeat(width), size: 'small' });

  lines.push({ text: 'APPAREIL', size: 'normal', bold: true });
  if (reparation.objet) {
    lines.push({ text: formatLine('Type:', reparation.objet.nom, width), size: 'small' });
  }
  if (reparation.categorie) {
    lines.push({ text: formatLine('Catégorie:', reparation.categorie.nom, width), size: 'small' });
  }

  const marqueNom = getNom(reparation.marque);
  lines.push({ text: formatLine('Marque:', marqueNom || 'N/A', width), size: 'small' });

  const modeleNom = getNom(reparation.modele);
  if (modeleNom) {
    lines.push({ text: formatLine('Modèle:', modeleNom, width), size: 'small' });
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
  lines.push({ text: formatLine('Prix total:', `${(reparation.prix || 0).toFixed(2)} DT`, width), size: 'small' });
  lines.push({ text: formatLine('Acompte:', `${(reparation.acompte || 0).toFixed(2)} DT`, width), size: 'small' });
  lines.push({
    text: formatLine('Reste à payer:', `${((reparation.prix || 0) - (reparation.acompte || 0)).toFixed(2)} DT`, width),
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
        const fontSize = TICKET_CONFIG.fontSizes[item.size] || TICKET_CONFIG.fontSizes.normal;
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
 * ✅ Génère le HTML du ticket avec :
 * - Logo + N° + Date + Créé par (en haut)
 * - Client (sans email)
 * - Appareil
 * - Panne
 * - Finances
 * - QR Code
 * - Phrase arabe d'avertissement
 * - Infos boutique
 */
const generateTicketHTML = async (reparation, options = {}) => {
  const {
    boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO',
    boutiqueAddress = process.env.BOUTIQUE_ADDRESS || 'Adresse non configurée',
    boutiquePhone = process.env.BOUTIQUE_PHONE || 'Tél: XX XXX XXX',
    boutiqueEmail = process.env.BOUTIQUE_EMAIL || '',
    footerMessage = 'Merci de votre confiance!',
    offsetTop = 5,
    offsetLeft = 0.5,
    offsetRight = 0.5,
  } = options;

  const reparationData = reparation.toObject ? reparation.toObject() : reparation;

  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    'http://localhost:5173';

  const qrData = `${frontendUrl}/suivi/${reparationData.numero}`;

  console.log('🎫 QR Code ticket généré:', qrData);

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

  // ✅ Logo
  const logoDataUrl = getLogoDataUrl();

  const marqueNom = getNom(reparationData.marque) || 'N/A';
  const modeleNom = getNom(reparationData.modele);
  const pannesTexte = formatPannes(reparationData.panneType);

  // ✅ Nom du créateur
  const createurNom = reparationData.createdBy
    ? `${reparationData.createdBy.firstName || ''} ${reparationData.createdBy.lastName || ''}`.trim() ||
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
      size: 80mm auto;
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
      width: 80mm;
      background: white;
      color: black;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.2;
      padding-top: ${offsetTop}mm;
      padding-left: ${offsetLeft}mm;
      padding-right: ${offsetRight}mm;
      padding-bottom: 5mm;
    }

    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 14px; }
    .medium { font-size: 12px; }
    .small { font-size: 10px; }
    .xsmall { font-size: 9px; }
    .tiny { font-size: 8px; }

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

    /* ✅ En-tête avec logo + infos */
    .header-logo-block {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
      padding-bottom: 4px;
    }

    .header-logo-block img {
      width: 55px;
      height: 55px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .header-infos {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
      text-align: left;
    }

    .header-infos .info-line {
      font-size: 9.5px;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-infos .info-line .label {
      color: #444;
    }

    .header-infos .info-line .value {
      font-weight: bold;
    }

    .status-box {
      border: 2px solid #000;
      padding: 3px;
      text-align: center;
      font-weight: bold;
      margin: 5px 0;
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

    /* ✅ Bloc phrase arabe */
    .arabic-block {
      direction: rtl;
      text-align: right;
      font-family: 'Arial', 'Tahoma', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      margin: 6px 0;
      padding: 4px 2px;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }

    .arabic-block .line {
      margin-bottom: 3px;
    }

    /* ✅ Bloc infos boutique */
    .shop-info {
      text-align: center;
      font-size: 10px;
      line-height: 1.4;
      margin-top: 8px;
      font-weight: bold;
    }

    .shop-info .shop-name {
      font-size: 11px;
      margin-bottom: 2px;
    }

    .shop-info .shop-address {
      font-size: 9.5px;
      font-weight: normal;
      margin-bottom: 3px;
    }

    .shop-info .shop-phones {
      font-size: 9px;
      font-weight: normal;
      line-height: 1.3;
    }

    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }

      html, body {
        width: 80mm;
        margin: 0;
        padding: 0;
        padding-top: ${offsetTop}mm;
        padding-left: ${offsetLeft}mm;
        padding-right: ${offsetRight}mm;
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

  <!-- ✅ EN-TÊTE : Logo + N° + Date + Créé par -->
  <div class="header-logo-block">
    ${
      logoDataUrl
        ? `<img src="${logoDataUrl}" alt="Logo" />`
        : ''
    }
    <div class="header-infos">
      <div class="info-line">
        <span class="label">N° :</span>
        <span class="value">${reparationData.numero || 'N/A'}</span>
      </div>
      <div class="info-line">
        <span class="label">Créé le :</span>
        <span class="value">${new Date(reparationData.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>
      <div class="info-line">
        <span class="label">Créé par :</span>
        <span class="value">${createurNom}</span>
      </div>
    </div>
  </div>

  <div class="double-separator"></div>

  <!-- ✅ CLIENT (sans email) -->
  <div class="section-title">Client</div>
  <div class="row small"><span>Nom:</span><span>${reparationData.client?.nom || 'N/A'}</span></div>
  <div class="row small"><span>Code:</span><span>${reparationData.client?.code || 'N/A'}</span></div>
  <div class="row small"><span>Tél:</span><span>${reparationData.client?.phone || 'N/A'}</span></div>
  <div class="separator"></div>

  <!-- ✅ APPAREIL -->
  <div class="section-title">Appareil</div>
  ${reparationData.objet ? `<div class="row small"><span>Type:</span><span>${reparationData.objet.nom}</span></div>` : ''}
  ${reparationData.categorie ? `<div class="row small"><span>Catégorie:</span><span>${reparationData.categorie.nom}</span></div>` : ''}
  <div class="row small"><span>Marque:</span><span>${marqueNom}</span></div>
  <div class="separator"></div>

  <!-- ✅ TYPE DE PANNE -->
  <div class="section-title">Type de panne</div>
  <div class="small">${pannesTexte}</div>
  <div class="separator"></div>

  <!-- ✅ FINANCES -->
  <div class="section-title">Finances</div>
  <div class="row small"><span>Prix total:</span><span>${(reparationData.prix || 0).toFixed(2)} DT</span></div>
  <div class="row small"><span>Acompte:</span><span>${(reparationData.acompte || 0).toFixed(2)} DT</span></div>
  <div class="row bold"><span>Reste à payer:</span><span>${((reparationData.prix || 0) - (reparationData.acompte || 0)).toFixed(2)} DT</span></div>

  ${reparationData.observation ? `
  <div class="separator"></div>
  <div class="section-title">Observation</div>
  <div class="small">${reparationData.observation}</div>
  ` : ''}

  <!-- ✅ QR CODE -->
  ${qrCodeDataUrl ? `
  <div class="separator"></div>
  <div class="qr-code">
    <img src="${qrCodeDataUrl}" alt="QR Code" />
    <div class="small">📱 Scannez pour suivre votre réparation</div>
    <div class="qr-code-url">${qrData}</div>
  </div>
  ` : ''}

  <!-- ✅ PHRASE ARABE -->
  <div class="arabic-block">
    <div class="line">يجب الاستظهار بهذا الوصل لاستلام الهاتف أو الحاسوب.</div>
    <div class="line">المحل لا يتحمّل مسؤولية الهاتف أو الحاسوب بعد مرور 3 أشهر من تاريخ الاستلام.</div>
  </div>

  <!-- ✅ INFOS BOUTIQUE -->
  <div class="shop-info">
    <div class="shop-name">${boutiqueName}</div>
    <div class="shop-address">Avenue Habib Bourguiba - Haouaria 8045</div>
      <div class="separator"></div>

    <div class="shop-phones">
      GSM Technique Haouaria : 20 417 056<br/>
      GSM Technique Saheb Jebel : 95 832 935
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