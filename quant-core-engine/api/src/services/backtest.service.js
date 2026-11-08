/**
 * ============================================================================
 *  services/backtest.service.js — Backtest histórico del recomendador (calibración)
 * ============================================================================
 *  PREGUNTA QUE RESPONDE
 *    "Si el recomendador hubiera existido durante el último año, ¿en qué porcentaje
 *     de las veces su primera opción habría ganado? ¿Y la probabilidad que anuncia
 *     coincide con lo que realmente pasó?" (a eso se le llama CALIBRACIÓN).
 *
 *  CÓMO FUNCIONA (paso a paso, para exponer)
 *    1. Se toman ~1.5 años de velas diarias reales del ticker.
 *    2. Cada 5 días hábiles se "viaja en el tiempo": solo se usan datos hasta esa fecha.
 *    3. Se lee el régimen (lib/scoring.js) y se arman las 4 estrategias con strikes fijos
 *       (straddle ATM, strangle ±5 %, calendar ATM 30/60 días, diagonal +3 %/ATM).
 *    4. El motor Rust calcula la probabilidad de ganancia anunciada (Monte Carlo) y el puntaje.
 *    5. Se avanza 21 días hábiles (≈ 30 días calendario) y se mide el P&L REAL con el precio
 *       que de verdad tuvo la acción, valuando las opciones con Black-Scholes del motor.
 *    6. Se cuenta cuántas veces ganó la primera opción y se compara probabilidad anunciada
 *       contra frecuencia real por tramos.
 *
 *  LÍMITE IMPORTANTE (decirlo siempre)
 *    Alpaca no entrega históricos de volatilidad implícita en el plan gratuito. Por eso la IV
 *    de ese día se APROXIMA con la volatilidad histórica de largo plazo del ticker
 *    ("el mercado cobra la volatilidad típica"). Es una aproximación honesta, no un dato real
 *    de cotizaciones pasadas, y se declara en la respuesta.
 * ============================================================================
 */
import { monteCarlo, pnlMatrix } from '@core/quant-engine';
import { badRequest } from '../lib/errors.js';
import { composite, marketSignals, templateFit, volSide } from '../lib/scoring.js';
import { getHistory } from './riskExtended.service.js';

const RATE = Number(process.env.RISK_FREE_RATE ?? 0.04);
const WARMUP = 80; // días de historia mínima antes del primer punto de prueba
const HOLD_TRADING_DAYS = 21; // ≈ 30 días calendario
const STEP = 5;
const NEAR_T = 30 / 365;
const FAR_T = 60 / 365;
const MC_PATHS = 4000;

const round = (value, decimals = 3) => (Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null);

/**
 * Piernas (formato del motor Rust) de cada plantilla con strikes fijos relativos al spot.
 * qty > 0 compra, qty < 0 vende; multiplicador 100 acciones por contrato.
 *
 * @param {string} template - 'long-straddle' | 'short-straddle' | 'long-strangle' | 'short-strangle' | 'calendar' | 'diagonal'.
 * @param {number} spot - Precio del subyacente ese día.
 * @param {number} vol - IV aproximada (0.30 = 30 %).
 * @returns {Array<object>} Piernas para monteCarlo / pnlMatrix.
 */
export function backtestLegs(template, spot, vol) {
  const leg = (type, strike, t, qty) => ({ type, strike, t, qty, vol, multiplier: 100 });
  const sign = template.startsWith('short') ? -1 : 1;
  switch (template) {
    case 'long-straddle':
    case 'short-straddle':
      return [leg('call', spot, NEAR_T, sign), leg('put', spot, NEAR_T, sign)];
    case 'long-strangle':
    case 'short-strangle':
      return [leg('call', spot * 1.05, NEAR_T, sign), leg('put', spot * 0.95, NEAR_T, sign)];
    case 'calendar':
      return [leg('call', spot, NEAR_T, -1), leg('call', spot, FAR_T, 1)];
    case 'diagonal':
      return [leg('call', spot * 1.03, NEAR_T, -1), leg('call', spot, FAR_T, 1)];
    default:
      throw new Error(`Plantilla desconocida: ${template}`);
  }
}

