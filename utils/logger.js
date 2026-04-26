const pino = require('pino');
const { append } = require('./db');

const LEVELS = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

function createEntry(level, message) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

function normalizeArgs(value, fallbackMessage) {
  if (value instanceof Error) {
    return {
      fields: { err: value },
      message: fallbackMessage || value.message,
    };
  }

  if (value && typeof value === 'object') {
    return {
      fields: value,
      message: fallbackMessage || value.message || JSON.stringify(value),
    };
  }

  return {
    fields: undefined,
    message: String(value),
  };
}

function persist(entry) {
  try {
    append('logs', entry);
  } catch (err) {
    baseLogger.error({ err }, 'Failed to persist log entry');
  }
}

function write(level, value, fallbackMessage) {
  const { fields, message } = normalizeArgs(value, fallbackMessage);
  const entry = createEntry(LEVELS[level], message);

  if (fields) baseLogger[level](fields, message);
  else baseLogger[level](message);

  persist(entry);
  return entry;
}

function info(value, message) {
  return write('info', value, message);
}

function warn(value, message) {
  return write('warn', value, message);
}

function error(value, message) {
  return write('error', value, message);
}

module.exports = {
  info,
  warn,
  error,
  child: baseLogger.child.bind(baseLogger),
  pino: baseLogger,
};
