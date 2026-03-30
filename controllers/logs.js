const { read } = require('../utils/db');
const logger = require('../utils/logger');

function getLogs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const logs = read('logs');
    // Newest first, limited
    res.json({ ok: true, data: logs.slice(-limit).reverse() });
  } catch (err) {
    logger.error(`logs.getLogs: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { getLogs };
