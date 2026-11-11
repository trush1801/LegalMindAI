// ============================================================
// Auth Test Script
// Tests: Register → Login → GetMe → Admin routes → Role checks
// Usage: node src/utils/authTest.js
// Make sure Express server is running: npm run dev
// ============================================================
const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api';
let normalToken = '';
let adminToken  = '';
let adminUserId = '';

// ── Helper ────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  // Don't throw on non-2xx so we can inspect all responses
  validateStatus: () => true,
});

const log = (label, data) => {
  console.log(`\n✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const logError = (label, res) => {
  console.log(`\n❌ ${label}`);
  console.log('Status :', res?.status);
  console.log('Data   :', JSON.stringify(res?.data, null, 2));
};

// ── Tests ─────────────────────────────────────────────────
const runTests = async () => {
  console.log('\n⚖️  LegalMind AI — Auth Test');
  console.log('================================\n');

  // ── 1. Register Normal User ───────────────────────────
  console.log('TEST 1: Register Normal User');
  const r1 = await api.post('/auth/register', {
    name:     'Test Normal User',
    email:    `normal_${Date.now()}@legalmind.ai`,
    password: 'Password123!',
  });

  if (r1.status === 201) {
    normalToken = r1.data.token;
    log('Normal user registered', {
      user:  r1.data.user,
      token: normalToken.substring(0, 30) + '...',
    });
  } else {
    logError('Register Normal User FAILED', r1);
    console.log('\n⛔ Cannot continue without registered user. Exiting.');
    process.exit(1);
  }

  // ── 2. Register Second User (future admin) ────────────
  console.log('\nTEST 2: Register Admin User (starts as normal_user)');
  const r2 = await api.post('/auth/register', {
    name:     'Test Admin User',
    email:    `admin_${Date.now()}@legalmind.ai`,
    password: 'AdminPass123!',
  });

  if (r2.status === 201) {
    adminToken  = r2.data.token;
    adminUserId = r2.data.user.id;
    log('Second user registered', { user: r2.data.user });
  } else {
    logError('Register Admin User FAILED', r2);
    process.exit(1);
  }

  // ── 3. Login with wrong credentials ───────────────────
  console.log('\nTEST 3: Login with wrong credentials (expect 401)');
  const r3 = await api.post('/auth/login', {
    email:    'nonexistent@legalmind.ai',
    password: 'wrong',
  });
  if (r3.status === 401) {
    log('Correctly rejected bad credentials (401)', {
      status: r3.status,
      error:  r3.data.error,
    });
  } else {
    logError('Expected 401 but got', r3);
  }

  // ── 4. Login with correct credentials ─────────────────
  console.log('\nTEST 4: Login with correct credentials (expect 200)');
  const r4 = await api.post('/auth/login', {
    email:    r1.data.user.email,
    password: 'Password123!',
  });
  if (r4.status === 200) {
    normalToken = r4.data.token; // refresh token
    log('Login successful', { user: r4.data.user });
  } else {
    logError('Login FAILED', r4);
  }

  // ── 5. GET /auth/me — with token ──────────────────────
  console.log('\nTEST 5: GET /auth/me (with token, expect 200)');
  const r5 = await api.get('/auth/me', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  if (r5.status === 200) {
    log('Get Me successful', r5.data.user);
  } else {
    logError('Get Me FAILED', r5);
  }

  // ── 6. GET /auth/me — without token ───────────────────
  console.log('\nTEST 6: GET /auth/me without token (expect 401)');
  const r6 = await api.get('/auth/me');
  if (r6.status === 401) {
    log('Correctly rejected — no token (401)', { error: r6.data.error });
  } else {
    logError('Expected 401 but got', r6);
  }

  // ── 7. Update profile ─────────────────────────────────
  console.log('\nTEST 7: Update Profile');
  const r7 = await api.put('/auth/update-profile',
    { name: 'Updated Normal User', preferredLanguage: 'hindi' },
    { headers: { Authorization: `Bearer ${normalToken}` } }
  );
  if (r7.status === 200) {
    log('Profile updated', r7.data.user);
  } else {
    logError('Update Profile FAILED', r7);
  }

  // ── 8. Normal user hits admin route (expect 403) ──────
  console.log('\nTEST 8: GET /admin/stats — normal user (expect 403)');
  const r8 = await api.get('/admin/stats', {
    headers: { Authorization: `Bearer ${normalToken}` },
  });
  if (r8.status === 403) {
    log('Normal user blocked from admin (403)', { error: r8.data.error });
  } else {
    logError('Expected 403 but got', r8);
  }

  // ── 9. Promote to admin via DB ────────────────────────
  console.log('\nTEST 9: Promote user to admin (direct DB)');
  const mongoose = require('mongoose');
  const config   = require('../config/env');
  const User     = require('../models/User.model');
  const { generateUserToken } = require('./jwt.utils');

  await mongoose.connect(config.MONGODB_URI);
  const adminUser = await User.findByIdAndUpdate(
    adminUserId,
    { role: 'admin' },
    { new: true }
  );
  adminToken = generateUserToken(adminUser);
  await mongoose.disconnect();
  log('User promoted to admin', {
    email: adminUser.email,
    role:  adminUser.role,
  });

  // ── 10. Admin hits admin route (expect 200) ───────────
  console.log('\nTEST 10: GET /admin/stats — admin user (expect 200)');
  const r10 = await api.get('/admin/stats', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (r10.status === 200) {
    log('Admin stats retrieved', r10.data.data);
  } else {
    logError('Admin Stats FAILED', r10);
  }

  // ── 11. Admin get all users ───────────────────────────
  console.log('\nTEST 11: GET /admin/users');
  const r11 = await api.get('/admin/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (r11.status === 200) {
    log('All users retrieved', {
      total: r11.data.data.pagination.total,
      users: r11.data.data.users.map((u) => ({
        name:  u.name,
        email: u.email,
        role:  u.role,
      })),
    });
  } else {
    logError('Get All Users FAILED', r11);
  }

  // ── 12. Change Password ───────────────────────────────
  console.log('\nTEST 12: Change Password');
  const r12 = await api.put('/auth/change-password',
    { currentPassword: 'Password123!', newPassword: 'NewPassword456!' },
    { headers: { Authorization: `Bearer ${normalToken}` } }
  );
  if (r12.status === 200) {
    log('Password changed', r12.data);
  } else {
    logError('Change Password FAILED', r12);
  }

  // ── 13. Logout ────────────────────────────────────────
  console.log('\nTEST 13: Logout');
  const r13 = await api.post('/auth/logout', {},
    { headers: { Authorization: `Bearer ${normalToken}` } }
  );
  if (r13.status === 200) {
    log('Logout successful', r13.data);
  } else {
    logError('Logout FAILED', r13);
  }

  // ── Cleanup ───────────────────────────────────────────
  console.log('\n🧹 Cleaning up test users...');
  const mongoose2 = require('mongoose');
  const config2   = require('../config/env');
  const User2     = require('../models/User.model');
  await mongoose2.connect(config2.MONGODB_URI);
  await User2.deleteMany({ email: /@legalmind\.ai$/ });
  await mongoose2.disconnect();
  console.log('✅ Test users cleaned up');

  console.log('\n================================');
  console.log('✅ AUTH TESTS COMPLETE — PART 03 DONE');
  console.log('================================\n');
};

runTests().catch((err) => {
  console.error('\n❌ Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});