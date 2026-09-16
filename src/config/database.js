const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    logger.info(`✅ MongoDB connecté: ${conn.connection.host}`);
    
    // Gestion des événements de connexion
    mongoose.connection.on('error', (err) => {
      logger.error('❌ Erreur MongoDB:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB déconnecté');
    });
    
    return conn;
  } catch (error) {
    logger.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;