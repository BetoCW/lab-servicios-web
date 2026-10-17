// Riesgo de una estrategia con el motor Rust/WASM (@core/quant-engine) y datos reales de Alpaca.
// Entradas reales: precio del subyacente, mid e IV de cada pierna (snapshots de Alpaca).
// Salidas: Monte Carlo del P&L, matriz spot × vol, márgenes Reg T / SPAN, griegas del
// portafolio y la comparación precio del modelo vs. precio de mercado por pierna.
import { blackScholes, impliedVol, monteCarlo, pnlMatrix, regTMargin, spanMargin } from '@core/quant-engine';
import { alpaca } from '../lib/alpaca.js';
import { badRequest } from '../lib/errors.js';
import { parseOcc } from '../lib/occ.js';
import { loadStrategy } from './strategies.service.js';

const RATE = Number(process.env.RISK_FREE_RATE ?? 0.04);
const YEAR_MS = 365 * 86400000;
const SPOT_SHOCKS = [-0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075, 0.1];
const VOL_SHOCKS = [-0.1, -0.05, 0, 0.05, 0.1];
const round = (v, d = 4) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** Años hasta el cierre del vencimiento (16:00 de Nueva York ≈ 20:00 UTC). */
const yearsTo = (expiration, now) => Math.max(0, (Date.parse(`${expiration}T20:00:00Z`) - now) / YEAR_MS);

