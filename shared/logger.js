const fs = require('fs');
const path = require('path');
const config = require('./config');

const levels = ['debug', 'info', 'warn', 'error'];

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

ensureDir(config.LOG_DIR);
const logFile = path.join(config.LOG_DIR, 'app.log');
const stream = fs.createWriteStream(logFile, { flags: 'a' });

function format(level, msg, meta) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  return meta ? line + ' ' + JSON.stringify(meta) + '\n' : line + '\n';
}

function write(level, msg, meta) {
  const text = format(level, msg, meta);
  try { stream.write(text); } catch (_) {}
  if (level === 'error') console.error(msg, meta || '');
  else if (level === 'warn') console.warn(msg, meta || '');
  else console.log(msg, meta || '');
}

const threshold = levels.indexOf(config.LOG_LEVEL);
function shouldLog(level) { return levels.indexOf(level) >= threshold; }

module.exports = {
  debug(msg, meta) { if (shouldLog('debug')) write('debug', msg, meta); },
  info(msg, meta) { if (shouldLog('info')) write('info', msg, meta); },
  warn(msg, meta) { if (shouldLog('warn')) write('warn', msg, meta); },
  error(msg, meta) { write('error', msg, meta); },
};