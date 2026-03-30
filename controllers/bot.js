const { tick } = require('../services/bot');
const logger = require('../utils/logger');

async function triggerTick(req, res) {
  try {
    logger.info('Manual bot tick triggered via API.');
    // Run tick in background — respond immediately
    tick().catch((err) => logger.error(`Manual tick error: ${err.message}`));
    res.json({ ok: true, message: 'Bot tick triggered.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { triggerTick };
