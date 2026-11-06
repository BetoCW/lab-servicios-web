// Servicio 2 — Órdenes de acciones y opciones en Alpaca Paper Trading, sincronizadas a Supabase.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, badRequest } from '../lib/errors.js';

/**
 * Convierte de forma segura un valor numérico opcional a número o null.
 * @param {*} value - Valor de entrada.
 * @returns {number|null}
 */
const parseOptionalNumber = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * Transforma una orden de Alpaca en formato de fila para la base de datos.
 * @param {object} order - Orden original de Alpaca.
 * @returns {object} Objeto de fila para Supabase.
 */
const toRow = (order) => ({
  alpaca_id: order.id,
  client_order_id: order.client_order_id,
  symbol: order.symbol || null,
  asset_class: order.asset_class,
  order_class: order.order_class,
  side: order.side,
  type: order.type ?? order.order_type,
  time_in_force: order.time_in_force,
  qty: parseOptionalNumber(order.qty),
  filled_qty: parseOptionalNumber(order.filled_qty),
  limit_price: parseOptionalNumber(order.limit_price),
  stop_price: parseOptionalNumber(order.stop_price),
  filled_avg_price: parseOptionalNumber(order.filled_avg_price),
  status: order.status,
  legs: order.legs ?? null,
  raw: order,
  submitted_at: order.submitted_at,
});

/**
 * Transforma una entidad de orden de Alpaca en DTO para el cliente de la API.
 * @param {object} order - Entidad de orden de Alpaca.
 * @returns {object} DTO normalizado de la orden.
 */
export const toOrderDto = (order) => ({
  id: order.id,
  clientOrderId: order.client_order_id,
  symbol: order.symbol || null,
  assetClass: order.asset_class,
  orderClass: order.order_class,
  side: order.side,
  type: order.type ?? order.order_type,
  timeInForce: order.time_in_force,
  qty: parseOptionalNumber(order.qty),
  filledQty: parseOptionalNumber(order.filled_qty),
  limitPrice: parseOptionalNumber(order.limit_price),
  stopPrice: parseOptionalNumber(order.stop_price),
  filledAvgPrice: parseOptionalNumber(order.filled_avg_price),
  status: order.status,
  legs: (order.legs ?? []).map((leg) => ({
    symbol: leg.symbol,
    side: leg.side,
    ratioQty: parseOptionalNumber(leg.ratio_qty),
    status: leg.status,
  })),
  submittedAt: order.submitted_at,
});

/**
 * Inserta o actualiza registros de órdenes en la tabla espejo de Supabase.
 * @param {object[]} orders - Arreglo de órdenes de Alpaca.
 * @returns {Promise<void>}
 */
export async function mirrorOrders(orders) {
  if (!orders.length) return;
  await q(db().from('orders').upsert(orders.map(toRow), { onConflict: 'alpaca_id' }));
}

const SIDES = ['buy', 'sell'];
const TYPES = ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'];
const TIFS = ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'];
// Estados de orden donde Alpaca rechaza modificaciones directas PATCH estando aún activa.
const RESUBMIT_STATUSES = ['accepted', 'pending_new'];

