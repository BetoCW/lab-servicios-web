/**
 * ============================================================================
 *  services/ai.service.js — Validación de riesgo con IA (OpenRouter)
 * ============================================================================
 *  QUÉ HACE
 *    Recibe las métricas de riesgo de una estrategia (probabilidad de ganancia, valor
 *    esperado, VaR, pérdida máxima, margen...) y le pide a un modelo de lenguaje
 *    (vía OpenRouter) un veredicto: "aprobado", "precaución" o "rechazado", con su
 *    justificación en español.
 *
 *  CÓMO SE EXPLICA EN UNA EXPOSICIÓN
 *    "La IA no calcula nada: los números salen del motor Rust. La IA hace de segundo
 *     revisor, como un analista de riesgo que lee el resumen y dice si el trato le
 *     parece razonable. Si la IA no está disponible, el sistema lo dice y NO opera."
 *
 *  GARANTÍAS DE SEGURIDAD
 *    - La llave (OPENROUTER_API_KEY) vive solo en api/.env; nunca se devuelve ni se registra.
 *    - Si falla la red, falta la llave o el modelo responde algo ilegible, el veredicto es
 *      "unavailable" (sin validación) y el resto del sistema sigue funcionando.
 *    - Temperatura 0: misma entrada, respuesta lo más estable posible.
 * ============================================================================
 */
import { config } from '../config.js';

const VERDICTS = { approved: 'approved', aprobado: 'approved', caution: 'caution', precaucion: 'caution', precaución: 'caution', rejected: 'rejected', rechazado: 'rejected' };

const SYSTEM_PROMPT =
  'Eres un analista de riesgo de opciones financieras. Recibes métricas calculadas por un motor cuantitativo ' +
  '(no las recalcules). Evalúa si la estrategia es razonable para una cuenta de papel (simulada). ' +
  'Criterios: probabilidad de ganancia baja, valor esperado negativo, pérdida máxima grande frente al capital, ' +
  'margen alto o riesgo ilimitado son señales de alerta. ' +
  'Responde SOLO con un JSON: {"verdict":"approved"|"caution"|"rejected","reason":"2 a 3 oraciones en español"}.';

/**
 * Extrae el primer objeto JSON de un texto (algunos modelos lo envuelven en ```json ... ```).
 * @param {string} text - Respuesta cruda del modelo.
 * @returns {object|null} Objeto parseado o null si no hay JSON válido.
 */
export function extractJson(text) {
  const match = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Normaliza el veredicto del modelo a uno de: 'approved' | 'caution' | 'rejected'.
 * @param {string} raw - Texto del veredicto devuelto por el modelo.
 * @returns {'approved'|'caution'|'rejected'|null} Veredicto normalizado o null si no se reconoce.
 */
export function normalizeVerdict(raw) {
  return VERDICTS[String(raw ?? '').trim().toLowerCase()] ?? null;
}

/** Respuesta estándar cuando no se puede validar: no bloquea al resto del sistema. */
const unavailable = (reason) => ({ verdict: 'unavailable', reason: `Sin validación de IA: ${reason}`, model: null });

/**
 * Una llamada a OpenRouter con un modelo concreto.
 * @param {string} model - Identificador del modelo (ej. 'google/gemma-4-31b-it:free').
 * @param {object} metrics - Métricas de la estrategia.
 * @returns {Promise<{verdict: string, reason: string, model: string|null}>} Veredicto o 'unavailable' con la causa.
 */
async function askModel(model, metrics) {
  const { apiKey, timeoutMs } = config.ai;
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-title': 'Quant Core F0' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Métricas de la estrategia:
${JSON.stringify(metrics, null, 2)}` },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unavailable(`no se pudo contactar a OpenRouter (${error.name})`);
  }
  if (!response.ok) return unavailable(`OpenRouter respondió ${response.status} con ${model}`);
  const payload = await response.json().catch(() => null);
  const parsed = extractJson(payload?.choices?.[0]?.message?.content);
  const verdict = normalizeVerdict(parsed?.verdict);
  if (!verdict) return unavailable(`el modelo ${model} no devolvió un veredicto legible`);
  return { verdict, reason: String(parsed.reason ?? '').slice(0, 600), model: payload?.model ?? model };
}

export const aiService = {
  /**
   * Pide a OpenRouter un veredicto sobre las métricas de riesgo. Prueba el modelo principal y,
   * si falla, los de respaldo en orden (los modelos gratuitos a veces devuelven 429 o 404).
   *
   * @param {object} metrics - Métricas de la estrategia (probProfit, expectedValue, var95, cvar95, worstSimulated, marginRegT...).
   * @returns {Promise<{verdict: 'approved'|'caution'|'rejected'|'unavailable', reason: string, model: string|null}>}
   */
  async validateRisk(metrics) {
    if (!config.ai.apiKey) return unavailable('falta OPENROUTER_API_KEY en el .env');
    let last = unavailable('sin modelos configurados');
    for (const model of [config.ai.model, ...config.ai.fallbackModels]) {
      last = await askModel(model, metrics);
      if (last.verdict !== 'unavailable') return last;
    }
    return last;
  },
};
