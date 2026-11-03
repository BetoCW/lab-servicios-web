// Indicadores técnicos sobre una serie de cierres. Cada función regresa un arreglo alineado con
// la entrada; las posiciones sin datos suficientes (calentamiento) son null.

export function sma(values, n) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v - (i >= n ? values[i - n] : 0);
    return i >= n - 1 ? sum / n : null;
  });
}

// EMA sembrada con la SMA de las primeras n velas (convención de TradingView).
export function ema(values, n) {
  const k = 2 / (n + 1);
  let prev = null;
  return values.map((v, i) => {
    if (v == null) return null;
    if (prev == null) {
      const window = values.slice(i - n + 1, i + 1);
      if (i < n - 1 || window.some((x) => x == null)) return null;
      prev = window.reduce((a, b) => a + b, 0) / n;
      return prev;
    }
    prev = v * k + prev * (1 - k);
    return prev;
  });
}

export function bollinger(values, n = 20, mult = 2) {
  const mid = sma(values, n);
  const band = (sign) =>
    values.map((_, i) => {
      if (mid[i] == null) return null;
      const w = values.slice(i - n + 1, i + 1);
      const sd = Math.sqrt(w.reduce((a, v) => a + (v - mid[i]) ** 2, 0) / n);
      return mid[i] + sign * mult * sd;
    });
  return { middle: mid, upper: band(1), lower: band(-1) };
}

// RSI de Wilder: promedios suavizados de subidas y bajadas.
export function rsi(values, n = 14) {
  const out = values.map(() => null);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const up = Math.max(d, 0), down = Math.max(-d, 0);
    if (i <= n) {
      gain += up / n;
      loss += down / n;
      if (i < n) continue;
    } else {
      gain = (gain * (n - 1) + up) / n;
      loss = (loss * (n - 1) + down) / n;
    }
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  const sig = ema(line, signal);
  return { macd: line, signal: sig, histogram: line.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i])) };
}
