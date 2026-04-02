const { getKlines, getPrice, getBalance, placeMarketOrder } = require('./binance');
const { computeIndicators, computeBounceIndicators, isNear } = require('./indicators');
const { notifyBuy, notifySell, notifyError } = require('./telegram');
const { append, updateTrade, getOpenTrade, read } = require('../utils/db');
const logger = require('../utils/logger');

// ── Watchlist ─────────────────────────────────────────────────────────────────
const WATCHLIST = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
  'TRXUSDT',
  'DOGEUSDT',
  'BCHUSDT',
  'ADAUSDT',
  'LINKUSDT',
  // 'MONADUSDT' — not listed on Binance Testnet
  // 'HYPEUSDT'  — not listed on Binance Testnet
  'TONUSDT',
  'SUIUSDT',
  'AVAXUSDT',
  'LTCUSDT',
  'ASTERUSDT',
  'AAVEUSDT',
  'FILUSDT',
  'ZROUSDT',
];

// ── 15m trend strategy config ─────────────────────────────────────────────────
const TREND_SL_PCT       = 0.01;  // 1 %
const TREND_TP_PCT       = 0.005; // 0.5 %
const TREND_CAPITAL_PCT  = 0.05;  // 5 %
const TREND_EMA_TOL      = 1.5;   // price within 1.5 % of EMA50

// ── 5m bounce strategy config ─────────────────────────────────────────────────
const BOUNCE_SL_PCT       = 0.005; // 0.5 %
const BOUNCE_TP_PCT       = 0.005; // 0.5 %
const BOUNCE_CAPITAL_PCT  = 0.05;  // 5 %
const BOUNCE_EMA_TOL      = 1.5;   // price within 1.5 % of EMA9
const BOUNCE_RSI_BUY      = 45;    // RSI < 45 → oversold on 5m
const BOUNCE_RSI_SELL     = 55;    // RSI > 55 → overbought on 5m

// Per-symbol lock — prevents concurrent ticks on the same pair
const running = {};

// ── Bot running state ─────────────────────────────────────────────────────────
let _isRunning = false;
const getBotRunning = () => _isRunning;
const startBot     = () => { _isRunning = true;  logger.info('[bot] Started.'); };
const stopBot      = () => { _isRunning = false; logger.info('[bot] Stopped.'); };

// ── Signal evaluators ─────────────────────────────────────────────────────────

function evaluateTrendSignal({ currentPrice, ema50, ema200, rsi14 }) {
  const nearEma50 = isNear(currentPrice, ema50, TREND_EMA_TOL);
  // BUY: uptrend + RSI dip below 45 + price near EMA50
  if (ema50 > ema200 && rsi14 < 45 && nearEma50) return 'BUY';
  // SELL signal on open trade: downtrend + RSI spike above 55 + price near EMA50
  if (ema50 < ema200 && rsi14 > 55 && nearEma50) return 'SELL';
  return 'HOLD';
}

function evaluateBounceSignal({ currentPrice, ema9, ema21, rsi14 }) {
  const nearEma9 = isNear(currentPrice, ema9, BOUNCE_EMA_TOL);
  // BUY bounce: RSI oversold + price near EMA9 (no trend direction filter — catch any bounce)
  if (rsi14 < BOUNCE_RSI_BUY  && nearEma9) return 'BUY';
  // SELL bounce: RSI overbought + price near EMA9
  if (rsi14 > BOUNCE_RSI_SELL && nearEma9) return 'SELL';
  return 'HOLD';
}

// ── SL / TP check — uses the levels stored on the trade record ────────────────

function shouldExitTrade(trade, currentPrice) {
  if (currentPrice <= trade.stopLoss)   return { exit: true, reason: 'STOP_LOSS' };
  if (currentPrice >= trade.takeProfit) return { exit: true, reason: 'TAKE_PROFIT' };
  return { exit: false, reason: null };
}

// ── Shared order helpers ──────────────────────────────────────────────────────

function calcExecutedPrice(order, fallback) {
  return order.fills?.length
    ? order.fills.reduce((s, f) => s + parseFloat(f.price) * parseFloat(f.qty), 0) /
      order.fills.reduce((s, f) => s + parseFloat(f.qty), 0)
    : fallback;
}

