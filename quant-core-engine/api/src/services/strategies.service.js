// Servicio 4 — Estrategias de opciones multi-leg (spreads, straddles, iron condors...).
// Se guardan en Supabase; cada pierna se valida contra los contratos de Alpaca.
// GET las valora con cotizaciones vivas de Alpaca; POST /:id/submit las envía como
// orden multi-leg (order_class = 'mleg') a Alpaca Paper Trading.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, notFound, badRequest, conflict } from '../lib/errors.js';
import { parseOcc } from '../lib/occ.js';
import { mirrorOrders, toOrderDto } from './orders.service.js';

const MAX_LEGS = 4; // Límite de Alpaca para órdenes multi-leg (mleg)
const CONTRACT_SIZE = 100; // Multiplicador estándar por contrato de opciones
const INTENTS = ['buy_to_open', 'buy_to_close', 'sell_to_open', 'sell_to_close'];

/**
 * Convierte los registros de estrategia y piernas de la base de datos a DTO del cliente.
 *
 * @param {object} strategyRow - Fila de la estrategia en Supabase.
 * @param {Array<object>} [legs=[]] - Registros de las piernas asociadas.
 * @returns {object} DTO formateado de la estrategia.
 */
const toDto = (strategyRow, legs = []) => ({
  id: strategyRow.id,
  name: strategyRow.name,
  underlying: strategyRow.underlying,
  description: strategyRow.description,
  qty: strategyRow.qty,
  orderType: strategyRow.order_type,
  limitPrice: strategyRow.limit_price,
  status: strategyRow.status,
  alpacaOrderId: strategyRow.alpaca_order_id,
  legs: legs.map((leg) => ({
    id: leg.id,
    symbol: leg.symbol,
    side: leg.side,
    ratioQty: leg.ratio_qty,
    positionIntent: leg.position_intent,
    ...parseOcc(leg.symbol),
    ...(leg.quote ? { quote: leg.quote } : {}),
  })),
  createdAt: strategyRow.created_at,
  updatedAt: strategyRow.updated_at,
});

/**
 * Valida los datos recibidos para crear o actualizar una estrategia de opciones.
 *
 * @param {object} body - Cuerpo de la petición con metadatos y piernas de la estrategia.
 * @returns {Promise<{strategy: object, legs: Array<object>}>} Datos sanitizados de la estrategia y piernas.
 * @throws {import('../lib/errors.js').HttpError} Si la validación falla o algún contrato es inválido.
 */
async function validate(body) {
  check(body, {
    name: { required: true, type: 'string' },
    underlying: { required: true, type: 'string' },
    qty: { type: 'number', positive: true },
    order_type: { oneOf: ['market', 'limit'] },
    limit_price: { type: 'number' },
    legs: { required: true, type: 'array' },
  });
  if (body.order_type === 'limit' && body.limit_price == null) throw badRequest('limit_price es obligatorio si order_type = limit');
  if (body.legs.length < 1 || body.legs.length > MAX_LEGS) throw badRequest(`Una estrategia lleva de 1 a ${MAX_LEGS} piernas`);

  const underlying = body.underlying.trim().toUpperCase();
  const legs = body.legs.map((leg, i) => {
    check(leg, {
      symbol: { required: true, type: 'string' },
      side: { required: true, oneOf: ['buy', 'sell'] },
      ratio_qty: { type: 'number', positive: true },
      position_intent: { oneOf: INTENTS },
    });
    const symbol = leg.symbol.trim().toUpperCase();
    if (!parseOcc(symbol)) throw badRequest(`legs[${i}].symbol no es un símbolo OCC válido (ej. AAPL251219C00200000)`);
    return {
      symbol,
      side: leg.side,
      ratio_qty: Math.trunc(Number(leg.ratio_qty ?? 1)),
      position_intent: leg.position_intent ?? (leg.side === 'buy' ? 'buy_to_open' : 'sell_to_open'),
    };
  });

  // Cada pierna debe existir en Alpaca y pertenecer al subyacente declarado.
  await Promise.all(
    legs.map(async (leg, i) => {
      const contract = await alpaca.getOptionContract(leg.symbol).catch((err) => {
        throw badRequest(`legs[${i}]: ${err.message}`);
      });
      if (contract.underlying_symbol !== underlying) {
        throw badRequest(`legs[${i}] (${leg.symbol}) pertenece a ${contract.underlying_symbol}, no a ${underlying}`);
      }
    }),
  );

  return {
    strategy: {
      name: body.name.trim(),
      underlying,
      description: body.description ?? null,
      qty: Math.trunc(Number(body.qty ?? 1)),
      order_type: body.order_type ?? 'market',
      limit_price: body.limit_price ?? null,
    },
    legs,
  };
}

/**
 * Carga una estrategia y sus piernas ordenadas desde la base de datos por ID.
 *
 * @param {string} id - Identificador de la estrategia.
 * @returns {Promise<{strategy: object, legs: Array<object>}>} La estrategia y sus piernas ordenadas.
 * @throws {import('../lib/errors.js').HttpError} Si la estrategia no existe.
 */
export async function loadStrategy(id) {
  const rows = await q(db().from('strategies').select('*, strategy_legs(*)').eq('id', id).limit(1));
  if (!rows.length) throw notFound(`No existe la estrategia ${id}`);
  const { strategy_legs: legs, ...strategy } = rows[0];
  legs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { strategy, legs };
}

