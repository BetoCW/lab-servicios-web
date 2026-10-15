// Cliente HTTP de Alpaca (Trading API + Market Data API) con fetch nativo.
// Docs: https://docs.alpaca.markets/reference
import { config } from '../config.js';
import { HttpError } from './errors.js';

function headers() {
  if (!config.alpaca.keyId || !config.alpaca.secretKey) {
    throw new HttpError(503, 'Faltan ALPACA_KEY_ID / ALPACA_SECRET_KEY en el .env');
  }
  return {
    'APCA-API-KEY-ID': config.alpaca.keyId,
    'APCA-API-SECRET-KEY': config.alpaca.secretKey,
    accept: 'application/json',
  };
}

function toQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(base, method, path, { query, body } = {}) {
  const res = await fetch(`${base}${path}${toQuery(query)}`, {
    method,
    headers: { ...headers(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Algunos errores (404 de ruta, 5xx del balanceador) llegan como texto plano.
    data = { message: text.slice(0, 200) };
  }
  if (!res.ok) {
    // Alpaca responde { code, message }; se respeta su status (404, 403, 422...).
    throw new HttpError(res.status, `Alpaca: ${data?.message ?? res.statusText}`, { alpacaCode: data?.code });
  }
  return data;
}

const trading = (method, path, opts) => request(config.alpaca.tradingUrl, method, path, opts);
const data = (method, path, opts) => request(config.alpaca.dataUrl, method, path, opts);

export const alpaca = {
  account: () => trading('GET', '/v2/account'),

  // ---- watchlists
  listWatchlists: () => trading('GET', '/v2/watchlists'),
  getWatchlist: (id) => trading('GET', `/v2/watchlists/${encodeURIComponent(id)}`),
  createWatchlist: (body) => trading('POST', '/v2/watchlists', { body }),
  updateWatchlist: (id, body) => trading('PUT', `/v2/watchlists/${encodeURIComponent(id)}`, { body }),
  deleteWatchlist: (id) => trading('DELETE', `/v2/watchlists/${encodeURIComponent(id)}`),
  addToWatchlist: (id, symbol) => trading('POST', `/v2/watchlists/${encodeURIComponent(id)}`, { body: { symbol } }),
  removeFromWatchlist: (id, symbol) =>
    trading('DELETE', `/v2/watchlists/${encodeURIComponent(id)}/${encodeURIComponent(symbol)}`),

  // ---- orders
  listOrders: (query) => trading('GET', '/v2/orders', { query: { nested: true, ...query } }),
  getOrder: (id) => trading('GET', `/v2/orders/${encodeURIComponent(id)}`, { query: { nested: true } }),
  createOrder: (body) => trading('POST', '/v2/orders', { body }),
  replaceOrder: (id, body) => trading('PATCH', `/v2/orders/${encodeURIComponent(id)}`, { body }),
  cancelOrder: (id) => trading('DELETE', `/v2/orders/${encodeURIComponent(id)}`),
  cancelAllOrders: () => trading('DELETE', '/v2/orders'),

  // ---- options (contratos)
  async listOptionContracts(query, max = 500) {
    const out = [];
    let page_token;
    do {
      const page = await trading('GET', '/v2/options/contracts', {
        query: { ...query, limit: Math.min(max - out.length, 10000), page_token },
      });
      out.push(...(page.option_contracts ?? []));
      page_token = page.next_page_token;
    } while (page_token && out.length < max);
    return out;
  },
  getOptionContract: (symbolOrId) => trading('GET', `/v2/options/contracts/${encodeURIComponent(symbolOrId)}`),

  // ---- market data
  /** Snapshots (cotización, último trade, IV y griegas) para hasta N símbolos OCC. */
  async optionSnapshots(symbols) {
    const result = {};
    for (let i = 0; i < symbols.length; i += 100) {
      const chunk = symbols.slice(i, i + 100);
      let page_token;
      do {
        const page = await data('GET', '/v1beta1/options/snapshots', {
          query: { symbols: chunk, feed: config.alpaca.optionsFeed, limit: 1000, page_token },
        });
        Object.assign(result, page.snapshots ?? {});
        page_token = page.next_page_token;
      } while (page_token);
    }
    return result;
  },
  stockSnapshot: (symbol) =>
    data('GET', `/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, { query: { feed: config.alpaca.stocksFeed } }),
};
