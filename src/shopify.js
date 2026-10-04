/**
 * shopify.js
 * Handles all Shopify Admin REST API operations:
 *  - Get access token (client_credentials)
 *  - Create product
 *  - Update existing product
 *  - Check if product exists by SKU
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

let _cachedToken = null;

/**
 * Get Shopify Admin API access token.
 * 
 * TWO WAYS this works:
 * 1. SIMPLE (recommended): Set SHOPIFY_ADMIN_TOKEN in .env → uses it directly
 * 2. OAUTH: Uses API Key + Secret to request a fresh token via client_credentials
 */
async function getAccessToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) {
    if (!_cachedToken) logger.info('Using permanent Shopify Admin token from .env');
    _cachedToken = process.env.SHOPIFY_ADMIN_TOKEN;
    return _cachedToken;
  }

  if (_cachedToken) return _cachedToken;

  logger.info('Getting Shopify access token via OAuth...');

  const res = await axios.post(
    `https://${config.shopify.shopDomain}/admin/oauth/access_token`,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     config.shopify.apiKey,
      client_secret: config.shopify.apiSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  _cachedToken = res.data.access_token;
  logger.success(`Got Shopify token: ${_cachedToken.substring(0, 12)}...`);
  return _cachedToken;
}


async function getExistingProducts(token) {
  const products = [];
  let url = `https://${config.shopify.shopDomain}/admin/api/2024-01/products.json?limit=250&fields=id,tags,variants`;

  while (url) {
    const res = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    products.push(...(res.data.products || []));

    // Pagination
    const link = res.headers['link'] || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  const skuMap = {};
  for (const p of products) {
    for (const v of (p.variants || [])) {
      if (v.sku) {
        skuMap[v.sku] = {
          productId: p.id,
          tags: p.tags,
          inventoryItemId: v.inventory_item_id,
          quantity: v.inventory_quantity,
        };
      }
    }
  }

  return skuMap;
}


/**
 * Creates a product. Shopify publishes products created this way to the
 * Online Store on its own, so there is no separate publish step.
 */
async function createProduct(token, payload) {
  const res = await axios.post(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/products.json`,
    payload,
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  const product = res.data.product;
  if (!product.published_at) {
    logger.warn(`Product ${product.id} was created but isn't on the Online Store; publish it in Shopify admin.`);
  }
  return product;
}

async function updateProduct(token, shopifyId, payload) {
  const res = await axios.put(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/products/${shopifyId}.json`,
    payload,
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  return res.data.product;
}

let _locationId = process.env.SHOPIFY_LOCATION_ID || null;

/**
 * The store's stock location. Discovered from an item's inventory level so the
 * app doesn't need the read_locations scope; SHOPIFY_LOCATION_ID overrides it.
 */
async function getLocationId(token, inventoryItemId) {
  if (_locationId) return _locationId;

  const res = await axios.get(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  const level = (res.data.inventory_levels || [])[0];
  if (!level) throw new Error(`No inventory location found for inventory item ${inventoryItemId}`);
  _locationId = level.location_id;
  logger.info(`Using Shopify location ${_locationId} for stock updates`);
  return _locationId;
}

/**
 * Sets the available stock of an item. Shopify ignores inventory_quantity on
 * product updates, so this is the only way stock changes (e.g. POS sales) reach the store.
 */
async function setInventory(token, inventoryItemId, available) {
  const locationId = await getLocationId(token, inventoryItemId);
  await axios.post(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/inventory_levels/set.json`,
    { location_id: locationId, inventory_item_id: inventoryItemId, available },
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
}

/**
 * Units per SKU in online orders from the last `days` days that weren't
 * cancelled, so the sync doesn't put a piece back on sale that sold online.
 */
async function getRecentOrderQuantities(token, days = 30) {
  const since = encodeURIComponent(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  let url = `https://${config.shopify.shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${since}&fields=cancelled_at,line_items`;
  const quantities = {};

  while (url) {
    const res = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token } });
    for (const order of (res.data.orders || [])) {
      if (order.cancelled_at) continue;
      for (const item of (order.line_items || [])) {
        if (item.sku) quantities[item.sku] = (quantities[item.sku] || 0) + item.quantity;
      }
    }

    const link = res.headers['link'] || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return quantities;
}

module.exports = {
  getAccessToken,
  getExistingProducts,
  getRecentOrderQuantities,
  createProduct,
  updateProduct,
  setInventory,
};
