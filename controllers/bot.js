const { tick, startBot, stopBot, getBotRunning, closeTradesByIds, sellExternalAsset, getStatus } = require('../services/bot');
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
    openIds.length && closeTradesByIds(openIds).catch(err => logger.error(`Close all trades error: ${err.message}`));

    // Also sell all external (non-bot) holdings from the Binance account
    const { assets } = await require('../services/binance').getAllBalances().catch(() => ({ assets: [] }));
    const botAssets  = new Set(read('trades').filter(t => t.status === 'OPEN').map(t => t.symbol.replace('USDT', '')));
    const externals  = assets.filter(b => !botAssets.has(b.asset) && b.free > 0);
    externals.forEach(b => {
      sellExternalAsset(b.asset + 'USDT').catch(err => logger.error(`Sell external ${b.asset} error: ${err.message}`));
    });

    const total = openIds.length + externals.length;
    res.json({ ok: true, message: total ? `Closing ${total} position(s).` : 'No open positions.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function sellAsset(req, res) {
  try {
    const symbol = (req.body.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
    const result = await sellExternalAsset(symbol);
    res.json({ ok: true, message: `Sold ${result.executedQty} ${symbol.replace('USDT', '')} @ $${result.executedPrice.toFixed(4)}` });
  } catch (err) {
    const raw = err.response?.data?.msg || err.message;
    const msg = raw.startsWith('DUST:')
      ? `${symbol.replace('USDT', '')} balance is too small to sell (dust)`
      : raw;
    logger.warn(`[sellAsset] ${raw}`);
    res.status(400).json({ ok: false, error: msg });
  }
}

module.exports = { triggerStart, triggerStop, closeTrades, closeAllTrades, sellAsset };
