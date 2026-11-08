/**
 * ============================================================================
 *  lib/stats.js — Estadística y medidas de riesgo (funciones puras, sin red)
 * ============================================================================
 *  QUÉ HACE
 *    Contiene las fórmulas de riesgo que usa el recomendador y el análisis de
 *    riesgo extendido: retornos, volatilidad histórica, VaR y CVaR, drawdown
 *    máximo, Sharpe, Sortino, beta e intervalos de confianza.
 *
 *  POR QUÉ ESTÁ APARTE
 *    Son funciones puras (misma entrada, misma salida). Eso permite probarlas
 *    con números conocidos en pruebas/unitarias/stats.test.js y explicarlas
 *    una por una al exponer, sin depender de Alpaca ni de la base de datos.
 *
 *  CONVENCIÓN DE SIGNOS
 *    VaR y CVaR se devuelven como pérdida en POSITIVO (igual que el motor Rust):
 *    un VaR95 de 120 significa "en el 5 % de los peores casos se pierde 120 o más".
 * ============================================================================
 */

/** Días de mercado por año: convierte desviación diaria en anual (σ_anual = σ_diaria · √252). */
export const TRADING_DAYS = 252;

/**
 * Promedio aritmético: μ = (Σ xᵢ) / n.
 * @param {number[]} values
 * @returns {number} Promedio; NaN si el arreglo está vacío.
 */
export function mean(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : NaN;
}

/**
 * Desviación estándar MUESTRAL: s = √( Σ (xᵢ − μ)² / (n − 1) ).
 * Se divide entre n−1 (corrección de Bessel) porque se estima con una muestra, no con toda la población.
 * @param {number[]} values
 * @returns {number} Desviación estándar; NaN si hay menos de 2 datos.
 */
export function stdev(values) {
  if (values.length < 2) return NaN;
  const mu = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / (values.length - 1));
}

/**
 * Retornos logarítmicos diarios: rₜ = ln(Pₜ / Pₜ₋₁).
 * Se usan logaritmos porque se suman en el tiempo y son consistentes con el modelo GBM del Monte Carlo.
 * @param {number[]} closes - Precios de cierre en orden cronológico.
 * @returns {number[]} Un retorno menos que precios.
 */
export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

/**
 * Volatilidad histórica anualizada de los últimos `window` retornos: σ_anual = s_diaria · √252.
 * @param {number[]} closes - Precios de cierre cronológicos.
 * @param {number} [window=30] - Cantidad de retornos recientes a considerar.
 * @returns {number} Volatilidad anualizada (0.25 = 25 %); NaN si faltan datos.
 */
export function historicalVol(closes, window = 30) {
  const returns = logReturns(closes).slice(-window);
  return stdev(returns) * Math.sqrt(TRADING_DAYS);
}

/**
 * Percentil por interpolación lineal sobre un arreglo YA ordenado de menor a mayor.
 * @param {number[]} sorted - Datos ordenados ascendente.
 * @param {number} p - Percentil entre 0 y 1 (0.05 = percentil 5).
 * @returns {number}
 */
export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * VaR y CVaR HISTÓRICOS a partir de una lista de resultados (P&L) ya observados o simulados.
 *   VaR  = −percentil_(1−nivel) del P&L        → pérdida que solo se supera en (1−nivel) de los casos.
 *   CVaR = −promedio de los P&L ≤ ese percentil → pérdida PROMEDIO dentro de ese peor tramo (Expected Shortfall).
 * @param {number[]} pnls - Resultados de ganancia/pérdida (negativo = pérdida).
 * @param {number} [level=0.95] - Nivel de confianza.
 * @returns {{ var: number, cvar: number }} Ambos como pérdida positiva; NaN si no hay datos.
 */
export function varCvar(pnls, level = 0.95) {
  if (!pnls.length) return { var: NaN, cvar: NaN };
  const sorted = [...pnls].sort((a, b) => a - b);
  const cutoff = percentile(sorted, 1 - level);
  const tail = sorted.filter((v) => v <= cutoff);
  return { var: -cutoff, cvar: -mean(tail) };
}

/**
 * Drawdown máximo: la mayor caída porcentual desde un máximo previo hasta un mínimo posterior.
 *   drawdownₜ = (Pₜ − máximo_hasta_t) / máximo_hasta_t ;  maxDrawdown = el más negativo.
 * @param {number[]} closes - Precios cronológicos.
 * @returns {number} Valor entre −1 y 0 (−0.2 = caída máxima de 20 %).
 */
