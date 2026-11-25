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
import { aiService } from './ai.service.js';
import { newsService, newsFit } from './news.service.js';
import { DEFAULT_CORES, parseCores, scoreCores } from '../lib/cores.js';

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
 * @param {number} [horizonDays=100] - Último día de vencimiento aceptado (el scan lo baja a 90).
 * @returns {Promise<object>} Spot, historial, cotizaciones y vencimientos elegidos.
 */
async function loadMarket(symbol, horizonDays = 100) {
  const [stock, history] = await Promise.all([alpaca.stockSnapshot(symbol), getHistory(symbol)]);
  const spot = stock?.latestTrade?.p ?? stock?.dailyBar?.c;
  if (!spot) throw badRequest(`Alpaca no tiene precio para ${symbol}`);

  const base = { underlying_symbols: symbol, status: 'active' };
  const nearMax = Math.min(45, horizonDays);
  const [nearContracts, farContracts] = await Promise.all([
    alpaca.listOptionContracts(
      { ...base, expiration_date_gte: isoDate(14), expiration_date_lte: isoDate(nearMax), strike_price_gte: Math.floor(spot * 0.9), strike_price_lte: Math.ceil(spot * 1.1) },
      250,
    ),
    horizonDays < 46 ? [] : alpaca.listOptionContracts(
      { ...base, type: 'call', expiration_date_gte: isoDate(46), expiration_date_lte: isoDate(horizonDays), strike_price_gte: Math.floor(spot * 0.96), strike_price_lte: Math.ceil(spot * 1.04) },
      80,
    ),
  ]);
  const nearExpiration = closestExpiration(nearContracts, Math.min(NEAR_TARGET_DAYS, nearMax));
  if (!nearExpiration) throw badRequest(`${symbol} no tiene opciones listadas en los próximos 14–${nearMax} días`);
  const farExpiration = closestExpiration(farContracts, Math.min(FAR_TARGET_DAYS, horizonDays));

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
  // Honestidad: se aclara cuando ninguna estrategia alcanza valor esperado positivo.
  const betterEv = all.filter((entry) => entry !== winner && entry.metrics.expectedValue > 0);
  const caveat =
    winner.metrics.expectedValue > 0
      ? ''
      : betterEv.length
        ? ` Ojo: su valor esperado es negativo; ${betterEv.map((entry) => entry.name).join(' y ')} ${betterEv.length > 1 ? 'tienen' : 'tiene'} valor esperado positivo.`
        : ' Sin ventaja estadística positiva: ninguna de las cuatro estrategias alcanza valor esperado > 0; es solo la menos desfavorable.';
  return (
    `${winner.name} obtuvo ${winner.score} puntos: gana en ${round(winner.metrics.probProfit * 100, 1)} % de las simulaciones, ` +
    `su valor esperado es $${winner.metrics.expectedValue} y su peor caso simulado es $${winner.metrics.worstSimulated}. ` +
    `Hoy ${volView}, y el precio va ${trend}.${gap}${caveat}`
  );
}

/**
 * Determina los líderes por categoría analítica y asigna insignias a cada estrategia.
 * @param {Array<object>} usable - Lista de estrategias válidas evaluadas en orden de rank.
 * @returns {{ categoryWinners: object, rankingWithBadges: Array<object> }}
 */
/**
 * Explica pata por pata por qué se eligió cada contrato (strike, vencimiento y papel en la estrategia).
 * @param {string} template - Plantilla ('long-straddle', 'calendar', ...).
 * @param {Array<{symbol: string, side: 'buy'|'sell'}>} legs - Piernas armadas por build().
 * @param {Array<object>} quotes - Cotizaciones normalizadas (toQuote) de las que salieron las piernas.
 * @param {number} spot - Precio actual del subyacente.
 * @returns {Array<object>} Una explicación por pierna, en el mismo orden que `legs`.
 */
