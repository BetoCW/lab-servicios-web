// Datos de mercado en vivo para la gráfica: velas de Alpaca + indicadores técnicos.
// La última vela se actualiza con el último trade del snapshot (feed IEX, tiempo real).
import { config } from '../config.js';
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.js';

// Cuántos días hacia atrás pedir para juntar `limit` velas aun con fines de semana y feriados.
const TIMEFRAMES = { '1Min': [60, 5], '5Min': [300, 15], '15Min': [900, 30], '1Hour': [3600, 120], '1Day': [86400, 730] };
const round = (v) => (v == null ? null : Math.round(v * 10000) / 10000);

export const marketService = {
  async bars(symbol, query = {}) {
    const sym = String(symbol).toUpperCase();
    if (!/^[A-Z][A-Z.]{0,9}$/.test(sym)) throw badRequest('Símbolo inválido');
    const timeframe = query.timeframe ?? '5Min';
    if (!TIMEFRAMES[timeframe]) throw badRequest(`timeframe debe ser uno de: ${Object.keys(TIMEFRAMES).join(', ')}`);
    const limit = Math.min(Math.max(Number(query.limit) || 300, 50), 1000);
    const [seconds, lookbackDays] = TIMEFRAMES[timeframe];

    const [page, snap] = await Promise.all([
      alpaca.stockBars(sym, { timeframe, limit, sort: 'desc', start: new Date(Date.now() - lookbackDays * 864e5).toISOString() }),
      alpaca.stockSnapshot(sym),
    ]);
    const bars = (page.bars ?? []).reverse().map((b) => ({ time: Date.parse(b.t) / 1000, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
    if (!bars.length) throw badRequest(`Alpaca no tiene velas de ${sym} en ${timeframe}`);

    // El último trade solo mueve la vela si cae dentro de su periodo.
    const trade = snap?.latestTrade;
    const last = bars.at(-1);
    if (trade?.p && Date.parse(trade.t) / 1000 < last.time + seconds) {
      last.close = trade.p;
      last.high = Math.max(last.high, trade.p);
      last.low = Math.min(last.low, trade.p);
    }

    const closes = bars.map((b) => b.close);
    const bb = bollinger(closes, 20, 2);
    const m = macd(closes);
    const series = { sma20: sma(closes, 20), ema9: ema(closes, 9), bbUpper: bb.upper, bbLower: bb.lower, rsi14: rsi(closes, 14), ...m };
    return {
      symbol: sym,
      timeframe,
      source: `Alpaca Market Data · feed ${config.alpaca.stocksFeed}`,
      quote: {
        price: trade?.p ?? last.close,
        time: trade?.t ?? null,
        bid: snap?.latestQuote?.bp ?? null,
        ask: snap?.latestQuote?.ap ?? null,
        prevClose: snap?.prevDailyBar?.c ?? null,
      },
      bars,
      indicators: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.map(round)])),
    };
  },
};
