// ============================================================
// MongoDB Connection
// ============================================================
const mongoose = require('mongoose');
const config   = require('./env');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('   Make sure Docker is running: docker-compose up -d');
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () =>
  console.warn('⚠️  MongoDB disconnected')
);
mongoose.connection.on('reconnected', () =>
  console.log('🔄 MongoDB reconnected')
);

module.exports = connectDB;