async function openTrade(symbol, price, opts) {
  const {
    slPct      = TREND_SL_PCT,
    tpPct      = TREND_TP_PCT,
    capitalPct = TREND_CAPITAL_PCT,
    strategy   = '15m',
    indicators = {},
  } = opts;

  const { free: usdtBalance } = await getBalance('USDT');
  const quantity = (usdtBalance * capitalPct) / price;

  logger.info(`[${symbol}][${strategy}] Opening BUY @ ${price.toFixed(4)}, qty=${quantity.toFixed(6)}, SL=${(slPct*100).toFixed(1)}%, TP=${(tpPct*100).toFixed(1)}%`);

  const order = await placeMarketOrder(symbol, 'BUY', quantity);
  const executedPrice = calcExecutedPrice(order, price);
  const executedQty   = parseFloat(order.executedQty);

  const trade = {
    id:         order.orderId.toString(),
    symbol,
    strategy,
    side:       'BUY',
    status:     'OPEN',
    entryTime:  new Date().toISOString(),
    entryPrice: executedPrice,
    quantity:   executedQty,
    stopLoss:   executedPrice * (1 - slPct),
    takeProfit: executedPrice * (1 + tpPct),
    indicators,
  };

  append('trades', trade);
  await notifyBuy({ symbol, price: executedPrice, quantity: executedQty, tradeId: trade.id, strategy });
  logger.info(`[${symbol}][${strategy}] Trade opened id=${trade.id}`);

  const { free: newUsdt } = await getBalance('USDT');
  const base = symbol.replace('USDT', '');
  const { free: baseBalance } = await getBalance(base).catch(() => ({ free: 0 }));
  append('balance', { timestamp: new Date().toISOString(), USDT: newUsdt, [base]: baseBalance, event: 'BUY', symbol, strategy });
}

async function closeTrade(trade, price, reason) {
  logger.info(`[${trade.symbol}][${trade.strategy || '15m'}] Closing id=${trade.id}, reason=${reason} @ ${price.toFixed(4)}`);

  const order = await placeMarketOrder(trade.symbol, 'SELL', trade.quantity);
  const executedPrice = calcExecutedPrice(order, price);
  const pnl = (executedPrice - trade.entryPrice) * trade.quantity;

  updateTrade(trade.id, {
    status:      'CLOSED',
    exitTime:    new Date().toISOString(),
    exitPrice:   executedPrice,
    pnl,
    closeReason: reason,
  });

  await notifySell({ symbol: trade.symbol, price: executedPrice, quantity: trade.quantity, pnl, tradeId: trade.id });
  logger.info(`[${trade.symbol}][${trade.strategy || '15m'}] Closed id=${trade.id}, PnL=${pnl.toFixed(4)} USDT`);

  const { free: newUsdt } = await getBalance('USDT');
  const base = trade.symbol.replace('USDT', '');
  const { free: baseBalance } = await getBalance(base).catch(() => ({ free: 0 }));
  append('balance', { timestamp: new Date().toISOString(), USDT: newUsdt, [base]: baseBalance, event: 'SELL', symbol: trade.symbol, pnl });
}

// ── 15m trend tick ────────────────────────────────────────────────────────────

