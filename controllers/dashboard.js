const { getStatus, getWatchlistSnapshot } = require('../services/bot');
const { read } = require('../utils/db');
const logger = require('../utils/logger');

async function getDashboard(req, res) {
  try {
    const status = await getStatus();
    res.json({ ok: true, data: status });
  } catch (err) {
    logger.error(`dashboard.getDashboard: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function getWatchlist(req, res) {
  try {
    const snapshot = await getWatchlistSnapshot();
    res.json({ ok: true, data: snapshot });
  } catch (err) {
    logger.error(`dashboard.getWatchlist: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function getBalanceHistory(req, res) {
  try {
    res.json({ ok: true, data: read('balance') });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { getDashboard, getWatchlist, getBalanceHistory };