export const riskService = {
  async analyze(id, query = {}) {
    const paths = Math.min(Math.max(Number(query.paths ?? 50000), 1000), 500000);
    const seed = Number(query.seed ?? 42);
    const { strategy, legs } = await loadStrategy(id);
    const now = Date.now();

    const contracts = legs.map((l) => ({ ...l, ...parseOcc(l.symbol) }));
    const expired = contracts.filter((c) => yearsTo(c.expiration, now) <= 0);
    if (expired.length) throw badRequest(`Piernas vencidas: ${expired.map((c) => c.symbol).join(', ')}. Arma la estrategia con un vencimiento futuro.`);

    // ---------------------------------------------------- datos reales de Alpaca
    const [stock, snaps] = await Promise.all([
      alpaca.stockSnapshot(strategy.underlying),
      alpaca.optionSnapshots(contracts.map((c) => c.symbol)),
    ]);
    const spot = stock?.latestTrade?.p ?? stock?.dailyBar?.c;
    if (!spot) throw badRequest(`Alpaca no tiene precio para ${strategy.underlying}`);

    const nearest = Math.min(...contracts.map((c) => yearsTo(c.expiration, now)));
    // Por defecto se simula hasta el primer vencimiento: el P&L al expirar.
    const horizonDays = Math.min(Number(query.horizon_days ?? nearest * 365), nearest * 365);

    const legsIn = contracts.map((c) => {
      const s = snaps[c.symbol] ?? {};
      const q = s.latestQuote ?? {};
      const mid = q.bp != null && q.ap != null && q.ap > 0 ? (q.bp + q.ap) / 2 : (s.latestTrade?.p ?? null);
      const t = yearsTo(c.expiration, now);
      // IV de Alpaca; si no viene, el motor la calcula del mid.
      let vol = s.impliedVolatility ?? null;
      let ivSource = 'alpaca';
      if (vol == null && mid != null) {
        vol = impliedVol([{ type: c.type, spot, strike: c.strike, t, rate: RATE, price: mid }])[0];
        ivSource = 'motor';
      }
      if (!Number.isFinite(vol)) throw badRequest(`Sin cotización ni IV para ${c.symbol}`);
      const sign = c.side === 'buy' ? 1 : -1;
      return { ...c, t, vol, ivSource, mid, qty: sign * c.ratio_qty * strategy.qty, multiplier: 100 };
    });

    // ---------------------------------------------------- motor
    const t0 = performance.now();
    const greeks = blackScholes(legsIn.map((l) => ({ type: l.type, spot, strike: l.strike, t: l.t, rate: RATE, vol: l.vol })));
    const engineLegs = legsIn.map((l) => ({ type: l.type, strike: l.strike, t: l.t, qty: l.qty, vol: l.vol, multiplier: l.multiplier }));
    // Vol del subyacente para la simulación: IV promedio de las piernas.
    const underlyingVol = legsIn.reduce((a, l) => a + l.vol, 0) / legsIn.length;
    const mc = monteCarlo(engineLegs, { spot, rate: RATE, vol: underlyingVol, horizonDays, paths, seed, bins: 40 });
    const tMc = performance.now() - t0;
    const matrix = pnlMatrix(engineLegs, { spot, rate: RATE, horizonDays: 0, spotShocks: SPOT_SHOCKS, volShocks: VOL_SHOCKS });
    const atExpiry = pnlMatrix(engineLegs, { spot, rate: RATE, horizonDays, spotShocks: SPOT_SHOCKS, volShocks: [0] }).map((r) => r[0]);
    const regT = regTMargin(engineLegs, { spot, rate: RATE });
    const span = spanMargin(engineLegs, { spot, rate: RATE, priceScan: 0.15, volScan: 0.04, shortOptionMinimum: 25 });
    const engineMs = performance.now() - t0;

    const portfolio = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
    const legRows = legsIn.map((l, i) => {
      const g = greeks[i];
      for (const k of Object.keys(portfolio)) portfolio[k] += g[k] * l.qty * l.multiplier;
      return {
        symbol: l.symbol, side: l.side, qty: l.qty, type: l.type, strike: l.strike, expiration: l.expiration,
        daysToExpiry: round(l.t * 365, 2), iv: round(l.vol), ivSource: l.ivSource,
        marketMid: round(l.mid), modelPrice: round(g.price), diff: l.mid == null ? null : round(g.price - l.mid),
        delta: round(g.delta), gamma: round(g.gamma, 5), theta: round(g.theta), vega: round(g.vega),
      };
    });
    const marketCost = legsIn.every((l) => l.mid != null) ? legsIn.reduce((a, l) => a + l.qty * l.multiplier * l.mid, 0) : null;

    const width = (mc.max - mc.min) / mc.histogram.length;
    return {
      strategy: { id: strategy.id, name: strategy.name, underlying: strategy.underlying, qty: strategy.qty },
      inputs: {
        source: 'Alpaca (snapshots en vivo)', spot, rate: RATE, underlyingVol: round(underlyingVol),
        horizonDays: round(horizonDays, 2), paths, seed, asOf: new Date(now).toISOString(),
      },
      legs: legRows,
      cost: { model: round(mc.baseValue, 2), market: round(marketCost, 2) },
      monteCarlo: {
        mean: round(mc.mean, 2), std: round(mc.std, 2), var95: round(mc.var95, 2), cvar95: round(mc.cvar95, 2),
        var99: round(mc.var99, 2), probProfit: round(mc.probProfit), min: round(mc.min, 2), max: round(mc.max, 2),
        histogram: mc.histogram.map((count, i) => ({ from: round(mc.min + i * width, 2), to: round(mc.min + (i + 1) * width, 2), count })),
      },
      pnlMatrix: { spotShocks: SPOT_SHOCKS, volShocks: VOL_SHOCKS, values: matrix.map((r) => r.map((v) => round(v, 2))) },
      pnlAtHorizon: SPOT_SHOCKS.map((s, i) => ({ spotShock: s, spot: round(spot * (1 + s), 2), pnl: round(atExpiry[i], 2) })),
      greeks: Object.fromEntries(Object.entries(portfolio).map(([k, v]) => [k, round(v, 2)])),
      margin: { regT: round(regT.total, 2), span: round(span.margin, 2), spanWorstScenario: span.worstScenario },
      performance: { monteCarloMs: round(tMc, 1), engineMs: round(engineMs, 1), pathsPerSecond: Math.round(paths / (tMc / 1000)) },
    };
  },
};
