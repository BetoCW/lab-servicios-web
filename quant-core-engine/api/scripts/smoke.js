// Prueba de punta a punta: recorre GET/POST/PUT/PATCH/DELETE de las 4 APIs + GraphQL
// contra el servidor corriendo (npm run dev) y contra Alpaca Paper + Supabase reales.
// Uso: npm run smoke            (BASE=http://localhost:3060 por defecto)
// Todo lo que crea lo borra al final; las órdenes son paper y con precio lejano al mercado.
const BASE = process.env.BASE ?? 'http://localhost:3060';
const API = `${BASE}/api/v1`;
const results = [];

async function call(method, path, body, expected) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  const pass = expected ? res.status === expected : res.ok;
  results.push({ ok: pass ? 'OK' : 'FAIL', method, path: path.replace(BASE, ''), status: res.status, note: pass ? '' : data?.message ?? '' });
  if (!pass) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const days = (n) => isoDate(new Date(Date.now() + n * 86400000));

async function main() {
  await call('GET', '/account');

  // ---------------------------------------------------- 1. watchlists
  const wl = await call('POST', '/watchlists', { name: `smoke-${Date.now()}`, symbols: ['AAPL', 'MSFT'] }, 201);
  await call('GET', `/watchlists/${wl.id}`);
  await call('PUT', `/watchlists/${wl.id}`, { name: `${wl.name}-v2`, symbols: ['AAPL', 'SPY'] });
  await call('POST', `/watchlists/${wl.id}/symbols`, { symbol: 'NVDA' }, 201);
  await call('DELETE', `/watchlists/${wl.id}/symbols/SPY`);
  await call('GET', '/watchlists');
  await call('DELETE', `/watchlists/${wl.id}`, null, 204);

  // ---------------------------------------------------- 3. option-chains
  const chain = await call('POST', '/option-chains', { underlying: 'SPY', expiration_from: days(1), expiration_to: days(21), option_type: 'call' }, 201);
  const spot = chain.underlyingPrice ?? 600;
  await call('PUT', `/option-chains/${chain.id}`, {
    underlying: 'SPY', expiration_from: days(1), expiration_to: days(21), option_type: 'call',
    strike_min: Math.floor(spot * 0.95), strike_max: Math.ceil(spot * 1.05),
  });
  await call('POST', `/option-chains/${chain.id}/refresh`);
  const full = await call('GET', `/option-chains/${chain.id}`);
  await call('GET', '/option-chains?underlying=SPY');

  // ---------------------------------------------------- 4. strategies (bull call spread)
  const exp = full.quotes[0]?.expiration;
  const calls = full.quotes.filter((qt) => qt.expiration === exp).sort((a, b) => a.strike - b.strike);
  const atm = calls.findIndex((qt) => qt.strike >= spot);
  const [lower, upper] = [calls[Math.max(atm, 0)], calls[Math.min(Math.max(atm, 0) + 2, calls.length - 1)]];
  const legs = [
    { symbol: lower.symbol, side: 'buy', ratio_qty: 1 },
    { symbol: upper.symbol, side: 'sell', ratio_qty: 1 },
  ];
  const st = await call('POST', '/strategies', { name: 'Smoke bull call spread', underlying: 'SPY', qty: 1, order_type: 'limit', limit_price: 0.01, legs }, 201);
  await call('GET', `/strategies/${st.id}`);
  await call('PUT', `/strategies/${st.id}`, { name: 'Smoke bull call spread v2', underlying: 'SPY', qty: 1, order_type: 'limit', limit_price: 0.01, legs });
  await call('GET', '/strategies?underlying=SPY');
  await call('POST', `/strategies/${st.id}/submit`, null, 201);
  await call('DELETE', `/strategies/${st.id}`, null, 204);
  await call('DELETE', `/option-chains/${chain.id}`, null, 204);

  // ---------------------------------------------------- 2. orders (limit muy abajo: no se llena)
  const order = await call('POST', '/orders', { symbol: 'AAPL', qty: 1, side: 'buy', type: 'limit', time_in_force: 'gtc', limit_price: 1 }, 201);
  await call('GET', `/orders/${order.id}`);
  // Una orden recién enviada puede seguir en pending_new; Alpaca solo la reemplaza ya aceptada.
  await new Promise((r) => setTimeout(r, 1500));
  const replaced = await call('PATCH', `/orders/${order.id}`, { limit_price: 1.05 });
  await call('DELETE', `/orders/${replaced.id}`);
  await call('GET', '/orders?status=all&limit=5');

  // ---------------------------------------------------- GraphQL
  await call('POST', `${BASE}/graphql`, { query: '{ watchlists { id name } strategies { id } optionChains { id } orders(limit: 3) { id status } }' });
}

main()
  .catch((err) => console.error(`\n${err.message}\n`))
  .finally(() => {
    console.table(results);
    const failed = results.filter((r) => r.ok !== 'OK').length;
    console.log(`${results.length - failed}/${results.length} pasos OK`);
    process.exitCode = failed ? 1 : 0;
  });
