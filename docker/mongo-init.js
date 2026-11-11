// ============================================================
// MongoDB Initialization Script
// ============================================================

db = db.getSiblingDB('legalmind');

db.createCollection('users');
db.createCollection('documents');
db.createCollection('analysis_results');
db.createCollection('risk_findings');
db.createCollection('chat_histories');
db.createCollection('reports');

db.users.createIndex({ email: 1 }, { unique: true });
db.documents.createIndex({ userId: 1 });
db.documents.createIndex({ createdAt: -1 });

print('✅ LegalMind MongoDB initialized successfully');