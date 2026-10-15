// API 3 — Cadenas de opciones (Market Data F0).
// POST define qué cadena seguir (subyacente + filtros) y la ingesta desde Alpaca:
//   contratos  -> GET /v2/options/contracts
//   cotización -> GET /v1beta1/options/snapshots (bid/ask, último, IV y griegas)
// PUT cambia filtros y vuelve a ingestar; GET la lee de Supabase.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, notFound } from '../lib/errors.js';

const MAX_CONTRACTS = 300;

const toChainDto = (c) => ({
  id: c.id,
  underlying: c.underlying,
  expirationFrom: c.expiration_from,
  expirationTo: c.expiration_to,
  optionType: c.option_type,
  strikeMin: c.strike_min,
  strikeMax: c.strike_max,
  underlyingPrice: c.underlying_price,
  contractsCount: c.contracts_count,
  lastRefreshedAt: c.last_refreshed_at,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

const toQuoteDto = (r) => ({
  symbol: r.symbol,
  type: r.option_type,
  strike: Number(r.strike),
  expiration: r.expiration,
  openInterest: r.open_interest,
  bid: r.bid,
  ask: r.ask,
  mid: r.bid != null && r.ask != null ? Math.round(((Number(r.bid) + Number(r.ask)) / 2) * 10000) / 10000 : null,
  last: r.last,
  impliedVolatility: r.implied_volatility,
  delta: r.delta,
  gamma: r.gamma,
  theta: r.theta,
  vega: r.vega,
  rho: r.rho,
  quoteTime: r.quote_time,
});

const FILTER_RULES = {
  expiration_from: { date: true },
  expiration_to: { date: true },
  option_type: { oneOf: ['call', 'put'] },
  strike_min: { type: 'number' },
  strike_max: { type: 'number' },
};

function filtersFrom(body) {
  return {
    expiration_from: body.expiration_from ?? null,
    expiration_to: body.expiration_to ?? null,
    option_type: body.option_type ?? null,
    strike_min: body.strike_min ?? null,
    strike_max: body.strike_max ?? null,
  };
}

async function getChainRow(id) {
  const rows = await q(db().from('option_chains').select('*').eq('id', id).limit(1));
  if (!rows.length) throw notFound(`No existe la cadena ${id}`);
  return rows[0];
}

/** Descarga contratos + snapshots de Alpaca y reemplaza las cotizaciones guardadas. */
async function ingest(chain) {
  const contracts = await alpaca.listOptionContracts(
    {
      underlying_symbols: chain.underlying,
      status: 'active',
      expiration_date_gte: chain.expiration_from,
      expiration_date_lte: chain.expiration_to,
      type: chain.option_type,
      strike_price_gte: chain.strike_min,
      strike_price_lte: chain.strike_max,
    },
    MAX_CONTRACTS,
  );
  const snapshots = contracts.length ? await alpaca.optionSnapshots(contracts.map((c) => c.symbol)) : {};

  let underlyingPrice = null;
  try {
    const s = await alpaca.stockSnapshot(chain.underlying);
    underlyingPrice = s?.latestTrade?.p ?? s?.dailyBar?.c ?? null;
  } catch {
    // Subyacente sin datos (p. ej. índice): la cadena se guarda igual.
  }

  const rows = contracts.map((c) => {
    const snap = snapshots[c.symbol] ?? {};
    const quote = snap.latestQuote ?? {};
    const g = snap.greeks ?? {};
    return {
      chain_id: chain.id,
      symbol: c.symbol,
      option_type: c.type,
      strike: Number(c.strike_price),
      expiration: c.expiration_date,
      open_interest: c.open_interest != null ? Number(c.open_interest) : null,
      bid: quote.bp ?? null,
      ask: quote.ap ?? null,
      last: snap.latestTrade?.p ?? null,
      implied_volatility: snap.impliedVolatility ?? null,
      delta: g.delta ?? null,
      gamma: g.gamma ?? null,
      theta: g.theta ?? null,
      vega: g.vega ?? null,
      rho: g.rho ?? null,
      quote_time: quote.t ?? snap.latestTrade?.t ?? null,
    };
  });

  await q(db().from('option_quotes').delete().eq('chain_id', chain.id));
  for (let i = 0; i < rows.length; i += 500) {
    await q(db().from('option_quotes').insert(rows.slice(i, i + 500)));
  }
  const [updated] = await q(
    db()
      .from('option_chains')
      .update({ underlying_price: underlyingPrice, contracts_count: rows.length, last_refreshed_at: new Date().toISOString() })
      .eq('id', chain.id)
      .select(),
  );
  return updated;
}

export const optionChainsService = {
  async list(query = {}) {
    let req = db().from('option_chains').select('*').order('created_at', { ascending: false });
    if (query.underlying) req = req.eq('underlying', String(query.underlying).toUpperCase());
    return (await q(req)).map(toChainDto);
  },

  async get(id, query = {}) {
    const chain = await getChainRow(id);
    let req = db().from('option_quotes').select('*').eq('chain_id', id).order('expiration').order('strike').order('option_type');
    if (query.expiration) req = req.eq('expiration', query.expiration);
    if (query.type) req = req.eq('option_type', query.type);
    const quotes = await q(req);
    return { ...toChainDto(chain), quotes: quotes.map(toQuoteDto) };
  },

  async create(body) {
    check(body, { underlying: { required: true, type: 'string' }, ...FILTER_RULES });
    const [chain] = await q(
      db()
        .from('option_chains')
        .insert({ underlying: body.underlying.trim().toUpperCase(), ...filtersFrom(body) })
        .select(),
    );
    try {
      await ingest(chain);
    } catch (err) {
      // Si Alpaca rechaza la ingesta no se deja una cadena vacía colgando.
      await q(db().from('option_chains').delete().eq('id', chain.id));
      throw err;
    }
    return this.get(chain.id);
  },

  /** PUT: reemplaza los filtros (y el subyacente) y vuelve a ingestar. */
  async update(id, body) {
    check(body, { underlying: { required: true, type: 'string' }, ...FILTER_RULES });
    await getChainRow(id);
    const [chain] = await q(
      db()
        .from('option_chains')
        .update({ underlying: body.underlying.trim().toUpperCase(), ...filtersFrom(body) })
        .eq('id', id)
        .select(),
    );
    await ingest(chain);
    return this.get(id);
  },

  /** POST /:id/refresh: misma cadena, cotizaciones nuevas. */
  async refresh(id) {
    await ingest(await getChainRow(id));
    return this.get(id);
  },

  async remove(id) {
    const deleted = await q(db().from('option_chains').delete().eq('id', id).select('id'));
    if (!deleted.length) throw notFound(`No existe la cadena ${id}`);
  },
};

