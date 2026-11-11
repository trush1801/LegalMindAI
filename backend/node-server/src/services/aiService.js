// ============================================================
// AI Service Communication Layer
// Node.js/Express → FastAPI
// React NEVER calls FastAPI directly
// ============================================================
const axios  = require('axios');
const config = require('../config/env');

const aiServiceClient = axios.create({
  baseURL: config.AI_SERVICE_URL,
  timeout: 30000,
  headers: {
    'Content-Type':      'application/json',
    'X-Internal-API-Key': config.INTERNAL_API_KEY,
  },
});

const checkAIServiceHealth = async () => {
  const res = await aiServiceClient.get('/health');
  return res.data;
};

const chainTest = async () => {
  const res = await aiServiceClient.get('/health/chain-test');
  return res.data;
};

const geminiProbe = async () => {
  try {
    const res = await aiServiceClient.get('/health/gemini-probe');
    return res.data;
  } catch (err) {
    return {
      success: false,
      configured: false,
      status: 'unreachable',
      error: err.message,
    };
  }
};

module.exports = {
  checkAIServiceHealth,
  chainTest,
  geminiProbe,
  aiServiceClient,
  post: (url, data, conf) => aiServiceClient.post(url, data, conf),
  get: (url, conf) => aiServiceClient.get(url, conf),
};