const axios  = require('axios');
const crypto = require('node:crypto');
const fs     = require('fs');
const path   = require('path');

const { createRateLimiter, WEIGHT } = require('../utils/rateLimit');
const logger = require('../utils/logger');

const BASE_URL        = 'https://demo-api.binance.com/api'; // orders & account (Spot Demo)
const MARKET_BASE_URL = 'https://api.binance.com/api';      // klines & price (real data, no auth)
const API_KEY         = process.env.BINANCE_API_KEY;
const API_SECRET      = process.env.BINANCE_API_SECRET;

// Separate rate limit pools — market and demo-private are independent servers
const marketRL  = createRateLimiter('market');
const privateRL = createRateLimiter('demo');

// ── File-based klines cache ───────────────────────────────────────────────────

const CACHE_DIR = path.join(__dirname, '../data/cache');

const KLINES_TTL = { '15m': 14 * 60_000, '5m': 4 * 60_000 };
const KLINES_TTL_DEFAULT = 60_000;

function _cacheFile(symbol, interval) {
  return path.join(CACHE_DIR, `klines_${symbol}_${interval}.json`);
}

function _readKlinesCache(symbol, interval) {
  const ttl = KLINES_TTL[interval] ?? KLINES_TTL_DEFAULT;
  try {
    const rec = JSON.parse(fs.readFileSync(_cacheFile(symbol, interval), 'utf8'));
    if (rec && Date.now() - rec.cachedAt < ttl) return rec.data;
  } catch { /* cache miss */ }
  return null;
}

function _writeKlinesCache(symbol, interval, data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(_cacheFile(symbol, interval), JSON.stringify({ cachedAt: Date.now(), data }));
  } catch (e) {
    logger.warn(`[klineCache] write failed for ${symbol}/${interval}: ${e.message}`);
  }
}

// ── Axios helpers ─────────────────────────────────────────────────────────────

function sign(queryString) {
  return crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
}

function buildQuery(params) {
  return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

function _addInterceptors(client, rl) {
  client.interceptors.response.use(
    res => {
      rl.updateFromHeaders(res.headers);
      return res;
    },
    async err => {
      const status = err.response?.status;
      // Binance 429 = soft rate limit, 418 = IP banned — honour Retry-After
      if ((status === 429 || status === 418) && !err.config._rlRetried) {
        err.config._rlRetried = true;
        const after = parseInt(err.response.headers['retry-after'] || '61', 10);
        logger.warn(`[binance] HTTP ${status} — waiting ${after}s then retrying`);
        await new Promise(r => setTimeout(r, after * 1000));
        return client.request(err.config);
      }
      return Promise.reject(err);
    }
  );
}

const marketClient = axios.create({ baseURL: MARKET_BASE_URL, timeout: 15000 });
const privateClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'X-MBX-APIKEY': API_KEY },
});

_addInterceptors(marketClient, marketRL);
_addInterceptors(privateClient, privateRL);

// ── Exchange info (memory cache, 1h TTL) ─────────────────────────────────────

let _exchangeInfoCache = null, _exchangeInfoCacheAt = 0;
let _demoExchangeInfoCache = null, _demoExchangeInfoCacheAt = 0;
const EXCHANGE_INFO_TTL = 60 * 60_000;

async function getExchangeInfo() {
  if (_exchangeInfoCache && Date.now() - _exchangeInfoCacheAt < EXCHANGE_INFO_TTL) {
    return _exchangeInfoCache;
  }
  await marketRL.throttle(WEIGHT.exchangeInfo);
  const { data } = await marketClient.get('/v3/exchangeInfo');
  _exchangeInfoCache    = data;
  _exchangeInfoCacheAt  = Date.now();
  return data;
}

async function getStepSize(symbol) {
  const info = await getExchangeInfo();
  const sym  = info.symbols.find(s => s.symbol === symbol);
  if (!sym) return null;
  const lot  = sym.filters.find(f => f.filterType === 'LOT_SIZE');
  return lot ? parseFloat(lot.stepSize) : null;
}

function floorToStepSize(quantity, stepSize) {
  if (stepSize >= 1) {
    return Math.floor(quantity / stepSize) * stepSize;
  }
  const precision = Math.round(-Math.log10(stepSize));
  const factor    = Math.pow(10, precision);
  return Math.floor(quantity * factor) / factor;
}

// ── Public endpoints ──────────────────────────────────────────────────────────

async function getKlines(symbol, interval = '15m', limit = 1000) {
  const cached = _readKlinesCache(symbol, interval);
  if (cached) return cached;

  await marketRL.throttle(WEIGHT.klines(limit));
  const { data } = await marketClient.get('/v3/klines', {
    params: { symbol, interval, limit },
  });
  const parsed = data.map(k => ({
    openTime:  k[0],
    open:      parseFloat(k[1]),
    high:      parseFloat(k[2]),
    low:       parseFloat(k[3]),
    close:     parseFloat(k[4]),
    volume:    parseFloat(k[5]),
    closeTime: k[6],
  }));
  _writeKlinesCache(symbol, interval, parsed);
  return parsed;
}

