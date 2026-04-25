const logger = require('./logger');

// Binance Spot API: 6000 weight per minute per IP
const LIMIT    = 6000;
const WARN_AT  = 4800; // log warning
const PAUSE_AT = 5500; // hold new requests until window resets

// Endpoint request weights (GET /api/v3/*)
const WEIGHT = {
  klines:      (limit) => limit <= 100 ? 2 : limit <= 500 ? 5 : 10,
  tickerPrice:  2,
  account:     20,
  exchangeInfo: 20,
  order:        1,
  openOrders:   6,
};

let _used    = 0;
let _resetAt = Date.now() + 60_000;

function _tick() {
  if (Date.now() >= _resetAt) {
    _used    = 0;
    _resetAt = Date.now() + 60_000;
  }
}

// Called by axios response interceptor — Binance tells us the authoritative value
function updateFromHeaders(headers) {
  const w = parseInt(headers['x-mbx-used-weight-1m'], 10);
  if (!isNaN(w)) {
    _used = w;
    if (w >= WARN_AT) logger.warn(`[rateLimit] Weight usage: ${w}/${LIMIT}`);
  }
}

// Call before each API request; awaits if we're close to the limit
async function throttle(weight = 0) {
  _tick();
  if (_used + weight >= PAUSE_AT) {
    const wait = Math.max(0, _resetAt - Date.now()) + 250;
    logger.warn(`[rateLimit] Throttling ${wait}ms — used ${_used}/${LIMIT}`);
    await new Promise(r => setTimeout(r, wait));
    _tick();
  }
  _used += weight; // optimistic pre-deduct; corrected on response
}

const getUsage = () => { _tick(); return { used: _used, limit: LIMIT }; };

module.exports = { updateFromHeaders, throttle, getUsage, WEIGHT };
