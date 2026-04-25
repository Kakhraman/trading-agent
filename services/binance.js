const axios = require('axios');
const crypto = require('node:crypto');

const BASE_URL        = 'https://demo-api.binance.com/api'; // orders & account (Spot Demo)
const MARKET_BASE_URL = 'https://api.binance.com/api';      // klines & price (real data, no auth)
const API_KEY    = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;

function sign(queryString) {
  return crypto
    .createHmac('sha256', API_SECRET)
    .update(queryString)
    .digest('hex');
}

function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

// Public market data — uses real Binance for full historical kline depth
const marketClient = axios.create({
  baseURL: MARKET_BASE_URL,
  timeout: 10000,
});

// ── Exchange info cache (step sizes) ──────────────────────────────────────────

let _exchangeInfoCache = null;
let _exchangeInfoCacheAt = 0;
const EXCHANGE_INFO_TTL = 60 * 60 * 1000; // 1 hour

async function getExchangeInfo() {
  if (_exchangeInfoCache && Date.now() - _exchangeInfoCacheAt < EXCHANGE_INFO_TTL) {
    return _exchangeInfoCache;
  }
  const { data } = await marketClient.get('/v3/exchangeInfo');
  _exchangeInfoCache = data;
  _exchangeInfoCacheAt = Date.now();
  return data;
}

async function getStepSize(symbol) {
  const info = await getExchangeInfo();
  const sym = info.symbols.find(s => s.symbol === symbol);
  if (!sym) return null;
  const lot = sym.filters.find(f => f.filterType === 'LOT_SIZE');
  return lot ? parseFloat(lot.stepSize) : null;
}

function floorToStepSize(quantity, stepSize) {
  const precision = stepSize < 1 ? Math.round(-Math.log10(stepSize)) : 0;
  const factor = Math.pow(10, precision);
  return Math.floor(quantity * factor) / factor;
}

const privateClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'X-MBX-APIKEY': API_KEY },
});

// ── Public endpoints ──────────────────────────────────────────────────────────

/**
 * Fetch kline (candlestick) data.
 * @param {string} symbol  e.g. 'BTCUSDT'
 * @param {string} interval e.g. '15m'
 * @param {number} limit   number of candles (max 1000)
 */
async function getKlines(symbol, interval = '15m', limit = 1000) {
  const { data } = await marketClient.get('/v3/klines', {
    params: { symbol, interval, limit },
  });
  // Each element: [openTime, open, high, low, close, volume, ...]
  return data.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

async function getPrice(symbol) {
  const { data } = await marketClient.get('/v3/ticker/price', {
    params: { symbol },
  });
  return parseFloat(data.price);
}

// ── Private endpoints ─────────────────────────────────────────────────────────

async function getAccountInfo() {
  const timestamp = Date.now();
  const query = buildQuery({ timestamp });
  const signature = sign(query);
  const { data } = await privateClient.get(
    `/v3/account?${query}&signature=${signature}`
  );
  return data;
}

async function getBalance(asset = 'USDT') {
  const account = await getAccountInfo();
  const balance = account.balances.find((b) => b.asset === asset);
  return balance
    ? { free: parseFloat(balance.free), locked: parseFloat(balance.locked) }
    : { free: 0, locked: 0 };
}

/**
 * Place a market order.
 * @param {string} symbol
 * @param {'BUY'|'SELL'} side
 * @param {number} quantity  base asset quantity
 */
async function placeMarketOrder(symbol, side, quantity) {
  const stepSize = await getStepSize(symbol);
  const adjQty = stepSize ? floorToStepSize(quantity, stepSize) : quantity;
  const precision = stepSize && stepSize < 1 ? Math.round(-Math.log10(stepSize)) : 0;
  const qtyStr = adjQty.toFixed(precision);

  const timestamp = Date.now();
  const params = {
    symbol,
    side,
    type: 'MARKET',
    quantity: qtyStr,
    timestamp,
  };
  const query = buildQuery(params);
  const signature = sign(query);
  const { data } = await privateClient.post(
    `/v3/order?${query}&signature=${signature}`
  );
  return data;
}

/**
 * Fetch open orders for a symbol.
 */
async function getOpenOrders(symbol) {
  const timestamp = Date.now();
  const query = buildQuery({ symbol, timestamp });
  const signature = sign(query);
  const { data } = await privateClient.get(
    `/v3/openOrders?${query}&signature=${signature}`
  );
  return data;
}

module.exports = { getKlines, getPrice, getAccountInfo, getBalance, placeMarketOrder, getOpenOrders };
