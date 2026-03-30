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

- **`services/bot.js`** — Core trading logic. Contains `tick()` (15m trend strategy) and `tick5m()` (5m bounce strategy). Uses per-symbol locks to prevent concurrent execution on the same pair. Watchlist is hardcoded (19 USDT pairs).
- **`services/binance.js`** — Binance Testnet REST client. All private calls are HMAC-SHA256 signed. Base URL: `https://testnet.binance.vision/api`.
- **`services/indicators.js`** — EMA and RSI calculations. `computeIndicators()` returns EMA50/EMA200/RSI14 for the 15m strategy; `computeBounceIndicators()` returns EMA9/EMA21/RSI14 for the 5m strategy.
- **`services/telegram.js`** — Sends HTML-formatted trade notifications and error alerts.

### Strategy parameters

**15m Trend:** EMA50/EMA200/RSI14 · Buy: EMA50>EMA200, RSI<30, price within 0.5% of EMA50 · Sell: EMA50<EMA200, RSI>70, price within 0.5% · SL: −2%, TP: +3%, size: 5% of USDT balance

**5m Bounce:** EMA9/EMA21/RSI14 · Buy: EMA9>EMA21, RSI<35, price within 0.3% of EMA9 · Sell: EMA9<EMA21, RSI>65, price within 0.3% · SL: −1%, TP: +1.5%, size: 3% of USDT balance

### Data persistence

`utils/db.js` reads/writes JSON files in `data/`. Key functions: `read(key)`, `write(key, data)`, `append(key, item)`, `updateTrade(id, updates)`, `getOpenTrade(symbol)`. The `data/` directory is gitignored.

### API endpoints

```
GET  /api/dashboard        Bot status & metrics
GET  /api/watchlist        All symbols with cached indicators (30s cache)
GET  /api/balance-history  Balance timeline
GET  /api/trades           All trades (newest first)
GET  /api/trades/open      Open positions only
GET  /api/logs             System logs (limit 200)
POST /api/bot/tick         Manually trigger 15m tick
```

## Environment

Copy `.env.example` to `.env` and fill in credentials:

```
BINANCE_API_KEY=       # Binance Spot Testnet key
BINANCE_API_SECRET=    # Binance Spot Testnet secret
TELEGRAM_BOT_TOKEN=    # Telegram bot token (optional)
TELEGRAM_CHAT_ID=      # Telegram chat ID (optional)
PORT=3000
```

Testnet credentials only — the base URL is hardcoded to `testnet.binance.vision`, not production Binance.
