/**
 * ============================================================================
 *  services/riskExtended.service.js — Riesgo extendido de una estrategia
 * ============================================================================
 *  QUÉ HACE
 *    Complementa el reporte del motor Rust (Monte Carlo, griegas, márgenes) con
 *    las medidas que pidió el profe:
 *      1. VaR y CVaR — histórico (se re-juega el pasado real) y Monte Carlo.
 *      2. Drawdown máximo del subyacente y peor caso histórico de la estrategia.
 *      3. Sharpe y Sortino — del subyacente (1 año) y de la estrategia (Monte Carlo).
 *      4. Beta contra SPY y delta ponderado por beta.
 *      5. Estrés: ±2σ de movimiento y caída de volatilidad implícita (IV crush).
 *      6. Incertidumbre: intervalos de confianza del 95 %.
 *
 *  CÓMO SE EXPLICA EN UNA EXPOSICIÓN
 *    "El Monte Carlo inventa el futuro con una fórmula (movimiento browniano).
 *     El VaR histórico, en cambio, aplica lo que REALMENTE hizo el precio en el
 *     último año a nuestra estrategia. Si los dos se parecen, el modelo es creíble."
 *
 *  DE DÓNDE SALEN LOS DATOS
 *    Velas diarias del subyacente y de SPY desde Alpaca (feed IEX). Se guardan
 *    5 minutos en memoria para no repetir llamadas (Alpaca limita a 200/min).
 * ============================================================================
 */
import { pnlMatrix } from '@core/quant-engine';
import { alpaca } from '../lib/alpaca.js';
import { memo } from '../lib/cache.js';
import {
  beta,
  histogramPercentile,
  logReturns,
  maxDrawdown,
  mean,
  meanConfidenceInterval95,
  proportionConfidenceInterval95,
  sharpe,
  sortino,
  varCvar,
} from '../lib/stats.js';

const DAY_MS = 86_400_000;
const HISTORY_TTL_MS = 5 * 60_000;
const MAX_REPLAY_SHOCKS = 400;

/**
 * Redondeo seguro: devuelve null si el valor no es un número finito (JSON no admite NaN).
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number|null}
 */
const round = (value, decimals = 2) => (Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null);

/**
 * Descarga ~1.5 años de velas diarias de un símbolo y las regresa de la más vieja a la más nueva.
 * @param {string} symbol - Ticker (p. ej. 'AAPL').
 * @returns {Promise<number[]>} Precios de cierre cronológicos.
 */
const dailyCloses = memo(HISTORY_TTL_MS, async (symbol) => {
  const page = await alpaca.stockBars(symbol, {
    timeframe: '1Day',
    limit: 400,
    sort: 'desc',
    start: new Date(Date.now() - 600 * DAY_MS).toISOString(),
  });
  return (page.bars ?? []).reverse().map((bar) => bar.c);
}, (symbol) => symbol); // SPY se comparte entre todos los tickers

/**
 * Historial diario del subyacente y de SPY, con caché de 5 minutos y sin descargas duplicadas
 * (si overview y recommend lo piden a la vez, comparten la misma descarga).
 * @param {string} underlying - Ticker del subyacente.
 * @returns {Promise<{ closes: number[], spyCloses: number[] }>}
 */
export const getHistory = memo(
  HISTORY_TTL_MS,
  async (underlying) => {
    const key = underlying.toUpperCase();
    const [closes, spyCloses] = await Promise.all([dailyCloses(key), key === 'SPY' ? null : dailyCloses('SPY')]);
    return { closes, spyCloses: spyCloses ?? closes };
  },
  (underlying) => underlying.toUpperCase(),
);

/**
 * Calcula el bloque de riesgo extendido de una estrategia.
 *
 * @param {object} input
 * @param {string} input.underlying - Ticker del subyacente.
 * @param {number} input.spot - Precio actual del subyacente.
 * @param {Array<object>} input.engineLegs - Piernas en el formato del motor Rust.
 * @param {object} input.mc - Resultado del Monte Carlo del motor (mean, std, probProfit, var95, cvar95...).
 * @param {Array<{from:number,to:number,count:number}>} input.histogram - Histograma del P&L simulado.
 * @param {number} input.paths - Trayectorias simuladas (tamaño de la muestra).
 * @param {number} input.horizonDays - Horizonte en días calendario.
 * @param {number} input.underlyingVol - Volatilidad usada en la simulación (0.30 = 30 %).
 * @param {number} input.portfolioDelta - Delta total de la estrategia en acciones equivalentes.
 * @param {number} input.rate - Tasa libre de riesgo anual.
 * @param {{closes:number[],spyCloses:number[]}} [input.history] - Historial ya descargado (opcional).
 * @returns {Promise<object>} Bloque `extended` del reporte de riesgo.
 */