export function maxDrawdown(closes) {
  let peak = -Infinity;
  let worst = 0;
  for (const price of closes) {
    peak = Math.max(peak, price);
    worst = Math.min(worst, (price - peak) / peak);
  }
  return worst;
}

/**
 * Razón de Sharpe anualizada: (μ_anual − tasa libre) / σ_anual.
 * Mide cuánto rendimiento extra se obtiene por cada unidad de riesgo TOTAL.
 * @param {number[]} dailyReturns - Retornos diarios.
 * @param {number} [riskFree=0.04] - Tasa libre de riesgo anual.
 * @returns {number}
 */
export function sharpe(dailyReturns, riskFree = 0.04) {
  const annualReturn = mean(dailyReturns) * TRADING_DAYS;
  const annualVol = stdev(dailyReturns) * Math.sqrt(TRADING_DAYS);
  return (annualReturn - riskFree) / annualVol;
}

/**
 * Razón de Sortino anualizada: (μ_anual − tasa libre) / σ_bajista_anual.
 * Igual que Sharpe pero solo penaliza las caídas: σ_bajista = √( Σ min(r − objetivo, 0)² / n ).
 * @param {number[]} dailyReturns - Retornos diarios.
 * @param {number} [riskFree=0.04] - Tasa libre de riesgo anual (también es el objetivo mínimo).
 * @returns {number}
 */
export function sortino(dailyReturns, riskFree = 0.04) {
  const dailyTarget = riskFree / TRADING_DAYS;
  const downside = Math.sqrt(mean(dailyReturns.map((r) => Math.min(r - dailyTarget, 0) ** 2)));
  const annualDownside = downside * Math.sqrt(TRADING_DAYS);
  return (mean(dailyReturns) * TRADING_DAYS - riskFree) / annualDownside;
}

/**
 * Beta de un activo contra un índice: β = Cov(r_activo, r_índice) / Var(r_índice).
 * β = 1 se mueve igual que el índice; β > 1 amplifica; β < 0 va en sentido contrario.
 * @param {number[]} assetReturns - Retornos del activo.
 * @param {number[]} indexReturns - Retornos del índice (SPY), mismas fechas.
 * @returns {number}
 */
export function beta(assetReturns, indexReturns) {
  const n = Math.min(assetReturns.length, indexReturns.length);
  const a = assetReturns.slice(-n);
  const b = indexReturns.slice(-n);
  const muA = mean(a);
  const muB = mean(b);
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (a[i] - muA) * (b[i] - muB);
    variance += (b[i] - muB) ** 2;
  }
  return covariance / variance;
}

/**
 * Intervalo de confianza del 95 % para un promedio: μ ± 1.96 · σ / √n  (teorema central del límite).
 * Con 50 000 trayectorias de Monte Carlo el intervalo del promedio es muy angosto.
 * @param {number} mu - Promedio de la muestra.
 * @param {number} sigma - Desviación estándar de la muestra.
 * @param {number} n - Tamaño de la muestra.
 * @returns {[number, number]} [límite inferior, límite superior]
 */
export function meanConfidenceInterval95(mu, sigma, n) {
  const margin = (1.96 * sigma) / Math.sqrt(n);
  return [mu - margin, mu + margin];
}

/**
 * Intervalo de confianza del 95 % para una proporción (p. ej. probabilidad de ganancia):
 *   p ± 1.96 · √( p (1 − p) / n )  (aproximación normal de la binomial).
 * @param {number} p - Proporción observada entre 0 y 1.
 * @param {number} n - Cantidad de observaciones.
 * @returns {[number, number]} Límites acotados a [0, 1].
 */
export function proportionConfidenceInterval95(p, n) {
  const margin = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return [Math.max(0, p - margin), Math.min(1, p + margin)];
}

/**
 * Percentil aproximado de una distribución resumida en un histograma de P&L.
 * Recorre los intervalos acumulando frecuencia hasta alcanzar el percentil y interpola dentro del intervalo.
 * @param {Array<{from:number,to:number,count:number}>} histogram - Intervalos con su conteo.
 * @param {number} p - Percentil entre 0 y 1.
 * @returns {number}
 */
export function histogramPercentile(histogram, p) {
  const total = histogram.reduce((sum, bin) => sum + bin.count, 0);
  const target = total * p;
  let accumulated = 0;
  for (const bin of histogram) {
    if (accumulated + bin.count >= target) {
      const fraction = bin.count ? (target - accumulated) / bin.count : 0;
      return bin.from + (bin.to - bin.from) * fraction;
    }
    accumulated += bin.count;
  }
  return histogram.at(-1)?.to ?? NaN;
}
