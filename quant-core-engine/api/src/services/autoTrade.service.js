/**
 * ============================================================================
 *  services/autoTrade.service.js — "Ejecutar automático" (recomienda → valida → opera en PAPER)
 * ============================================================================
 *  QUÉ HACE
 *    POST /api/v1/strategies/auto  { symbol, dryRun?, confirm? }  (confirm: true obligatorio para enviar la orden)
 *      1. Pide la recomendación (recommend.service) y toma la ganadora.
 *      2. FILTRO 1 — riesgo (reglas fijas, abajo).
 *      3. FILTRO 2 — IA (servicio `ai`, puerto 3065): debe responder "approved".
 *      4. SOLO si pasan los dos filtros: guarda la estrategia y la envía como orden
 *         multi-pierna a Alpaca PAPER (dinero simulado).
 *
 *  FILTRO DE RIESGO (todas deben cumplirse)
 *      • probabilidad de ganancia ≥ 40 %
 *      • valor esperado > 0
 *      • VaR 95 % ≤ 5 % del capital de la cuenta
 *      • margen Reg T ≤ poder de compra disponible
 *
 *  SEGURIDAD
 *    - Alpaca está configurado en paper por defecto (config.alpaca.tradingUrl).
 *    - Si la IA no está disponible, NO se opera (fallar cerrado).
 *    - dryRun = true calcula todo pero no envía ninguna orden.
 *    - Esto NO garantiza ganancias: es un asistente de decisión.
 * ============================================================================
 */
import { config } from '../config.js';
import { alpaca } from '../lib/alpaca.js';
import { badRequest, HttpError } from '../lib/errors.js';
import { recommendService } from './recommend.service.js';
import { strategiesService } from './strategies.service.js';

// Proteccion contra doble clic / peticiones repetidas: /auto es la unica ruta que mueve dinero (paper)
// y no tiene autenticacion; con esto solo puede haber UNA ejecucion a la vez y no se repite el mismo
// ticker durante 60 s tras enviar una orden. shortcut: estado en memoria de un proceso; con varias replicas usar Redis.
const REPEAT_BLOCK_MS = 60_000;
let running = false;
const lastOrderAt = new Map();

export const RISK_RULES = { minProbProfit: 0.4, maxVarShareOfEquity: 0.05 };

/**
 * Evalúa el FILTRO 1 (riesgo) sobre las métricas de la estrategia ganadora.
 *
 * @param {{probProfit:number, expectedValue:number, var95:number, marginRegT:number}} metrics - Métricas de la ganadora.
 * @param {{equity:number, buyingPower:number}} account - Capital y poder de compra de la cuenta paper.
 * @returns {{ passed: boolean, checks: Array<{rule: string, value: number, limit: string, ok: boolean}> }}
 */
export function riskFilter(metrics, account) {
  const checks = [
    { rule: 'Probabilidad de ganancia', value: metrics.probProfit, limit: `≥ ${RISK_RULES.minProbProfit}`, ok: metrics.probProfit >= RISK_RULES.minProbProfit },
    { rule: 'Valor esperado', value: metrics.expectedValue, limit: '> 0', ok: metrics.expectedValue > 0 },
    {
      rule: 'VaR 95 % frente al capital',
      value: metrics.var95,
      limit: `≤ ${RISK_RULES.maxVarShareOfEquity * 100} % de ${account.equity}`,
      ok: metrics.var95 <= RISK_RULES.maxVarShareOfEquity * account.equity,
    },
    { rule: 'Margen Reg T', value: metrics.marginRegT, limit: `≤ poder de compra (${account.buyingPower})`, ok: metrics.marginRegT <= account.buyingPower },
  ];
  return { passed: checks.every((check) => check.ok), checks };
}

/**
 * Llama al microservicio `ai` por HTTP (el mismo camino que cualquier cliente).
 * @param {object} metrics - Métricas a validar.
 * @returns {Promise<{verdict: string, reason: string, model: string|null}>} Veredicto; 'unavailable' si el servicio no responde.
 */
