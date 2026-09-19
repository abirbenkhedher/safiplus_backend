const logger = require('../config/logger');

// ✅ URL de base de l'API TextBee
const TEXTBEE_API_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';

// ✅ Templates des messages par statut
const SMS_TEMPLATES = {
  'REPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre réparation ${numero} est terminée. Vous pouvez venir la récupérer. - ${boutique}`,

  'NON REPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} n'a pas pu être réparé. Contactez-nous pour plus d'informations. - ${boutique}`,

  'SAV': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} a été transmis au service après-vente. - ${boutique}`,

  'SAV REPARE': (client, numero, boutique) =>
    `Bonjour ${client}, votre appareil ${numero} est de retour du SAV et est prêt. - ${boutique}`,

  'SAV NON REPARE': (client, numero, boutique) =>
    `Bonjour ${client}, le SAV n'a pas pu réparer votre appareil ${numero}. Vous pouvez venir le récupérer. - ${boutique}`,
};

/**
 * ✅ Envoie un SMS et retourne le résultat détaillé
 * @param {Object} reparation - La réparation (avec client populé)
 * @param {string} statusLabel - Le libellé du nouveau statut
 * @param {string} userId - L'ID de l'utilisateur qui déclenche
 * @returns {Promise<Object|null>} - Détail du SMS envoyé ou null
 */
exports.sendStatusSMS = async (reparation, statusLabel, userId) => {
  try {
    // 1. Vérifier que le client a un téléphone
    if (!reparation.client?.phone) {
      logger.warn(`⚠️ SMS non envoyé : pas de téléphone pour ${reparation.numero}`);
      return null;
    }

    // 2. Vérifier qu'un template existe pour ce statut
    const template = SMS_TEMPLATES[statusLabel];
    if (!template) {
      logger.info(`ℹ️ Pas de SMS configuré pour le statut "${statusLabel}"`);
      return null;
    }

    // 3. Vérifier que l'API est configurée
    if (!process.env.TEXTBEE_API_KEY) {
      logger.warn('⚠️ TEXTBEE_API_KEY non configurée, SMS non envoyé');
      return null;
    }

    // 4. Construire le message
    const boutiqueName = process.env.BOUTIQUE_NAME || 'ATELIER PRO';
    const messageBody = template(
      reparation.client.nom || 'Client',
      reparation.numero,
      boutiqueName
    );

    // 5. Formater le numéro (E.164 recommandé)
    const phone = formatPhoneNumber(reparation.client.phone);
    if (!phone) {
      logger.warn(`⚠️ Numéro invalide : ${reparation.client.phone}`);
      return null;
    }

    // 6. Envoi via TextBee
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

    logger.info(`✅ SMS envoyé à ${phone} pour ${reparation.numero} (statut: ${statusLabel})`);

    // ✅ Retourner le détail pour l'historique
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

    // ✅ Retourner un enregistrement d'échec pour l'historique
    const template = SMS_TEMPLATES[statusLabel];
    return {
      statut: statusLabel,
      statutId: reparation.status?._id || reparation.status,
      message: template
        ? template(
            reparation.client?.nom || 'Client',
            reparation.numero,
            process.env.BOUTIQUE_NAME || 'ATELIER PRO'
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

/**
 * ✅ Formate un numéro de téléphone au format E.164
 */
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