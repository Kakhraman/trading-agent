/**
 * Technical indicator calculations.
 * All functions accept an array of closing prices (numbers) and return a number.
 */

/**
 * Exponential Moving Average.
 * @param {number[]} closes  array of closing prices (oldest → newest)
 * @param {number}   period
 */
function ema(closes, period) {
  if (closes.length < period) {
    throw new Error(`Need at least ${period} candles for EMA-${period}`);
  }
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

/**
 * Relative Strength Index (Wilder smoothing).
 * @param {number[]} closes
 * @param {number}   period  default 14
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) {
    throw new Error(`Need at least ${period + 1} candles for RSI-${period}`);
  }
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses += Math.abs(d);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d <  0 ? Math.abs(d) : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * Returns true if price is within tolerancePct % of level.
 */
function isNear(price, level, tolerancePct = 0.5) {
  return Math.abs((price - level) / level) * 100 <= tolerancePct;
}

/**
 * 15m trend strategy indicators — EMA50, EMA200, RSI14.
 * @param {{ close: number }[]} klines  oldest → newest
 */
function computeIndicators(klines) {
  const closes = klines.map(k => k.close);
  const currentPrice = closes[closes.length - 1];
  return {
    currentPrice,
    ema50:  ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14:  rsi(closes, 14),
  };
}

/**
 * 5m bounce strategy indicators — EMA9, EMA21, RSI14.
 * @param {{ close: number }[]} klines  oldest → newest
 */
function computeBounceIndicators(klines) {
  const closes = klines.map(k => k.close);
  const currentPrice = closes[closes.length - 1];
  return {
    currentPrice,
    ema9:  ema(closes, 9),
    ema21: ema(closes, 21),
    rsi14: rsi(closes, 14),
  };
}

module.exports = { ema, rsi, isNear, computeIndicators, computeBounceIndicators };
