import { badRequest } from './errors.js';
import { SCORE_WEIGHTS, POSITIVE_EV_BASE, POSITIVE_EV_SPAN, NON_POSITIVE_EV_MAX_SCALE } from './scoring.js';

export const CORE_WEIGHTS = { technical: SCORE_WEIGHTS.fit, probability: SCORE_WEIGHTS.probProfit, risk: SCORE_WEIGHTS.expectedValue, ai: SCORE_WEIGHTS.fit, news: 0.2, liquidity: 0.2 };
export const DEFAULT_CORES = ['technical', 'probability', 'risk'];

export function parseCores(value) {
  if (value === undefined) return [...DEFAULT_CORES];
  const items = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(items) || !items.length || items.some((item) => typeof item !== 'string' || !Object.hasOwn(CORE_WEIGHTS, item.trim()))) {
    throw badRequest('cores debe seleccionar al menos uno de: technical, probability, risk, ai, news, liquidity');
  }
  return Object.keys(CORE_WEIGHTS).filter((key) => items.some((item) => item.trim() === key));
}

// Solo los cores seleccionados influyen en el puntaje. Las métricas siguen siendo
// insumos del análisis; no se convierten en votos de cores desactivados.
export function scoreCores(parts, cores, expectedValue) {
  const values = { technical: parts.fit, probability: parts.probability, risk: parts.expectedValue, ai: parts.ai, news: parts.news, liquidity: parts.liquidity };
  const weight = cores.reduce((sum, key) => sum + CORE_WEIGHTS[key], 0);
  const raw = cores.reduce((sum, key) => {
    if (!Number.isFinite(values[key])) throw badRequest(`El core ${key} no está disponible; no se puede completar el análisis seleccionado`);
    return sum + CORE_WEIGHTS[key] * values[key];
  }, 0) / weight;
  // La compuerta EV pertenece al core de rendimiento/riesgo.
  const scaled = cores.includes('risk') ? (expectedValue > 0 ? POSITIVE_EV_BASE + POSITIVE_EV_SPAN * raw : NON_POSITIVE_EV_MAX_SCALE * raw) : 100 * raw;
  return Math.round(scaled * 10) / 10;
}