export async function extendedRisk({ underlying, spot, engineLegs, mc, histogram, paths, horizonDays, underlyingVol, portfolioDelta, rate, history }) {
  const { closes, spyCloses } = history ?? (await getHistory(underlying));
  const dailyReturns = logReturns(closes);
  const spyReturns = logReturns(spyCloses);
  const lastYear = dailyReturns.slice(-252);

  // ---- 1) VaR / CVaR histórico: se aplican a la estrategia los movimientos REALES que tuvo el
  //         subyacente en ventanas del mismo largo que el horizonte (rolling windows).
  const horizonTradingDays = Math.max(1, Math.round((horizonDays * 252) / 365));
  const replayShocks = [];
  for (let i = 0; i + horizonTradingDays < closes.length; i++) replayShocks.push(closes[i + horizonTradingDays] / closes[i] - 1);
  const recentShocks = replayShocks.slice(-MAX_REPLAY_SHOCKS);
  const replayPnl = recentShocks.length >= 20
    ? pnlMatrix(engineLegs, { spot, rate, horizonDays, spotShocks: recentShocks, volShocks: [0] }).map((row) => row[0])
    : [];
  const historical = varCvar(replayPnl, 0.95);

  // ---- 3) Sharpe / Sortino de la estrategia con los resultados simulados.
  //         Sortino: la desviación bajista se aproxima con el centro de cada intervalo del histograma.
  const totalCount = histogram.reduce((sum, bin) => sum + bin.count, 0);
  const downsideDeviation = Math.sqrt(
    histogram.reduce((sum, bin) => sum + bin.count * Math.min((bin.from + bin.to) / 2, 0) ** 2, 0) / totalCount,
  );

  // ---- 4) Beta contra SPY y delta ponderado: cuántas acciones de SPY "equivale" la estrategia.
  const stockBeta = beta(dailyReturns, spyReturns);
  const spySpot = spyCloses.at(-1);

  // ---- 5) Estrés. σ del horizonte = vol · √(días/365). IV crush: baja la volatilidad hasta 10 puntos.
  const sigmaMove = underlyingVol * Math.sqrt(horizonDays / 365);
  const ivDrop = -Math.min(0.1, underlyingVol * 0.5);
  const stressSpots = [-2 * sigmaMove, 0, 2 * sigmaMove];
  const stress = pnlMatrix(engineLegs, { spot, rate, horizonDays, spotShocks: stressSpots, volShocks: [0, ivDrop] });
  const scenario = (name, spotIndex, volIndex) => ({
    name,
    spotMovePct: round(stressSpots[spotIndex] * 100, 1),
    ivChangePoints: round((volIndex ? ivDrop : 0) * 100, 1),
    pnl: round(stress[spotIndex][volIndex]),
  });

  return {
    var: {
      note: 'Pérdida en positivo. Histórico = re-jugar el último año real; Monte Carlo = simulación GBM.',
      historical95: round(historical.var),
      historicalCVaR95: round(historical.cvar),
      monteCarlo95: round(mc.var95),
      monteCarloCVaR95: round(mc.cvar95),
      monteCarlo99: round(mc.var99),
      historicalSamples: replayPnl.length,
    },
    drawdown: {
      underlyingMaxDrawdownPct: round(maxDrawdown(closes.slice(-252)) * 100, 1),
      strategyWorstHistoricalPnl: replayPnl.length ? round(Math.min(...replayPnl)) : null,
    },
    ratios: {
      underlyingSharpe: round(sharpe(lastYear, rate)),
      underlyingSortino: round(sortino(lastYear, rate)),
      strategySharpe: round(mc.mean / mc.std),
      strategySortino: round(downsideDeviation > 0 ? mc.mean / downsideDeviation : NaN),
    },
    beta: {
      vsSPY: round(stockBeta),
      betaWeightedDelta: round(portfolioDelta * stockBeta * (spot / spySpot)),
    },
    stress: {
      sigmaMovePct: round(sigmaMove * 100, 1),
      scenarios: [
        scenario('Baja 2σ', 0, 0),
        scenario('Sube 2σ', 2, 0),
        scenario('Caída de IV', 1, 1),
        scenario('Baja 2σ + caída de IV', 0, 1),
        scenario('Sube 2σ + caída de IV', 2, 1),
      ],
    },
    confidence: {
      note: 'Intervalos al 95 %. El de la media es angosto porque hay miles de trayectorias; el del P&L muestra el rango donde cae el 95 % de los resultados.',
      meanPnl95: meanConfidenceInterval95(mc.mean, mc.std, paths).map((v) => round(v)),
      pnlRange95: [round(histogramPercentile(histogram, 0.025)), round(histogramPercentile(histogram, 0.975))],
      probProfit95: proportionConfidenceInterval95(mc.probProfit, paths).map((v) => round(v, 4)),
    },
    meanHistoricalPnl: round(mean(replayPnl)),
  };
}
