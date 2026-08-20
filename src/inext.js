/**
 * inext.js
 * Fetches products from the iNext ERP API.
 * 
 * Response shape from API:
 * { status: boolean, message: string, data: Array<Product> }
 * 
 * When data is available:
 * { status: true, message: "Success", data: [ { ...productFields }, ... ] }
 * 
 * When empty:
 * { status: false, message: "No data found", data: [] }
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

/**
 * Fetch all products from iNext ERP marked for Shopify export.
 * @returns {Array} Array of raw ERP product objects
 */
async function fetchERPProducts() {
  logger.info('Calling iNext ERP API...');

  let responseData;
  try {
    const response = await axios({
      method: 'GET',
      url: config.inext.apiUrl,
      headers: { 'Content-Type': 'application/json' },
      data: {
        Token:         config.inext.token,
        server_ip:     config.inext.serverIp,
        server_port:   config.inext.serverPort,
        database_name: config.inext.databaseName,
        db_user:       config.inext.dbUser,
        db_password:   config.inext.dbPassword,
      },
      timeout: 30000,
      // Don't throw on 4xx — let us handle it below
      validateStatus: () => true,
    });
    responseData = response.data;
  } catch (err) {
    throw new Error(`iNext API network error: ${err.message}`);
  }

  const { status, message, data } = responseData;

  if (!status || !Array.isArray(data) || data.length === 0) {
    logger.warn(`iNext API: ${message} (0 products returned)`);
    return [];
  }

  logger.success(`iNext API returned ${data.length} products`);
  return data;
}

module.exports = { fetchERPProducts };
