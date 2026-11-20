// Datos de mercado en vivo para la gráfica: velas de Alpaca + indicadores técnicos.
// La última vela se actualiza con el último trade del snapshot (feed IEX, tiempo real).
import { config } from '../config.js';
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { memo } from '../lib/cache.js';
import { normalizeSymbol } from '../lib/symbol.js';
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.js';

const DAY_IN_MS = 86_400_000;
const SNAPSHOT_TTL_MS = 2000;

/**
 * Snapshot de la acción (último trade, bid/ask, vela del día) con caché de 2 s: la gráfica en vivo
 * y el resumen del ticker lo comparten, así que varias pestañas o endpoints cuestan UNA llamada.
 */
export const stockSnapshot = memo(SNAPSHOT_TTL_MS, (symbol) => alpaca.stockSnapshot(symbol), (symbol) => symbol);

// Configuración de temporalidades: [segundos por vela, días hacia atrás a solicitar].
// Cuántos días hacia atrás pedir para juntar `limit` velas aun con fines de semana y feriados.
const TIMEFRAMES = {
  '1Min': [60, 5],
  '5Min': [300, 15],
  '15Min': [900, 30],
  '1Hour': [3600, 120],
  '1Day': [86400, 730],
  '1Week': [604800, 3650],
  '1Month': [null, 10950],
};

// Fechas de API: YYYY-MM-DD (UTC, fin inclusivo) o timestamp con zona horaria.
function parseDate(value, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw badRequest(`${name} debe ser una fecha YYYY-MM-DD o un timestamp con zona horaria`);
  }
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) throw badRequest(`${name} no es una fecha válida`);
  return time + (name === 'end' && value.length === 10 ? DAY_IN_MS - 1 : 0);
}

/**
 * Redondea un valor a cuatro decimales para salida de indicadores numéricos.
 * @param {number|null} val - Valor a redondear.
 * @returns {number|null} Valor redondeado o null si es nulo.
 */
const round = (val) => (val == null ? null : Math.round(val * 10000) / 10000);

export const marketService = {
  /**
   * Obtiene velas históricas de Alpaca y calcula indicadores técnicos asociados (SMA, EMA, Bollinger, RSI, MACD).
   * La última vela se ajusta en tiempo real con el trade más reciente del snapshot si corresponde a su ventana temporal.
   *
   * @param {string} symbol - Símbolo del activo (ej. 'AAPL').
   * @param {object} [query={}] - Parámetros de consulta opcionales.
   * @param {string} [query.timeframe='5Min'] - Intervalo de vela hasta '1Week' o '1Month'.
   * @param {number} [query.limit=300] - Cantidad máxima de velas solicitadas (1 a 1000), las más recientes del rango.
   * @param {string} [query.start] - Inicio inclusivo; sin inicio se calcula una ventana según la temporalidad.
   * @param {string} [query.end] - Fin inclusivo; sin fin se consulta hasta la actualidad.
   * @returns {Promise<object>} Objeto con símbolo, temporalidad, cotización actual, velas e indicadores técnicos.
   * @throws {import('../lib/errors.js').HttpError} Si el símbolo o timeframe son inválidos o no hay datos disponibles.
   */
  async bars(symbol, query = {}) {
    const normalizedSymbol = normalizeSymbol(symbol);
    const timeframe = query.timeframe ?? '5Min';
    if (!Object.hasOwn(TIMEFRAMES, timeframe)) throw badRequest(`timeframe debe ser uno de: ${Object.keys(TIMEFRAMES).join(', ')}`);
    const limit = Number(query.limit ?? 300);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw badRequest('limit debe ser un entero entre 1 y 1000');
    const [secondsPerBar, lookbackDays] = TIMEFRAMES[timeframe];
    const end = parseDate(query.end, 'end');
    const start = parseDate(query.start, 'start') ?? (end ?? Date.now()) - lookbackDays * DAY_IN_MS;
    if (start > (end ?? Date.now())) throw badRequest('start debe ser anterior o igual a end (o la actualidad)');

    const [rawBars, snapshot] = await Promise.all([
      (async () => {
        const result = [];
        let pageToken;
        do {
          const page = await alpaca.stockBars(normalizedSymbol, {
            timeframe, limit: limit - result.length, sort: 'desc',
            start: new Date(start).toISOString(),
            ...(end == null ? {} : { end: new Date(end).toISOString() }),
            page_token: pageToken,
          });
          result.push(...(page.bars ?? []));
          pageToken = page.next_page_token;
        } while (pageToken && result.length < limit);
        return result.slice(0, limit);
      })(),
      end == null ? stockSnapshot(normalizedSymbol) : null,
    ]);

    // Mapeo del formato de barra Alpaca: t (timestamp), o (open), h (high), l (low), c (close), v (volume).
    const bars = rawBars.reverse().map((rawBar) => ({
      time: Date.parse(rawBar.t) / 1000,
      open: rawBar.o,
      high: rawBar.h,
      low: rawBar.l,
      close: rawBar.c,
      volume: rawBar.v,
    }));
    if (!bars.length) throw badRequest(`Alpaca no tiene velas de ${normalizedSymbol} en ${timeframe}`);

    // El último trade solo mueve la vela si cae dentro de su periodo.
    const latestTrade = snapshot?.latestTrade;
    const latestBar = bars.at(-1);
    const periodEnd = new Date(latestBar.time * 1000);
    if (timeframe === '1Month') periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    else periodEnd.setTime(periodEnd.getTime() + secondsPerBar * 1000);
    const tradeTime = Date.parse(latestTrade?.t);
    if (latestTrade?.p && tradeTime >= latestBar.time * 1000 && tradeTime < periodEnd.getTime()) {
      latestBar.close = latestTrade.p;
      latestBar.high = Math.max(latestBar.high, latestTrade.p);
      latestBar.low = Math.min(latestBar.low, latestTrade.p);
    }

    const closes = bars.map((bar) => bar.close);
    const bollingerBands = bollinger(closes, 20, 2);
    const macdMetrics = macd(closes);
    const series = {
      sma20: sma(closes, 20),
      ema9: ema(closes, 9),
      bbUpper: bollingerBands.upper,
      bbLower: bollingerBands.lower,
      rsi14: rsi(closes, 14),
      ...macdMetrics,
    };
    return {
      symbol: normalizedSymbol,
      timeframe,
      source: `Alpaca Market Data · feed ${config.alpaca.stocksFeed}`,
      quote: {
        price: latestTrade?.p ?? latestBar.close,
        time: latestTrade?.t ?? null,
        bid: snapshot?.latestQuote?.bp ?? null,
        ask: snapshot?.latestQuote?.ap ?? null,
        prevClose: snapshot?.prevDailyBar?.c ?? null,
      },
      bars,
      indicators: Object.fromEntries(
        Object.entries(series).map(([indicatorKey, values]) => [indicatorKey, values.map(round)]),
      ),
    };
  },
};
