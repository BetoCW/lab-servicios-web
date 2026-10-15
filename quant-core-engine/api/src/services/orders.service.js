// API 2 — Órdenes (acciones y opciones) en Alpaca Paper Trading, con bitácora en Supabase.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, badRequest } from '../lib/errors.js';

const num = (v) => (v === null || v === undefined ? null : Number(v));

const toRow = (o) => ({
  alpaca_id: o.id,
  client_order_id: o.client_order_id,
  symbol: o.symbol || null,
  asset_class: o.asset_class,
  order_class: o.order_class,
  side: o.side,
  type: o.type ?? o.order_type,
  time_in_force: o.time_in_force,
  qty: num(o.qty),
  filled_qty: num(o.filled_qty),
  limit_price: num(o.limit_price),
  stop_price: num(o.stop_price),
  filled_avg_price: num(o.filled_avg_price),
  status: o.status,
  legs: o.legs ?? null,
  raw: o,
  submitted_at: o.submitted_at,
});

export const toOrderDto = (o) => ({
  id: o.id,
  clientOrderId: o.client_order_id,
  symbol: o.symbol || null,
  assetClass: o.asset_class,
  orderClass: o.order_class,
  side: o.side,
  type: o.type ?? o.order_type,
  timeInForce: o.time_in_force,
  qty: num(o.qty),
  filledQty: num(o.filled_qty),
  limitPrice: num(o.limit_price),
  stopPrice: num(o.stop_price),
  filledAvgPrice: num(o.filled_avg_price),
  status: o.status,
  legs: (o.legs ?? []).map((l) => ({ symbol: l.symbol, side: l.side, ratioQty: num(l.ratio_qty), status: l.status })),
  submittedAt: o.submitted_at,
});

export async function mirrorOrders(orders) {
  if (!orders.length) return;
  await q(db().from('orders').upsert(orders.map(toRow), { onConflict: 'alpaca_id' }));
}

const SIDES = ['buy', 'sell'];
const TYPES = ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'];
const TIFS = ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'];
// Estados en los que Alpaca rechaza PATCH aunque la orden siga viva.
const RESUBMIT_STATUSES = ['accepted', 'pending_new'];

export const ordersService = {
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

  async get(id) {
    const o = await alpaca.getOrder(id);
    await mirrorOrders([o]);
    return toOrderDto(o);
  },

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
    const o = await alpaca.createOrder({
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
    await mirrorOrders([o]);
    return toOrderDto(o);
  },

  /** PATCH: Alpaca reemplaza la orden y regresa una NUEVA orden (nuevo id). */
  async replace(id, body) {
    check(body, {
      qty: { type: 'number', positive: true },
      limit_price: { type: 'number', positive: true },
      stop_price: { type: 'number', positive: true },
      time_in_force: { oneOf: TIFS },
    });
    const patch = Object.fromEntries(
      ['qty', 'limit_price', 'stop_price', 'time_in_force']
        .filter((k) => body[k] != null)
        .map((k) => [k, k === 'time_in_force' ? body[k] : String(body[k])]),
    );
    if (!Object.keys(patch).length) throw badRequest('Envía al menos uno: qty, limit_price, stop_price, time_in_force');

    const current = await alpaca.getOrder(id);
    let replacement;
    if (RESUBMIT_STATUSES.includes(current.status)) {
      // Con el mercado cerrado la orden queda en 'accepted' y Alpaca no la deja reemplazar
      // (422). Se emula el replace: cancelar y volver a enviar con los campos cambiados.
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

  async cancel(id) {
    await alpaca.cancelOrder(id);
    const o = await alpaca.getOrder(id);
    await mirrorOrders([o]);
    return toOrderDto(o);
  },

  async cancelAll() {
    const results = (await alpaca.cancelAllOrders()) ?? [];
    return results.map((r) => ({ id: r.id, status: r.status }));
  },
};
