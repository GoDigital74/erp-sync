require('dotenv').config();

module.exports = {
  inext: {
    apiUrl: process.env.INEXT_API_URL,
    token: process.env.INEXT_TOKEN,
    serverIp: process.env.INEXT_SERVER_IP,
    serverPort: parseInt(process.env.INEXT_SERVER_PORT),
    databaseName: process.env.INEXT_DATABASE_NAME,
    dbUser: process.env.INEXT_DB_USER,
    dbPassword: process.env.INEXT_DB_PASSWORD,
  },
  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
  }
};
