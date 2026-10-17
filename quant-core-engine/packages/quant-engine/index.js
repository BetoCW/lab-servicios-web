// @core/quant-engine — envoltura síncrona del motor Rust/WASM (contrato OpenSpec).
// Lo consume la API F0 en GET /strategies/{id}/risk (services/risk.service.js).
// Compilar el .wasm:  npm run build   (cargo build --target wasm32-unknown-unknown)
import { readFileSync } from 'node:fs';

// Instanciación síncrona: el .wasm no tiene imports, así que no hace falta await.
const bytes = readFileSync(new URL('./quant_core.wasm', import.meta.url));
const { exports: wasm } = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});

if (wasm.qc_abi_version() !== 100) throw new Error(`ABI de quant_core no soportado: ${wasm.qc_abi_version()}`);

const KIND = { call: 1, put: -1, stock: 0 };

/** Copia un Float64Array a la memoria del WASM, ejecuta fn y libera. */
function withBuffers(inputs, outLen, fn) {
  const ptrs = inputs.map((arr) => {
    const p = wasm.qc_alloc(arr.length);
    new Float64Array(wasm.memory.buffer, p, arr.length).set(arr);
    return [p, arr.length];
  });
  const out = wasm.qc_alloc(outLen);
  try {
    const ret = fn(...ptrs.map(([p]) => p), out);
    // La memoria pudo crecer durante fn: se crea la vista después.
    return { ret, out: new Float64Array(wasm.memory.buffer, out, outLen).slice() };
  } finally {
    ptrs.forEach(([p, n]) => wasm.qc_free(p, n));
    wasm.qc_free(out, outLen);
  }
}

const contractRows = (list, last) =>
  Float64Array.from(list.flatMap((c) => [KIND[c.type], c.spot, c.strike, c.t, c.rate ?? 0, c.div ?? 0, c[last]]));

const legRows = (legs) =>
  Float64Array.from(legs.flatMap((l) => [KIND[l.type], l.strike ?? 0, l.t ?? 0, l.qty, l.vol ?? 0, l.multiplier ?? (l.type === 'stock' ? 1 : 100)]));

/** Black-Scholes-Merton + griegas. vega/rho por 1 punto, theta por día. */
export function blackScholes(contracts) {
  const { out } = withBuffers([contractRows(contracts, 'vol')], contracts.length * 6, (i, o) => wasm.qc_bs_batch(i, contracts.length, o));
  return contracts.map((_, k) => {
    const [price, delta, gamma, vega, theta, rho] = out.subarray(k * 6, k * 6 + 6);
    return { price, delta, gamma, vega, theta, rho };
  });
}

/** Árbol binomial CRR (americanas por defecto). */
export function binomial(contracts, { steps = 200, american = true } = {}) {
  const { out } = withBuffers([contractRows(contracts, 'vol')], contracts.length * 5, (i, o) =>
    wasm.qc_binomial_batch(i, contracts.length, steps, american ? 1 : 0, o),
  );
  return contracts.map((_, k) => {
    const [price, delta, gamma, theta, earlyExercisePremium] = out.subarray(k * 5, k * 5 + 5);
    return { price, delta, gamma, theta, earlyExercisePremium };
  });
}

/** Volatilidad implícita (NaN si el precio viola no-arbitraje). */
export function impliedVol(quotes) {
  const { out } = withBuffers([contractRows(quotes, 'price')], quotes.length, (i, o) => wasm.qc_iv_batch(i, quotes.length, o));
  return Array.from(out);
}

/** Matriz de P&L: filas = choques de spot relativos, columnas = choques de vol absolutos. */
export function pnlMatrix(legs, { spot, rate = 0, div = 0, horizonDays = 0, spotShocks, volShocks }) {
  const { out } = withBuffers([legRows(legs), Float64Array.from(spotShocks), Float64Array.from(volShocks)], spotShocks.length * volShocks.length, (l, s, v, o) =>
    wasm.qc_pnl_matrix(l, legs.length, spot, rate, div, horizonDays / 365, s, spotShocks.length, v, volShocks.length, o),
  );
  return spotShocks.map((_, i) => Array.from(out.subarray(i * volShocks.length, (i + 1) * volShocks.length)));
}

/** Monte Carlo (GBM con antitéticas) del P&L del portafolio al horizonte. */
export function monteCarlo(legs, { spot, rate = 0, div = 0, vol, horizonDays, paths = 10000, seed = 1, bins = 40 }) {
  const { out } = withBuffers([legRows(legs)], 9 + bins, (l, o) =>
    wasm.qc_monte_carlo(l, legs.length, spot, rate, div, vol, horizonDays / 365, paths, seed, o, 9 + bins),
  );
  const [mean, std, var95, cvar95, var99, probProfit, min, max, baseValue] = out;
  return { mean, std, var95, cvar95, var99, probProfit, min, max, baseValue, histogram: Array.from(out.subarray(9)) };
}

/** Margen Reg T por pierna (conservador, sin compensar spreads). */
export function regTMargin(legs, { spot, rate = 0, div = 0 }) {
  const { ret, out } = withBuffers([legRows(legs)], legs.length, (l, o) => wasm.qc_reg_t(l, legs.length, spot, rate, div, o));
  return { total: ret, perLeg: Array.from(out) };
}

/** Margen estilo SPAN: peor pérdida de 16 escenarios vs. mínimo por opción corta. */
export function spanMargin(legs, { spot, rate = 0, div = 0, priceScan = 0.15, volScan = 0.04, shortOptionMinimum = 0 }) {
  const { out } = withBuffers([legRows(legs)], 20, (l, o) => wasm.qc_span(l, legs.length, spot, rate, div, priceScan, volScan, shortOptionMinimum, o));
  return { margin: out[0], scanRisk: out[1], shortOptionMinimum: out[2], worstScenario: out[3], scenarios: Array.from(out.subarray(4)) };
}
