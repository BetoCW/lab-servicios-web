// Especificación OpenAPI 3 de las 4 APIs (se sirve en /api-docs con Swagger UI).
import { config } from '../config.js';

const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const ok = (schema, code = 200) => ({ [code]: { description: 'OK', ...json(schema) }, default: { description: 'Error', ...json(ref('Error')) } });
const noContent = { 204: { description: 'Eliminado' }, default: { description: 'Error', ...json(ref('Error')) } };

const op = (tag, summary, extra = {}) => ({ tags: [tag], summary, ...extra });

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Quant Core Engine & Market Data (F0) — API',
    version: '1.0.0',
    description:
      '4 APIs CRUD conectadas a **Alpaca Paper Trading** y persistidas en **Supabase**. ' +
      'Las mismas operaciones están en GraphQL en `/graphql`.',
  },
  servers: [{ url: config.apiUrl }],
  tags: [
    { name: 'Watchlists', description: 'Listas de seguimiento (Alpaca /v2/watchlists)' },
    { name: 'Orders', description: 'Órdenes de acciones y opciones (Alpaca /v2/orders)' },
    { name: 'Option chains', description: 'Ingesta de cadenas de opciones (contratos + snapshots con IV y griegas)' },
    { name: 'Strategies', description: 'Estrategias multi-leg validadas contra Alpaca y enviadas como orden mleg' },
    { name: 'Account', description: 'Estado de la cuenta paper (verifica las llaves)' },
  ],
  paths: {
    '/account': { get: op('Account', 'Cuenta de Alpaca', { responses: ok({ type: 'object' }) }) },

    '/watchlists': {
      get: op('Watchlists', 'Listar watchlists', { responses: ok({ type: 'array', items: ref('Watchlist') }) }),
      post: op('Watchlists', 'Crear watchlist', { requestBody: json(ref('WatchlistInput')), responses: ok(ref('Watchlist'), 201) }),
    },
    '/watchlists/{id}': {
      parameters: [idParam],
      get: op('Watchlists', 'Obtener watchlist', { responses: ok(ref('Watchlist')) }),
      put: op('Watchlists', 'Reemplazar nombre y símbolos', { requestBody: json(ref('WatchlistInput')), responses: ok(ref('Watchlist')) }),
      delete: op('Watchlists', 'Eliminar watchlist', { responses: noContent }),
    },
    '/watchlists/{id}/symbols': {
      parameters: [idParam],
      post: op('Watchlists', 'Agregar un símbolo', {
        requestBody: json({ type: 'object', required: ['symbol'], properties: { symbol: { type: 'string', example: 'NVDA' } } }),
        responses: ok(ref('Watchlist'), 201),
      }),
    },
    '/watchlists/{id}/symbols/{symbol}': {
      parameters: [idParam, { name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
      delete: op('Watchlists', 'Quitar un símbolo', { responses: ok(ref('Watchlist')) }),
    },

    '/orders': {
      get: op('Orders', 'Listar órdenes', {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'closed', 'all'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'symbols', in: 'query', schema: { type: 'string' }, description: 'Separados por coma' },
        ],
        responses: ok({ type: 'array', items: ref('Order') }),
      }),
      post: op('Orders', 'Enviar orden', { requestBody: json(ref('OrderInput')), responses: ok(ref('Order'), 201) }),
      delete: op('Orders', 'Cancelar todas las órdenes abiertas', { responses: ok({ type: 'array', items: { type: 'object' } }, 207) }),
    },
    '/orders/{id}': {
      parameters: [idParam],
      get: op('Orders', 'Obtener orden', { responses: ok(ref('Order')) }),
      patch: op('Orders', 'Reemplazar orden (regresa la orden nueva)', {
        requestBody: json({
          type: 'object',
          properties: { qty: { type: 'number' }, limit_price: { type: 'number' }, stop_price: { type: 'number' }, time_in_force: { type: 'string' } },
        }),
        responses: ok(ref('Order')),
      }),
      delete: op('Orders', 'Cancelar orden', { responses: ok(ref('Order')) }),
    },

    '/option-chains': {
      get: op('Option chains', 'Listar cadenas seguidas', {
        parameters: [{ name: 'underlying', in: 'query', schema: { type: 'string' } }],
        responses: ok({ type: 'array', items: ref('OptionChain') }),
      }),
      post: op('Option chains', 'Seguir una cadena e ingestarla desde Alpaca', {
        requestBody: json(ref('OptionChainInput')),
        responses: ok(ref('OptionChain'), 201),
      }),
    },
    '/option-chains/{id}': {
      parameters: [idParam],
      get: op('Option chains', 'Cadena con cotizaciones, IV y griegas', {
        parameters: [
          { name: 'expiration', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['call', 'put'] } },
        ],
        responses: ok(ref('OptionChain')),
      }),
      put: op('Option chains', 'Cambiar filtros y re-ingestar', { requestBody: json(ref('OptionChainInput')), responses: ok(ref('OptionChain')) }),
      delete: op('Option chains', 'Dejar de seguir (borra sus cotizaciones)', { responses: noContent }),
    },
    '/option-chains/{id}/refresh': {
      parameters: [idParam],
      post: op('Option chains', 'Actualizar cotizaciones desde Alpaca', { responses: ok(ref('OptionChain')) }),
    },

    '/strategies': {
      get: op('Strategies', 'Listar estrategias', {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'submitted', 'canceled'] } },
          { name: 'underlying', in: 'query', schema: { type: 'string' } },
        ],
        responses: ok({ type: 'array', items: ref('Strategy') }),
      }),
      post: op('Strategies', 'Crear estrategia (valida cada pierna en Alpaca)', { requestBody: json(ref('StrategyInput')), responses: ok(ref('Strategy'), 201) }),
    },
    '/strategies/{id}': {
      parameters: [idParam],
      get: op('Strategies', 'Estrategia valorada con cotizaciones vivas', { responses: ok(ref('Strategy')) }),
      put: op('Strategies', 'Reemplazar estrategia (solo draft)', { requestBody: json(ref('StrategyInput')), responses: ok(ref('Strategy')) }),
      delete: op('Strategies', 'Eliminar (cancela la orden si ya se envió)', { responses: noContent }),
    },
    '/strategies/{id}/risk': {
      parameters: [idParam],
      get: op('Strategies', 'Riesgo con el motor Rust/WASM sobre datos reales de Alpaca', {
        description: 'Monte Carlo del P&L al vencimiento, matriz precio × vol, márgenes Reg T / SPAN, griegas del portafolio y precio del motor vs. mid de Alpaca.',
        parameters: [
          { name: 'paths', in: 'query', schema: { type: 'integer', default: 50000, minimum: 1000, maximum: 500000 } },
          { name: 'seed', in: 'query', schema: { type: 'integer', default: 42 } },
          { name: 'horizon_days', in: 'query', schema: { type: 'number' }, description: 'Por defecto: hasta el primer vencimiento' },
        ],
        responses: ok({ type: 'object' }),
      }),
    },
    '/strategies/{id}/submit': {
      parameters: [idParam],
      post: op('Strategies', 'Enviar como orden multi-leg a Alpaca', { responses: ok({ type: 'object' }, 201) }),
    },
  },
  components: {
    schemas: {
      Error: { type: 'object', properties: { status: { type: 'integer' }, message: { type: 'string' }, details: {} } },
      WatchlistInput: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', example: 'Tech F0' }, symbols: { type: 'array', items: { type: 'string' }, example: ['AAPL', 'MSFT', 'SPY'] } },
      },
      Watchlist: {
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' }, symbols: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string' }, updatedAt: { type: 'string' } },
      },
      OrderInput: {
        type: 'object',
        required: ['symbol', 'qty', 'side', 'type', 'time_in_force'],
        properties: {
          symbol: { type: 'string', example: 'AAPL' },
          qty: { type: 'number', example: 1 },
          side: { type: 'string', enum: ['buy', 'sell'] },
          type: { type: 'string', enum: ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'], example: 'limit' },
          time_in_force: { type: 'string', enum: ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'], example: 'day' },
          limit_price: { type: 'number', example: 100 },
          stop_price: { type: 'number' },
          position_intent: { type: 'string', enum: ['buy_to_open', 'buy_to_close', 'sell_to_open', 'sell_to_close'] },
          client_order_id: { type: 'string' },
        },
      },
      Order: { type: 'object', properties: { id: { type: 'string' }, symbol: { type: 'string' }, side: { type: 'string' }, type: { type: 'string' }, qty: { type: 'number' }, status: { type: 'string' } } },
      OptionChainInput: {
        type: 'object',
        required: ['underlying'],
        properties: {
          underlying: { type: 'string', example: 'SPY' },
          expiration_from: { type: 'string', format: 'date' },
          expiration_to: { type: 'string', format: 'date' },
          option_type: { type: 'string', enum: ['call', 'put'] },
          strike_min: { type: 'number' },
          strike_max: { type: 'number' },
        },
      },
      OptionChain: {
        type: 'object',
        properties: {
          id: { type: 'string' }, underlying: { type: 'string' }, underlyingPrice: { type: 'number' }, contractsCount: { type: 'integer' },
          lastRefreshedAt: { type: 'string' }, quotes: { type: 'array', items: { type: 'object' } },
        },
      },
      StrategyInput: {
        type: 'object',
        required: ['name', 'underlying', 'legs'],
        properties: {
          name: { type: 'string', example: 'Bull call spread SPY' },
          underlying: { type: 'string', example: 'SPY' },
          description: { type: 'string' },
          qty: { type: 'integer', example: 1 },
          order_type: { type: 'string', enum: ['market', 'limit'] },
          limit_price: { type: 'number' },
          legs: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              required: ['symbol', 'side'],
              properties: {
                symbol: { type: 'string', example: 'SPY251219C00600000' },
                side: { type: 'string', enum: ['buy', 'sell'] },
                ratio_qty: { type: 'integer', example: 1 },
                position_intent: { type: 'string', enum: ['buy_to_open', 'buy_to_close', 'sell_to_open', 'sell_to_close'] },
              },
            },
          },
        },
      },
      Strategy: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, status: { type: 'string' }, legs: { type: 'array', items: { type: 'object' } }, pricing: { type: 'object' } } },
    },
  },
};
