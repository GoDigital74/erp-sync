const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, `sync-${new Date().toISOString().split('T')[0]}.log`);

const format = (level, msg) => {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${msg}`;
};

const write = (line) => {
  fs.appendFileSync(logFile, line + '\n');
};

const logger = {
  info:    (msg) => { const l = format('INFO ', msg); console.log(`ℹ️  ${l}`);  write(l); },
  success: (msg) => { const l = format('OK   ', msg); console.log(`✅ ${l}`);  write(l); },
  warn:    (msg) => { const l = format('WARN ', msg); console.warn(`⚠️  ${l}`); write(l); },
  error:   (msg) => { const l = format('ERROR', msg); console.error(`❌ ${l}`); write(l); },
};

module.exports = logger;
