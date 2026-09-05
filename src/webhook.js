/**
 * Receives completed purchases from the client/server system and creates
 * matching Shopify orders. The sender should POST to /webhooks/order.
 */

require('dotenv').config();

const http = require('http');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');
const {
  getAccessToken,
  getExistingVariants,
  findOrderByExternalId,
  createOrder,
} = require('./shopify');

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Request body is too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function isValidSignature(body, signature) {
  if (!config.webhook.secret) return true;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', config.webhook.secret).update(body).digest('hex');
  const received = signature.replace(/^sha256=/, '');
  return received.length === expected.length && crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  );
}

function normalizeOrder(input) {
  const order = input.order || input;
  const externalId = order.id || order.order_id || order.orderId || order.invoice_no;
  const items = order.items || order.line_items || order.products;

  if (!externalId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Payload must contain an order id and a non-empty items array');
  }

  return {
    externalId: String(externalId),
    email: order.email || order.customer?.email,
    customer: order.customer,
    items: items.map((item) => ({
      sku: String(item.sku || item.itemcode || item.Itemcode || ''),
      quantity: Number(item.quantity || item.qty || 1),
    })),
  };
}

async function handleOrder(input) {
  const order = normalizeOrder(input);
  if (order.items.some((item) => !item.sku || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Every item must contain a SKU and a positive integer quantity');
  }

  const token = await getAccessToken();
  const existing = await findOrderByExternalId(token, order.externalId);
  if (existing) return { created: false, orderId: existing.id };

  const variantMap = await getExistingVariants(token);
  const lineItems = order.items.map((item) => {
    const variantId = variantMap[item.sku];
    if (!variantId) throw new Error(`SKU not found in Shopify: ${item.sku}`);
    return { variant_id: variantId, quantity: item.quantity };
  });

  const shopifyOrder = await createOrder(token, {
    email: order.email,
    line_items: lineItems,
    inventory_behavior: 'decrement_obeying_policy',
    financial_status: 'paid',
    send_receipt: false,
    note_attributes: [{ name: 'external_order_id', value: order.externalId }],
    ...(order.customer ? { shipping_address: order.customer.shipping_address } : {}),
  });

  return { created: true, orderId: shopifyOrder.id };
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/webhooks/order') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const body = await readBody(request);
    if (!isValidSignature(body, request.headers['x-webhook-signature'])) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    const result = await handleOrder(JSON.parse(body));
    response.writeHead(result.created ? 201 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result));
    logger.success(`${result.created ? 'Created' : 'Already synced'} Shopify order ${result.orderId}`);
  } catch (error) {
    logger.error(`Order webhook failed: ${error.message}`);
    response.writeHead(error instanceof SyntaxError ? 400 : 500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(config.webhook.port, config.webhook.host, () => {
  logger.info(`Order webhook listening on ${config.webhook.host}:${config.webhook.port}/webhooks/order`);
});