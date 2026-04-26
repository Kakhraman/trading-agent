# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start      # Production: node server.js
npm run dev    # Development: nodemon server.js (auto-restart on changes)
```

No test suite, no lint tooling. Manual verification with `npm run dev` is the only check. Default port is `5000`; override with `PORT=` in `.env`.

## Architecture

**Entry point:** `server.js` — loads env, registers two cron jobs (`0 */15 * * * *` and `0 */5 * * * *`), mounts `/api`, serves the SPA, and fires an initial `tick()` on bot start via the API (not on process start).

### Layer breakdown

| Layer | Path | Role |
|---|---|---|
| Routes | `routes/api.js` | Maps HTTP endpoints to controllers |
| Controllers | `controllers/` | Thin request/response handlers |
| Services | `services/` | All business logic |
| Utils | `utils/` | Persistence (`db.js`), logging (`logger.js`), rate limiting (`rateLimit.js`) |
| Frontend | `public/` | AngularJS SPA — shell in `index.html`, route views in `public/views/`, JS in `public/assets/js/` |
| Data | `data/*.json` | Runtime state — NOT committed |

### Critical cross-cutting behaviors

**In-memory state vs disk:** `services/bot.js` loads `data/settings.json` and `data/state.json` into module-level variables at startup (`_watchlist`, `_isRunning`, `_tick15mEnabled`, `_tick5mEnabled`). All reads use these variables; writes flush both the variable and the file. Never read settings directly from `db.js` — always use the exported getters.

**Per-symbol lock:** A `running{}` object in `bot.js` prevents concurrent ticks on the same symbol. Both `tickSymbol` and `tick5mSymbol` skip and warn if the symbol is already locked. Manual close also skips locked symbols.

**Two Axios client pools:** `services/binance.js` uses separate clients and rate limiters for market data (`api.binance.com`) and private/demo orders (`demo-api.binance.com`). Both share the same 6000 weight/min budget tracked in `utils/rateLimit.js`, but independently via `marketRL` and `privateRL`. Rate limit headers from responses update the local counter.

**Klines file cache:** Klines are cached to `data/cache/klines_<symbol>_<interval>.json` with TTL (15m interval: 14 min, 5m: 4 min, others: 1 min). Cache is read before any API call; stale or missing cache triggers a fresh fetch.

**Dashboard holdings merge:** `getStatus()` calls `getAllBalances()` once to get USDT free balance AND all non-zero non-USDT Binance account balances. Bot-tracked open trades are built from `data/trades.json`; additional Binance account balances not covered by a bot trade are appended to `cryptoAssets` with `external: true`. External assets are displayed in the Holdings table with an "External" badge and their checkboxes disabled (can't be closed via the bot).

**Async close pattern:** `POST /api/trades/close` and `POST /api/trades/close-all` respond immediately and run the close in the background via `.catch()`. The trade IDs come from Binance `orderId` (stored as strings).

### Services

- **`services/bot.js`** — Core trading logic. `tick()` runs 15m strategy; `tick5m()` runs 5m strategy. Both iterate `_watchlist` sequentially with 300 ms between symbols. `getStatus()` is the dashboard data source — merges local trade records with live Binance account balances.
- **`services/binance.js`** — Binance REST client. Public market data uses `api.binance.com`; all authenticated calls use `demo-api.binance.com` (Spot Demo, HMAC-SHA256 signed).
- **`services/indicators.js`** — Pure EMA (exponential) and RSI (Wilder smoothing) calculations. `computeIndicators()` → EMA50/EMA200/RSI14 for 15m; `computeBounceIndicators()` → EMA9/EMA21/RSI14 for 5m.
- **`services/telegram.js`** — HTML-formatted trade and error notifications.

### Strategy parameters (constants in `bot.js`)

**15m Trend:** EMA50/EMA200/RSI14 · Buy: EMA50>EMA200, RSI<45, price within 1.5% of EMA50 · Sell: EMA50<EMA200, RSI>55, price within 1.5% · SL: −0.5%, TP: +1%, size: 5% of USDT balance

**5m Bounce:** EMA9/EMA21/RSI14 · Buy: RSI<45, price within 1.5% of EMA9 · Sell: RSI>55, price within 1.5% · SL: −0.5%, TP: +1%, size: 5% of USDT balance

Both strategies can be independently enabled/disabled at runtime.

### Frontend

AngularJS 1.x SPA with HTML5 routing. All JS is in `public/assets/js/`:
- `app.js` — module config, routes, filters (`appMoney`, `appSigned`, `appNumber`, `appDateTime`, `strategyName`). Dashboard auto-refreshes every `APP_REFRESH_MS` (15 s).
- `services.js` — `ApiService` (all HTTP calls) and `ToastService`. All API responses are normalized; `ok: false` body → rejected promise.
- `controllers.js` — one controller per view, `controllerAs: 'vm'`.

Route templates in `public/views/` match the routes: `dashboard.html`, `watchlist.html`, `trades.html`, `logs.html`, `settings.html`. Vendor assets are in `public/assets/vendor/` — do not hand-edit minified files.

### Data persistence

`utils/db.js` reads/writes JSON files in `data/`. Key functions: `read(key)`, `write(key, data)`, `append(key, item)`, `updateTrade(id, updates)`, `getOpenTrade(symbol)`. The default watchlist (used when `data/settings.json` doesn't exist) is defined in `db.js`.

| File | Contents |
|---|---|
| `data/state.json` | `{ isRunning }` |
| `data/settings.json` | `{ watchlist, tick15mEnabled, tick5mEnabled }` |
| `data/trades.json` | All trade records |
| `data/balance.json` | Balance timeline (appended on every buy/sell) |
| `data/logs.json` | System log entries |
| `data/cache/` | Klines file cache (auto-created) |

### API endpoints

```
GET    /api/dashboard                  Bot status, balances, open positions (live Binance data)
GET    /api/watchlist                  All symbols with cached indicators (30 s cache)
GET    /api/balance-history            Balance timeline
GET    /api/trades                     All trades (newest first)
GET    /api/trades/open                Open positions only
GET    /api/logs                       System logs (limit 200)
POST   /api/bot/start                  Start bot + fire initial tick
POST   /api/bot/stop                   Stop bot
POST   /api/trades/close               Close trades by IDs  { ids: [...] }
POST   /api/trades/close-all           Close all open trades
GET    /api/settings                   watchlist + strategy flags
POST   /api/settings/strategy          { strategy: "15m"|"5m", enabled: bool }
POST   /api/settings/watchlist         { symbol: "BTCUSDT" } — validated against Binance exchange info
DELETE /api/settings/watchlist/:symbol Remove symbol
```

## Environment

Copy `.env.example` to `.env`:

```
BINANCE_API_KEY=       # Binance Spot Demo API key
BINANCE_API_SECRET=    # Binance Spot Demo API secret
TELEGRAM_BOT_TOKEN=    # Optional
TELEGRAM_CHAT_ID=      # Optional
PORT=3000
```

Base URL is hardcoded to `demo-api.binance.com` — Spot Demo only, not production Binance.