function explainLegs(template, legs, quotes, spot) {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const isStraddle = template.endsWith('straddle');
  const isStrangle = template.endsWith('strangle');
  const isShort = template.startsWith('short');

  return legs.map((leg) => {
    const quote = bySymbol.get(leg.symbol);
    const action = leg.side === 'buy' ? 'Compra' : 'Venta';
    if (!quote) return { symbol: leg.symbol, action };

    const days = Math.round(daysUntil(quote.expiration));
    const isFarLeg = (template === 'calendar' || template === 'diagonal') && leg.side === 'buy';
    const isCall = quote.type === 'call';
    const delta = quote.delta != null ? round(Math.abs(quote.delta), 2) : null;

    let strikeReason;
    if (isStraddle) {
      strikeReason = isCall
        ? `Strike ${quote.strike}: el más cercano al precio actual ($${round(spot)}), para quedar en el dinero.`
        : `Strike ${quote.strike}: el mismo de la call, para que ambas patas sean simétricas.`;
    } else if (isStrangle) {
      strikeReason = delta != null
        ? `Strike ${quote.strike}: delta ${delta}, el más cercano a 0.25 (fuera del dinero).`
        : `Strike ${quote.strike}: ≈5 % fuera del dinero (Alpaca no trajo griegas).`;
    } else if (isFarLeg) {
      strikeReason = `Strike ${quote.strike}: el más cercano al precio actual ($${round(spot)}), en el dinero.`;
    } else if (template === 'calendar') {
      strikeReason = `Strike ${quote.strike}: el mismo de la pata lejana, para que se compensen.`;
    } else {
      strikeReason = delta != null
        ? `Strike ${quote.strike}: delta ${delta}, el más cercano a 0.30 (fuera del dinero).`
        : `Strike ${quote.strike}: ≈4 % fuera del dinero (Alpaca no trajo griegas).`;
    }

    let role;
    if (isStraddle || isStrangle) {
      role = isShort
        ? `Cobra la prima; pierde si el precio ${isCall ? 'sube' : 'cae'} con fuerza.`
        : `Gana si el precio ${isCall ? 'sube' : 'cae'} más de lo que costó la prima.`;
    } else if (isFarLeg) {
      role = 'Limita el riesgo de la venta cercana y conserva valor cuando esta vence.';
    } else {
      role = 'Cobra la prima, que se desgasta rápido con el paso del tiempo (theta).';
    }

    return {
      symbol: quote.symbol,
      action,
      type: quote.type,
      strike: quote.strike,
      expiration: quote.expiration,
      days,
      mid: round(quote.mid),
      summary: `${action} ${quote.type} ${quote.strike} · vence en ${days} días`,
      strikeReason,
      role,
    };
  }); 
}
export function buildCategoryWinners(usable) {
  if (!usable.length) return { categoryWinners: {}, rankingWithBadges: [] };
  const bestFit = [...usable].sort((a, b) => (b.scoreParts?.fit ?? 0) - (a.scoreParts?.fit ?? 0))[0];
  const bestRiskReward = [...usable].sort((a, b) => (b.scoreParts?.expectedValue ?? 0) - (a.scoreParts?.expectedValue ?? 0))[0];
  const bestWinRate = [...usable].sort((a, b) => (b.metrics?.probProfit ?? 0) - (a.metrics?.probProfit ?? 0))[0];
  const bestComposite = usable[0];

  const categoryWinners = {
    byFit: {
      template: bestFit.template,
      name: bestFit.name,
      value: bestFit.scoreParts?.fit ?? 0,
      label: `${Math.round((bestFit.scoreParts?.fit ?? 0) * 100)} % encaje`,
      description: 'Recomendada si confías en el análisis técnico de tendencia (EMA9/SMA20) y régimen de volatilidad.',
    },
    byRiskAdjustedReturn: {
      template: bestRiskReward.template,
      name: bestRiskReward.name,
      value: bestRiskReward.scoreParts?.expectedValue ?? 0,
      label: `EV $${bestRiskReward.metrics.expectedValue} (CVaR $${bestRiskReward.metrics.cvar95})`,
      description: 'Recomendada si buscas la mejor asimetría matemática protegiendo el capital ante colas de pérdida.',
    },
    byProbability: {
      template: bestWinRate.template,
      name: bestWinRate.name,
      value: bestWinRate.metrics.probProfit,
      label: `${Math.round(bestWinRate.metrics.probProfit * 100)} % prob.`,
      description: 'Recomendada si buscas cobrar primas y tener la máxima frecuencia de operaciones ganadoras.',
    },
    byComposite: {
      template: bestComposite.template,
      name: bestComposite.name,
      value: bestComposite.score,
      label: `${bestComposite.score} pts`,
      description: 'Ganadora del algoritmo equilibrado (40 % probabilidad + 30 % EV/CVaR + 30 % encaje).',
    },
  };

  const rankingWithBadges = usable.map((entry) => {
    const badges = [];
    if (entry.template === bestComposite.template) badges.push('byComposite');
    if (entry.template === bestFit.template) badges.push('byFit');
    if (entry.template === bestRiskReward.template) badges.push('byRiskAdjustedReturn');
    if (entry.template === bestWinRate.template) badges.push('byProbability');
    return { ...entry, badges };
  });

  return { categoryWinners, rankingWithBadges };
}

