require('dotenv').config();

const os = require('os');
const express = require('express');
const path = require('path');
const cron = require('node-cron');

const logger = require('./utils/logger');
const apiRouter = require('./routes/api');
const { tick, tick5m, getBotRunning } = require('./services/bot');

process.on('uncaughtException',  (err)    => logger.error(`[FATAL] Uncaught exception: ${err.message}`));
process.on('unhandledRejection', (reason) => logger.error(`[FATAL] Unhandled rejection: ${reason}`));

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRouter);
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function scheduleTick(fn, label) {
  return async () => {
    if (!getBotRunning()) return;
    try { await fn(); } catch (err) { logger.error(`${label} cron failed: ${err.message}`); }
  };
}

cron.schedule('0 */15 * * * *', scheduleTick(tick,   '15m'));
cron.schedule('0 */5 * * * *',  scheduleTick(tick5m, '5m'));

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
