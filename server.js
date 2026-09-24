require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/database');
const logger = require('./src/config/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const familleRoutes = require('./src/routes/familleRoutes');
const categorieRoutes = require('./src/routes/categorieRoutes');
const objetRoutes = require('./src/routes/objetRoutes');
const statusRoutes = require('./src/routes/statusRoutes');
const clientRoutes = require('./src/routes/clientRoutes');
const reparationRoutes = require('./src/routes/reparationRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const exportRoutes = require('./src/routes/exportRoutes');
const historyRoutes = require('./src/routes/historyRoutes');
const teamMessagesRouter = require('./src/routes/teamMessages');
const marquesRoutes =  require('./src/routes/marquesRoutes');
const modelesRoutes =  require('./src/routes/modelesRoutes');


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/familles', familleRoutes);
app.use('/api/categories', categorieRoutes);
app.use('/api/objets', objetRoutes);
app.use('/api/statuses', statusRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/reparations', reparationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/team-messages', teamMessagesRouter);
app.use('/api/marques', marquesRoutes);
app.use('/api/modeles', modelesRoutes);


// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`🚀 Serveur démarré sur http://localhost:${PORT}`);
      logger.info(`📊 Environnement: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('❌ Erreur lors du démarrage:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', () => {
  logger.info('SIGTERM reçu, arrêt du serveur...');
  process.exit(0);
});