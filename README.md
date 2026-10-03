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
├── auto-sync.bat         ← Double-click to run the sync non-stop
├── auto-sync.ps1         ← Used by auto-sync.bat (restarts, no click-pause)
├── logs/                 ← Auto-generated daily log files
├── data/                 ← What the last sync saw per SKU (auto-generated)
└── src/
    ├── config.js         ← Loads all env variables
    ├── logger.js         ← Console + file logger
    ├── inext.js          ← Calls iNext ERP API, returns products
    ├── mapper.js         ← Maps ERP fields → Shopify fields
    ├── shopify.js        ← Shopify API: create/update products, set stock
    ├── state.js          ← Saves/loads data/sync-state.json
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
   - If SKU is new → **CREATE** it
   - If its details changed in the ERP since the last sync → **UPDATE** it
   - If it was sold or restocked at the POS → set its Shopify **STOCK**
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

This runs once. The first run after an update re-sends every product (a few
minutes); after that only changes are sent and a run takes seconds.

## Keep Stock Updated Automatically

```bash
npm run auto
```

Or double-click `auto-sync.bat` in the project folder. It does the same and
restarts the sync by itself if it ever stops. To start it automatically when
Windows starts, press `Win + R`, type `shell:startup`, and put a shortcut to
`auto-sync.bat` in the folder that opens.

Keeps running and syncs every 2 minutes, so a piece sold at the POS sells out
on the online store within minutes. Change the interval with
`SYNC_INTERVAL_MINUTES` in `.env` (minimum 1). Leave it running on a PC that
stays on; `Ctrl+C` stops it.

### Install on the shop PC

Run the sync on **one** PC only. Two PCs at once can create duplicate products.

1. Copy the whole `inext-sync` folder, **including `.env`**, to the shop PC
   (e.g. `C:\inext-sync`) with a USB drive. `.env` holds the passwords; don't
   send it by email or WhatsApp.
2. Install Node.js (LTS) from https://nodejs.org.
3. Open the folder, type `cmd` in the address bar, press Enter, then run
   `npm install`.
4. Test once: `npm start`. It should end with `Errors : 0` or
   `No changes: all N products already up to date`.
5. Start with Windows: press `Win + R`, type `shell:startup`, and put a
   shortcut to `auto-sync.bat` in the folder that opens.
6. Settings → System → Power → Screen and sleep → sleep **Never**.
7. Double-click `auto-sync.bat` and minimise the window.
8. On the old PC: close its sync window and delete its shortcut from
   `shell:startup`.

Stock rules:

- **Sold at the POS** → the ERP's `StockQty` drops → Shopify stock is lowered
  to match. At 0 the product shows as sold out and can't be bought online
  (every product is set to deny overselling).
- **Returned or restocked at the POS** → the ERP stock goes up → Shopify stock
  goes up by the same amount.
- **Shopify lower than the ERP for any other reason** — usually a piece sold
  online that hasn't been billed at the POS yet — Shopify is left alone, so the
  piece isn't put back on sale.
- Shopify products whose SKU isn't in the ERP feed are never touched.

Only products tagged `inext-sync` get their title, description, price and tags
updated from the ERP. The sync adds this tag to every product it creates.
Products that reached Shopify any other way have no tag, so they keep their
own details and only their stock is synced. Remove the tag from a product to
manage it by hand; add it to let the ERP manage it.

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