async function tickSymbol(symbol) {
  if (running[symbol]) {
    logger.warn(`[${symbol}][15m] Symbol locked — skipping.`);
    return;
  }
  running[symbol] = true;
  try {
    const klines    = await getKlines(symbol, '15m', 250);
    const ind       = computeIndicators(klines);
    const { currentPrice, ema50, ema200, rsi14 } = ind;

    logger.info(`[${symbol}][15m] Price=${currentPrice.toFixed(4)} EMA50=${ema50.toFixed(4)} EMA200=${ema200.toFixed(4)} RSI=${rsi14.toFixed(2)}`);

    const activeTrade = getOpenTrade(symbol);
    if (activeTrade) {
      const { exit, reason } = shouldExitTrade(activeTrade, currentPrice);
      if (exit) { await closeTrade(activeTrade, currentPrice, reason); return; }
      if (evaluateTrendSignal(ind) === 'SELL') { await closeTrade(activeTrade, currentPrice, 'SIGNAL'); return; }
      const upnl = (currentPrice - activeTrade.entryPrice) * activeTrade.quantity;
      logger.info(`[${symbol}][15m] Holding id=${activeTrade.id}, uPnL=${upnl.toFixed(4)} USDT`);
    } else {
      const signal = evaluateTrendSignal(ind);
      logger.info(`[${symbol}][15m] Signal: ${signal}`);
      if (signal === 'BUY') {
        await openTrade(symbol, currentPrice, {
          slPct: TREND_SL_PCT, tpPct: TREND_TP_PCT, capitalPct: TREND_CAPITAL_PCT,
          strategy: '15m', indicators: { ema50, ema200, rsi14 },
        });
      }
    }
  } catch (err) {
    const msg = err.response?.data?.msg || err.message;
    logger.error(`[${symbol}][15m] Tick error: ${msg}`);
    await notifyError(`bot.trend.${symbol}`, msg);
  } finally {
    running[symbol] = false;
  }
}

// ── 5m bounce tick ────────────────────────────────────────────────────────────

async function tick5mSymbol(symbol) {
  if (running[symbol]) {
    logger.warn(`[${symbol}][5m] Symbol locked — skipping bounce check.`);
    return;
  }
  running[symbol] = true;
  try {
    const klines    = await getKlines(symbol, '5m', 100);
    const ind       = computeBounceIndicators(klines);
    const { currentPrice, ema9, ema21, rsi14 } = ind;

    logger.info(`[${symbol}][5m] Price=${currentPrice.toFixed(4)} EMA9=${ema9.toFixed(4)} EMA21=${ema21.toFixed(4)} RSI=${rsi14.toFixed(2)}`);

    const activeTrade = getOpenTrade(symbol);
    if (activeTrade) {
      const { exit, reason } = shouldExitTrade(activeTrade, currentPrice);
      if (exit) { await closeTrade(activeTrade, currentPrice, reason); return; }
      if (evaluateBounceSignal(ind) === 'SELL') { await closeTrade(activeTrade, currentPrice, 'SIGNAL'); return; }
      const upnl = (currentPrice - activeTrade.entryPrice) * activeTrade.quantity;
      logger.info(`[${symbol}][5m] Holding id=${activeTrade.id}, uPnL=${upnl.toFixed(4)} USDT`);
    } else {
      const signal = evaluateBounceSignal(ind);
      logger.info(`[${symbol}][5m] Bounce signal: ${signal}`);
      if (signal === 'BUY') {
        await openTrade(symbol, currentPrice, {
          slPct: BOUNCE_SL_PCT, tpPct: BOUNCE_TP_PCT, capitalPct: BOUNCE_CAPITAL_PCT,
          strategy: '5m', indicators: { ema9, ema21, rsi14 },
        });
      }
    }
  } catch (err) {
    const msg = err.response?.data?.msg || err.message;
    logger.error(`[${symbol}][5m] Bounce tick error: ${msg}`);
    await notifyError(`bot.bounce.${symbol}`, msg);
  } finally {
    running[symbol] = false;
  }
}

// ── Full-watchlist tick runners ───────────────────────────────────────────────

async function tick() {
  logger.info(`[15m] Tick started — ${WATCHLIST.length} symbols.`);
  for (const symbol of WATCHLIST) {
    await tickSymbol(symbol);
    await new Promise(r => setTimeout(r, 300));
  }
  logger.info('[15m] Tick finished.');
}

async function tick5m() {
  logger.info(`[5m] Bounce tick started — ${WATCHLIST.length} symbols.`);
  for (const symbol of WATCHLIST) {
    await tick5mSymbol(symbol);
    await new Promise(r => setTimeout(r, 300));
  }
  logger.info('[5m] Bounce tick finished.');
}

// ── Dashboard status ──────────────────────────────────────────────────────────

