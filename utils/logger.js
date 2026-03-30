const { append } = require('./db');

function formatMsg(level, message) {
  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

function info(message) {
  const entry = formatMsg('INFO', message);
  console.log(`[INFO]  ${entry.timestamp} — ${message}`);
  append('logs', entry);
}

function warn(message) {
  const entry = formatMsg('WARN', message);
  console.warn(`[WARN]  ${entry.timestamp} — ${message}`);
  append('logs', entry);
}

function error(message) {
  const entry = formatMsg('ERROR', message);
  console.error(`[ERROR] ${entry.timestamp} — ${message}`);
  append('logs', entry);
}

module.exports = { info, warn, error };
