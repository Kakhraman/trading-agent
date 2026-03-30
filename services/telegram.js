const axios = require('axios');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text) {
  if (!TOKEN || !CHAT_ID) {
    console.warn('[Telegram] BOT_TOKEN or CHAT_ID not configured — skipping notification.');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err.message);
  }
}

function notifyBuy({ symbol, price, quantity, tradeId, strategy = '15m' }) {
  const tag = strategy === '5m' ? '⚡ 5m Bounce' : '📈 15m Trend';
  return sendMessage(
    `🟢 <b>BUY</b> executed [${tag}]\n` +
    `Symbol: <code>${symbol}</code>\n` +
    `Price: <code>${price.toFixed(2)}</code>\n` +
    `Qty: <code>${quantity.toFixed(6)}</code>\n` +
    `Trade ID: <code>${tradeId}</code>`
  );
}

function notifySell({ symbol, price, quantity, pnl, tradeId }) {
  const sign = pnl >= 0 ? '▲' : '▼';
  return sendMessage(
    `🔴 <b>SELL</b> executed\n` +
    `Symbol: <code>${symbol}</code>\n` +
    `Price: <code>${price.toFixed(2)}</code>\n` +
    `Qty: <code>${quantity.toFixed(6)}</code>\n` +
    `PnL: <code>${sign} ${pnl.toFixed(4)} USDT</code>\n` +
    `Trade ID: <code>${tradeId}</code>`
  );
}

function notifyError(context, message) {
  return sendMessage(`❌ <b>ERROR</b> [${context}]\n<code>${message}</code>`);
}

module.exports = { sendMessage, notifyBuy, notifySell, notifyError };
