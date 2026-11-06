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

/**
 * Serializa una lista de contratos en un buffer lineal con stride 7:
 * [tipo, spot, strike, t, rate, div, vol|precio].
 *
 * @param {Array<object>} list - Lista de contratos a serializar.
 * @param {string} trailingMetricKey - Clave métrica final ('vol' para pricing, 'price' para IV).
 * @returns {Float64Array} Buffer plano f64 preparado para memoria WASM.
 */
const contractRows = (list, trailingMetricKey) =>
  Float64Array.from(list.flatMap((contract) => [KIND[contract.type], contract.spot, contract.strike, contract.t, contract.rate ?? 0, contract.div ?? 0, contract[trailingMetricKey]]));

/**
 * Serializa las piernas de una estrategia en un buffer lineal con stride 6:
 * [tipo, strike, t, qty, vol, multiplicador].
 *
 * @param {Array<object>} legs - Lista de piernas de la estrategia.
 * @returns {Float64Array} Buffer plano f64 preparado para memoria WASM.
 */
const legRows = (legs) =>
  Float64Array.from(legs.flatMap((leg) => [KIND[leg.type], leg.strike ?? 0, leg.t ?? 0, leg.qty, leg.vol ?? 0, leg.multiplier ?? (leg.type === 'stock' ? 1 : 100)]));

/**
 * Calcula precios y griegas de Black-Scholes-Merton en lote.
 * Vega y rho se expresan por 1 punto porcentual, theta por día calendario.
 *
 * @param {Array<{type: 'call'|'put', spot: number, strike: number, t: number, vol: number, rate?: number, div?: number}>} contracts - Parámetros de cada contrato.
 * @returns {Array<{price: number, delta: number, gamma: number, vega: number, theta: number, rho: number}>} Lista de valoraciones y sensibilidades.
 */
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

/**
 * Valora opciones mediante el modelo de árbol binomial Cox-Ross-Rubinstein (CRR).
 * Por defecto resuelve opciones de estilo americano con ejercicio temprano.
 *
 * @param {Array<{type: 'call'|'put', spot: number, strike: number, t: number, vol: number, rate?: number, div?: number}>} contracts - Parámetros de cada contrato.
 * @param {object} [options={}] - Parámetros opcionales del árbol binomial.
 * @param {number} [options.steps=200] - Cantidad de pasos temporales en el árbol.
 * @param {boolean} [options.american=true] - Si es true valora estilo americano, si es false estilo europeo.
 * @returns {Array<{price: number, delta: number, gamma: number, theta: number, earlyExercisePremium: number}>} Métricas del árbol.
 */
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

/**
 * Calcula la volatilidad implícita invertida mediante el algoritmo híbrido Newton-Raphson/bisección.
 * Retorna NaN si el precio viola los límites de no-arbitraje intrínseco.
 *
 * @param {Array<{type: 'call'|'put', spot: number, strike: number, t: number, price: number, rate?: number, div?: number}>} quotes - Cotizaciones observadas.
 * @returns {number[]} Arreglo con la volatilidad implícita anualizada calculada para cada contrato.
 */
export function impliedVol(quotes) {
  const { out } = withBuffers(
    [contractRows(quotes, 'price')],
    quotes.length,
    (inputPtr, outputPtr) => wasm.qc_iv_batch(inputPtr, quotes.length, outputPtr),
  );
  return Array.from(out);
}

/**
 * Calcula la matriz de P&L combinada evaluando escenarios simultáneos de choque de spot y volatilidad.
 * Filas corresponden a choques relativos de spot, columnas a choques absolutos de volatilidad.
 *
 * @param {Array<{type: 'call'|'put'|'stock', strike?: number, t?: number, qty: number, vol?: number, multiplier?: number}>} legs - Piernas de la estrategia.
 * @param {object} params - Configuración del análisis de matriz.
 * @param {number} params.spot - Precio spot actual del subyacente.
 * @param {number} [params.rate=0] - Tasa libre de riesgo continua anualizada.
 * @param {number} [params.div=0] - Tasa continua de dividendos.
 * @param {number} [params.horizonDays=0] - Horizonte de proyección en días (0 para P&L inmediato).
 * @param {number[]} params.spotShocks - Lista de choques relativos en el precio spot (ej. [-0.1, 0, 0.1]).
 * @param {number[]} params.volShocks - Lista de choques absolutos en volatilidad (ej. [-0.05, 0, 0.05]).
 * @returns {number[][]} Matriz bidimensional [filas spot][columnas vol] de P&L esperado.
 */
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

