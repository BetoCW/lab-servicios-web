// Zonas heurísticas, no barreras ni probabilidades. Extremos locales confirmados
// con dos observaciones a cada lado; solo se usan datos de la ventana recibida.
// Referencia conceptual: https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance
export function supportResistance(input, referencePrice) {
  const basis = typeof input[0] === 'number' ? 'closes' : 'high-low';
  const bars = input.slice(-200).map((b) => typeof b === 'number' ? { high: b, low: b, close: b } : b);
  const valid = (b) => b && [b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0) && b.high >= b.low;
  const price = referencePrice ?? bars.at(-1)?.close;
  const result = { basis, price: Number.isFinite(price) ? price : null, lookback: bars.length, zones: [],
    nearestSupport: null, nearestResistance: null,
    method: 'Hasta 200 observaciones; pivotes con 2 velas a cada lado, agrupados por tolerancia de precio/volatilidad. Mínimo 2 contactos separados por 5 velas. Zonas orientativas, no garantías.' };
  if (!Number.isFinite(price) || price <= 0 || bars.length < 10) return result;
  const ranges = bars.slice(-15).flatMap((b, i, arr) => valid(b) ? [Math.max(b.high - b.low,
    i && valid(arr[i - 1]) ? Math.abs(b.high - arr[i - 1].close) : 0,
    i && valid(arr[i - 1]) ? Math.abs(b.low - arr[i - 1].close) : 0)] : []);
  const range = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
  const tolerance = Math.max(price * 0.003, Math.min(range * 0.35, price * 0.02));
  const pivots = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const window = bars.slice(i - 2, i + 3);
    if (!window.every(valid)) continue;
    const neighbors = window.filter((_, j) => j !== 2);
    if (neighbors.every((b) => bars[i].high > b.high)) pivots.push({ index: i, price: bars[i].high });
    if (neighbors.every((b) => bars[i].low < b.low)) pivots.push({ index: i, price: bars[i].low });
  }
  // Precio primero: un cluster nunca se ensancha por encadenar pivotes alejados.
  pivots.sort((a, b) => a.price - b.price);
  const groups = [];
  for (const pivot of pivots) {
    let group = groups.at(-1);
    if (!group || pivot.price - group[0].price > tolerance) { group = []; groups.push(group); }
    group.push(pivot);
  }
  const zones = groups.flatMap((group) => {
    const contacts = [];
    for (const p of [...group].sort((a, b) => a.index - b.index)) {
      if (!contacts.length || p.index - contacts.at(-1).index >= 5) contacts.push(p);
    }
    if (contacts.length < 2) return [];
    const center = contacts.reduce((sum, p) => sum + p.price, 0) / contacts.length;
    const lower = Math.max(0, center - tolerance / 2), upper = center + tolerance / 2;
    return [{ price: center, lower, upper, touches: contacts.length,
      type: center <= price ? 'support' : 'resistance', inZone: price >= lower && price <= upper,
      distancePct: Math.abs(center - price) / price * 100,
      lastTouch: bars[contacts.at(-1).index]?.time ?? null }];
  });
  const nearest = (type) => zones.filter((z) => z.type === type).sort((a, b) => a.distancePct - b.distancePct).slice(0, 3);
  const supports = nearest('support'), resistances = nearest('resistance');
  return { ...result, tolerance, zones: [...supports, ...resistances],
    nearestSupport: supports[0] ?? null, nearestResistance: resistances[0] ?? null };
}

export function levelFit(template, levels) {
  const support = levels?.nearestSupport, resistance = levels?.nearestResistance;
  if (!support && !resistance) return null;
  const near = (zone) => zone ? Math.max(0, 1 - zone.distancePct / 3) : 0;
  if (template === 'diagonal') return Math.max(0, Math.min(1, 0.5 + 0.3 * near(support) - 0.3 * near(resistance)));
  if (template.startsWith('short-') || template === 'calendar') {
    return support && resistance && support.distancePct <= 10 && resistance.distancePct <= 10 ? 0.7 : 0.5;
  }
  return 0.5; // Un soporte/resistencia no demuestra que comprar volatilidad sea rentable.
}
