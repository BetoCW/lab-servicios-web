// Datos de mercado en vivo para la gráfica: velas de Alpaca + indicadores técnicos.
// La última vela se actualiza con el último trade del snapshot (feed IEX, tiempo real).
import { config } from '../config.js';
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.js';

const DAY_IN_MS = 86_400_000;

// Configuración de temporalidades: [segundos por vela, días hacia atrás a solicitar].
// Cuántos días hacia atrás pedir para juntar `limit` velas aun con fines de semana y feriados.
const TIMEFRAMES = {
  '1Min': [60, 5],
  '5Min': [300, 15],
  '15Min': [900, 30],
  '1Hour': [3600, 120],
  '1Day': [86400, 730],
};

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
   * @param {string} [query.timeframe='5Min'] - Intervalo de vela ('1Min', '5Min', '15Min', '1Hour', '1Day').
   * @param {number} [query.limit=300] - Cantidad máxima de velas solicitadas (50 a 1000).
   * @returns {Promise<object>} Objeto con símbolo, temporalidad, cotización actual, velas e indicadores técnicos.
   * @throws {import('../lib/errors.js').HttpError} Si el símbolo o timeframe son inválidos o no hay datos disponibles.
   */
  async bars(symbol, query = {}) {
    const normalizedSymbol = String(symbol).toUpperCase();
    if (!/^[A-Z][A-Z.]{0,9}$/.test(normalizedSymbol)) throw badRequest('Símbolo inválido');
    const timeframe = query.timeframe ?? '5Min';
    if (!TIMEFRAMES[timeframe]) throw badRequest(`timeframe debe ser uno de: ${Object.keys(TIMEFRAMES).join(', ')}`);
    const limit = Math.min(Math.max(Number(query.limit) || 300, 50), 1000);
    const [secondsPerBar, lookbackDays] = TIMEFRAMES[timeframe];

    const [page, snapshot] = await Promise.all([
      alpaca.stockBars(normalizedSymbol, {
        timeframe,
        limit,
        sort: 'desc',
        start: new Date(Date.now() - lookbackDays * DAY_IN_MS).toISOString(),
      }),
      alpaca.stockSnapshot(normalizedSymbol),
    ]);

    // Mapeo del formato de barra Alpaca: t (timestamp), o (open), h (high), l (low), c (close), v (volume).
    const bars = (page.bars ?? []).reverse().map((rawBar) => ({
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
    if (latestTrade?.p && Date.parse(latestTrade.t) / 1000 < latestBar.time + secondsPerBar) {
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