/**
 * Simulación Monte Carlo del P&L del portafolio al horizonte con movimiento browniano geométrico (GBM) y variates antitéticas.
 *
 * @param {Array<{type: 'call'|'put'|'stock', strike?: number, t?: number, qty: number, vol?: number, multiplier?: number}>} legs - Piernas del portafolio.
 * @param {object} params - Parámetros de simulación.
 * @param {number} params.spot - Precio spot actual.
 * @param {number} [params.rate=0] - Tasa libre de riesgo continua.
 * @param {number} [params.div=0] - Tasa de dividendos continua.
 * @param {number} params.vol - Volatilidad del subyacente.
 * @param {number} params.horizonDays - Horizonte de tiempo en días.
 * @param {number} [params.paths=10000] - Cantidad de caminos simulados.
 * @param {number} [params.seed=1] - Semilla del generador pseudoaleatorio.
 * @param {number} [params.bins=40] - Cantidad de intervalos para el histograma de frecuencias.
 * @returns {{mean: number, std: number, var95: number, cvar95: number, var99: number, probProfit: number, min: number, max: number, baseValue: number, histogram: number[]}} Estadísticas de distribución de P&L.
 */
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

/**
 * Calcula el requerimiento de margen regulatorio Reg T por pierna, reconociendo spreads verticales.
 *
 * @param {Array<{type: 'call'|'put'|'stock', strike?: number, t?: number, qty: number, vol?: number, multiplier?: number}>} legs - Piernas de la estrategia.
 * @param {object} params - Parámetros de mercado.
 * @param {number} params.spot - Precio spot del subyacente.
 * @param {number} [params.rate=0] - Tasa libre de riesgo.
 * @param {number} [params.div=0] - Tasa de dividendos.
 * @returns {{total: number, perLeg: number[]}} Margen total requerido y desglose por pierna.
 */
export function regTMargin(legs, { spot, rate = 0, div = 0 }) {
  const { ret, out } = withBuffers(
    [legRows(legs)],
    legs.length,
    (legsPtr, outputPtr) => wasm.qc_reg_t(legsPtr, legs.length, spot, rate, div, outputPtr),
  );
  return { total: ret, perLeg: Array.from(out) };
}

/**
 * Calcula el margen de riesgo tipo SPAN evaluando los 16 escenarios estandarizados y el piso de opciones cortas.
 *
 * @param {Array<{type: 'call'|'put'|'stock', strike?: number, t?: number, qty: number, vol?: number, multiplier?: number}>} legs - Piernas de la estrategia.
 * @param {object} params - Parámetros de escaneo SPAN.
 * @param {number} params.spot - Precio spot del subyacente.
 * @param {number} [params.rate=0] - Tasa libre de riesgo.
 * @param {number} [params.div=0] - Tasa de dividendos.
 * @param {number} [params.priceScan=0.15] - Rango de choque de precio relativo (15%).
 * @param {number} [params.volScan=0.04] - Rango de choque de volatilidad (4 puntos).
 * @param {number} [params.shortOptionMinimum=0] - Requerimiento mínimo monetario por opción corta.
 * @returns {{margin: number, scanRisk: number, shortOptionMinimum: number, worstScenario: number, scenarios: number[]}} Desglose de riesgo y margen SPAN.
 */
export function spanMargin(legs, { spot, rate = 0, div = 0, priceScan = 0.15, volScan = 0.04, shortOptionMinimum = 0 }) {
  const { out } = withBuffers(
    [legRows(legs)],
    20,
    (legsPtr, outputPtr) => wasm.qc_span(legsPtr, legs.length, spot, rate, div, priceScan, volScan, shortOptionMinimum, outputPtr),
  );
  return { margin: out[0], scanRisk: out[1], shortOptionMinimum: out[2], worstScenario: out[3], scenarios: Array.from(out.subarray(4)) };
}
