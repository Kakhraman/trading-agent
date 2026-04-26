const logger = require('./logger');

// Binance Spot: 6000 weight per minute per IP, per server
const LIMIT    = 6000;
const WARN_AT  = 4800;
const PAUSE_AT = 5500;

const WEIGHT = {
  klines:       (limit) => limit <= 100 ? 2 : limit <= 500 ? 5 : 10,
  tickerPrice:  2,
  account:      20,
  exchangeInfo: 20,
  order:        1,
  openOrders:   6,
};

// Each API server (market vs demo-private) has its own independent rate limit pool
function createRateLimiter(name) {
  let _used    = 0;
  let _resetAt = Date.now() + 60_000;

  function _tick() {
    if (Date.now() >= _resetAt) {
      _used    = 0;
      _resetAt = Date.now() + 60_000;
    }
  }

  function updateFromHeaders(headers) {
    const w = parseInt(headers['x-mbx-used-weight-1m'], 10);
    if (!isNaN(w)) {
      _used = w;
      if (w >= WARN_AT) logger.warn(`[rateLimit:${name}] Weight usage: ${w}/${LIMIT}`);
    }
  }

  async function throttle(weight = 0) {
    _tick();
    if (_used + weight >= PAUSE_AT) {
      const wait = Math.max(0, _resetAt - Date.now()) + 250;
      logger.warn(`[rateLimit:${name}] Throttling ${wait}ms — used ${_used}/${LIMIT}`);
      await new Promise(r => setTimeout(r, wait));
      _tick();
    }
    _used += weight;
  }

  const getUsage = () => { _tick(); return { used: _used, limit: LIMIT }; };

  return { updateFromHeaders, throttle, getUsage };
}

module.exports = { createRateLimiter, WEIGHT };