async function getPrice(symbol) {
  await marketRL.throttle(WEIGHT.tickerPrice);
  const { data } = await marketClient.get('/v3/ticker/price', { params: { symbol } });
  return parseFloat(data.price);
}

// ── Private endpoints (Spot Demo — demo-api.binance.com) ─────────────────────

async function getAccountInfo() {
  await privateRL.throttle(WEIGHT.account);
  const timestamp = Date.now();
  const query     = buildQuery({ timestamp, recvWindow: 5000 });
  const signature = sign(query);
  const { data }  = await privateClient.get(`/v3/account?${query}&signature=${signature}`);
  return data;
}

async function getBalance(asset = 'USDT') {
  const account = await getAccountInfo();
  const balance = account.balances.find(b => b.asset === asset);
  return balance
    ? { free: parseFloat(balance.free), locked: parseFloat(balance.locked) }
    : { free: 0, locked: 0 };
}

async function getAllBalances() {
  const account = await getAccountInfo();

  // Lazily load demo step sizes for dust filtering
  if (!_demoExchangeInfoCache || Date.now() - _demoExchangeInfoCacheAt >= EXCHANGE_INFO_TTL) {
    try {
      await privateRL.throttle(WEIGHT.exchangeInfo);
      const { data } = await privateClient.get('/v3/exchangeInfo');
      _demoExchangeInfoCache   = data;
      _demoExchangeInfoCacheAt = Date.now();
    } catch { /* skip filter if unavailable */ }
  }

  const result = { usdt: { free: 0, locked: 0 }, assets: [] };
  for (const b of account.balances) {
    const free   = parseFloat(b.free);
    const locked = parseFloat(b.locked);
    if (b.asset === 'USDT') {
      result.usdt = { free, locked };
    } else if (free + locked > 0) {
      // Skip dust: if free qty rounds to zero it can't be sold
      if (_demoExchangeInfoCache) {
        const sym  = _demoExchangeInfoCache.symbols.find(s => s.symbol === b.asset + 'USDT');
        const lot  = sym?.filters.find(f => f.filterType === 'LOT_SIZE');
        const step = lot ? parseFloat(lot.stepSize) : null;
        if (step && floorToStepSize(free, step) <= 0) continue;
      }
      result.assets.push({ asset: b.asset, free, locked });
    }
  }
  return result;
}

async function _getDemoStepSize(symbol) {
  try {
    if (!_demoExchangeInfoCache || Date.now() - _demoExchangeInfoCacheAt >= EXCHANGE_INFO_TTL) {
      await privateRL.throttle(WEIGHT.exchangeInfo);
      const { data } = await privateClient.get('/v3/exchangeInfo');
      _demoExchangeInfoCache   = data;
      _demoExchangeInfoCacheAt = Date.now();
    }
    const sym = _demoExchangeInfoCache.symbols.find(s => s.symbol === symbol);
    const lot = sym?.filters.find(f => f.filterType === 'LOT_SIZE');
    return lot ? parseFloat(lot.stepSize) : null;
  } catch {
    return getStepSize(symbol); // fall back to real exchange info
  }
}

async function placeMarketOrder(symbol, side, quantity) {
  const stepSize  = await _getDemoStepSize(symbol);
  const adjQty    = stepSize ? floorToStepSize(quantity, stepSize) : quantity;
  const precision = stepSize && stepSize < 1 ? Math.round(-Math.log10(stepSize)) : 0;
  const qtyStr    = adjQty.toFixed(precision);

  logger.info(`[${symbol}] ${side} qty=${qtyStr} (raw=${quantity}, stepSize=${stepSize})`);

  if (parseFloat(qtyStr) <= 0) {
    throw new Error(`DUST: ${symbol} qty=${quantity} rounds to zero with stepSize=${stepSize} — cannot sell`);
  }

  const timestamp = Date.now();
  const params    = { symbol, side, type: 'MARKET', quantity: qtyStr, timestamp, recvWindow: 5000 };
  const query     = buildQuery(params);
  const signature = sign(query);
  await privateRL.throttle(WEIGHT.order);
  const { data } = await privateClient.post(`/v3/order?${query}&signature=${signature}`);
  return data;
}

async function getOpenOrders(symbol) {
  await privateRL.throttle(WEIGHT.openOrders);
  const timestamp = Date.now();
  const query     = buildQuery({ symbol, timestamp, recvWindow: 5000 });
  const signature = sign(query);
  const { data }  = await privateClient.get(`/v3/openOrders?${query}&signature=${signature}`);
  return data;
}

module.exports = {
  getKlines, getPrice,
  getExchangeInfo, getAccountInfo, getBalance, getAllBalances,
  placeMarketOrder, getOpenOrders,
};
