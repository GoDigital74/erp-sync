/**
 * state.js
 * Remembers what the last sync saw for each SKU — the ERP stock and a
 * fingerprint of the product details — in data/sync-state.json, so the next
 * sync only sends Shopify what actually changed.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const stateFile = path.join(__dirname, '..', 'data', 'sync-state.json');

function load() {
  if (!fs.existsSync(stateFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    logger.warn(`Ignoring unreadable ${stateFile}: ${err.message}`);
    return {};
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  // Write to a temp file first so a crash mid-write can't corrupt the state.
  const tmpFile = `${stateFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, stateFile);
}

module.exports = { load, save };
