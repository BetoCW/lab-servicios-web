/**
 * ============================================================================
 *  services/recommend.service.js — Recomendador de estrategias (Straddle, Strangle, Calendar, Diagonal)
 * ============================================================================
 *  QUÉ HACE
 *    Dado un ticker (GET /api/v1/strategies/recommend?symbol=AAPL):
 *      1. Descarga datos REALES de Alpaca: precio, ~1.5 años de velas diarias y las
 *         cadenas de opciones cercana (≈30 días) y lejana (≈60 días).
 *      2. Calcula señales: IV vs volatilidad histórica, tendencia SMA/EMA, Bollinger.
 *      3. Arma las 4 estrategias con las plantillas del front (web/templates.js).
 *      4. Mide cada una con el motor Rust/WASM (Monte Carlo): probabilidad de ganancia,
 *         valor esperado, pérdida máxima simulada, VaR/CVaR, márgenes y griegas.
 *      5. Las ordena por un puntaje 0–100 (ver lib/scoring.js) y explica por qué gana la primera.
 *
 *  CÓMO SE EXPLICA EN UNA EXPOSICIÓN
 *    "No adivinamos: miramos si el mercado cobra la volatilidad cara o barata frente a lo
 *     que realmente se ha movido el precio, armamos las 4 estrategias con contratos reales,
 *     simulamos 20 000 futuros posibles de cada una y premiamos la que gana más veces,
 *     con mejor valor esperado y mejor encaje con el momento del mercado."
 *
 *  LÍMITES HONESTOS
 *    El Monte Carlo usa una sola volatilidad (promedio de las piernas) y movimiento
 *    browniano: no captura saltos ni noticias. Es una guía, no una garantía.
 * ============================================================================
 */
import '../../../web/templates.js'; // define globalThis.F0Templates (mismas plantillas que usa el front)
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { normalizeSymbol } from '../lib/symbol.js';
import { composite, marketSignals, templateFit, volSide } from '../lib/scoring.js';
import { getHistory } from './riskExtended.service.js';
import { riskService } from './risk.service.js';

const { build, TEMPLATES } = globalThis.F0Templates;
const DAY_MS = 86_400_000;
const NEAR_TARGET_DAYS = 30;
const FAR_TARGET_DAYS = 60;

const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const daysUntil = (expiration) => (Date.parse(`${expiration}T20:00:00Z`) - Date.now()) / DAY_MS;
const round = (value, decimals = 2) => (Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null);

/**
 * Elige, de una lista de contratos, el vencimiento más cercano a una cantidad objetivo de días.
 * @param {Array<{expiration_date: string}>} contracts - Contratos de Alpaca.
 * @param {number} targetDays - Días objetivo (30 cercano, 60 lejano).
 * @returns {string|null} Fecha YYYY-MM-DD o null si no hay contratos.
 */
function closestExpiration(contracts, targetDays) {
  const expirations = [...new Set(contracts.map((contract) => contract.expiration_date))];
  if (!expirations.length) return null;
  return expirations.reduce((best, current) =>
    Math.abs(daysUntil(current) - targetDays) < Math.abs(daysUntil(best) - targetDays) ? current : best,
  );
}

/**
 * Convierte un contrato + su snapshot de Alpaca en el formato de "cotización" que esperan las plantillas.
 * @param {object} contract - Contrato de Alpaca (symbol, type, strike_price, expiration_date).
 * @param {object} [snapshot] - Snapshot de Alpaca (latestQuote, latestTrade, greeks, impliedVolatility).
 * @returns {object} Cotización normalizada con bid, ask, mid, delta e IV.
 */
function toQuote(contract, snapshot) {
  const quote = snapshot?.latestQuote ?? {};
  const hasMarket = quote.bp != null && quote.ap != null && quote.ap > 0;
  return {
    symbol: contract.symbol,
    type: contract.type,
    strike: Number(contract.strike_price),
    expiration: contract.expiration_date,
    bid: quote.bp ?? null,
    ask: quote.ap ?? null,
    mid: hasMarket ? (quote.bp + quote.ap) / 2 : (snapshot?.latestTrade?.p ?? null),
    delta: snapshot?.greeks?.delta ?? null,
    impliedVolatility: snapshot?.impliedVolatility ?? null,
  };
}

/**
 * IV "at the money": promedio de la IV de las opciones cuyo strike está más cerca del spot.
 * @param {Array<object>} quotes - Cotizaciones del vencimiento.
 * @param {number} spot - Precio del subyacente.
 * @returns {number|null} IV anualizada (0.30 = 30 %) o null si ninguna cotización trae IV.
 */
function atmIv(quotes, spot) {
  const withIv = quotes.filter((quote) => quote.impliedVolatility != null);
  if (!withIv.length) return null;
  const nearest = [...withIv].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 4);
  return nearest.reduce((sum, quote) => sum + quote.impliedVolatility, 0) / nearest.length;
}

