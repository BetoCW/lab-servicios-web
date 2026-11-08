/**
 * ============================================================================
 *  lib/scoring.js — Señales de mercado y puntaje del recomendador (funciones puras)
 * ============================================================================
 *  QUÉ HACE
 *    1. Lee el "régimen" del mercado a partir de precios: volatilidad histórica,
 *       tendencia (SMA/EMA), posición dentro de las bandas de Bollinger y RSI.
 *    2. Decide qué tan bien encaja cada estrategia con ese régimen (puntaje "fit").
 *    3. Combina probabilidad de ganancia, valor esperado y encaje en un puntaje 0–100.
 *
 *  REGLA DE FONDO (la que se explica al exponer)
 *    - Volatilidad implícita BARATA frente a la histórica  → conviene COMPRAR volatilidad
 *      (long straddle / long strangle): se gana si el precio se mueve más de lo que cobra el mercado.
 *    - Volatilidad implícita CARA frente a la histórica    → conviene VENDER volatilidad
 *      (short straddle / short strangle): se cobra una prima mayor al movimiento real esperado.
 *    - Estructura temporal (vol cercana > vol lejana) y mercado lateral → calendar.
 *    - Sesgo alcista suave → diagonal de calls.
 *
 *  Es un modelo heurístico y transparente, no una garantía de ganancia.
 * ============================================================================
 */
import { bollinger, ema, rsi, sma } from './indicators.js';
import { historicalVol, mean } from './stats.js';

/**
 * Limita un número al intervalo [lo, hi].
 * @param {number} value
 * @param {number} [lo=0]
 * @param {number} [hi=1]
 * @returns {number}
 */
export const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));

/**
 * Lee el régimen de mercado a partir de los cierres diarios.
 *
 * @param {number[]} closes - Cierres diarios en orden cronológico (mínimo ~40 datos).
 * @returns {{
 *   price: number, hv30: number, hvLongRun: number, sma20: number, ema9: number,
 *   trendStrength: number, bollingerPosition: number, rsi14: number
 * }} Señales:
 *   - hv30: volatilidad histórica anualizada de los últimos 30 días.
 *   - hvLongRun: promedio de la volatilidad histórica de 30 días en ventanas pasadas (contexto de largo plazo).
 *   - trendStrength: (EMA9 − SMA20) / SMA20. Positivo = impulso alcista, negativo = bajista.
 *   - bollingerPosition: 0 = en la banda inferior, 0.5 = en la media, 1 = en la banda superior.
 */
export function marketSignals(closes) {
  const price = closes.at(-1);
  const sma20 = sma(closes, 20).at(-1);
  const ema9 = ema(closes, 9).at(-1);
  const bands = bollinger(closes, 20, 2);
  const upper = bands.upper.at(-1);
  const lower = bands.lower.at(-1);
  const rolling = [];
  for (let end = 60; end <= closes.length; end += 5) rolling.push(historicalVol(closes.slice(0, end), 30));
  return {
    price,
    hv30: historicalVol(closes, 30),
    hvLongRun: mean(rolling.filter(Number.isFinite)),
    sma20,
    ema9,
    trendStrength: (ema9 - sma20) / sma20,
    bollingerPosition: upper > lower ? clamp((price - lower) / (upper - lower)) : 0.5,
    rsi14: rsi(closes, 14).at(-1),
  };
}

/**
 * Elige si conviene comprar o vender volatilidad según la razón IV/HV.
 * Umbral 1.10: la IV debe superar a la HV en 10 % para que valga la pena VENDER.
 * @param {number} ivToHv - Volatilidad implícita ATM dividida entre la histórica de 30 días.
 * @returns {'long'|'short'}
 */
export const volSide = (ivToHv) => (ivToHv > 1.1 ? 'short' : 'long');

/**
 * Puntaje de encaje (0 a 1) de cada plantilla con el régimen actual.
 *
 * @param {object} input
 * @param {number} input.ivToHv - IV ATM / HV30.
 * @param {number|null} input.termSlope - IV vencimiento cercano / IV vencimiento lejano (null si no hay).
 * @param {{trendStrength:number, bollingerPosition:number}} input.signals - Señales de marketSignals.
 * @returns {Record<string, number>} Encaje por plantilla.
 */
export function templateFit({ ivToHv, termSlope, signals }) {
  const volCheap = clamp((1.15 - ivToHv) / 0.5); // 1 cuando la IV es mucho menor que la HV
  const volRich = clamp((ivToHv - 0.95) / 0.5); // 1 cuando la IV es mucho mayor que la HV
  const nearBand = clamp(Math.abs(signals.bollingerPosition - 0.5) * 2); // 1 pegado a una banda (posible ruptura)
  const rangeBound = 1 - nearBand; // 1 en el centro de las bandas (mercado lateral)
  const bullish = clamp(0.5 + signals.trendStrength * 10); // 0.5 neutro, hacia 1 con impulso alcista
  const term = termSlope == null ? 0.5 : clamp((termSlope - 0.9) / 0.3);
  const longVol = 0.7 * volCheap + 0.3 * nearBand;
  const shortVol = 0.7 * volRich + 0.3 * rangeBound;
  return {
    'long-straddle': longVol,
    'long-strangle': longVol,
    'short-straddle': shortVol,
    'short-strangle': shortVol,
    calendar: 0.5 * term + 0.5 * rangeBound,
    diagonal: 0.5 * bullish + 0.5 * (1 - Math.abs(volRich - volCheap)),
  };
}

/**
 * Puntaje final 0–100 de una estrategia.
 *   score = 100 · ( 0.40·probabilidad de ganancia + 0.30·puntaje de valor esperado + 0.30·encaje )
 *   puntaje de valor esperado = 0.5 + 0.5·tanh( valor esperado / pérdida VaR95 )
 *     → 0.5 si el valor esperado es 0; sube hacia 1 si gana mucho respecto al riesgo; baja hacia 0 si pierde.
 *
 * @param {object} input
 * @param {number} input.probProfit - Probabilidad de ganancia (0–1) del Monte Carlo.
 * @param {number} input.expectedValue - P&L promedio simulado en dólares.
 * @param {number} input.var95 - VaR 95 % en dólares (pérdida positiva).
 * @param {number} input.fit - Encaje con el régimen (0–1).
 * @returns {{ score: number, parts: { probability: number, expectedValue: number, fit: number } }}
 */
export function composite({ probProfit, expectedValue, var95, fit }) {
  const evScore = 0.5 + 0.5 * Math.tanh(expectedValue / Math.max(Math.abs(var95), 1));
  const score = 100 * (0.4 * probProfit + 0.3 * evScore + 0.3 * fit);
  return { score: Math.round(score * 10) / 10, parts: { probability: probProfit, expectedValue: evScore, fit } };
}
