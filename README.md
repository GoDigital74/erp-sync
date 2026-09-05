npm start
to run the project

# iNext ERP → Shopify Sync

Syncs products from the **iNext ERP** system to **Mamta Saree Centre** Shopify store.

## Folder Structure

```
inext-sync/
├── .env                  ← All credentials (never commit this)
├── package.json
├── test-api.js           ← Quick test to probe the iNext API
├── logs/                 ← Auto-generated daily log files
└── src/
    ├── config.js         ← Loads all env variables
    ├── logger.js         ← Console + file logger
    ├── inext.js          ← Calls iNext ERP API, returns products
    ├── mapper.js         ← Maps ERP fields → Shopify fields
    ├── shopify.js        ← Shopify API: create/update products
    ├── sync.js           ← Product sync orchestrator
    └── webhook.js        ← Receives purchases and creates Shopify orders
```

## How It Works

```
iNext ERP API  →  mapper.js  →  Shopify Admin API
(GET products)    (transform)   (create/update)
```

Purchases made in the client/server system follow the reverse direction:

```
Client/server system  →  POST /webhooks/order  →  Shopify order + inventory
```

1. Calls `proc_get_items_for_shopify` with DB credentials
2. Maps ERP product fields to Shopify format
3. For each product:
   - If SKU already exists on Shopify → **UPDATE** it
   - If SKU is new → **CREATE** it
4. Logs everything to `logs/sync-YYYY-MM-DD.log`

## Setup

```bash
npm install
```

## Run Sync

```bash
node src/sync.js
# or
npm start
```

## Receive Purchases

Start the purchase receiver separately:

```bash
npm run start-webhook
```

Configure these optional environment variables in `.env`:

```env
WEBHOOK_HOST=0.0.0.0
WEBHOOK_PORT=3000
WEBHOOK_SECRET=use-the-same-secret-on-the-sender
```

The client/server system should send a JSON `POST` request to
`/webhooks/order`. The minimum payload is:

```json
{
    "order_id": "INV-1001",
    "email": "customer@example.com",
    "items": [
        { "sku": "ITEM-SKU-001", "quantity": 1 }
    ]
}
```

`id`, `orderId`, `invoice_no`, `products`, `line_items`, `itemcode`, and
`Itemcode` are also accepted aliases. The SKU must already exist in Shopify.
The receiver stores the source order ID as `external_order_id`, so retries do
not create duplicate Shopify orders. When `WEBHOOK_SECRET` is configured,
send `X-Webhook-Signature: sha256=<hex HMAC-SHA256 of the raw request body>`.

## Test API Connection

```bash
node test-api.js
```

## Current Status

| Component | Status |
|---|---|
| iNext API connection | ✅ Working |
| Response format known | ✅ `{ status, message, data }` |
| Shopify connection | ✅ Working |
| Field mapping | ⏳ Will auto-detect when ERP has data |

> **Note:** The iNext API currently returns "No data found" because the client
> has not yet marked any products for Shopify export in their ERP system.
> Once they do, running `npm start` will sync all products automatically.
