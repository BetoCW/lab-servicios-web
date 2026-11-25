import { config } from '../config.js';

const clamp = (n) => Math.max(0, Math.min(1, n));
const round = (n) => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;

// Escenario a bid/ask por pierna. No modela fills de la orden combinada ni la
// cotización futura: se supone el mismo spread para cerrar que para abrir.
export function analyzeLiquidity(legs, snapshots, expectedValue, options = {}) {
  const { qty = 1, now = Date.now(), feed = config.alpaca.optionsFeed,
    maxAgeSeconds = config.execution.maxQuoteAgeSeconds,
    commissionPerContract = config.execution.commissionPerContract,
    slippageBps = config.execution.slippageBps } = options;
  if (!Number.isInteger(qty) || qty < 1 || !legs.length) throw new Error('Tamaño de estrategia inválido');
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0 || !Number.isFinite(slippageBps) || slippageBps < 0
    || (commissionPerContract != null && (!Number.isFinite(commissionPerContract) || commissionPerContract < 0))) {
    throw new Error('Configuración de costos de ejecución inválida');
  }
  const rows = legs.map((leg) => {
    const q = snapshots[leg.symbol]?.latestQuote ?? {};
    const contracts = Number(leg.ratio_qty ?? 1) * qty;
    if (!['buy', 'sell'].includes(leg.side) || !Number.isInteger(contracts) || contracts < 1) throw new Error('Pierna inválida');
    const valid = Number.isFinite(q.bp) && Number.isFinite(q.ap) && q.bp > 0 && q.ap >= q.bp;
    const time = Date.parse(q.t);
    const ageSeconds = Number.isFinite(time) ? (now - time) / 1000 : null;
    const fresh = ageSeconds != null && ageSeconds >= 0 && ageSeconds <= maxAgeSeconds;
    const size = leg.side === 'buy' ? q.as : q.bs;
    const exitSize = leg.side === 'buy' ? q.bs : q.as;
    const sizeKnown = Number.isFinite(size) && size >= 0 && Number.isFinite(exitSize) && exitSize >= 0;
    const sizeEnough = sizeKnown && size >= contracts && exitSize >= contracts;
    const mid = valid ? (q.ap + q.bp) / 2 : null;
    const spread = valid ? q.ap - q.bp : null;
    return { symbol: leg.symbol, side: leg.side, contracts, bid: Number.isFinite(q.bp) ? q.bp : null, ask: Number.isFinite(q.ap) ? q.ap : null,
      bidSize: Number.isFinite(q.bs) ? q.bs : null, askSize: Number.isFinite(q.as) ? q.as : null, quoteTime: Number.isFinite(time) ? new Date(time).toISOString() : null,
      ageSeconds: round(ageSeconds), valid, fresh, sizeKnown, sizeEnough, mid,
      relativeSpreadPct: valid ? spread / mid * 100 : null,
      entryPenalty: valid ? spread / 2 * contracts * 100 : null,
      entryDebit: valid ? (leg.side === 'buy' ? q.ap : -q.bp) * contracts * 100 : null,
      issues: [!valid && 'Bid/ask ausente, cruzado o sin bid positivo', !fresh && 'Cotización antigua o fecha no válida',
        !sizeKnown ? 'Tamaño no disponible' : !sizeEnough && 'Tamaño visible insuficiente para entrada o salida'].filter(Boolean),
    };
  });
  const valid = rows.every((r) => r.valid);
  const fresh = rows.every((r) => r.fresh);
  const sizeEnough = rows.every((r) => r.sizeEnough);
  const contracts = rows.reduce((sum, r) => sum + r.contracts, 0);
  const grossPremium = valid ? rows.reduce((sum, r) => sum + r.mid * r.contracts * 100, 0) : null;
  const entryPenalty = valid ? rows.reduce((sum, r) => sum + r.entryPenalty, 0) : null;
  const roundTripSpread = valid ? entryPenalty * 2 : null;
  const commissionsKnown = Number.isFinite(commissionPerContract) && commissionPerContract >= 0;
  const commissionCost = commissionsKnown ? commissionPerContract * contracts * 2 : null;
  const extraSlippage = valid ? grossPremium * slippageBps / 10000 * 2 : null;
  const estimatedCost = valid ? roundTripSpread + (commissionCost ?? 0) + extraSlippage : null;
  const expectedAfterCosts = valid && Number.isFinite(expectedValue) ? expectedValue - estimatedCost : null;
  const weightedSpread = valid ? roundTripSpread / grossPremium : null;
  const spreadScore = valid ? 1 / (1 + weightedSpread / 0.1) : 0;
  let score = valid ? clamp(0.55 * spreadScore + 0.25 * Number(fresh) + 0.2 * Number(sizeEnough)) : 0;
  // Calidad insuficiente no puede parecer excelente por un spread pequeño.
  if (!fresh || !sizeEnough || !commissionsKnown || feed !== 'opra') score = Math.min(score, 0.5);
  const ready = valid && fresh && sizeEnough && commissionsKnown && feed === 'opra';
  const warnings = [feed !== 'opra' && 'Feed indicativo: precios modificados, no confirma ejecución real',
    !commissionsKnown && 'Comisiones sin configurar: el escenario las excluye',
    ...rows.flatMap((r) => r.issues.map((issue) => `${r.symbol}: ${issue}`))].filter(Boolean);
  return { score: Math.round(score * 1000) / 1000, status: !valid ? 'unavailable' : ready ? 'ok' : 'limited',
    ready, asOf: new Date(now).toISOString(), feed, qty, maxAgeSeconds, commissionsKnown,
    entryPenalty: round(entryPenalty), roundTripSpread: round(roundTripSpread), commissions: round(commissionCost),
    slippageBps, extraSlippage: round(extraSlippage), estimatedCost: round(estimatedCost),
    entryDebit: valid ? round(rows.reduce((sum, r) => sum + r.entryDebit, 0)) : null,
    expectedAfterCosts: round(expectedAfterCosts), warnings, legs: rows,
    method: 'Spreads y tamaños visibles por pierna; entrada al ask para compras y al bid para ventas, multiplicador 100. Escenario de cierre con el mismo spread. No recalcula probabilidad, VaR ni Monte Carlo; no garantiza fills ni precios futuros. No incluye volumen/interés abierto por no estar disponibles en estos snapshots.',
  };
}
