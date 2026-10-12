import config from '../src/config/config';

// Prueba de punta a punta del Catalogo de Catalogos contra el servidor en
// ejecucion (npm run dev). Corre el mismo guion en MongoDB y en Supabase y
// compara el codigo HTTP obtenido con el esperado.
const BASE = `http://${config.HOST}:${config.PORT}${config.API_URL}`;
const results = [];

const call = async (label, method, path, { token, body, expect }) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  results.push({ label, method, path, expect, status: res.status, db: res.headers.get('x-db-server') });
  return data;
};

const scenario = async (dbServer) => {
  const tag = `[${dbServer}]`;
  const { token } = await call(`${tag} login`, 'POST', '/auth/login', {
    body: { usuario: 'kperez', dbServer }, expect: 200,
  });
  const t = { token };

  await call(`${tag} sesion`, 'GET', '/auth/session', { ...t, expect: 200 });
  await call(`${tag} lista`, 'GET', '/catalogs', { ...t, expect: 200 });
  await call(`${tag} filtro collection`, 'GET', '/catalogs?collection=trading&section=Analisis', { ...t, expect: 200 });
  await call(`${tag} uno`, 'GET', '/catalogs/strategies', { ...t, expect: 200 });
  await call(`${tag} arbol`, 'GET', '/catalogs/strategies/tree', { ...t, expect: 200 });
  const level2 = await call(`${tag} valores nivel 2`, 'GET', '/catalogs/strategies/values?level=2', { ...t, expect: 200 });

  await call(`${tag} alta catalogo`, 'POST', '/catalogs', {
    ...t,
    expect: 201,
    body: {
      key: 'order_types', label: 'Tipos de Orden', collection: 'trading', section: 'Operacion',
      sequence: 5, route: '/config/order-types',
      values: [{ code: 'MARKET', value: 'A mercado', alias: 'MKT' }],
    },
  });
  await call(`${tag} alta duplicada`, 'POST', '/catalogs', {
    ...t, expect: 409, body: { key: 'order_types', label: 'x', collection: 'trading' },
  });
  await call(`${tag} key invalida`, 'POST', '/catalogs', {
    ...t, expect: 400, body: { key: 'Order Types', label: 'x', collection: 'trading' },
  });
  await call(`${tag} alta masiva`, 'POST', '/catalogs/many', {
    ...t,
    expect: 201,
    body: [
      { key: 'markets', label: 'Mercados', collection: 'trading', values: [{ code: 'NYSE', value: 'Bolsa de NY' }] },
      { key: 'currencies', label: 'Monedas', collection: 'config', values: [{ code: 'MXN', value: 'Peso mexicano' }] },
    ],
  });
  await call(`${tag} alta masiva parcial`, 'POST', '/catalogs/many', {
    ...t,
    expect: 207,
    body: [
      { key: 'markets', label: 'Repetido', collection: 'trading' },
      { key: 'risk_levels', label: 'Niveles de riesgo', collection: 'trading' },
    ],
  });

  await call(`${tag} modifica catalogo`, 'PUT', '/catalogs/order_types', {
    ...t, expect: 200, body: { label: 'Tipos de Orden de Compra/Venta', sequence: 6 },
  });
  await call(`${tag} modifica masivo`, 'PUT', '/catalogs/many', {
    ...t, expect: 200, body: [{ key: 'markets', section: 'Mercados' }, { key: 'currencies', section: 'Divisas' }],
  });

  const limit = await call(`${tag} alta valor`, 'POST', '/catalogs/order_types/values', {
    ...t, expect: 201, body: { code: 'LIMIT', value: 'Limitada', alias: 'LMT' },
  });
  await call(`${tag} alta valor nivel 2`, 'POST', '/catalogs/order_types/values', {
    ...t, expect: 201, body: { parentId: limit.id, code: 'LIMIT_GTC', value: 'Limitada hasta cancelar', alias: 'GTC' },
  });
  await call(`${tag} code repetido`, 'POST', '/catalogs/order_types/values', {
    ...t, expect: 409, body: { code: 'LIMIT', value: 'Otra' },
  });
  await call(`${tag} padre inexistente`, 'POST', '/catalogs/order_types/values', {
    ...t, expect: 400, body: { parentId: '00000000-0000-4000-8000-000000000000', code: 'X1', value: 'x' },
  });
  const many = await call(`${tag} alta valores masiva`, 'POST', '/catalogs/order_types/values/many', {
    ...t,
    expect: 201,
    body: [
      { code: 'STOP', value: 'Stop', alias: 'STP' },
      { code: 'STOP_LIMIT', value: 'Stop limitada', alias: 'STL' },
    ],
  });
  await call(`${tag} consulta valor`, 'GET', `/catalogs/order_types/values/${limit.id}`, { ...t, expect: 200 });
  await call(`${tag} modifica valor`, 'PUT', `/catalogs/order_types/values/${limit.id}`, {
    ...t, expect: 200, body: { value: 'Limitada (precio maximo)', description: 'Se ejecuta a ese precio o mejor' },
  });
  await call(`${tag} modifica valores masivo`, 'PUT', '/catalogs/order_types/values/many', {
    ...t, expect: 200, body: many.data.map((v, i) => ({ id: v.id, alias: `${v.alias}_${i + 1}` })),
  });
  await call(`${tag} secuencia ocupada`, 'PUT', `/catalogs/order_types/values/${many.data[0].id}`, {
    ...t, expect: 409, body: { sequence: 1 },
  });
  await call(`${tag} baja logica valor (cascada)`, 'DELETE', `/catalogs/order_types/values/${limit.id}`, { ...t, expect: 200 });
  await call(`${tag} valor ya borrado`, 'GET', `/catalogs/order_types/values/${limit.id}`, { ...t, expect: 404 });
  await call(`${tag} baja fisica valores masiva`, 'DELETE', '/catalogs/order_types/values/many?hard=true', {
    ...t, expect: 200, body: { ids: many.data.map((v) => v.id) },
  });
  await call(`${tag} nivel 2 de strategies`, 'GET', `/catalogs/strategies/values?parentId=${level2[0].parentId}`, { ...t, expect: 200 });

  await call(`${tag} baja logica catalogo`, 'DELETE', '/catalogs/order_types', { ...t, expect: 200 });
  await call(`${tag} catalogo borrado`, 'GET', '/catalogs/order_types', { ...t, expect: 404 });
  await call(`${tag} baja fisica tras baja logica`, 'DELETE', '/catalogs/order_types?hard=true', { ...t, expect: 200 });
  await call(`${tag} baja fisica catalogo`, 'DELETE', '/catalogs/risk_levels?hard=true', { ...t, expect: 200 });
  await call(`${tag} baja fisica masiva`, 'DELETE', '/catalogs/many?hard=true', {
    ...t, expect: 200, body: { keys: ['markets', 'currencies'] },
  });
};

const run = async () => {
  await call('sin token', 'GET', '/catalogs', { expect: 401 });
  await call('dbServer invalido', 'POST', '/auth/login', { body: { usuario: 'kperez', dbServer: 'oracle' }, expect: 400 });
  await scenario('mongodb');
  await scenario('supabase');

  let failed = 0;
  results.forEach((r) => {
    const ok = r.status === r.expect;
    if (!ok) failed += 1;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${String(r.status)} ${r.method.padEnd(6)} ${r.path.padEnd(52).slice(0, 52)} ${r.label}`,
    );
  });
  console.log(`\n${results.length - failed}/${results.length} peticiones con el codigo esperado.`);
  process.exit(failed ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