/**
 * Descarga y normaliza lo necesario de Alpaca para recomendar sobre un ticker.
 * @param {string} symbol - Ticker en mayúsculas.
 * @returns {Promise<object>} Spot, historial, cotizaciones y vencimientos elegidos.
 */
async function loadMarket(symbol) {
  const [stock, history] = await Promise.all([alpaca.stockSnapshot(symbol), getHistory(symbol)]);
  const spot = stock?.latestTrade?.p ?? stock?.dailyBar?.c;
  if (!spot) throw badRequest(`Alpaca no tiene precio para ${symbol}`);

  const base = { underlying_symbols: symbol, status: 'active' };
  const [nearContracts, farContracts] = await Promise.all([
    alpaca.listOptionContracts(
      { ...base, expiration_date_gte: isoDate(14), expiration_date_lte: isoDate(45), strike_price_gte: Math.floor(spot * 0.9), strike_price_lte: Math.ceil(spot * 1.1) },
      250,
    ),
    alpaca.listOptionContracts(
      { ...base, type: 'call', expiration_date_gte: isoDate(46), expiration_date_lte: isoDate(100), strike_price_gte: Math.floor(spot * 0.96), strike_price_lte: Math.ceil(spot * 1.04) },
      80,
    ),
  ]);
  const nearExpiration = closestExpiration(nearContracts, NEAR_TARGET_DAYS);
  if (!nearExpiration) throw badRequest(`${symbol} no tiene opciones listadas en los próximos 14–45 días`);
  const farExpiration = closestExpiration(farContracts, FAR_TARGET_DAYS);

  const chosen = [
    ...nearContracts.filter((contract) => contract.expiration_date === nearExpiration),
    ...farContracts.filter((contract) => contract.expiration_date === farExpiration),
  ];
  const snaps = await alpaca.optionSnapshots(chosen.map((contract) => contract.symbol));
  // Solo contratos con precio de mercado: sin cotización no se puede medir riesgo.
  const quotes = chosen.map((contract) => toQuote(contract, snaps[contract.symbol])).filter((quote) => quote.mid != null && quote.mid > 0);
  return { stock, history, snaps, spot, quotes, nearExpiration, farExpiration };
}

/**
 * Redacta en español por qué ganó la primera estrategia, citando sus números reales.
 * @param {object} winner - Entrada ganadora del ranking.
 * @param {object} second - Segunda del ranking (para la comparación), puede ser undefined.
 * @param {object} signals - Señales de mercado.
 * @param {Array<object>} [all] - Todas las estrategias evaluadas, para comparar sus valores esperados.
 * @returns {string} Explicación en una o dos oraciones.
 */
function explain(winner, second, signals, all = []) {
  const volView =
    signals.ivToHv > 1.1
      ? `la volatilidad implícita (${round(signals.iv * 100, 1)} %) está cara frente a la histórica (${round(signals.hv30 * 100, 1)} %), así que conviene vender volatilidad`
      : signals.ivToHv < 0.95
        ? `la volatilidad implícita (${round(signals.iv * 100, 1)} %) está barata frente a la histórica (${round(signals.hv30 * 100, 1)} %), así que conviene comprarla`
        : `la volatilidad implícita (${round(signals.iv * 100, 1)} %) está cerca de la histórica (${round(signals.hv30 * 100, 1)} %), sin ventaja clara en volatilidad`;
  const trend = signals.trendStrength > 0.005 ? 'con impulso alcista' : signals.trendStrength < -0.005 ? 'con impulso bajista' : 'sin tendencia marcada';
  const gap = second ? ` Superó a ${second.name} por ${round(winner.score - second.score, 1)} puntos.` : '';
  // Honestidad: se aclara cuando el valor esperado de la ganadora es negativo, y si otra estrategia lo tiene positivo.
  const betterEv = all.filter((entry) => entry !== winner && entry.metrics.expectedValue > 0);
  const caveat =
    winner.metrics.expectedValue > 0
      ? ''
      : betterEv.length
        ? ` Ojo: su valor esperado es negativo; ganó por probabilidad de ganancia y encaje con el mercado, pero ${betterEv.map((entry) => entry.name).join(' y ')} ${betterEv.length > 1 ? 'tienen' : 'tiene'} valor esperado positivo. Compara el detalle antes de decidir.`
        : ' Ojo: su valor esperado es negativo, así que es la menos mala de las cuatro, no una operación con ventaja estadística.';
  return (
    `${winner.name} obtuvo ${winner.score} puntos: gana en ${round(winner.metrics.probProfit * 100, 1)} % de las simulaciones, ` +
    `su valor esperado es $${winner.metrics.expectedValue} y su peor caso simulado es $${winner.metrics.worstSimulated}. ` +
    `Hoy ${volView}, y el precio va ${trend}.${gap}${caveat}`
  );
}

