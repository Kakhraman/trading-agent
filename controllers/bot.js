const { tick, startBot, stopBot, getBotRunning, closeTradesByIds, getStatus } = require('../services/bot');
const { read } = require('../utils/db');
const logger = require('../utils/logger');

async function triggerStart(req, res) {
  try {
    startBot();
    logger.info('Bot started via API.');
    tick().catch(err => logger.error(`Startup tick error: ${err.message}`));
    res.json({ ok: true, isRunning: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

function triggerStop(req, res) {
  try {
    stopBot();
    logger.info('Bot stopped via API.');
    res.json({ ok: true, isRunning: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function closeTrades(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ ok: false, error: 'ids array required.' });
    }
    closeTradesByIds(ids).catch(err => logger.error(`Close trades error: ${err.message}`));
    res.json({ ok: true, message: `Closing ${ids.length} trade(s).` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function closeAllTrades(req, res) {
  try {
    const openIds = read('trades')
      .filter(t => t.status === 'OPEN')
      .map(t => t.id);
    if (!openIds.length) return res.json({ ok: true, message: 'No open trades.' });
    closeTradesByIds(openIds).catch(err => logger.error(`Close all trades error: ${err.message}`));
    res.json({ ok: true, message: `Closing ${openIds.length} trade(s).` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { triggerStart, triggerStop, closeTrades, closeAllTrades };
