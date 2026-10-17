// Genera la colección de las 4 APIs en formato Insomnia v4 (también la importan Postman,
// Bruno, Hoppscotch y Yaak). Los ids se encadenan solos con after-response scripts:
// al crear un recurso se guarda su id en el environment y las demás peticiones lo usan.
// Uso: node scripts/buildCollection.js  ->  insomnia/f0-collection.json
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 'wrk_quant_core_f0';
const ENV = 'env_quant_core_f0';
const resources = [];
let n = 0;

const saveId = (key, expr = 'insomnia.response.json().id') =>
  `const body = insomnia.response.json();\nif (body && ${expr.replace('insomnia.response.json()', 'body')}) insomnia.environment.set('${key}', ${expr.replace('insomnia.response.json()', 'body')});`;

function folder(name, description) {
  const id = `fld_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  resources.push({ _id: id, _type: 'request_group', parentId: W, name, description, metaSortKey: ++n });
  return id;
}

function req(parentId, name, method, path, { body, script, description } = {}) {
  resources.push({
    _id: `req_${String(++n).padStart(3, '0')}`,
    _type: 'request',
    parentId,
    name,
    description: description ?? '',
    method,
    url: `{{ _.base_url }}${path}`,
    body: body ? { mimeType: 'application/json', text: JSON.stringify(body, null, 2) } : {},
    headers: body ? [{ name: 'Content-Type', value: 'application/json' }] : [],
    afterResponseScript: script ?? '',
    metaSortKey: n,
  });
}

resources.push({
  _id: W,
  _type: 'workspace',
  name: 'Quant Core F0 — 4 APIs (Alpaca + Supabase)',
  description: 'REST + GraphQL del equipo F0. Corre `npm run dev` en quant-core-engine/api antes de probar.',
  scope: 'collection',
});
resources.push({
  _id: ENV,
  _type: 'environment',
  parentId: W,
  name: 'Base Environment',
  data: {
    base_url: 'http://localhost:3060/api/v1',
    graphql_url: 'http://localhost:3060/graphql',
    watchlist_id: '',
    order_id: '',
    chain_id: '',
    strategy_id: '',
    gql_watchlist_id: '',
    leg_buy: '',
    leg_sell: '',
  },
});

const acc = folder('0. Cuenta', 'Verifica que las llaves de Alpaca funcionan');
req(acc, 'GET cuenta Alpaca', 'GET', '/account');

const wl = folder('1. Watchlists', 'Alpaca /v2/watchlists + espejo en Supabase');
req(wl, 'GET listar', 'GET', '/watchlists');
req(wl, 'POST crear', 'POST', '/watchlists', { body: { name: 'Prueba colección F0', symbols: ['AAPL', 'MSFT', 'SPY'] }, script: saveId('watchlist_id') });
req(wl, 'GET detalle', 'GET', '/watchlists/{{ _.watchlist_id }}');
req(wl, 'PUT reemplazar', 'PUT', '/watchlists/{{ _.watchlist_id }}', { body: { name: 'Prueba colección F0 v2', symbols: ['AAPL', 'NVDA'] } });
req(wl, 'POST agregar símbolo', 'POST', '/watchlists/{{ _.watchlist_id }}/symbols', { body: { symbol: 'TSLA' } });
req(wl, 'DELETE quitar símbolo', 'DELETE', '/watchlists/{{ _.watchlist_id }}/symbols/TSLA');
req(wl, 'DELETE borrar', 'DELETE', '/watchlists/{{ _.watchlist_id }}');

const ch = folder('2. Option chains', 'Ingesta de contratos + snapshots (IV y griegas) desde Alpaca');
const today = new Date();
const plus = (d) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
// Guarda el id y deja listas dos piernas (ATM y dos strikes arriba) para la estrategia.
const chainScript = `${saveId('chain_id')}
const calls = (body.quotes || []).filter(q => q.type === 'call' && q.expiration === (body.quotes[0] || {}).expiration).sort((a, b) => a.strike - b.strike);
const i = Math.max(0, calls.findIndex(q => q.strike >= (body.underlyingPrice || 0)));
if (calls[i]) insomnia.environment.set('leg_buy', calls[i].symbol);
if (calls[i + 2]) insomnia.environment.set('leg_sell', calls[i + 2].symbol);`;
req(ch, 'GET listar', 'GET', '/option-chains');
req(ch, 'POST seguir SPY (calls 3 semanas)', 'POST', '/option-chains', {
  body: { underlying: 'SPY', expiration_from: plus(1), expiration_to: plus(21), option_type: 'call' },
  script: chainScript,
  description: 'Ajusta las fechas si ya pasaron.',
});
req(ch, 'GET cadena con cotizaciones', 'GET', '/option-chains/{{ _.chain_id }}?type=call');
req(ch, 'PUT cambiar filtros', 'PUT', '/option-chains/{{ _.chain_id }}', {
  body: { underlying: 'SPY', expiration_from: plus(1), expiration_to: plus(21), option_type: 'call' },
  script: chainScript,
});
req(ch, 'POST refresh', 'POST', '/option-chains/{{ _.chain_id }}/refresh');
req(ch, 'DELETE dejar de seguir', 'DELETE', '/option-chains/{{ _.chain_id }}');

const st = folder('3. Strategies', 'Multi-leg validadas en Alpaca; usa las piernas que dejó la cadena');
const strategyBody = (name) => ({
  name,
  underlying: 'SPY',
  qty: 1,
  order_type: 'limit',
  limit_price: 0.01,
  legs: [
    { symbol: '{{ _.leg_buy }}', side: 'buy', ratio_qty: 1 },
    { symbol: '{{ _.leg_sell }}', side: 'sell', ratio_qty: 1 },
  ],
});
req(st, 'GET listar', 'GET', '/strategies');
req(st, 'POST crear bull call spread', 'POST', '/strategies', { body: strategyBody('Bull call spread SPY'), script: saveId('strategy_id') });
req(st, 'GET detalle valorado', 'GET', '/strategies/{{ _.strategy_id }}');
req(st, 'GET riesgo con el motor (Monte Carlo)', 'GET', '/strategies/{{ _.strategy_id }}/risk?paths=100000', {
  description: 'Motor Rust/WASM sobre precios e IV reales de Alpaca: Monte Carlo, matriz de P&L, Reg T / SPAN, griegas.',
});
req(st, 'PUT editar (draft)', 'PUT', '/strategies/{{ _.strategy_id }}', { body: strategyBody('Bull call spread SPY (ajustado)') });
req(st, 'POST enviar a Alpaca (mleg)', 'POST', '/strategies/{{ _.strategy_id }}/submit');
req(st, 'DELETE borrar (cancela orden)', 'DELETE', '/strategies/{{ _.strategy_id }}');

const or = folder('4. Orders', 'Alpaca /v2/orders (paper). Limit a $1: no se llena');
req(or, 'GET listar', 'GET', '/orders?status=all&limit=10');
req(or, 'POST orden limit AAPL', 'POST', '/orders', {
  body: { symbol: 'AAPL', qty: 1, side: 'buy', type: 'limit', time_in_force: 'gtc', limit_price: 1 },
  script: saveId('order_id'),
});
req(or, 'GET detalle', 'GET', '/orders/{{ _.order_id }}');
req(or, 'PATCH reemplazar precio', 'PATCH', '/orders/{{ _.order_id }}', { body: { limit_price: 1.05 }, script: saveId('order_id') });
req(or, 'DELETE cancelar', 'DELETE', '/orders/{{ _.order_id }}');
req(or, 'DELETE cancelar todas', 'DELETE', '/orders');

const gq = folder('5. GraphQL', 'Las mismas operaciones por /graphql');
resources.push({
  _id: `req_${String(++n).padStart(3, '0')}`,
  _type: 'request',
  parentId: gq,
  name: 'Query: todo',
  method: 'POST',
  url: '{{ _.graphql_url }}',
  headers: [{ name: 'Content-Type', value: 'application/json' }],
  body: {
    mimeType: 'application/graphql',
    text: JSON.stringify({
      query:
        '{\n  watchlists { id name symbols }\n  optionChains { id underlying contractsCount underlyingPrice }\n  strategies { id name status pricing { netPerUnit netTotal } }\n  orders(limit: 5) { id symbol status limitPrice }\n}',
    }),
  },
  metaSortKey: n,
});
resources.push({
  _id: `req_${String(++n).padStart(3, '0')}`,
  _type: 'request',
  parentId: gq,
  name: 'Mutation: crear watchlist',
  method: 'POST',
  url: '{{ _.graphql_url }}',
  headers: [{ name: 'Content-Type', value: 'application/json' }],
  body: {
    mimeType: 'application/graphql',
    text: JSON.stringify({ query: 'mutation {\n  createWatchlist(input: { name: "GraphQL F0", symbols: ["QQQ"] }) { id name symbols }\n}' }),
  },
  afterResponseScript: saveId('gql_watchlist_id', 'insomnia.response.json().data?.createWatchlist?.id'),
  metaSortKey: n,
});
resources.push({
  _id: `req_${String(++n).padStart(3, '0')}`,
  _type: 'request',
  parentId: gq,
  name: 'Mutation: borrar watchlist',
  method: 'POST',
  url: '{{ _.graphql_url }}',
  headers: [{ name: 'Content-Type', value: 'application/json' }],
  body: {
    mimeType: 'application/graphql',
    text: JSON.stringify({ query: 'mutation {\n  deleteWatchlist(id: "{{ _.gql_watchlist_id }}")\n}' }),
  },
  metaSortKey: n,
});

const out = new URL('../insomnia/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(
  new URL('f0-collection.json', out),
  JSON.stringify({ _type: 'export', __export_format: 4, __export_date: new Date().toISOString(), __export_source: 'quant-core-f0', resources }, null, 2) + '\n',
);
console.log(`insomnia/f0-collection.json: ${resources.filter((r) => r._type === 'request').length} peticiones`);
