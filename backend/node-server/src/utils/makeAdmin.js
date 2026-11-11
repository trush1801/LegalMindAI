const mongoose = require('mongoose');
const path = require('path');

// Try loading .env from root directory and current directory
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27018/legalmind?authSource=admin';

async function setAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    const email = (process.argv[2] || 'pateltrush49@gmail.com').toLowerCase().trim();

    const result = await mongoose.connection.db.collection('users').updateOne(
      { email },
      { $set: { role: 'admin' } }
    );

    if (result.matchedCount === 0) {
      console.log(`❌ No user found with email: "${email}"`);
      console.log('Available users in DB:');
      const allUsers = await mongoose.connection.db.collection('users').find({}, { projection: { email: 1, role: 1 } }).toArray();
      console.log(allUsers);
    } else {
      console.log(`✅ SUCCESS! User "${email}" is now an ADMIN.`);
    }
  } catch (err) {
    console.error('Error updating role:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

setAdmin();