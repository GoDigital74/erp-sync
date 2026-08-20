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
    logger.info('Using permanent Shopify Admin token from .env');
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
  let url = `https://${config.shopify.shopDomain}/admin/api/2024-01/products.json?limit=250&fields=id,variants`;

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
      if (v.sku) skuMap[v.sku] = p.id;
    }
  }

  return skuMap;
}


let _onlineStorePublicationId = null;

async function getOnlineStorePublicationId(token) {
  if (_onlineStorePublicationId) return _onlineStorePublicationId;

  const res = await axios.post(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/graphql.json`,
    { query: `{ publications(first: 10) { edges { node { id name } } } }` },
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  const publications = res.data.data?.publications?.edges || [];
  const onlineStore = publications.find((p) => p.node.name === 'Online Store');
  _onlineStorePublicationId = onlineStore ? onlineStore.node.id : null;
  return _onlineStorePublicationId;
}

async function publishToOnlineStore(token, productId) {
  const publicationId = await getOnlineStorePublicationId(token);
  if (!publicationId) {
    logger.warn('Online Store publication not found; product created but not published.');
    return;
  }

  const res = await axios.post(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/graphql.json`,
    {
      query: `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }
      `,
      variables: {
        id: `gid://shopify/Product/${productId}`,
        input: [{ publicationId }],
      },
    },
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  const errors = res.data.data?.publishablePublish?.userErrors;
  if (errors && errors.length > 0) {
    logger.warn(`Failed to publish product ${productId} to Online Store: ${JSON.stringify(errors)}`);
  }
}

async function createProduct(token, payload) {
  const res = await axios.post(
    `https://${config.shopify.shopDomain}/admin/api/2024-01/products.json`,
    payload,
    { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
  );
  const product = res.data.product;
  try {
    await publishToOnlineStore(token, product.id);
  } catch (err) {
    logger.warn(`Failed to publish product ${product.id} to Online Store: ${err.message}`);
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

module.exports = { getAccessToken, getExistingProducts, createProduct, updateProduct };