export const recommendService = {
  /**
   * Recomienda y ordena las 4 estrategias (Straddle, Strangle, Calendar, Diagonal) para un ticker.
   *
   * @param {string} rawSymbol - Ticker (ej. 'AAPL').
   * @param {{paths?: number, cores?: string|string[], horizonDays?: number, templates?: string[]}} [query={}] - Trayectorias de Monte Carlo
   *   (por defecto 20 000), cores, horizonDays (último vencimiento aceptado, por defecto 100) y templates
   *   (fuerza qué plantillas evaluar; lo usa el screen para medir una sola estrategia en todas las empresas).
   * @returns {Promise<object>} Señales, ranking ordenado por puntaje, ganadora con reporte completo y explicación.
   * @throws {import('../lib/errors.js').HttpError} Si el ticker es inválido o no tiene opciones.
   */
  async recommend(rawSymbol, query = {}) {
    const symbol = normalizeSymbol(rawSymbol);
    const cores = parseCores(query.cores);
    const paths = Math.min(Math.max(Number(query.paths ?? 20000), 2000), 100000);

    const horizonDays = Number(query.horizonDays ?? 100);
    const news = cores.includes('news') ? await newsService.analyze(symbol) : null;
    const market = await loadMarket(symbol, horizonDays);
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
    const fits = cores.includes('technical') ? templateFit({ ivToHv: signals.ivToHv, termSlope: signals.termSlope, signals }) : {};
    // Sin core técnico no se descartan compras/ventas por su criterio de volatilidad.
    const candidates = query.templates?.length ? query.templates
      : cores.includes('technical') ? [`${side}-straddle`, `${side}-strangle`, 'calendar', 'diagonal']
      : ['long-straddle', 'short-straddle', 'long-strangle', 'short-strangle', 'calendar', 'diagonal'];
    const hasHv30 = Number.isFinite(marketView.hv30) && marketView.hv30 > 0;
    const simQuery = hasHv30 ? { paths, seed: 42, simulationVol: marketView.hv30, simulationVolSource: 'hv30' } : { paths, seed: 42 };

    const evaluated = await Promise.all(
      candidates.map(async (template) => {
        try {
          const built = build(template, quotes, spot, nearExpiration);
          const legs = built.legs;
          const report = await riskService.analyzeLegs(
            { name: built.name, underlying: symbol, qty: 1 },
            legs,
            simQuery,
            { stock: market.stock, snaps: market.snaps, history },
          );
          const mc = report.monteCarlo;
          const { parts } = composite({ probProfit: mc.probProfit, expectedValue: mc.mean, cvar95: mc.cvar95, var95: mc.var95, fit: fits[template] ?? 0 });
          const ai = cores.includes('ai') ? await aiService.validateRisk({ symbol, strategy: built.name,
            probProfit: mc.probProfit, expectedValue: mc.mean, var95: mc.var95, cvar95: mc.cvar95,
            worstSimulated: mc.min, marginRegT: report.margin.regT, extended: report.extended }) : null;
          if (ai?.verdict === 'unavailable') throw Object.assign(new Error(ai.reason), { coreUnavailable: true });
          if (ai) parts.ai = { approved: 1, caution: 0.5, rejected: 0 }[ai.verdict];
          const newsView = news ? newsFit(news, template) : null;
          if (newsView) parts.news = newsView.score;
          const score = scoreCores(parts, cores, mc.mean);
          if (!cores.includes('technical')) parts.fit = null;
          return {
            template,
            name: TEMPLATES[template],
            legs,
            legExplanations: explainLegs(template, legs, quotes, spot),
            score,
            scoreParts: parts,
            ai,
            news: newsView,
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
          return { template, name: TEMPLATES[template], error: error.message, coreUnavailable: error.coreUnavailable === true, score: -1 };
        }
      }),
    );

    const unavailable = evaluated.find((entry) => entry.coreUnavailable);
    if (unavailable) throw badRequest(`No se pudo completar el core IA: ${unavailable.error}`);
    const ranking = evaluated
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ rank: index + 1, ...entry }));
    const usable = ranking.filter((entry) => !entry.error);
    if (!usable.length) throw badRequest(`No se pudo armar ninguna estrategia para ${symbol}: ${ranking.map((e) => e.error).join(' | ')}`);

    const { categoryWinners, rankingWithBadges } = buildCategoryWinners(usable);
    const categories = { byFit: 'technical', byRiskAdjustedReturn: 'risk', byProbability: 'probability' };
    for (const [category, core] of Object.entries(categories)) {
      if (!cores.includes(core)) delete categoryWinners[category];
    }
    for (const entry of rankingWithBadges) entry.badges = entry.badges.filter((badge) => !categories[badge] || cores.includes(categories[badge]));
    const winner = rankingWithBadges[0];
    const actionable = winner.metrics.expectedValue > 0;
    const simulationVolSource = winner.report?.inputs?.simulationVolSource ?? (hasHv30 ? 'hv30' : 'iv-avg');
    return {
      symbol,
      cores,
      news,
      asOf: new Date().toISOString(),
      actionable,
      method: `Cores activos: ${cores.join(', ')}. Pesos normalizados entre los seleccionados; compuerta EV > 0 solo con risk. Las métricas cuantitativas son insumos compartidos.`,
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
        simulationVolSource,
        nearExpiration,
        farExpiration,
      },
      categoryWinners,
      // Cada fila lleva su reporte completo y las insignias de liderazgo por categoría.
      ranking: rankingWithBadges,
      winner: { template: winner.template, name: winner.name, score: winner.score, actionable, metrics: winner.metrics, legs: winner.legs, legExplanations: winner.legExplanations, report: winner.report },
      explanation: cores.length === DEFAULT_CORES.length && DEFAULT_CORES.every((core) => cores.includes(core))
        ? explain(winner, rankingWithBadges[1], signals, rankingWithBadges)
        : `${winner.name} obtuvo ${winner.score} puntos usando ${cores.join(', ')}.${winner.ai ? ` IA: ${winner.ai.reason}` : ''} Probabilidad simulada ${(winner.metrics.probProfit * 100).toFixed(1)} %; valor esperado $${winner.metrics.expectedValue}.`,
    };
  },
};