export const recommendService = {
  /**
   * Recomienda y ordena las 4 estrategias (Straddle, Strangle, Calendar, Diagonal) para un ticker.
   *
   * @param {string} rawSymbol - Ticker (ej. 'AAPL').
   * @param {{paths?: number}} [query={}] - Trayectorias de Monte Carlo por estrategia (por defecto 20 000).
   * @returns {Promise<object>} Señales, ranking ordenado por puntaje, ganadora con reporte completo y explicación.
   * @throws {import('../lib/errors.js').HttpError} Si el ticker es inválido o no tiene opciones.
   */
  async recommend(rawSymbol, query = {}) {
    const symbol = normalizeSymbol(rawSymbol);
    const paths = Math.min(Math.max(Number(query.paths ?? 20000), 2000), 100000);

    const market = await loadMarket(symbol);
    const { spot, quotes, nearExpiration, farExpiration, history } = market;
    const nearQuotes = quotes.filter((quote) => quote.expiration === nearExpiration);
    const farQuotes = quotes.filter((quote) => quote.expiration === farExpiration);

    const marketView = marketSignals(history.closes);
    const iv = atmIv(nearQuotes, spot) ?? marketView.hv30;
    const ivFar = farQuotes.length ? atmIv(farQuotes, spot) : null;
    const signals = {
      ...marketView,
      iv,
      ivToHv: iv / marketView.hv30,
      termSlope: ivFar ? iv / ivFar : null,
      spot,
      nearExpiration,
      farExpiration,
    };
    const side = volSide(signals.ivToHv);
    const fits = templateFit({ ivToHv: signals.ivToHv, termSlope: signals.termSlope, signals });
    const candidates = [`${side}-straddle`, `${side}-strangle`, 'calendar', 'diagonal'];

    const evaluated = await Promise.all(
      candidates.map(async (template) => {
        try {
          const built = build(template, quotes, spot, nearExpiration);
          const legs = built.legs;
          const report = await riskService.analyzeLegs(
            { name: built.name, underlying: symbol, qty: 1 },
            legs,
            { paths, seed: 42 },
            { stock: market.stock, snaps: market.snaps, history },
          );
          const mc = report.monteCarlo;
          const { score, parts } = composite({ probProfit: mc.probProfit, expectedValue: mc.mean, var95: mc.var95, fit: fits[template] });
          return {
            template,
            name: TEMPLATES[template],
            legs,
            score,
            scoreParts: parts,
            metrics: {
              probProfit: mc.probProfit,
              expectedValue: mc.mean,
              worstSimulated: mc.min,
              bestSimulated: mc.max,
              var95: mc.var95,
              cvar95: mc.cvar95,
              marginRegT: report.margin.regT,
              marginSpan: report.margin.span,
              netCost: report.cost.market,
              greeks: report.greeks,
              reward_risk: mc.var95 > 0 ? round(mc.mean / mc.var95, 3) : null,
            },
            report,
          };
        } catch (error) {
          return { template, name: TEMPLATES[template], error: error.message, score: -1 };
        }
      }),
    );

    const ranking = evaluated
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ rank: index + 1, ...entry }));
    const usable = ranking.filter((entry) => !entry.error);
    if (!usable.length) throw badRequest(`No se pudo armar ninguna estrategia para ${symbol}: ${ranking.map((e) => e.error).join(' | ')}`);

    const winner = usable[0];
    return {
      symbol,
      asOf: new Date().toISOString(),
      method: 'Puntaje = 40 % prob. de ganancia + 30 % valor esperado/riesgo + 30 % encaje con el mercado (lib/scoring.js).',
      signals: {
        spot,
        hv30Pct: round(signals.hv30 * 100, 1),
        hvLongRunPct: round(signals.hvLongRun * 100, 1),
        ivPct: round(signals.iv * 100, 1),
        ivToHv: round(signals.ivToHv, 2),
        termSlope: round(signals.termSlope, 2),
        trendStrengthPct: round(signals.trendStrength * 100, 2),
        sma20: round(signals.sma20),
        ema9: round(signals.ema9),
        bollingerPosition: round(signals.bollingerPosition, 2),
        rsi14: round(signals.rsi14, 1),
        volView: side === 'short' ? 'IV cara: se vende volatilidad' : 'IV barata o neutra: se compra volatilidad',
        nearExpiration,
        farExpiration,
      },
      // Cada fila lleva su reporte completo (histograma, riesgo extendido) para que el front pueda mostrar su detalle al hacer clic.
      ranking,
      winner: { template: winner.template, name: winner.name, score: winner.score, metrics: winner.metrics, legs: winner.legs, report: winner.report },
      explanation: explain(winner, usable[1], signals, usable),
    };
  },
};
