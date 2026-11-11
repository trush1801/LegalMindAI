// ============================================================
// 404 Handler
// ============================================================
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
    timestamp: new Date().toISOString(),
  });
};

module.exports = notFound;