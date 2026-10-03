/**
 * http.js
 * Puts a hard time limit on every API call (iNext and Shopify). axios's own
 * `timeout` only fires when a connection goes silent, so a slow, trickling
 * reply could hold up the sync indefinitely. Now a stuck call is abandoned
 * after a minute and retried on the next round.
 */

const axios = require('axios');

const REQUEST_TIME_LIMIT_MS = 60 * 1000;

axios.interceptors.request.use((config) => {
  if (!config.signal) config.signal = AbortSignal.timeout(REQUEST_TIME_LIMIT_MS);
  return config;
});

axios.interceptors.response.use(null, (err) => {
  if (axios.isCancel(err)) err.message = `no answer within ${REQUEST_TIME_LIMIT_MS / 1000}s`;
  return Promise.reject(err);
});