export const backtestService = {
  /**
   * Corre el backtest del recomendador sobre el último año de un ticker.
   *
   * @param {string} rawSymbol - Ticker (ej. 'AAPL').
   * @returns {Promise<object>} Muestras, % de acierto de la primera opción, acierto por estrategia y calibración.
   * @throws {import('../lib/errors.js').HttpError} Si el ticker es inválido o hay poca historia.
   */
  async run(rawSymbol) {
    const symbol = String(rawSymbol ?? '').trim().toUpperCase();
    if (!/^[A-Z][A-Z.]{0,9}$/.test(symbol)) throw badRequest('symbol debe ser un ticker válido (ej. AAPL)');
    const { closes } = await getHistory(symbol);
    if (closes.length < WARMUP + HOLD_TRADING_DAYS + 20) throw badRequest(`${symbol} no tiene historia suficiente para el backtest`);

    const samples = [];
    for (let i = WARMUP; i + HOLD_TRADING_DAYS < closes.length; i += STEP) {
      const spot = closes[i];
      const signals = marketSignals(closes.slice(0, i + 1));
      if (!Number.isFinite(signals.hvLongRun) || !Number.isFinite(signals.hv30)) continue;
      const iv = signals.hvLongRun; // aproximación de la IV de ese día (ver nota del encabezado)
      const ivToHv = iv / signals.hv30;
      const side = volSide(ivToHv);
      const fits = templateFit({ ivToHv, termSlope: null, signals });
      const move = closes[i + HOLD_TRADING_DAYS] / spot - 1;

      const candidates = [`${side}-straddle`, `${side}-strangle`, 'calendar', 'diagonal'].map((template) => {
        const legs = backtestLegs(template, spot, iv);
        const mc = monteCarlo(legs, { spot, rate: RATE, vol: iv, horizonDays: 30, paths: MC_PATHS, seed: 7 });
        const { score } = composite({ probProfit: mc.probProfit, expectedValue: mc.mean, var95: mc.var95, fit: fits[template] });
        const realizedPnl = pnlMatrix(legs, { spot, rate: RATE, horizonDays: 30, spotShocks: [move], volShocks: [0] })[0][0];
        return { template, score, predictedProb: mc.probProfit, realizedPnl, won: realizedPnl > 0 };
      });
      candidates.sort((a, b) => b.score - a.score);
      samples.push({ index: i, ivToHv, candidates });
    }
    if (!samples.length) throw badRequest('No hubo puntos de prueba válidos');

    const winners = samples.map((sample) => sample.candidates[0]);
    const byStrategy = {};
    for (const sample of samples) {
      for (const candidate of sample.candidates) {
        const key = candidate.template.replace(/^(long|short)-/, '');
        byStrategy[key] ??= { n: 0, wins: 0, pnl: 0 };
        byStrategy[key].n += 1;
        byStrategy[key].wins += candidate.won ? 1 : 0;
        byStrategy[key].pnl += candidate.realizedPnl;
      }
    }

    // Calibración: se agrupa la probabilidad ANUNCIADA y se compara con la frecuencia REAL de ganancia.
    const buckets = [
      { label: '< 40 %', min: 0, max: 0.4 },
      { label: '40–50 %', min: 0.4, max: 0.5 },
      { label: '50–60 %', min: 0.5, max: 0.6 },
      { label: '≥ 60 %', min: 0.6, max: 1.01 },
    ].map((bucket) => {
      const inBucket = samples.flatMap((s) => s.candidates).filter((c) => c.predictedProb >= bucket.min && c.predictedProb < bucket.max);
      return {
        range: bucket.label,
        samples: inBucket.length,
        predictedAvgPct: inBucket.length ? round((inBucket.reduce((s, c) => s + c.predictedProb, 0) / inBucket.length) * 100, 1) : null,
        realizedPct: inBucket.length ? round((inBucket.filter((c) => c.won).length / inBucket.length) * 100, 1) : null,
      };
    });

    return {
      symbol,
      method: `Cada ${STEP} días hábiles, últimos ${closes.length} días; mantener ${HOLD_TRADING_DAYS} días hábiles (≈ 30 días calendario).`,
      limitation: 'La IV histórica no está disponible en el plan gratuito de Alpaca: se aproxima con la volatilidad histórica de largo plazo del ticker. Es una estimación, no cotizaciones reales pasadas.',
      samples: samples.length,
      topPick: {
        winRatePct: round((winners.filter((w) => w.won).length / winners.length) * 100, 1),
        avgPnl: round(winners.reduce((s, w) => s + w.realizedPnl, 0) / winners.length, 2),
        note: 'Porcentaje de veces que la estrategia con mayor puntaje habría ganado dinero a 30 días.',
      },
      byStrategy: Object.fromEntries(
        Object.entries(byStrategy).map(([key, v]) => [key, { samples: v.n, winRatePct: round((v.wins / v.n) * 100, 1), avgPnl: round(v.pnl / v.n, 2) }]),
      ),
      calibration: buckets,
    };
  },
};
