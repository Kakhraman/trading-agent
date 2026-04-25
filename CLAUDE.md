# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start      # Production: node server.js
npm run dev    # Development: nodemon server.js (auto-restart on changes)
```

No test suite is configured. No lint tooling is configured.

## Architecture

**Entry point:** `server.js` — loads env, registers two cron jobs (15m at :00/:15/:30/:45, 5m every 5 min), mounts API routes, serves the SPA, and fires an initial tick on startup.

### Layer breakdown

| Layer | Path | Role |
|---|---|---|
| Routes | `routes/api.js` | Maps HTTP endpoints to controllers |
| Controllers | `controllers/` | Thin request/response handlers |
| Services | `services/` | All business logic |
| Utils | `utils/` | Persistence (`db.js`) and logging (`logger.js`) |
| Frontend | `public/index.html` | Single-file dashboard SPA |
| Data | `data/*.json` | Runtime state — NOT committed |

### Services

- **`services/bot.js`** — Core trading logic. Contains `tick()` (15m trend strategy) and `tick5m()` (5m bounce strategy). Uses per-symbol locks to prevent concurrent execution on the same pair. Watchlist is loaded from `data/settings.json` (dynamic, user-managed).
- **`services/binance.js`** — Binance Spot Demo REST client. All private calls are HMAC-SHA256 signed. Base URL: `https://demo-api.binance.com/api`. Public market data (klines, prices, exchange info) uses `https://api.binance.com/api`.
- **`services/indicators.js`** — EMA and RSI calculations. `computeIndicators()` returns EMA50/EMA200/RSI14 for the 15m strategy; `computeBounceIndicators()` returns EMA9/EMA21/RSI14 for the 5m strategy.
- **`services/telegram.js`** — Sends HTML-formatted trade notifications and error alerts.

### Strategy parameters

**15m Trend:** EMA50/EMA200/RSI14 · Buy: EMA50>EMA200, RSI<45, price within 1.5% of EMA50 · Sell: EMA50<EMA200, RSI>55, price within 1.5% · SL: −0.5%, TP: +1%, size: 5% of USDT balance

**5m Bounce:** EMA9/EMA21/RSI14 · Buy: RSI<45, price within 1.5% of EMA9 · Sell: RSI>55, price within 1.5% · SL: −0.5%, TP: +1%, size: 5% of USDT balance

Both strategies can be independently enabled/disabled at runtime via the Settings page or `POST /api/settings/strategy`.

### Data persistence

`utils/db.js` reads/writes JSON files in `data/`. Key functions: `read(key)`, `write(key, data)`, `append(key, item)`, `updateTrade(id, updates)`, `getOpenTrade(symbol)`. The `data/` directory is gitignored.

| File | Contents |
|---|---|
| `data/state.json` | `{ isRunning }` — bot on/off state |
| `data/settings.json` | `{ watchlist, tick15mEnabled, tick5mEnabled }` — user config |
| `data/trades.json` | All trade records |
| `data/balance.json` | Balance history timeline |
| `data/logs.json` | System log entries |

### Controllers

- **`controllers/bot.js`** — Start/stop bot, close trades
- **`controllers/dashboard.js`** — Dashboard status, watchlist snapshot, balance history
- **`controllers/trades.js`** — Trade history queries
- **`controllers/logs.js`** — Log queries
- **`controllers/settings.js`** — Settings CRUD: strategy toggles, watchlist add/remove (validates symbols against Binance exchange info)

### API endpoints

```
GET    /api/dashboard                  Bot status & metrics
GET    /api/watchlist                  All symbols with cached indicators (30s cache)
GET    /api/balance-history            Balance timeline
GET    /api/trades                     All trades (newest first)
GET    /api/trades/open                Open positions only
GET    /api/logs                       System logs (limit 200)
POST   /api/bot/start                  Start the bot
POST   /api/bot/stop                   Stop the bot
POST   /api/trades/close               Close trades by IDs  { ids: [...] }
POST   /api/trades/close-all           Close all open trades

GET    /api/settings                   Get settings (watchlist + strategy flags)
POST   /api/settings/strategy          Set strategy enabled  { strategy: "15m"|"5m", enabled: bool }
POST   /api/settings/watchlist         Add symbol to watchlist  { symbol: "BTCUSDT" }
DELETE /api/settings/watchlist/:symbol Remove symbol from watchlist
```

### Dashboard pages

| Page | Description |
|---|---|
| Dashboard | Balance cards, open positions, PnL summary |
| Watchlist | Live indicators (EMA/RSI/signals) for all tracked pairs |
| Trades | Full trade history with filters and sorting |
| Logs | System log viewer with level/search filter |
| Settings | Strategy enable/disable toggles; watchlist CRUD (add/remove symbols, validated via Binance API) |

## Environment

Copy `.env.example` to `.env` and fill in credentials:

```
BINANCE_API_KEY=       # Binance Spot Demo API key
BINANCE_API_SECRET=    # Binance Spot Demo API secret
TELEGRAM_BOT_TOKEN=    # Telegram bot token (optional)
TELEGRAM_CHAT_ID=      # Telegram chat ID (optional)
PORT=3000
```

Spot Demo credentials only — the base URL is hardcoded to `demo-api.binance.com`, not production Binance.
