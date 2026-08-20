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
    └── sync.js           ← Main orchestrator (run this)
```

## How It Works

```
iNext ERP API  →  mapper.js  →  Shopify Admin API
(GET products)    (transform)   (create/update)
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
