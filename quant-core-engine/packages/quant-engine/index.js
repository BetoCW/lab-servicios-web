// @core/quant-engine — envoltura síncrona del motor Rust/WASM (contrato OpenSpec).
// Lo consume la API F0 en GET /strategies/{id}/risk (services/risk.service.js).
// Compilar el .wasm:  npm run build   (cargo build --target wasm32-unknown-unknown)
import { readFileSync } from 'node:fs';

// Instanciación síncrona: el .wasm no tiene imports, así que no hace falta await.
const bytes = readFileSync(new URL('./quant_core.wasm', import.meta.url));
const { exports: wasm } = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});

if (wasm.qc_abi_version() !== 100) throw new Error(`ABI de quant_core no soportado: ${wasm.qc_abi_version()}`);

const KIND = { call: 1, put: -1, stock: 0 };

/**
 * Asigna buffers en la memoria lineal del WebAssembly, ejecuta la función FFI y libera la memoria.
 * @param {Float64Array[]} inputs - Arreglos de entrada a copiar en la memoria lineal de WASM
 * @param {number} outputLength - Cantidad de floats f64 a reservar para la salida
 * @param {Function} runFn - Función que invoca la exportación WASM pasando los punteros
 */
function withBuffers(inputs, outputLength, runFn) {
  const inputPointers = inputs.map((arr) => {
    const pointer = wasm.qc_alloc(arr.length);
    new Float64Array(wasm.memory.buffer, pointer, arr.length).set(arr);
    return [pointer, arr.length];
  });
  const outputPointer = wasm.qc_alloc(outputLength);
  try {
    const ret = runFn(...inputPointers.map(([pointer]) => pointer), outputPointer);
    // La memoria lineal pudo crecer durante la ejecución: se obtiene la vista del buffer actual.
    return { ret, out: new Float64Array(wasm.memory.buffer, outputPointer, outputLength).slice() };
  } finally {
    inputPointers.forEach(([pointer, length]) => wasm.qc_free(pointer, length));
    wasm.qc_free(outputPointer, outputLength);
  }
}

/** Stride 7: [tipo, spot, strike, t, rate, div, vol|precio] */
const contractRows = (list, trailingMetricKey) =>
  Float64Array.from(list.flatMap((c) => [KIND[c.type], c.spot, c.strike, c.t, c.rate ?? 0, c.div ?? 0, c[trailingMetricKey]]));

/** Stride 6: [tipo, strike, t, qty, vol, multiplicador] */
const legRows = (legs) =>
  Float64Array.from(legs.flatMap((l) => [KIND[l.type], l.strike ?? 0, l.t ?? 0, l.qty, l.vol ?? 0, l.multiplier ?? (l.type === 'stock' ? 1 : 100)]));

/** Black-Scholes-Merton + griegas. vega/rho por 1 punto, theta por día. */
export function blackScholes(contracts) {
  const { out } = withBuffers(
    [contractRows(contracts, 'vol')],
    contracts.length * 6,
    (inputPtr, outputPtr) => wasm.qc_bs_batch(inputPtr, contracts.length, outputPtr),
  );
  return contracts.map((_, index) => {
    const [price, delta, gamma, vega, theta, rho] = out.subarray(index * 6, index * 6 + 6);
    return { price, delta, gamma, vega, theta, rho };
  });
}

/** Árbol binomial CRR (americanas por defecto). */
export function binomial(contracts, { steps = 200, american = true } = {}) {
  const { out } = withBuffers(
    [contractRows(contracts, 'vol')],
    contracts.length * 5,
    (inputPtr, outputPtr) => wasm.qc_binomial_batch(inputPtr, contracts.length, steps, american ? 1 : 0, outputPtr),
  );
  return contracts.map((_, index) => {
    const [price, delta, gamma, theta, earlyExercisePremium] = out.subarray(index * 5, index * 5 + 5);
    return { price, delta, gamma, theta, earlyExercisePremium };
  });
}

/** Volatilidad implícita (NaN si el precio viola no-arbitraje). */
export function impliedVol(quotes) {
  const { out } = withBuffers(
    [contractRows(quotes, 'price')],
    quotes.length,
    (inputPtr, outputPtr) => wasm.qc_iv_batch(inputPtr, quotes.length, outputPtr),
  );
  return Array.from(out);
}

/** Matriz de P&L: filas = choques de spot relativos, columnas = choques de vol absolutos. */
export function pnlMatrix(legs, { spot, rate = 0, div = 0, horizonDays = 0, spotShocks, volShocks }) {
  const { out } = withBuffers(
    [legRows(legs), Float64Array.from(spotShocks), Float64Array.from(volShocks)],
    spotShocks.length * volShocks.length,
    (legsPtr, spotShocksPtr, volShocksPtr, outputPtr) =>
      wasm.qc_pnl_matrix(
        legsPtr,
        legs.length,
        spot,
        rate,
        div,
        horizonDays / 365,
        spotShocksPtr,
        spotShocks.length,
        volShocksPtr,
        volShocks.length,
        outputPtr,
      ),
  );
  return spotShocks.map((_, i) => Array.from(out.subarray(i * volShocks.length, (i + 1) * volShocks.length)));
}

/** Monte Carlo (GBM con antitéticas) del P&L del portafolio al horizonte. */
export function monteCarlo(legs, { spot, rate = 0, div = 0, vol, horizonDays, paths = 10000, seed = 1, bins = 40 }) {
  const { out } = withBuffers(
    [legRows(legs)],
    9 + bins,
    (legsPtr, outputPtr) =>
      wasm.qc_monte_carlo(legsPtr, legs.length, spot, rate, div, vol, horizonDays / 365, paths, seed, outputPtr, 9 + bins),
  );
  const [mean, std, var95, cvar95, var99, probProfit, min, max, baseValue] = out;
  return { mean, std, var95, cvar95, var99, probProfit, min, max, baseValue, histogram: Array.from(out.subarray(9)) };
}

/** Margen Reg T por pierna; reconoce spreads verticales (cada lado de un iron condor se cobra por separado). */
export function regTMargin(legs, { spot, rate = 0, div = 0 }) {
  const { ret, out } = withBuffers(
    [legRows(legs)],
    legs.length,
    (legsPtr, outputPtr) => wasm.qc_reg_t(legsPtr, legs.length, spot, rate, div, outputPtr),
  );
  return { total: ret, perLeg: Array.from(out) };
}

/** Margen estilo SPAN: peor pérdida de 16 escenarios vs. mínimo por opción corta. */
export function spanMargin(legs, { spot, rate = 0, div = 0, priceScan = 0.15, volScan = 0.04, shortOptionMinimum = 0 }) {
  const { out } = withBuffers(
    [legRows(legs)],
    20,
    (legsPtr, outputPtr) => wasm.qc_span(legsPtr, legs.length, spot, rate, div, priceScan, volScan, shortOptionMinimum, outputPtr),
  );
  return { margin: out[0], scanRisk: out[1], shortOptionMinimum: out[2], worstScenario: out[3], scenarios: Array.from(out.subarray(4)) };
}
