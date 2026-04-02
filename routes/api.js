const express = require('express');
const router = express.Router();

const dashboardCtrl = require('../controllers/dashboard');
const tradesCtrl    = require('../controllers/trades');
const logsCtrl      = require('../controllers/logs');
const botCtrl       = require('../controllers/bot');

// Dashboard / summary
router.get('/dashboard',       dashboardCtrl.getDashboard);
router.get('/watchlist',       dashboardCtrl.getWatchlist);
router.get('/balance-history', dashboardCtrl.getBalanceHistory);

// Trades
router.get('/trades',       tradesCtrl.getTrades);
router.get('/trades/open',  tradesCtrl.getOpenTrades);

// Logs
router.get('/logs', logsCtrl.getLogs);

// Bot control
router.post('/bot/start',       botCtrl.triggerStart);
router.post('/bot/stop',        botCtrl.triggerStop);
router.post('/trades/close',    botCtrl.closeTrades);
router.post('/trades/close-all', botCtrl.closeAllTrades);

module.exports = router;
