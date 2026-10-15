// API 4 — Estrategias de opciones multi-leg (spreads, straddles, iron condors...).
// Se arman y guardan en Supabase; cada pierna se valida contra los contratos de Alpaca.
// GET las valora con cotizaciones vivas de Alpaca; POST /:id/submit las envía como
// orden multi-leg (order_class = 'mleg') a Alpaca Paper Trading.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, notFound, badRequest, conflict } from '../lib/errors.js';
import { parseOcc } from '../lib/occ.js';
import { mirrorOrders, toOrderDto } from './orders.service.js';

const MAX_LEGS = 4; // límite de Alpaca para órdenes mleg
const INTENTS = ['buy_to_open', 'buy_to_close', 'sell_to_open', 'sell_to_close'];

const toDto = (s, legs = []) => ({
  id: s.id,
  name: s.name,
  underlying: s.underlying,
  description: s.description,
  qty: s.qty,
  orderType: s.order_type,
  limitPrice: s.limit_price,
  status: s.status,
  alpacaOrderId: s.alpaca_order_id,
  legs: legs.map((l) => ({
    id: l.id,
    symbol: l.symbol,
    side: l.side,
    ratioQty: l.ratio_qty,
    positionIntent: l.position_intent,
    ...parseOcc(l.symbol),
    ...(l.quote ? { quote: l.quote } : {}),
  })),
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

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

async function load(id) {
  const rows = await q(db().from('strategies').select('*, strategy_legs(*)').eq('id', id).limit(1));
  if (!rows.length) throw notFound(`No existe la estrategia ${id}`);
  const { strategy_legs: legs, ...strategy } = rows[0];
  legs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { strategy, legs };
}

export const strategiesService = {
  async list(query = {}) {
    let req = db().from('strategies').select('*, strategy_legs(*)').order('created_at', { ascending: false });
    if (query.status) req = req.eq('status', query.status);
    if (query.underlying) req = req.eq('underlying', String(query.underlying).toUpperCase());
    return (await q(req)).map(({ strategy_legs, ...s }) => toDto(s, strategy_legs));
  },

  /** Detalle con cotización viva de cada pierna y el costo neto (débito > 0, crédito < 0). */
  async get(id) {
    const { strategy, legs } = await load(id);
    const snaps = await alpaca.optionSnapshots(legs.map((l) => l.symbol)).catch(() => ({}));
    let net = 0;
    let complete = legs.length > 0;
    const priced = legs.map((l) => {
      const qt = snaps[l.symbol]?.latestQuote;
      if (!qt?.bp && !qt?.ap) {
        complete = false;
        return l;
      }
      const mid = (qt.bp + qt.ap) / 2;
      net += (l.side === 'buy' ? 1 : -1) * mid * l.ratio_qty;
      return { ...l, quote: { bid: qt.bp, ask: qt.ap, mid, iv: snaps[l.symbol].impliedVolatility ?? null, delta: snaps[l.symbol].greeks?.delta ?? null } };
    });
    return {
      ...toDto(strategy, priced),
      pricing: complete ? { netPerUnit: Math.round(net * 10000) / 10000, netTotal: Math.round(net * 100 * strategy.qty * 100) / 100 } : null,
    };
  },

  async create(body) {
    const { strategy, legs } = await validate(body);
    const [row] = await q(db().from('strategies').insert(strategy).select());
    try {
      await q(db().from('strategy_legs').insert(legs.map((l) => ({ ...l, strategy_id: row.id }))));
    } catch (err) {
      await q(db().from('strategies').delete().eq('id', row.id));
      throw err;
    }
    return this.get(row.id);
  },

  /** PUT: reemplaza la estrategia completa (solo en borrador). */
  async update(id, body) {
    const { strategy: current } = await load(id);
    if (current.status !== 'draft') throw conflict(`La estrategia ya está en estado ${current.status}; solo se edita en draft`);
    const { strategy, legs } = await validate(body);
    await q(db().from('strategies').update(strategy).eq('id', id));
    await q(db().from('strategy_legs').delete().eq('strategy_id', id));
    await q(db().from('strategy_legs').insert(legs.map((l) => ({ ...l, strategy_id: id }))));
    return this.get(id);
  },

  /** DELETE: si ya se envió, primero intenta cancelar la orden en Alpaca. */
  async remove(id) {
    const { strategy } = await load(id);
    if (strategy.status === 'submitted' && strategy.alpaca_order_id) {
      await alpaca.cancelOrder(strategy.alpaca_order_id).catch(() => {
        // Ya ejecutada o cancelada: no bloquea el borrado local.
      });
    }
    await q(db().from('strategies').delete().eq('id', id));
  },

  async submit(id) {
    const { strategy, legs } = await load(id);
    if (strategy.status !== 'draft') throw conflict(`La estrategia ya está en estado ${strategy.status}`);
    const order = await alpaca.createOrder({
      order_class: 'mleg',
      qty: String(strategy.qty),
      type: strategy.order_type,
      limit_price: strategy.order_type === 'limit' ? String(strategy.limit_price) : undefined,
      time_in_force: 'day', // Alpaca solo acepta 'day' en opciones
      legs: legs.map((l) => ({
        symbol: l.symbol,
        side: l.side,
        ratio_qty: String(l.ratio_qty),
        position_intent: l.position_intent,
      })),
    });
    await mirrorOrders([order]);
    await q(db().from('strategies').update({ status: 'submitted', alpaca_order_id: order.id }).eq('id', id));
    return { strategy: await this.get(id), order: toOrderDto(order) };
  },
};
