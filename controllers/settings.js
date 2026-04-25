const {
  getWatchlist, addToWatchlist, removeFromWatchlist,
  getTick15mEnabled, getTick5mEnabled, setTick15mEnabled, setTick5mEnabled,
} = require('../services/bot');
const { getExchangeInfo } = require('../services/binance');
const logger = require('../utils/logger');

function getSettings(req, res) {
  try {
    res.json({
      ok: true,
      data: {
        watchlist:      getWatchlist(),
        tick15mEnabled: getTick15mEnabled(),
        tick5mEnabled:  getTick5mEnabled(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

function setStrategy(req, res) {
  try {
    const { strategy, enabled } = req.body;
    if (strategy !== '15m' && strategy !== '5m') {
      return res.status(400).json({ ok: false, error: 'strategy must be "15m" or "5m"' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enabled must be boolean' });
    }
    if (strategy === '15m') setTick15mEnabled(enabled);
    else setTick5mEnabled(enabled);
    logger.info(`Strategy ${strategy} ${enabled ? 'enabled' : 'disabled'} via API.`);
    res.json({ ok: true, strategy, enabled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function addSymbol(req, res) {
  try {
    const symbol = (req.body.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

    const info  = await getExchangeInfo();
    const found = info.symbols.find(s => s.symbol === symbol && s.status === 'TRADING');
    if (!found) return res.status(400).json({ ok: false, error: `${symbol} not found or not actively trading on Binance` });

    const result = addToWatchlist(symbol);
    if (!result.ok) return res.status(400).json(result);

    logger.info(`Watchlist: added ${symbol}.`);
    res.json({ ok: true, watchlist: getWatchlist() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

function removeSymbol(req, res) {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    const result = removeFromWatchlist(symbol);
    if (!result.ok) return res.status(400).json(result);
    logger.info(`Watchlist: removed ${symbol}.`);
    res.json({ ok: true, watchlist: getWatchlist() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { getSettings, setStrategy, addSymbol, removeSymbol };
