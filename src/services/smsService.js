const logger = require('../config/logger');

const TEXTBEE_API_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';

// ============================================================
// ✅ CONSTANTE : numéro par défaut (client sans téléphone)
// ============================================================
const DEFAULT_PHONE = '00000000';

// ============================================================
// ✅ Normalisation du libellé de statut
// ============================================================
const normalizeStatus = (label) => {
  if (!label) return '';
  return String(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

// ============================================================
// ✅ Templates des SMS
// ============================================================
const SMS_TEMPLATES = {
  'REPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre réparation ${numero} est terminée. Vous pouvez venir la récupérer. - ${boutique}`,

  'NONREPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} n'a pas pu être réparé. Contactez-nous pour plus d'informations. - ${boutique}`,

  'SORTIENONREPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} est disponible au retrait (non réparé). Merci de venir le récupérer. - ${boutique}`,

  'SAV': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} a été transmis au service après-vente. - ${boutique}`,

  'SAVREPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} est de retour du SAV et est prêt. - ${boutique}`,

  'SAVNONREPARE': (client, numero, boutique) =>
    `Bonjour ${client}, le SAV n'a pas pu réparer votre appareil ${numero}. Vous pouvez venir le récupérer. - ${boutique}`,
};

// ============================================================
// ✅ Récupération du template (avec normalisation)
// ============================================================
const getTemplate = (statusLabel) => {
  const normalized = normalizeStatus(statusLabel);
  const template = SMS_TEMPLATES[normalized] || null;

  logger.info(
    `🔍 Template SMS: brut="${statusLabel}" -> normalisé="${normalized}" -> ${template ? '✅ trouvé' : '❌ NON TROUVÉ'}`
  );

  return template;
};

// ============================================================
// ✅ Vérifier si un numéro est le numéro par défaut
// ============================================================
const isDefaultPhone = (phone) => {
  if (!phone) return true;
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  return cleaned === DEFAULT_PHONE;
};

// ============================================================
// ✅ Envoie un SMS
// ============================================================
exports.sendStatusSMS = async (reparation, statusLabel, userId) => {
  try {
    // 1. Vérifier que le client a un téléphone
    if (!reparation.client?.phone) {
      logger.warn(`⚠️ SMS non envoyé : pas de téléphone pour ${reparation.numero}`);
      return null;
    }

    // ✅ 2. Ne PAS envoyer si c'est le numéro par défaut
    if (isDefaultPhone(reparation.client.phone)) {
      logger.info(
        `⏭️ SMS ignoré pour ${reparation.numero} : client sans téléphone (${reparation.client.phone})`
      );
      return null;
    }

    // 3. Vérifier qu'un template existe pour ce statut
    const template = getTemplate(statusLabel);
    if (!template) {
      logger.info(`ℹ️ Pas de SMS configuré pour le statut "${statusLabel}"`);
      return null;
    }

    // 4. Vérifier que l'API est configurée
    if (!process.env.TEXTBEE_API_KEY) {
      logger.warn('⚠️ TEXTBEE_API_KEY non configurée, SMS non envoyé');
      return null;
    }

    // 5. Construire le message
    const boutiqueName = process.env.BOUTIQUE_NAME || 'safi info +';
    const messageBody = template(
      reparation.client.nom || 'Client',
      reparation.numero,
      boutiqueName
    );

    // 6. Formater le numéro
    const phone = formatPhoneNumber(reparation.client.phone);
    if (!phone) {
      logger.warn(`⚠️ Numéro invalide : ${reparation.client.phone}`);
      return null;
    }

    // 7. Envoi via TextBee
    const response = await fetch(TEXTBEE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.TEXTBEE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [phone],
        message: messageBody,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    logger.info(`✅ SMS envoyé à ${phone} pour ${reparation.numero}`);

    return {
      statut: statusLabel,
      statutId: reparation.status?._id || reparation.status,
      message: messageBody,
      telephone: phone,
      clientNom: reparation.client.nom,
      envoyePar: userId,
      envoyeLe: new Date(),
      statutEnvoi: 'succes',
      erreur: null,
    };
  } catch (error) {
    logger.error(`❌ Échec SMS pour ${reparation.numero}:`, error.message);

    const template = getTemplate(statusLabel);
    return {
      statut: statusLabel,
      statutId: reparation.status?._id || reparation.status,
      message: template
        ? template(
            reparation.client?.nom || 'Client',
            reparation.numero,
            process.env.BOUTIQUE_NAME || 'safi info +'
          )
        : 'SMS',
      telephone: reparation.client?.phone || 'N/A',
      clientNom: reparation.client?.nom || 'Client',
      envoyePar: userId,
      envoyeLe: new Date(),
      statutEnvoi: 'echec',
      erreur: error.message,
    };
  }
};

// ============================================================
// ✅ Formate un numéro au format E.164
// ============================================================
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('216')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 8) {
      cleaned = '+216' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

exports.normalizeStatus = normalizeStatus;
exports.getTemplate = getTemplate;