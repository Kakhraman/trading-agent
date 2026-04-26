const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

const DEFAULT_WATCHLIST = ['BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','SOLUSDT','DOGEUSDT'];

const FILES = {
  trades:   path.join(DATA_DIR, 'trades.json'),
  balance:  path.join(DATA_DIR, 'balance.json'),
  logs:     path.join(DATA_DIR, 'logs.json'),
  state:    path.join(DATA_DIR, 'state.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
};

const FILE_DEFAULTS = {
  trades:   '[]',
  balance:  '[]',
  logs:     '[]',
  state:    JSON.stringify({ isRunning: false }),
  settings: JSON.stringify({ watchlist: DEFAULT_WATCHLIST, tick15mEnabled: true, tick5mEnabled: true }),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const [key, file] of Object.entries(FILES)) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, FILE_DEFAULTS[key]);
    }
  }
}

function read(key) {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(FILES[key], 'utf8'));
  } catch {
    return [];
  }
}

function write(key, data) {
  ensureDataDir();
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2));
}

function append(key, item) {
  const data = read(key);
  data.push(item);
  write(key, data);
}

function updateTrade(tradeId, updates) {
  const trades = read('trades');
  const idx = trades.findIndex((t) => t.id === tradeId);
  if (idx === -1) return null;
  trades[idx] = { ...trades[idx], ...updates };
  write('trades', trades);
  return trades[idx];
}

function getOpenTrade(symbol) {
  const trades = read('trades');
  return trades.find((t) => t.symbol === symbol && t.status === 'OPEN') || null;
}

module.exports = { read, write, append, updateTrade, getOpenTrade };
