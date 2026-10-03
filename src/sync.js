/**
 * sync.js — Main Orchestrator
 *
 * Flow:
 *  1. Fetch all products from iNext ERP API
 *  2. Get Shopify access token
 *  3. Load existing Shopify products (build SKU map to detect duplicates)
 *  4. For each ERP product:
 *     - If SKU is new → CREATE
 *     - If its details changed in the ERP since the last sync → UPDATE
 *       (only products tagged inext-sync; others keep their own details)
 *     - If it was sold or restocked at the POS → set its Shopify stock
 *  5. Log results summary
 *
 * `npm start` runs this once. `npm run auto` repeats it every
 * SYNC_INTERVAL_MINUTES, so POS sales reach the online store on their own.
 */

require('dotenv').config();
require('./http'); // hard time limit on every API call

const crypto = require('crypto');
const config = require('./config');
const { fetchERPProducts } = require('./inext');
const { getAccessToken, getExistingProducts, getRecentOrderQuantities, createProduct, updateProduct, setInventory } = require('./shopify');
const { mapToShopifyProduct, SYNC_TAG } = require('./mapper');
const syncState = require('./state');
const logger = require('./logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hasSyncTag = (tags) => (tags || '').split(',').some((t) => t.trim().toLowerCase() === SYNC_TAG);

/**
 * Fingerprint of a product's details (everything except stock), used to skip
 * products that haven't changed in the ERP since the last sync.
 */
function detailsHash(payload) {
  const { inventory_quantity, ...variant } = payload.product.variants[0];
  const details = { ...payload.product, variants: [variant] };
  return crypto.createHash('sha1').update(JSON.stringify(details)).digest('hex');
}

/**
 * Works out the Shopify stock for a product that is already on the store.
 *
 * - ERP stock lower than Shopify's → sold at the POS: lower Shopify to match.
 * - First time the sync sees the item → no history to go on, so raise Shopify
 *   to the ERP stock, minus pieces in recent online orders (`onlineQty`).
 * - ERP stock higher than at the last sync → returned/restocked at the POS:
 *   raise Shopify by the same amount (never above the ERP stock).
 * - Anything else leaves Shopify alone, so a piece sold online that hasn't
 *   been billed at the POS yet is not put back on sale.
 */
function stockAfterSync(erpQty, shopifyQty, lastErpQty, onlineQty = 0) {
  if (erpQty < shopifyQty) return erpQty;
  if (lastErpQty === undefined) return Math.max(shopifyQty, erpQty - onlineQty);
  if (erpQty > lastErpQty) {
    return Math.min(erpQty, shopifyQty + (erpQty - lastErpQty));
  }
  return shopifyQty;
}

async function runSync() {
  const startTime = Date.now();
  const results = { created: 0, updated: 0, stockChanged: 0, skipped: 0, errors: 0 };

  const erpProducts = await fetchERPProducts();

  if (erpProducts.length === 0) {
    logger.warn('Nothing to update; Shopify left as it is.');
    return;
  }

  const token = await getAccessToken();
  const skuMap = await getExistingProducts(token);
  const state = syncState.load();
  let onlineOrders; // loaded only when a first-seen item needs it

  // Synced products that iNext no longer lists can't get stock updates.
  const sent = new Set(erpProducts.map((item) => item.Itemcode));
  const missing = Object.keys(skuMap).filter((sku) => hasSyncTag(skuMap[sku].tags) && !sent.has(sku));
  if (missing.length) {
    logger.warn(`${missing.length} products on Shopify are missing from iNext's list, so their stock can't update `
      + `(e.g. ${missing.slice(0, 3).join(', ')}). Check they are still marked for Shopify in iNext.`);
  }

  for (let i = 0; i < erpProducts.length; i++) {
    const erpItem = erpProducts[i];
    const label = `[${i + 1}/${erpProducts.length}]`;

    try {
      const payload    = mapToShopifyProduct(erpItem);
      const sku        = payload.product.variants[0].sku;
      const title      = payload.product.title;
      const erpQty     = payload.product.variants[0].inventory_quantity;
      const hash       = detailsHash(payload);
      const last       = state[sku] || {};
      // A row without a stock number says nothing about stock, so don't read it as 0.
      const hasStock   = Number.isFinite(parseFloat(erpItem.StockQty));

      const existing = skuMap[sku];
      let inventoryItemId, currentQty, newQty;
      let sentHash = last.hash;
      let calledShopify = false;
      if (existing) {
        inventoryItemId = existing.inventoryItemId;
        currentQty      = existing.quantity;
        if (hasStock && last.erpQty === undefined && erpQty > currentQty && !onlineOrders) {
          onlineOrders = await getRecentOrderQuantities(token);
        }
        newQty          = hasStock ? stockAfterSync(erpQty, currentQty, last.erpQty, onlineOrders?.[sku]) : currentQty;
        if (!hasStock) logger.warn(`${label} iNext sent no stock number for SKU ${sku}; Shopify stock left as it is.`);
        // Products the sync didn't create (no sync tag) only get stock updates.
        if (hasSyncTag(existing.tags) && last.hash !== hash) {
          await updateProduct(token, existing.productId, payload);
          sentHash = hash;
          logger.success(`${label} UPDATED: "${title}" (SKU: ${sku})`);
          results.updated++;
          calledShopify = true;
        }
      } else {
        const product = await createProduct(token, payload);
        inventoryItemId = product.variants[0].inventory_item_id;
        currentQty      = product.variants[0].inventory_quantity;
        newQty          = erpQty;
        sentHash        = hash;
        logger.success(`${label} CREATED: "${title}" (SKU: ${sku})`);
        results.created++;
        calledShopify = true;
      }

      // Shopify ignores inventory_quantity on updates, so stock is set separately.
      if (newQty !== currentQty) {
        await setInventory(token, inventoryItemId, newQty);
        logger.success(`${label} STOCK: ${currentQty} → ${newQty} (SKU: ${sku})`);
        results.stockChanged++;
        calledShopify = true;
      }

      state[sku] = { erpQty: hasStock ? erpQty : last.erpQty, hash: sentHash };

      if (calledShopify) await sleep(600);
      else results.skipped++;

    } catch (err) {
      const errMsg = err.response?.data
        ? JSON.stringify(err.response.data).substring(0, 200)
        : err.message;
      logger.error(`${label} FAILED: "${erpItem.ItemName || erpItem.item_name || 'Unknown'}" → ${errMsg}`);
      results.errors++;
    }
  }

  syncState.save(state);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (results.created + results.updated + results.stockChanged + results.errors === 0) {
    logger.info(`No changes: all ${results.skipped} products already up to date (${duration}s)`);
    return;
  }

  logger.info('══════════════════════════════════════════');
  logger.info(`  Sync Complete in ${duration}s`);
  logger.info(`  ✅ Created : ${results.created}`);
  logger.info(`  🔄 Updated : ${results.updated}`);
  logger.info(`  📦 Stock   : ${results.stockChanged} changed`);
  logger.info(`  ⏭️  Skipped : ${results.skipped}`);
  logger.info(`  ❌ Errors  : ${results.errors}`);
  logger.info('══════════════════════════════════════════');
}

function logFatal(err) {
  logger.error(`Fatal sync error: ${err.message}`);
  if (err.response) {
    logger.error(`Response: ${JSON.stringify(err.response.data).substring(0, 300)}`);
  }
}

async function main() {
  logger.info('══════════════════════════════════════════');
  logger.info('  iNext ERP → Shopify Sync Starting');
  logger.info('══════════════════════════════════════════');

  if (!process.argv.includes('--auto')) {
    try {
      await runSync();
    } catch (err) {
      logFatal(err);
      process.exit(1);
    }
    return;
  }

  const minutes = config.sync.intervalMinutes;
  if (!(minutes >= 1)) {
    logger.error(`SYNC_INTERVAL_MINUTES must be at least 1 (got "${process.env.SYNC_INTERVAL_MINUTES}")`);
    process.exit(1);
  }

  logger.info(`Auto mode: syncing every ${minutes} min. Press Ctrl+C to stop.`);
  for (;;) {
    try {
      await runSync();
    } catch (err) {
      logFatal(err); // e.g. ERP or internet down — try again next round
    }
    await sleep(minutes * 60 * 1000);
  }
}

main();
