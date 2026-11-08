// Riesgo de una estrategia con el motor Rust/WASM (@core/quant-engine) y datos reales de Alpaca.
// Entradas reales: precio del subyacente, mid e IV de cada pierna (snapshots de Alpaca).
// Salidas: Monte Carlo del P&L, matriz spot × vol, márgenes Reg T / SPAN, griegas del
// portafolio y la comparación precio del modelo vs. precio de mercado por pierna.
import { blackScholes, impliedVol, monteCarlo, pnlMatrix, regTMargin, spanMargin } from '@core/quant-engine';
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { parseOcc } from '../lib/occ.js';
import { loadStrategy } from './strategies.service.js';
import { extendedRisk } from './riskExtended.service.js';

const RATE = Number(process.env.RISK_FREE_RATE ?? 0.04);
const YEAR_MS = 365 * 86400000;
const SPOT_SHOCKS = [-0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075, 0.1];
const VOL_SHOCKS = [-0.1, -0.05, 0, 0.05, 0.1];

/**
 * Redondea un valor numérico a una cantidad fija de decimales si es finito.
 * @param {number} v - Valor a redondear.
 * @param {number} [d=4] - Cantidad de decimales.
 * @returns {number|null} Valor redondeado o null si no es finito.
 */
const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Calcula la fracción de años hasta el cierre de la expiración (16:00 de Nueva York ≈ 20:00 UTC).
 * @param {string} expiration - Fecha de expiración (YYYY-MM-DD).
 * @param {number} now - Marca de tiempo actual en milisegundos.
 * @returns {number} Fracción de año restante hasta la expiración.
 */
const yearsTo = (expiration, now) => Math.max(0, (Date.parse(`${expiration}T20:00:00Z`) - now) / YEAR_MS);

