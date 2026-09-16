const History = require('../models/History');
const logger = require('../config/logger');

/**
 * Enregistre une action dans l'historique
 */
const logAction = async ({
  entityType,
  entityId,
  action,
  userId,
  changes = null,
  comment = null,
  oldStatus = null,
  newStatus = null,
  oldValue = null,
  newValue = null,
  req = null
}) => {
  try {
    const historyData = {
      entityType,
      entityId,
      action,
      user: userId,
      changes,
      comment,
      oldStatus,
      newStatus,
      oldValue,
      newValue
    };

    // Ajouter les infos de la requête si disponibles
    if (req) {
      historyData.ipAddress = req.ip || req.connection?.remoteAddress;
      historyData.userAgent = req.headers?.['user-agent'];
    }

    const history = await History.create(historyData);
    
    logger.debug(`Historique enregistré: ${action} sur ${entityType} ${entityId}`);
    
    return history;
  } catch (error) {
    logger.error('Erreur logAction:', error);
    // Ne pas faire échouer l'action principale si l'historique échoue
    return null;
  }
};

/**
 * Compare deux objets et retourne les différences
 */
const getChanges = (oldObj, newObj, fields = []) => {
  const changes = {};
  
  fields.forEach(field => {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    
    // Comparer les valeurs (convertir en string pour les ObjectId)
    const oldStr = oldVal?.toString() || null;
    const newStr = newVal?.toString() || null;
    
    if (oldStr !== newStr) {
      changes[field] = {
        old: oldVal,
        new: newVal
      };
    }
  });
  
  return Object.keys(changes).length > 0 ? changes : null;
};

/**
 * Récupère l'historique d'une entité
 */
const getEntityHistory = async (entityType, entityId, limit = 50) => {
  try {
    return await History.find({
      entityType,
      entityId
    })
      .populate('user', 'username firstName lastName')
      .populate('oldStatus', 'label color')
      .populate('newStatus', 'label color')
      .sort({ createdAt: -1 })
      .limit(limit);
  } catch (error) {
    logger.error('Erreur getEntityHistory:', error);
    return [];
  }
};

/**
 * Supprime l'historique ancien (plus de X jours)
 */
const cleanOldHistory = async (daysToKeep = 365) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await History.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    
    logger.info(`Historique nettoyé: ${result.deletedCount} entrées supprimées`);
    return result;
  } catch (error) {
    logger.error('Erreur cleanOldHistory:', error);
    return null;
  }
};

module.exports = {
  logAction,
  getChanges,
  getEntityHistory,
  cleanOldHistory
};