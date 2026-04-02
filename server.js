require('dotenv').config();

const logger = require('./utils/logger');

// Keep the process alive — log crashes but never exit
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  logger.error('[FATAL] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  logger.error('[FATAL] Unhandled rejection:', reason);
});

const express = require('express');
const path = require('path');
const cron = require('node-cron');

const apiRouter = require('./routes/api');
const { tick, tick5m, getBotRunning } = require('./services/bot');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Catch-all → SPA ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 15m trend strategy — fires at :00, :15, :30, :45 of every hour ───────────
cron.schedule('0 */15 * * * *', async () => {
  if (!getBotRunning()) return;
  try { await tick(); } catch (err) { logger.error(`15m cron failed: ${err.message}`); }
});

// ── 5m bounce strategy — fires every 5 minutes ───────────────────────────────
cron.schedule('0 */5 * * * *', async () => {
  if (!getBotRunning()) return;
  try { await tick5m(); } catch (err) { logger.error(`5m cron failed: ${err.message}`); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const os = require('os');

function getLocalIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);
}

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Local:   http://localhost:${PORT}`);
  getLocalIPs().forEach(ip => logger.info(`Network: http://${ip}:${PORT}`));
  logger.info('Bot scheduler active — ticks every 15 minutes (bot stopped by default).');
});