export const strategiesService = {
  /**
   * Lista estrategias con filtros opcionales por estado y símbolo subyacente.
   *
   * @param {object} [query={}] - Filtros de consulta.
   * @param {string} [query.status] - Filtrar por estado ('draft' | 'submitted').
   * @param {string} [query.underlying] - Filtrar por símbolo subyacente.
   * @returns {Promise<Array<object>>} Lista de DTOs de estrategias.
   */
  async list(query = {}) {
    let req = db().from('strategies').select('*, strategy_legs(*)').order('created_at', { ascending: false });
    if (query.status) req = req.eq('status', query.status);
    if (query.underlying) req = req.eq('underlying', String(query.underlying).toUpperCase());
    return (await q(req)).map(({ strategy_legs, ...strategyRow }) => toDto(strategyRow, strategy_legs));
  },

  /**
   * Obtiene el detalle de una estrategia con cotizaciones vivas y cálculo de costo neto (débito/crédito).
   *
   * @param {string} id - Identificador de la estrategia.
   * @returns {Promise<object>} DTO de la estrategia enriquecido con precios en vivo.
   */
  async get(id) {
    const { strategy, legs } = await loadStrategy(id);
    const snapshots = await alpaca.optionSnapshots(legs.map((leg) => leg.symbol)).catch(() => ({}));
    let net = 0;
    let complete = legs.length > 0;
    const priced = legs.map((leg) => {
      const quote = snapshots[leg.symbol]?.latestQuote;
      if (!quote?.bp && !quote?.ap) {
        complete = false;
        return leg;
      }
      const mid = (quote.bp + quote.ap) / 2;
      net += (leg.side === 'buy' ? 1 : -1) * mid * leg.ratio_qty;
      return {
        ...leg,
        quote: {
          bid: quote.bp,
          ask: quote.ap,
          mid,
          iv: snapshots[leg.symbol].impliedVolatility ?? null,
          delta: snapshots[leg.symbol].greeks?.delta ?? null,
        },
      };
    });
    return {
      ...toDto(strategy, priced),
      pricing: complete ? { netPerUnit: Math.round(net * 10000) / 10000, netTotal: Math.round(net * CONTRACT_SIZE * strategy.qty * 100) / 100 } : null,
    };
  },

  /**
   * Crea una nueva estrategia multi-leg y sus piernas en Supabase con rollback en caso de fallo.
   *
   * @param {object} body - Datos para crear la estrategia.
   * @returns {Promise<object>} DTO de la estrategia creada con cotizaciones en vivo.
   */
  async create(body) {
    const { strategy, legs } = await validate(body);
    const [row] = await q(db().from('strategies').insert(strategy).select());
    try {
      await q(db().from('strategy_legs').insert(legs.map((leg) => ({ ...leg, strategy_id: row.id }))));
    } catch (err) {
      await q(db().from('strategies').delete().eq('id', row.id));
      throw err;
    }
    return this.get(row.id);
  },

  /**
   * Reemplaza por completo una estrategia y sus piernas (solo permitido en estado 'draft').
   *
   * @param {string} id - Identificador de la estrategia.
   * @param {object} body - Datos actualizados de la estrategia.
   * @returns {Promise<object>} DTO de la estrategia actualizada con cotizaciones en vivo.
   */
  async update(id, body) {
    const { strategy: current } = await loadStrategy(id);
    if (current.status !== 'draft') throw conflict(`La estrategia ya está en estado ${current.status}; solo se edita en draft`);
    const { strategy, legs } = await validate(body);
    await q(db().from('strategies').update(strategy).eq('id', id));
    await q(db().from('strategy_legs').delete().eq('strategy_id', id));
    await q(db().from('strategy_legs').insert(legs.map((leg) => ({ ...leg, strategy_id: id }))));
    return this.get(id);
  },

  /**
   * Elimina una estrategia; si ya fue enviada, intenta cancelar la orden en Alpaca primero.
   *
   * @param {string} id - Identificador de la estrategia.
   * @returns {Promise<void>}
   */
  async remove(id) {
    const { strategy } = await loadStrategy(id);
    if (strategy.status === 'submitted' && strategy.alpaca_order_id) {
      await alpaca.cancelOrder(strategy.alpaca_order_id).catch(() => {
        // Si ya está ejecutada o cancelada, no bloquea el borrado local en base de datos.
      });
    }
    await q(db().from('strategies').delete().eq('id', id));
  },

  /**
   * Envía una estrategia en borrador como orden multi-leg (mleg) a Alpaca Paper Trading.
   *
   * @param {string} id - Identificador de la estrategia.
   * @returns {Promise<{strategy: object, order: object}>} DTO de la estrategia actualizada y orden enviada.
   */
  async submit(id) {
    const { strategy, legs } = await loadStrategy(id);
    if (strategy.status !== 'draft') throw conflict(`La estrategia ya está en estado ${strategy.status}`);
    const order = await alpaca.createOrder({
      order_class: 'mleg',
      qty: String(strategy.qty),
      type: strategy.order_type,
      limit_price: strategy.order_type === 'limit' ? String(strategy.limit_price) : undefined,
      time_in_force: 'day', // Alpaca solo acepta 'day' para órdenes de opciones
      legs: legs.map((leg) => ({
        symbol: leg.symbol,
        side: leg.side,
        ratio_qty: String(leg.ratio_qty),
        position_intent: leg.position_intent,
      })),
    });
    await mirrorOrders([order]);
    await q(db().from('strategies').update({ status: 'submitted', alpaca_order_id: order.id }).eq('id', id));
    return { strategy: await this.get(id), order: toOrderDto(order) };
  },
};
