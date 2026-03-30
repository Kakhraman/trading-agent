const axios = require('axios');
const crypto = require('node:crypto');

const BASE_URL = 'https://testnet.binance.vision/api';
const API_KEY = process.env.BINANCE_API_KEY;
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

const publicClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

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
async function getKlines(symbol, interval = '15m', limit = 250) {
  const { data } = await publicClient.get('/v3/klines', {
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
  const { data } = await publicClient.get('/v3/ticker/price', {
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
  const timestamp = Date.now();
  const params = {
    symbol,
    side,
    type: 'MARKET',
    quantity: quantity.toFixed(6),
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
