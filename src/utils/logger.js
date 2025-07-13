const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'info';
  }

  shouldLog(level) {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  error(...args) {
    if (this.shouldLog('error')) {
      console.error('[ERROR]', ...args);
    }
  }

  warn(...args) {
    if (this.shouldLog('warn')) {
      console.error('[WARN]', ...args);
    }
  }

  info(...args) {
    if (this.shouldLog('info')) {
      console.error('[INFO]', ...args);
    }
  }

  debug(...args) {
    if (this.shouldLog('debug')) {
      console.error('[DEBUG]', ...args);
    }
  }
}

export const logger = new Logger();