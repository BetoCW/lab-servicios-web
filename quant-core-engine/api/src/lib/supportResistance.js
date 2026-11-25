// Zonas heurísticas, no barreras ni probabilidades. Extremos locales confirmados
// con dos observaciones a cada lado; solo se usan datos de la ventana recibida.
// Referencia conceptual: https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance
/**
 * Detecta zonas donde se repitieron extremos de precio dentro del historial recibido.
 *
 * @param {number[]|Array<{high:number, low:number, close:number, time?:number}>} input
 *   Cierres o velas, ordenados de la observación más antigua a la más reciente.
 * @param {number} [referencePrice] Precio contra el que se clasifican las zonas.
 *   El recomendador pasa el spot; la gráfica, el cierre de su última vela.
 * @returns {object} Zonas con límites, contactos y distancia; hasta tres por lado.
 *   nearestSupport/nearestResistance son null si no hay zonas de ese tipo.
 */
export function supportResistance(input, referencePrice) {
  // 1. Unificar entradas: con cierres, high/low/close son el mismo número.
  // Esto permite reutilizar el detector en el recomendador y en el backtest.
  const basis = typeof input[0] === 'number' ? 'closes' : 'high-low';
  const bars = input.slice(-200).map((b) => typeof b === 'number' ? { high: b, low: b, close: b } : b);
  const valid = (b) => b && [b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0) && b.high >= b.low;
  const price = referencePrice ?? bars.at(-1)?.close;
  // Una respuesta vacía significa falta de evidencia, no un soporte/resistencia de precio cero.
  const result = { basis, price: Number.isFinite(price) ? price : null, lookback: bars.length, zones: [],
    nearestSupport: null, nearestResistance: null,
    method: 'Hasta 200 observaciones; pivotes con 2 velas a cada lado, agrupados por tolerancia de precio/volatilidad. Mínimo 2 contactos separados por 5 velas. Zonas orientativas, no garantías.' };
  if (!Number.isFinite(price) || price <= 0 || bars.length < 10) return result;
  // 2. Estimar cuánto varía el precio: máximo entre rango de la vela y saltos
  // respecto al cierre previo disponible. Se promedian hasta 15 observaciones.
  const ranges = bars.slice(-15).flatMap((b, i, arr) => valid(b) ? [Math.max(b.high - b.low,
    i && valid(arr[i - 1]) ? Math.abs(b.high - arr[i - 1].close) : 0,
    i && valid(arr[i - 1]) ? Math.abs(b.low - arr[i - 1].close) : 0)] : []);
  const range = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
  // Ancho de agrupación: mínimo 0.3 % del precio; componente de volatilidad
  // de 35 % del rango medio, limitado a 2 %. No es un ATR de Wilder ni un ajuste aprendido.
  const tolerance = Math.max(price * 0.003, Math.min(range * 0.35, price * 0.02));
  // 3. Detectar pivotes: el centro debe superar estrictamente los cuatro vecinos
  // (o ser inferior a ellos). Los empates no cuentan. Los últimos dos puntos no
  // pueden confirmarse todavía; el backtest solo entrega datos hasta su fecha de análisis.
  const pivots = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const window = bars.slice(i - 2, i + 3);
    if (!window.every(valid)) continue;
    const neighbors = window.filter((_, j) => j !== 2);
    if (neighbors.every((b) => bars[i].high > b.high)) pivots.push({ index: i, price: bars[i].high });
    if (neighbors.every((b) => bars[i].low < b.low)) pivots.push({ index: i, price: bars[i].low });
  }
  // 4. Agrupar por precio, comparando con el PRIMER precio del grupo.
  // Comparar solo con el anterior permitiría encadenar precios y crear zonas demasiado anchas.
  pivots.sort((a, b) => a.price - b.price);
  const groups = [];
  for (const pivot of pivots) {
    let group = groups.at(-1);
    if (!group || pivot.price - group[0].price > tolerance) { group = []; groups.push(group); }
    group.push(pivot);
  }
  const zones = groups.flatMap((group) => {
    // 5. Contar contactos independientes en orden temporal: varias velas de un
    // mismo movimiento no deben parecer varios rebotes. La separación es en velas,
    // no en días; cambia de duración al cambiar la temporalidad de la gráfica.
    const contacts = [];
    for (const p of [...group].sort((a, b) => a.index - b.index)) {
      if (!contacts.length || p.index - contacts.at(-1).index >= 5) contacts.push(p);
    }
    if (contacts.length < 2) return [];
    // El centro promedia los contactos aceptados; los límites forman una banda,
    // porque dos rebotes no necesitan suceder exactamente al mismo precio.
    const center = contacts.reduce((sum, p) => sum + p.price, 0) / contacts.length;
    const lower = Math.max(0, center - tolerance / 2), upper = center + tolerance / 2;
    // 6. El papel depende del precio de referencia ACTUAL del análisis: una zona
    // antes situada arriba puede pasar a soporte si el precio supera su centro.
    // Esto no confirma por sí mismo una ruptura ni una señal de compra/venta.
    return [{ price: center, lower, upper, touches: contacts.length,
      type: center <= price ? 'support' : 'resistance', inZone: price >= lower && price <= upper,
      distancePct: Math.abs(center - price) / price * 100,
      lastTouch: bars[contacts.at(-1).index]?.time ?? null }]; // Los cierres sin fecha devuelven null.
  });
  // 7. Seleccionar por cercanía al precio, no por número de contactos.
  const nearest = (type) => zones.filter((z) => z.type === type).sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  const supports = nearest('support'), resistances = nearest('resistance');
  return { ...result, tolerance, zones: [...supports, ...resistances],
    nearestSupport: supports[0] ?? null, nearestResistance: resistances[0] ?? null };
}

/**
 * Traduce las zonas a un encaje heurístico de 0 a 1 para una plantilla.
 * No es probabilidad de ganancia. null = sin evidencia (conservar encaje anterior);
 * 0.5 = aporte neutral cuando sí existen zonas. scoring.js decide cuánto pesa.
 */
export function levelFit(template, levels) {
  const support = levels?.nearestSupport, resistance = levels?.nearestResistance;
  if (!support && !resistance) return null;
  // Cercanía lineal: 1 sobre el centro, 0 a partir de 3 % de distancia.
  const near = (zone) => zone ? Math.max(0, 1 - zone.distancePct / 3) : 0;
  // Diagonal de calls: sesgo alcista. Cerca del soporte suma y cerca de resistencia resta.
  if (template === 'diagonal') return Math.max(0, Math.min(1, 0.5 + 0.3 * near(support) - 0.3 * near(resistance)));
  if (template.startsWith('short-') || template === 'calendar') {
    // Contexto de rango: ambos lados deben estar a no más de 10 %.
    // Un soporte muy lejano no basta para favorecer estas plantillas.
    return support && resistance && support.distancePct <= 10 && resistance.distancePct <= 10 ? 0.7 : 0.5;
  }
  return 0.5; // Un soporte/resistencia no demuestra que comprar volatilidad sea rentable.
}
