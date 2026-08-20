/**
 * mapper.js
 * Maps iNext ERP product fields → Shopify product fields.
 *
 * Actual field names returned by proc_get_items_for_shopify (confirmed via
 * live API call on 2026-08-20): Itemcode, ItemId, ItemMRP, ItemWSP, ItemEXP,
 * PurchasePrice, ArticleId, ArticleNo, Description, ExtDescription,
 * ArticleShortName, UomId, UomName, InvDepartmentName, InvCategoryName,
 * InvSubCategoryName, Para1Name..Para6Name (color/size attributes),
 * SupplierName, HSNCode, StockQty.
 *
 * Notes on this data model:
 * - `Itemcode` (lowercase "c") is the unique per-piece SKU — each row is
 *   effectively a single physical saree, not a SKU with multiple units.
 * - `Description` is actually the department blurb (e.g. "SAREES (FIRST
 *   FLOOR)"), not an item-specific description — do not use it as the title.
 * - There is no dedicated item name field. `ArticleNo` (the design/article
 *   code, e.g. "ZEBRA MULTI") plus `Para1Name` (color, e.g. "PINK") is the
 *   closest thing to a human-readable title.
 * - There is no image field in this API's response at all.
 *
 * Shopify REST API product structure:
 * https://shopify.dev/docs/api/admin-rest/2024-01/resources/product
 */

/**
 * Converts a single iNext ERP item to a Shopify product payload.
 * @param {Object} erpItem - Raw item from iNext API
 * @returns {Object} Shopify-formatted product payload
 */
function mapToShopifyProduct(erpItem) {
  // ── Core Fields ──────────────────────────────────────────────────────────
  const articleNo    = erpItem.ArticleNo || 'Unnamed Item';
  const color         = (erpItem.Para1Name && erpItem.Para1Name !== '[None]') ? erpItem.Para1Name : '';
  const title         = color ? `${articleNo} - ${color}` : articleNo;
  const sku           = erpItem.Itemcode || '';
  const price          = erpItem.ItemMRP || 0;
  const comparePrice  = null;
  const quantity      = erpItem.StockQty || 0;
  const barcode       = '';
  const category       = erpItem.InvCategoryName || '';
  const description   = [category, color].filter(Boolean).join(' - ');
  const vendor        = erpItem.SupplierName || 'Mamta Saree Centre';
  const productType   = category;
  const imageUrl      = null;
  const subCategory   = erpItem.InvSubCategoryName || '';
  const tags          = [category, subCategory, color].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  // ── Build Shopify Payload ─────────────────────────────────────────────────
  const payload = {
    product: {
      title,
      body_html: description,
      vendor,
      product_type: productType,
      status: 'active',
      tags: tags.join(', '),
      variants: [
        {
          price:                  parseFloat(price).toFixed(2),
          compare_at_price:       comparePrice ? parseFloat(comparePrice).toFixed(2) : null,
          sku,
          barcode:                String(barcode),
          inventory_management:  'shopify',
          inventory_quantity:     parseInt(quantity) || 0,
          requires_shipping:      true,
        }
      ]
    }
  };

  // Attach image only if URL is valid
  if (imageUrl && imageUrl.trim().startsWith('http')) {
    payload.product.images = [{ src: imageUrl.trim() }];
  }

  return payload;
}

module.exports = { mapToShopifyProduct };
