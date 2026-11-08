/**
 * ============================================================================
 *  services/overview.service.js — Resumen del ticker para la pantalla única
 * ============================================================================
 *  QUÉ HACE
 *    GET /api/v1/market/overview?symbol=AAPL devuelve, en UNA llamada, lo básico que la
 *    pantalla necesita al cambiar de ticker:
 *      • quote        cotización actual (último trade, bid/ask, cierre previo y % del día)
 *      • indicators   señales resumidas sobre velas diarias (SMA20, EMA9, RSI14, Bollinger, HV30)
 *      • expirations  vencimientos de opciones disponibles en los próximos 120 días
 *    Sustituye 3–4 peticiones del navegador (y sus viajes por el gateway) por una.
 *
 *  CARGA PARCIAL
 *    Si falla la cotización → error (sin precio no hay pantalla). Si fallan indicadores o
 *    vencimientos → se devuelve lo demás y el bloque caído va en `errors`, para que el
 *    front muestre "no disponible" solo en esa tarjeta.
 *
 *  COSTO EN PETICIONES A ALPACA (límite 200/min)
 *    snapshot 1 (TTL 2 s) + velas diarias 2 (TTL 5 min, SPY compartido) + contratos 1 (TTL 10 min).
 *    En régimen estable (mismo ticker) ≈ 30 llamadas/min por el snapshot; el resto casi cero.
 *
 *  DE DÓNDE SALEN LAS FÓRMULAS
 *    % del día = (precio − cierre previo) / cierre previo · 100.
 *    Indicadores: lib/scoring.js → marketSignals (SMA, EMA, Bollinger, RSI de lib/indicators.js;
 *    HV30 = desviación estándar de rendimientos logarítmicos de 30 días · √252).
 * ============================================================================
 */
import { alpaca } from '../lib/alpaca.js';
import { memo } from '../lib/cache.js';
import { marketSignals } from '../lib/scoring.js';
import { normalizeSymbol } from '../lib/symbol.js';
import { getHistory } from './riskExtended.service.js';
import { stockSnapshot } from './market.service.js';

const DAY_MS = 86_400_000;
const EXPIRATIONS_TTL_MS = 10 * 60_000;
const EXPIRATIONS_WINDOW_DAYS = 120;
const STRIKE_BAND = 0.15; // ±15 % alrededor del spot: basta para listar vencimientos y acota la respuesta
const MAX_CONTRACTS = 1000; // una sola página de Alpaca
const MIN_CLOSES = 60; // marketSignals necesita historia para HV30 y la volatilidad de largo plazo

const round = (value, decimals = 2) => (Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null);
const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

/**
 * Lista las fechas de vencimiento con opciones activas (caché de 10 min por ticker).
 * @param {string} symbol - Ticker.
 * @param {number} spot - Precio actual, para acotar los strikes consultados.
 * @returns {Promise<Array<{date: string, days: number}>>} Vencimientos ordenados con sus días restantes.
 */
const loadExpirations = memo(
  EXPIRATIONS_TTL_MS,
  async (symbol, spot) => {
    const contracts = await alpaca.listOptionContracts(
      {
        underlying_symbols: symbol,
        status: 'active',
        expiration_date_gte: isoDate(0),
        expiration_date_lte: isoDate(EXPIRATIONS_WINDOW_DAYS),
        strike_price_gte: Math.floor(spot * (1 - STRIKE_BAND)),
        strike_price_lte: Math.ceil(spot * (1 + STRIKE_BAND)),
      },
      MAX_CONTRACTS,
    );
    const dates = [...new Set(contracts.map((contract) => contract.expiration_date))].sort();
    return dates.map((date) => ({ date, days: Math.max(0, Math.ceil((Date.parse(`${date}T20:00:00Z`) - Date.now()) / DAY_MS)) }));
  },
  (symbol) => symbol, // el spot no forma parte de la clave: los vencimientos casi no cambian en 10 min
);

/**
 * Convierte el snapshot de Alpaca en la cotización de la pantalla.
 * @param {object} snapshot - Respuesta de /stocks/{symbol}/snapshot.
 * @returns {object} price, time, bid, ask, prevClose, changePct.
 */
export function toQuote(snapshot) {
  const price = snapshot?.latestTrade?.p ?? snapshot?.dailyBar?.c ?? null;
  const prevClose = snapshot?.prevDailyBar?.c ?? null;
  return {
    price,
    time: snapshot?.latestTrade?.t ?? null,
    // IEX fuera de horario manda bid/ask en 0: un lado en 0 no es un precio, se muestra como null.
    bid: snapshot?.latestQuote?.bp > 0 ? snapshot.latestQuote.bp : null,
    ask: snapshot?.latestQuote?.ap > 0 ? snapshot.latestQuote.ap : null,
    prevClose,
    changePct: price != null && prevClose ? round(((price - prevClose) / prevClose) * 100) : null,
  };
}

/**
 * Resume las señales técnicas en números simples para mostrar en tarjetas.
 * @param {number[]} closes - Cierres diarios cronológicos.
 * @returns {object} Indicadores redondeados y una etiqueta de tendencia.
 */
export function summarizeIndicators(closes) {
  if (closes.length < MIN_CLOSES) throw new Error(`Historial insuficiente (${closes.length} velas diarias)`);
  const signals = marketSignals(closes);
  return {
    sma20: round(signals.sma20),
    ema9: round(signals.ema9),
    rsi14: round(signals.rsi14, 1),
    hv30Pct: round(signals.hv30 * 100, 1),
    bollingerPosition: round(signals.bollingerPosition, 2),
    trendStrengthPct: round(signals.trendStrength * 100, 2),
    // Mismo umbral (±0.5 %) que usa el recomendador para decir "impulso alcista/bajista".
    trend: signals.trendStrength > 0.005 ? 'alcista' : signals.trendStrength < -0.005 ? 'bajista' : 'lateral',
  };
}

export const overviewService = {
  /**
   * Arma el resumen del ticker en paralelo; solo la cotización es indispensable.
   *
   * @param {string} rawSymbol - Ticker (ej. 'AAPL').
   * @returns {Promise<object>} { symbol, asOf, quote, indicators, expirations, errors }.
   * @throws {import('../lib/errors.js').HttpError} Si el ticker es inválido o Alpaca no lo conoce.
   */
  async overview(rawSymbol) {
    const symbol = normalizeSymbol(rawSymbol);
    const quotePromise = stockSnapshot(symbol).then(toQuote);
    const [quote, indicators, expirations] = await Promise.allSettled([
      quotePromise,
      getHistory(symbol).then((history) => summarizeIndicators(history.closes)),
      quotePromise.then((q) => {
        if (!q.price) throw new Error('sin precio para acotar strikes');
        return loadExpirations(symbol, q.price);
      }),
    ]);
    if (quote.status === 'rejected') throw quote.reason; // sin cotización no hay pantalla
    const errors = {};
    if (indicators.status === 'rejected') errors.indicators = indicators.reason.message;
    if (expirations.status === 'rejected') errors.expirations = expirations.reason.message;
    return {
      symbol,
      asOf: new Date().toISOString(),
      quote: quote.value,
      indicators: indicators.value ?? null,
      expirations: expirations.value ?? null,
      errors,
    };
  },
};
