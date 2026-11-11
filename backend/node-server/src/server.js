// ============================================================
// Server Entry Point
// ============================================================
const app       = require('./app');
const connectDB = require('./config/database');
const config    = require('./config/env');

const startServer = async () => {
  await connectDB();

  app.listen(config.PORT, () => {
    console.log('');
    console.log('⚖️  ================================');
    console.log('   LegalMind AI — Express Backend');
    console.log('⚖️  ================================');
    console.log(`🚀 Port      : ${config.PORT}`);
    console.log(`🌍 Env       : ${config.NODE_ENV}`);
    console.log(`📡 API Base  : http://localhost:${config.PORT}/api`);
    console.log(`🤖 AI Service: ${config.AI_SERVICE_URL}`);
    console.log('⚖️  ================================');
    console.log('');
  });
};

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});