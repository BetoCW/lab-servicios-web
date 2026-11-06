// API 3 — Cadenas de opciones (Market Data F0).
// POST define qué cadena seguir (subyacente + filtros) y la ingesta desde Alpaca:
//   contratos  -> GET /v2/options/contracts
//   cotización -> GET /v1beta1/options/snapshots (bid/ask, último, IV y griegas)
// PUT cambia filtros y vuelve a ingestar; GET la lee de Supabase.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, notFound } from '../lib/errors.js';

const MAX_CONTRACTS = 300;
const DB_INSERT_BATCH_SIZE = 500;

const toChainDto = (chainRow) => ({
  id: chainRow.id,
  underlying: chainRow.underlying,
  expirationFrom: chainRow.expiration_from,
  expirationTo: chainRow.expiration_to,
  optionType: chainRow.option_type,
  strikeMin: chainRow.strike_min,
  strikeMax: chainRow.strike_max,
  underlyingPrice: chainRow.underlying_price,
  contractsCount: chainRow.contracts_count,
  lastRefreshedAt: chainRow.last_refreshed_at,
  createdAt: chainRow.created_at,
  updatedAt: chainRow.updated_at,
});

const toQuoteDto = (quoteRow) => ({
  symbol: quoteRow.symbol,
  type: quoteRow.option_type,
  strike: Number(quoteRow.strike),
  expiration: quoteRow.expiration,
  openInterest: quoteRow.open_interest,
  bid: quoteRow.bid,
  ask: quoteRow.ask,
  mid: quoteRow.bid != null && quoteRow.ask != null ? Math.round(((Number(quoteRow.bid) + Number(quoteRow.ask)) / 2) * 10000) / 10000 : null,
  last: quoteRow.last,
  impliedVolatility: quoteRow.implied_volatility,
  delta: quoteRow.delta,
  gamma: quoteRow.gamma,
  theta: quoteRow.theta,
  vega: quoteRow.vega,
  rho: quoteRow.rho,
  quoteTime: quoteRow.quote_time,
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

  const rows = contracts.map((contract) => {
    const snapshot = snapshots[contract.symbol] ?? {};
    const quote = snapshot.latestQuote ?? {};
    const greeks = snapshot.greeks ?? {};
    return {
      chain_id: chain.id,
      symbol: contract.symbol,
      option_type: contract.type,
      strike: Number(contract.strike_price),
      expiration: contract.expiration_date,
      open_interest: contract.open_interest != null ? Number(contract.open_interest) : null,
      bid: quote.bp ?? null,
      ask: quote.ap ?? null,
      last: snapshot.latestTrade?.p ?? null,
      implied_volatility: snapshot.impliedVolatility ?? null,
      delta: greeks.delta ?? null,
      gamma: greeks.gamma ?? null,
      theta: greeks.theta ?? null,
      vega: greeks.vega ?? null,
      rho: greeks.rho ?? null,
      quote_time: quote.t ?? snapshot.latestTrade?.t ?? null,
    };
  });

  await q(db().from('option_quotes').delete().eq('chain_id', chain.id));
  for (let offset = 0; offset < rows.length; offset += DB_INSERT_BATCH_SIZE) {
    await q(db().from('option_quotes').insert(rows.slice(offset, offset + DB_INSERT_BATCH_SIZE)));
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

