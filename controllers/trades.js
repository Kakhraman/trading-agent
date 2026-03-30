const { read } = require('../utils/db');
const logger = require('../utils/logger');

function getTrades(req, res) {
  try {
    const trades = read('trades');
    // Newest first
    res.json({ ok: true, data: trades.slice().reverse() });
  } catch (err) {
    logger.error(`trades.getTrades: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
}

function getOpenTrades(req, res) {
  try {
    const trades = read('trades').filter((t) => t.status === 'OPEN');
    res.json({ ok: true, data: trades });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { getTrades, getOpenTrades };
