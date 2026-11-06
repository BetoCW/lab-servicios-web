// Servicio 3 — Cadenas de opciones (Market Data F0).
// Ingesta contratos y cotizaciones vivas (bid/ask, IV, griegas) desde Alpaca y los persiste en Supabase.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check, notFound } from '../lib/errors.js';

const MAX_CONTRACTS = 300;
const DB_INSERT_BATCH_SIZE = 500;

/**
 * Transforma una fila de cadena de opciones de la base de datos a DTO del cliente.
 * @param {object} chainRow - Registro de cadena en Supabase.
 * @returns {object} DTO normalizado de la cadena de opciones.
 */
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

/**
 * Transforma una fila de cotización de opción de la base de datos a DTO de la API.
 * @param {object} quoteRow - Registro de cotización en Supabase.
 * @returns {object} DTO normalizado de cotización.
 */
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

/**
 * Extrae los campos de filtro del cuerpo de la petición.
 * @param {object} body - Cuerpo de la petición en bruto.
 * @returns {object} Configuración de filtros.
 */
function filtersFrom(body) {
  return {
    expiration_from: body.expiration_from ?? null,
    expiration_to: body.expiration_to ?? null,
    option_type: body.option_type ?? null,
    strike_min: body.strike_min ?? null,
    strike_max: body.strike_max ?? null,
  };
}

/**
 * Carga el registro de una cadena desde Supabase por su ID.
 * @param {string} id - Identificador de la cadena.
 * @returns {Promise<object>} Registro de la cadena.
 */
async function getChainRow(id) {
  const rows = await q(db().from('option_chains').select('*').eq('id', id).limit(1));
  if (!rows.length) throw notFound(`No existe la cadena ${id}`);
  return rows[0];
}

/**
 * Descarga contratos de opciones y cotizaciones vivas desde Alpaca, actualizando Supabase.
 * @param {object} chain - Registro de configuración de la cadena.
 * @returns {Promise<object>} Registro de cadena actualizado.
 */
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
  const snapshots = contracts.length ? await alpaca.optionSnapshots(contracts.map((contract) => contract.symbol)) : {};

  let underlyingPrice = null;
  try {
    const stockSnapshot = await alpaca.stockSnapshot(chain.underlying);
    // Claves abreviadas de Alpaca: 'p' = precio del último trade, 'c' = precio de cierre de barra diaria
    underlyingPrice = stockSnapshot?.latestTrade?.p ?? stockSnapshot?.dailyBar?.c ?? null;
  } catch {
    // Si el subyacente no tiene barras de negociación (ej. índices), se guarda igualmente la cadena.
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
      // Claves abreviadas de Alpaca para cotización: 'bp' = precio bid, 'ap' = precio ask, 't' = timestamp
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
  /**
   * Lista las cadenas de opciones monitoreadas con filtros opcionales.
   * @param {{ underlying?: string }} [query={}] - Parámetros de filtro.
   * @returns {Promise<object[]>} Lista de DTOs de cadenas.
   */
  async list(query = {}) {
    let req = db().from('option_chains').select('*').order('created_at', { ascending: false });
    if (query.underlying) req = req.eq('underlying', String(query.underlying).toUpperCase());
    return (await q(req)).map(toChainDto);
  },

  /**
   * Obtiene una cadena de opciones con su lista completa de cotizaciones.
   * @param {string} id - Identificador de la cadena.
   * @param {{ expiration?: string, type?: string }} [query={}] - Filtros opcionales de cotización.
   * @returns {Promise<object>} DTO de la cadena con sus cotizaciones.
   */
  async get(id, query = {}) {
    const chain = await getChainRow(id);
    let req = db().from('option_quotes').select('*').eq('chain_id', id).order('expiration').order('strike').order('option_type');
    if (query.expiration) req = req.eq('expiration', query.expiration);
    if (query.type) req = req.eq('option_type', query.type);
    const quotes = await q(req);
    return { ...toChainDto(chain), quotes: quotes.map(toQuoteDto) };
  },

  /**
   * Crea una nueva definición de cadena de opciones e ingesta contratos de Alpaca.
   * @param {object} body - Parámetros de configuración de la cadena.
   * @returns {Promise<object>} DTO de la cadena creada con sus cotizaciones.
   */
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
      // Si la ingesta de Alpaca falla, elimina el registro huérfano.
      await q(db().from('option_chains').delete().eq('id', chain.id));
      throw err;
    }
    return this.get(chain.id);
  },

  /**
   * Actualiza los parámetros de filtro de una cadena existente y reingesta sus datos.
   * @param {string} id - Identificador de la cadena.
   * @param {object} body - Nuevos parámetros de filtro.
   * @returns {Promise<object>} DTO de la cadena actualizada con cotizaciones frescas.
   */
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

  /**
   * Refresca las cotizaciones de mercado y griegas de una cadena de opciones existente.
   * @param {string} id - Identificador de la cadena.
   * @returns {Promise<object>} DTO de la cadena actualizada.
   */
  async refresh(id) {
    await ingest(await getChainRow(id));
    return this.get(id);
  },

  /**
   * Elimina una cadena de opciones y sus cotizaciones asociadas en cascada.
   * @param {string} id - Identificador de la cadena.
   * @returns {Promise<void>}
   */
  async remove(id) {
    const deleted = await q(db().from('option_chains').delete().eq('id', id).select('id'));
    if (!deleted.length) throw notFound(`No existe la cadena ${id}`);
  },
};

