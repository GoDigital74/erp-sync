/**
 * sync.js — Main Orchestrator
 *
 * Flow:
 *  1. Fetch all products from iNext ERP API
 *  2. Get Shopify access token
 *  3. Load existing Shopify products (build SKU map to detect duplicates)
 *  4. For each ERP product:
 *     - If SKU already exists on Shopify → UPDATE
 *     - If SKU is new → CREATE
 *  5. Log results summary
 */

require('dotenv').config();

const { fetchERPProducts } = require('./inext');
const { getAccessToken, getExistingProducts, createProduct, updateProduct } = require('./shopify');
const { mapToShopifyProduct } = require('./mapper');
const logger = require('./logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSync() {
  const startTime = Date.now();
  logger.info('══════════════════════════════════════════');
  logger.info('  iNext ERP → Shopify Sync Starting');
  logger.info('══════════════════════════════════════════');

  const results = { created: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const erpProducts = await fetchERPProducts();

    if (erpProducts.length === 0) {
      logger.warn('No products returned from iNext ERP. Sync complete with nothing to do.');
      logger.warn('→ Ask the client to mark products for Shopify export in their ERP system.');
      return;
    }

    logger.info(`ERP fields available: ${Object.keys(erpProducts[0]).join(', ')}`);

    const token = await getAccessToken();

    logger.info('Loading existing Shopify products...');
    const skuMap = await getExistingProducts(token);
    logger.info(`Found ${Object.keys(skuMap).length} existing SKUs on Shopify`);

    for (let i = 0; i < erpProducts.length; i++) {
      const erpItem = erpProducts[i];
      const label = `[${i + 1}/${erpProducts.length}]`;

      try {
        const payload    = mapToShopifyProduct(erpItem);
        const sku        = payload.product.variants[0].sku;
        const title      = payload.product.title;

        if (skuMap[sku]) {
          await updateProduct(token, skuMap[sku], payload);
          logger.success(`${label} UPDATED: "${title}" (SKU: ${sku})`);
          results.updated++;
        } else {
          await createProduct(token, payload);
          logger.success(`${label} CREATED: "${title}" (SKU: ${sku})`);
          results.created++;
        }

      
        await sleep(600);

      } catch (err) {
        const errMsg = err.response?.data
          ? JSON.stringify(err.response.data).substring(0, 200)
          : err.message;
        logger.error(`${label} FAILED: "${erpItem.ItemName || erpItem.item_name || 'Unknown'}" → ${errMsg}`);
        results.errors++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info('══════════════════════════════════════════');
    logger.info(`  Sync Complete in ${duration}s`);
    logger.info(`  ✅ Created : ${results.created}`);
    logger.info(`  🔄 Updated : ${results.updated}`);
    logger.info(`  ⏭️  Skipped : ${results.skipped}`);
    logger.info(`  ❌ Errors  : ${results.errors}`);
    logger.info('══════════════════════════════════════════');

  } catch (err) {
    logger.error(`Fatal sync error: ${err.message}`);
    if (err.response) {
      logger.error(`Response: ${JSON.stringify(err.response.data).substring(0, 300)}`);
    }
    process.exit(1);
  }
}

runSync();