async function askAi(metrics) {
  try {
    const response = await fetch(`${config.services.ai}${config.apiUrl}/ai/validate-risk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ metrics }),
      signal: AbortSignal.timeout(config.ai.timeoutMs + 5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { verdict: 'unavailable', reason: `Sin validación de IA: el servicio ai no respondió (${error.message})`, model: null };
  }
}

export const autoTradeService = {
  /**
   * Ejecuta el flujo completo recomendar → riesgo → IA → orden paper.
   *
   * @param {{symbol: string, dryRun?: boolean}} body - Ticker y bandera de simulación sin enviar orden.
   * @returns {Promise<object>} Resultado con la recomendación, ambos filtros y, si se envió, la orden.
   * @throws {import('../lib/errors.js').HttpError} Si falta el ticker.
   */
  async run(body = {}) {
    if (!body.symbol) throw badRequest('symbol es obligatorio');
    // Confirmación explícita: enviar una orden exige `confirm: true`. El front lo manda solo después de que la persona
    // acepta el aviso; así un POST accidental (o de otra página abierta en el navegador) no puede operar. dryRun no la necesita.
    if (!body.dryRun && body.confirm !== true) throw badRequest('Para enviar una orden se requiere confirm: true (o usa dryRun: true para simular)');
    if (running) throw new HttpError(429, 'Ya hay una ejecución automática en curso; espera a que termine');
    running = true;
    try {
      return await this.execute(body);
    } finally {
      running = false;
    }
  },

  /** Cuerpo de `run` (separado para que el candado `running` siempre se libere en el finally). */
  async execute(body) {
    const recommendation = await recommendService.recommend(body.symbol);
    const { winner } = recommendation;

    const account = await alpaca.account();
    const accountSummary = { equity: Number(account.equity), buyingPower: Number(account.buying_power) };
    const risk = riskFilter(winner.metrics, accountSummary);

    const ai = await askAi({
      symbol: recommendation.symbol,
      strategy: winner.name,
      ...winner.metrics,
      extended: winner.report?.extended ?? null,
      accountEquity: accountSummary.equity,
    });
    const aiPassed = ai.verdict === 'approved';

    const result = {
      symbol: recommendation.symbol,
      strategy: winner.name,
      explanation: recommendation.explanation,
      filters: { risk, ai: { passed: aiPassed, ...ai } },
      disclaimer: 'Esta función no garantiza ganancias. Opera solo en Alpaca PAPER (dinero simulado).',
      executed: false,
      order: null,
    };
    if (!risk.passed || !aiPassed) {
      result.message = 'No se envió la orden: ' + (!risk.passed ? 'no pasó el filtro de riesgo' : 'la IA no aprobó la estrategia') + '.';
      return result;
    }
    if (body.dryRun) {
      result.message = 'Simulación (dryRun): pasó ambos filtros, pero no se envió la orden.';
      return result;
    }

    const blockedUntil = (lastOrderAt.get(recommendation.symbol) ?? 0) + REPEAT_BLOCK_MS;
    if (Date.now() < blockedUntil) throw new HttpError(429, `Ya se envió una orden automática de ${recommendation.symbol} hace menos de 60 s`);
    lastOrderAt.set(recommendation.symbol, Date.now());
    try {
      const created = await strategiesService.create({
        name: `${winner.name} (auto)`,
        underlying: recommendation.symbol,
        description: `Automática: ${recommendation.explanation}`.slice(0, 480),
        qty: 1,
        order_type: 'market',
        legs: winner.legs,
      });
      const submitted = await strategiesService.submit(created.id);
      return { ...result, executed: true, order: submitted.order, strategyId: created.id, message: 'Orden enviada a Alpaca PAPER.' };
    } catch (error) {
      lastOrderAt.delete(recommendation.symbol); // si falló, se permite reintentar
      throw error;
    }
  },
};
