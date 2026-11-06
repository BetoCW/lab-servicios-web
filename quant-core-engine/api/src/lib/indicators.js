// Indicadores técnicos sobre una serie de cierres. Cada función regresa un arreglo alineado con
// la entrada; las posiciones sin datos suficientes (calentamiento) son null.

/**
 * Media Móvil Simple (SMA).
 * @param {number[]} values - Serie de precios
 * @param {number} period - Ventana de periodos
 * @returns {(number|null)[]}
 */
export function sma(values, period) {
  let rollingSum = 0;
  return values.map((price, index) => {
    rollingSum += price - (index >= period ? values[index - period] : 0);
    return index >= period - 1 ? rollingSum / period : null;
  });
}

/**
 * Media Móvil Exponencial (EMA) sembrada con la SMA de las primeras N velas (convención TradingView).
 * @param {number[]} values - Serie de precios
 * @param {number} period - Ventana de periodos
 * @returns {(number|null)[]}
 */
export function ema(values, period) {
  const smoothingMultiplier = 2 / (period + 1);
  let previousEma = null;
  return values.map((price, index) => {
    if (price == null) return null;
    if (previousEma == null) {
      const windowSlice = values.slice(index - period + 1, index + 1);
      if (index < period - 1 || windowSlice.some((val) => val == null)) return null;
      previousEma = windowSlice.reduce((accumulator, val) => accumulator + val, 0) / period;
      return previousEma;
    }
    previousEma = price * smoothingMultiplier + previousEma * (1 - smoothingMultiplier);
    return previousEma;
  });
}

/**
 * Bandas de Bollinger.
 * @param {number[]} values - Serie de precios
 * @param {number} period - Ventana de la media móvil
 * @param {number} multiplier - Desviaciones estándar para las bandas
 * @returns {{ middle: (number|null)[], upper: (number|null)[], lower: (number|null)[] }}
 */
export function bollinger(values, period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const computeBand = (sign) =>
    values.map((_, index) => {
      if (middle[index] == null) return null;
      const windowSlice = values.slice(index - period + 1, index + 1);
      const variance = windowSlice.reduce((accum, val) => accum + (val - middle[index]) ** 2, 0) / period;
      const standardDeviation = Math.sqrt(variance);
      return middle[index] + sign * multiplier * standardDeviation;
    });
  return { middle, upper: computeBand(1), lower: computeBand(-1) };
}

/**
 * Índice de Fuerza Relativa (RSI de Wilder) con promedios suavizados.
 * @param {number[]} values - Serie de precios
 * @param {number} period - Periodo de observación
 * @returns {(number|null)[]}
 */
export function rsi(values, period = 14) {
  const rsiOutput = values.map(() => null);
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index < values.length; index++) {
    const priceDifference = values[index] - values[index - 1];
    const upwardChange = Math.max(priceDifference, 0);
    const downwardChange = Math.max(-priceDifference, 0);
    if (index <= period) {
      averageGain += upwardChange / period;
      averageLoss += downwardChange / period;
      if (index < period) continue;
    } else {
      averageGain = (averageGain * (period - 1) + upwardChange) / period;
      averageLoss = (averageLoss * (period - 1) + downwardChange) / period;
    }
    rsiOutput[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return rsiOutput;
}

/**
 * Convergencia/Divergencia de Medias Móviles (MACD).
 * @param {number[]} values - Serie de precios
 * @param {number} fastPeriod - Periodo de EMA rápida
 * @param {number} slowPeriod - Periodo de EMA lenta
 * @param {number} signalPeriod - Periodo de línea de señal
 * @returns {{ macd: (number|null)[], signal: (number|null)[], histogram: (number|null)[] }}
 */
export function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = ema(values, fastPeriod);
  const slowEma = ema(values, slowPeriod);
  const macdLine = values.map((_, index) => (fastEma[index] == null || slowEma[index] == null ? null : fastEma[index] - slowEma[index]));
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((macdVal, index) => (macdVal == null || signalLine[index] == null ? null : macdVal - signalLine[index]));
  return { macd: macdLine, signal: signalLine, histogram };
}