export const riskService = {
  /**
   * Ejecuta el análisis cuantitativo integral de riesgo para una estrategia dada.
   * Obtiene datos de mercado de Alpaca, calcula griegas Black-Scholes, simulación Monte Carlo de P&L,
   * matriz de escenarios de choque spot x vol y requisitos de margen regulatorio (Reg T y SPAN).
   *
   * @param {string} id - Identificador de la estrategia a analizar.
   * @param {object} [query={}] - Parámetros de simulación opcionales.
   * @param {number} [query.paths=50000] - Cantidad de trayectorias Monte Carlo (1000 - 500000).
   * @param {number} [query.seed=42] - Semilla del generador pseudoaleatorio.
   * @param {number} [query.horizon_days] - Horizonte de proyección en días (por defecto hasta la expiración más cercana).
   * @returns {Promise<object>} Reporte completo de riesgo, griegas, márgenes y métricas de rendimiento.
   * @throws {import('../lib/errors.js').HttpError} Si la estrategia tiene piernas vencidas o falta cotización de mercado.
   */
  async analyze(id, query = {}) {
    const { strategy, legs } = await loadStrategy(id);
    return this.analyzeLegs(strategy, legs, query);
  },

  /**
   * Núcleo del análisis: recibe la estrategia y sus piernas YA en memoria (no necesita base de datos).
   * Lo usan dos caminos: analyze(id) para estrategias guardadas y el recomendador, que evalúa
   * plantillas candidatas que todavía no existen en Supabase.
   *
   * @param {{id?: string, name: string, underlying: string, qty: number}} strategy - Datos de la estrategia.
   * @param {Array<{symbol: string, side: 'buy'|'sell', ratio_qty: number}>} legs - Piernas con símbolo OCC.
   * @param {object} [query={}] - Mismos parámetros que analyze (paths, seed, horizon_days).
   * @param {{stock?: object, snaps?: object, history?: object}} [prefetched={}] - Datos ya descargados
   *   (snapshot de la acción, snapshots de opciones, historial) para no repetir llamadas a Alpaca.
   * @returns {Promise<object>} Mismo reporte que analyze, más el bloque `extended`.
   */
  async analyzeLegs(strategy, legs, query = {}, prefetched = {}) {
    const paths = Math.min(Math.max(Number(query.paths ?? 50000), 1000), 500000);
    const seed = Number(query.seed ?? 42);
    const now = Date.now();

    const contracts = legs.map((leg) => ({ ...leg, ...parseOcc(leg.symbol) }));
    const expired = contracts.filter((contract) => yearsTo(contract.expiration, now) <= 0);
    if (expired.length) {
      throw badRequest(`Piernas vencidas: ${expired.map((c) => c.symbol).join(', ')}. Arma la estrategia con un vencimiento futuro.`);
    }

    // ---------------------------------------------------- datos reales de Alpaca
    const [stock, snaps] = await Promise.all([
      prefetched.stock ?? alpaca.stockSnapshot(strategy.underlying),
      prefetched.snaps ?? alpaca.optionSnapshots(contracts.map((contract) => contract.symbol)),
    ]);
    const spot = stock?.latestTrade?.p ?? stock?.dailyBar?.c;
    if (!spot) throw badRequest(`Alpaca no tiene precio para ${strategy.underlying}`);

    const nearest = Math.min(...contracts.map((contract) => yearsTo(contract.expiration, now)));
    // Por defecto se simula hasta el primer vencimiento: el P&L al expirar.
    const horizonDays = Math.min(Number(query.horizon_days ?? nearest * 365), nearest * 365);

    const legsIn = contracts.map((contract) => {
      const snapshot = snaps[contract.symbol] ?? {};
      const quote = snapshot.latestQuote ?? {};
      const mid = quote.bp != null && quote.ap != null && quote.ap > 0 ? (quote.bp + quote.ap) / 2 : (snapshot.latestTrade?.p ?? null);
      const timeToExpiryYears = yearsTo(contract.expiration, now);

      // IV de Alpaca; si no viene, el motor la calcula del precio mid.
      let vol = snapshot.impliedVolatility ?? null;
      let ivSource = 'alpaca';
      if (vol == null && mid != null) {
        vol = impliedVol([{ type: contract.type, spot, strike: contract.strike, t: timeToExpiryYears, rate: RATE, price: mid }])[0];
        ivSource = 'motor';
      }
      if (!Number.isFinite(vol)) throw badRequest(`Sin cotización ni IV para ${contract.symbol}`);
      const positionSign = contract.side === 'buy' ? 1 : -1;
      return {
        ...contract,
        t: timeToExpiryYears,
        vol,
        ivSource,
        mid,
        qty: positionSign * contract.ratio_qty * strategy.qty,
        multiplier: 100,
      };
    });

    // ---------------------------------------------------- motor WASM (@core/quant-engine)
    const startTime = performance.now();
    const greeks = blackScholes(
      legsIn.map((leg) => ({ type: leg.type, spot, strike: leg.strike, t: leg.t, rate: RATE, vol: leg.vol })),
    );
    const engineLegs = legsIn.map((leg) => ({
      type: leg.type,
      strike: leg.strike,
      t: leg.t,
      qty: leg.qty,
      vol: leg.vol,
      multiplier: leg.multiplier,
    }));
    // Volatilidad del subyacente para la simulación: IV promedio ponderado de las piernas.
    const underlyingVol = legsIn.reduce((accum, leg) => accum + leg.vol, 0) / legsIn.length;
    const mc = monteCarlo(engineLegs, { spot, rate: RATE, vol: underlyingVol, horizonDays, paths, seed, bins: 40 });
    const monteCarloDurationMs = performance.now() - startTime;
    const matrix = pnlMatrix(engineLegs, { spot, rate: RATE, horizonDays: 0, spotShocks: SPOT_SHOCKS, volShocks: VOL_SHOCKS });
    const atExpiry = pnlMatrix(engineLegs, { spot, rate: RATE, horizonDays, spotShocks: SPOT_SHOCKS, volShocks: [0] }).map((row) => row[0]);
    const regT = regTMargin(engineLegs, { spot, rate: RATE });
    const span = spanMargin(engineLegs, { spot, rate: RATE, priceScan: 0.15, volScan: 0.04, shortOptionMinimum: 25 });
    const totalEngineDurationMs = performance.now() - startTime;

    const portfolio = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
    const legRows = legsIn.map((leg, index) => {
      const legGreeks = greeks[index];
      for (const greekMetric of Object.keys(portfolio)) {
        portfolio[greekMetric] += legGreeks[greekMetric] * leg.qty * leg.multiplier;
      }
      return {
        symbol: leg.symbol,
        side: leg.side,
        qty: leg.qty,
        type: leg.type,
        strike: leg.strike,
        expiration: leg.expiration,
        daysToExpiry: round(leg.t * 365, 2),
        iv: round(leg.vol),
        ivSource: leg.ivSource,
        marketMid: round(leg.mid),
        modelPrice: round(legGreeks.price),
        diff: leg.mid == null ? null : round(legGreeks.price - leg.mid),
        delta: round(legGreeks.delta),
        gamma: round(legGreeks.gamma, 5),
        theta: round(legGreeks.theta),
        vega: round(legGreeks.vega),
      };
    });
    const marketCost = legsIn.every((leg) => leg.mid != null)
      ? legsIn.reduce((accum, leg) => accum + leg.qty * leg.multiplier * leg.mid, 0)
      : null;

    const binWidth = (mc.max - mc.min) / mc.histogram.length;
    const histogram = mc.histogram.map((count, i) => ({
      from: round(mc.min + i * binWidth, 2),
      to: round(mc.min + (i + 1) * binWidth, 2),
      count,
    }));
    // Riesgo extendido (VaR histórico, drawdown, Sharpe, beta, estrés, intervalos de confianza).
    // Si Alpaca no entrega historial, el reporte base sigue siendo válido: extended = null.
    const extended = await extendedRisk({
      underlying: strategy.underlying,
      spot,
      engineLegs,
      mc,
      histogram,
      paths,
      horizonDays,
      underlyingVol,
      portfolioDelta: portfolio.delta,
      rate: RATE,
      history: prefetched.history,
    }).catch(() => null);
    return {
      strategy: { id: strategy.id, name: strategy.name, underlying: strategy.underlying, qty: strategy.qty },
      inputs: {
        source: 'Alpaca (snapshots en vivo)',
        spot,
        rate: RATE,
        underlyingVol: round(underlyingVol),
        horizonDays: round(horizonDays, 2),
        paths,
        seed,
        asOf: new Date(now).toISOString(),
      },
      legs: legRows,
      cost: { model: round(mc.baseValue, 2), market: round(marketCost, 2) },
      monteCarlo: {
        mean: round(mc.mean, 2),
        std: round(mc.std, 2),
        var95: round(mc.var95, 2),
        cvar95: round(mc.cvar95, 2),
        var99: round(mc.var99, 2),
        probProfit: round(mc.probProfit),
        min: round(mc.min, 2),
        max: round(mc.max, 2),
        histogram,
      },
      extended,
      pnlMatrix: { spotShocks: SPOT_SHOCKS, volShocks: VOL_SHOCKS, values: matrix.map((row) => row.map((val) => round(val, 2))) },
      pnlAtHorizon: SPOT_SHOCKS.map((shock, i) => ({ spotShock: shock, spot: round(spot * (1 + shock), 2), pnl: round(atExpiry[i], 2) })),
      greeks: Object.fromEntries(Object.entries(portfolio).map(([metric, val]) => [metric, round(val, 2)])),
      margin: { regT: round(regT.total, 2), span: round(span.margin, 2), spanWorstScenario: span.worstScenario },
      performance: {
        monteCarloMs: round(monteCarloDurationMs, 1),
        engineMs: round(totalEngineDurationMs, 1),
        pathsPerSecond: Math.round(paths / (monteCarloDurationMs / 1000)),
      },
    };
  },
};
