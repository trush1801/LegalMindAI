// backend/node-server/src/utils/langgraphRouterTest.js

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const FASTAPI_URL = 'http://localhost:8000/query/router-test';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

async function runRouterTest() {
  console.log('\n🔀 LegalMind AI — Part 12A: LangGraph Router Test\n=================================================');

  const queries = [
    { name: "General RAG Query", text: "What is the notice period in this contract?" },
    { name: "Risk Query", text: "What are the liabilities and penalties if I terminate early?" },
    { name: "Summary Query", text: "Can you summarize the key points of this document?" }
  ];

  for (const q of queries) {
    try {
      const res = await axios.post(FASTAPI_URL, 
        { document_id: "test_doc_123", query: q.text },
        { headers: { 'x-internal-api-key': INTERNAL_API_KEY } }
      );
      
      console.log(`\n🗣️  User Query: "${q.text}"`);
      console.log(`🎯 Detected Intent: [${res.data.detected_intent.toUpperCase()}]`);
      console.log(`🛣️  LangGraph Routed To: >> ${res.data.routed_path} <<`);
      
    } catch (error) {
      console.error(`❌ Failed to test query: ${q.name}`);
      console.error(error.response?.data || error.message);
    }
  }
  console.log('\n=================================================\n✅ ROUTER TEST COMPLETE');
}

runRouterTest();