async function getStatus() {
  const trades = read('trades');

  const openTrades   = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const realizedPnl  = closedTrades.reduce((s, t) => s + (typeof t.pnl === 'number' ? t.pnl : 0), 0);
  const winRate      = closedTrades.length > 0
    ? (closedTrades.filter(t => typeof t.pnl === 'number' && t.pnl > 0).length / closedTrades.length) * 100
    : null;

  const { free: usdtBalance } = await getBalance('USDT').catch(() => ({ free: 0 }));

  const enrichedOpenTrades = await Promise.all(
    openTrades.map(async t => {
      try {
        const price         = await getPrice(t.symbol);
        const positionValue = price * t.quantity;
        const unrealizedPnl = (price - t.entryPrice) * t.quantity;
        return { ...t, currentPrice: price, positionValue, unrealizedPnl };
      } catch {
        return { ...t, currentPrice: null, positionValue: null, unrealizedPnl: null };
      }
    })
  );

  const cryptoValue    = enrichedOpenTrades.reduce((s, t) => s + (t.positionValue  ?? 0), 0);
  const unrealizedPnl  = enrichedOpenTrades.reduce((s, t) => s + (t.unrealizedPnl  ?? 0), 0);
  const totalBalance   = usdtBalance + cryptoValue;
  const totalPnl       = realizedPnl + unrealizedPnl;

  const cryptoAssets = enrichedOpenTrades.map(t => ({
    tradeId:      t.id,
    asset:        t.symbol.replace('USDT', ''),
    symbol:       t.symbol,
    quantity:     t.quantity,
    currentPrice: t.currentPrice,
    valueUsdt:    t.positionValue,
  }));

  return {
    isRunning:     _isRunning,
    watchlist:     WATCHLIST,
    totalBalance,
    usdtBalance,
    cryptoValue,
    cryptoAssets,
    openTrades:    enrichedOpenTrades,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    totalTrades:   trades.length,
    closedTrades:  closedTrades.length,
    winRate,
  };
}

// ── Watchlist snapshot (with both 15m + 5m indicators, cached 30 s) ───────────

let _wlCache = null, _wlCacheAt = 0;
const WL_CACHE_TTL = 30_000;

async function getWatchlistSnapshot() {
  if (_wlCache && Date.now() - _wlCacheAt < WL_CACHE_TTL) return _wlCache;

  const results = [];
  for (const symbol of WATCHLIST) {
    try {
      // Fetch both timeframes in parallel per symbol
      const [klines15m, klines5m] = await Promise.all([
        getKlines(symbol, '15m', 250),
        getKlines(symbol, '5m', 100),
      ]);
      const ind15m    = computeIndicators(klines15m);
      const ind5m     = computeBounceIndicators(klines5m);
      const signal15m = evaluateTrendSignal(ind15m);
      const signal5m  = evaluateBounceSignal(ind5m);
      const open      = getOpenTrade(symbol);
      results.push({
        symbol,
        // 15m
        price:     ind15m.currentPrice,
        ema50:     ind15m.ema50,
        ema200:    ind15m.ema200,
        rsi15m:    ind15m.rsi14,
        signal15m,
        // 5m
        ema9:      ind5m.ema9,
        ema21:     ind5m.ema21,
        rsi5m:     ind5m.rsi14,
        signal5m,
        // position
        hasOpenTrade: !!open,
        openTradeId:  open?.id || null,
        openStrategy: open?.strategy || null,
      });
    } catch (err) {
      const msg = err.response?.data?.msg || err.message;
      logger.warn(`[watchlist] ${symbol} skipped: ${msg}`);
      results.push({ symbol, error: msg });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  _wlCache   = results;
  _wlCacheAt = Date.now();
  return results;
}

// ── Manual close by trade IDs ─────────────────────────────────────────────────

async function closeTradesByIds(ids) {
  const open = read('trades').filter(t => t.status === 'OPEN' && ids.includes(t.id));
  for (const trade of open) {
    if (running[trade.symbol]) {
      logger.warn(`[${trade.symbol}] Skipping manual close — symbol locked.`);
      continue;
    }
    try {
      const price = await getPrice(trade.symbol);
      await closeTrade(trade, price, 'MANUAL');
    } catch (err) {
      const msg = err.response?.data?.msg || err.message;
      logger.error(`[${trade.symbol}] Manual close error: ${msg}`);
    }
  }
}

module.exports = {
  tick, tick5m,
  getStatus, getWatchlistSnapshot, WATCHLIST,
  startBot, stopBot, getBotRunning,
  closeTradesByIds,
};