export const ordersService = {
  /**
   * Obtiene órdenes que cumplan con los filtros y las sincroniza localmente.
   * @param {{ status?: string, limit?: number, symbols?: string }} [query={}] - Filtros de búsqueda.
   * @returns {Promise<object[]>} Lista de DTOs de órdenes.
   */
  async list(query = {}) {
    const orders = await alpaca.listOrders({
      status: query.status ?? 'all',
      limit: query.limit ?? 50,
      symbols: query.symbols,
      direction: 'desc',
    });
    await mirrorOrders(orders);
    return orders.map(toOrderDto);
  },

  /**
   * Obtiene una orden individual por su identificador de Alpaca.
   * @param {string} id - Identificador de orden en Alpaca.
   * @returns {Promise<object>} DTO de la orden.
   */
  async get(id) {
    const fetchedOrder = await alpaca.getOrder(id);
    await mirrorOrders([fetchedOrder]);
    return toOrderDto(fetchedOrder);
  },

  /**
   * Envía una orden simple de acciones u opciones a Alpaca.
   * @param {object} body - Datos de la orden.
   * @returns {Promise<object>} DTO de la orden creada.
   */
  async create(body) {
    check(body, {
      symbol: { required: true, type: 'string' },
      qty: { required: true, type: 'number', positive: true },
      side: { required: true, oneOf: SIDES },
      type: { required: true, oneOf: TYPES },
      time_in_force: { required: true, oneOf: TIFS },
      limit_price: { type: 'number', positive: true },
      stop_price: { type: 'number', positive: true },
    });
    if (['limit', 'stop_limit'].includes(body.type) && body.limit_price == null) {
      throw badRequest('limit_price es obligatorio para órdenes limit / stop_limit');
    }
    const createdOrder = await alpaca.createOrder({
      symbol: body.symbol.trim().toUpperCase(),
      qty: String(body.qty),
      side: body.side,
      type: body.type,
      time_in_force: body.time_in_force,
      limit_price: body.limit_price != null ? String(body.limit_price) : undefined,
      stop_price: body.stop_price != null ? String(body.stop_price) : undefined,
      position_intent: body.position_intent,
      client_order_id: body.client_order_id,
    });
    await mirrorOrders([createdOrder]);
    return toOrderDto(createdOrder);
  },

  /**
   * Modifica una orden activa con nuevos parámetros (crea una orden de reemplazo en Alpaca).
   * @param {string} id - Identificador de la orden a reemplazar.
   * @param {{ qty?: number, limit_price?: number, stop_price?: number, time_in_force?: string }} body - Parámetros modificados.
   * @returns {Promise<object>} DTO de la orden de reemplazo.
   */
  async replace(id, body) {
    check(body, {
      qty: { type: 'number', positive: true },
      limit_price: { type: 'number', positive: true },
      stop_price: { type: 'number', positive: true },
      time_in_force: { oneOf: TIFS },
    });
    const patch = Object.fromEntries(
      ['qty', 'limit_price', 'stop_price', 'time_in_force']
        .filter((paramKey) => body[paramKey] != null)
        .map((paramKey) => [paramKey, paramKey === 'time_in_force' ? body[paramKey] : String(body[paramKey])]),
    );
    if (!Object.keys(patch).length) throw badRequest('Envía al menos uno: qty, limit_price, stop_price, time_in_force');

    const current = await alpaca.getOrder(id);
    let replacement;
    if (RESUBMIT_STATUSES.includes(current.status)) {
      // Fuera de horario de mercado, las órdenes en 'accepted' rechazan PATCH (HTTP 422).
      // Se utiliza la estrategia de cancelar y reenviar con los campos modificados.
      await alpaca.cancelOrder(id);
      replacement = await alpaca.createOrder({
        symbol: current.symbol,
        qty: current.qty,
        side: current.side,
        type: current.type,
        time_in_force: current.time_in_force,
        limit_price: current.limit_price ?? undefined,
        stop_price: current.stop_price ?? undefined,
        position_intent: current.position_intent ?? undefined,
        ...patch,
      });
    } else {
      replacement = await alpaca.replaceOrder(id, patch);
    }
    const original = await alpaca.getOrder(id);
    await mirrorOrders([original, replacement]);
    return { ...toOrderDto(replacement), replaces: id, replaceMode: RESUBMIT_STATUSES.includes(current.status) ? 'cancel_resubmit' : 'alpaca_replace' };
  },

  /**
   * Cancela una orden abierta por su identificador.
   * @param {string} id - Identificador de la orden.
   * @returns {Promise<object>} DTO actualizado de la orden.
   */
  async cancel(id) {
    await alpaca.cancelOrder(id);
    const canceledOrder = await alpaca.getOrder(id);
    await mirrorOrders([canceledOrder]);
    return toOrderDto(canceledOrder);
  },

  /**
   * Cancela todas las órdenes abiertas de la cuenta.
   * @returns {Promise<Array<{ id: string, status: number }>>} Resultado de la operación.
   */
  async cancelAll() {
    const results = (await alpaca.cancelAllOrders()) ?? [];
    return results.map((cancelResult) => ({ id: cancelResult.id, status: cancelResult.status }));
  },
};
