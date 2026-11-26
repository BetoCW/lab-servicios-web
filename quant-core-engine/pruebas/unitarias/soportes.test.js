import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { supportResistance, supportResistanceSignals, levelFit } from '../../api/src/lib/supportResistance.js';
import { marketSignals, templateFit } from '../../api/src/lib/scoring.js';
import { scoreCores } from '../../api/src/lib/cores.js';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { marketService } from '../../api/src/services/market.service.js';

const wave = Array.from({ length: 120 }, (_, i) => 100 + 5 * Math.sin(i * Math.PI / 6));
const waveBars = () => wave.map((close, index) => ({
  time: Date.UTC(2026, 0, index + 1) / 1000, open: close, close, high: close + 1, low: close - 1,
}));

test('señales S/R: rebote en soporte y rechazo en resistencia con zona conocida y precio de cierre', () => {
  for (const [side, candle, reason] of [
    ['buy', { open: 96, low: 94, high: 98, close: 97 }, /Rebote alcista en soporte/],
    ['sell', { open: 104, low: 101, high: 106, close: 102 }, /Rechazo bajista en resistencia/],
  ]) {
    const bars = waveBars();
    bars.push({ ...candle, time: bars.at(-1).time + 86400 });
    const signal = supportResistanceSignals(bars).find((item) => item.index === 120);
    assert.ok(signal);
    assert.equal(signal.side, side);
    assert.equal(signal.time, bars[120].time);
    assert.equal(signal.price, candle.close);
    assert.match(signal.reason, reason);
    assert.ok(signal.zone.touches >= 2);
    const known = supportResistance(bars.slice(0, 120), bars[119].close);
    assert.ok(known.zones.some((zone) => zone.lower === signal.zone.lower && zone.upper === signal.zone.upper));
  }
});

test('señales S/R: tocar, romper o saltar una zona sin rebote confirmado no genera flecha', () => {
  for (const candle of [
    { open: 96, low: 92, high: 97, close: 93 }, // rompe soporte
    { open: 96, low: 94, high: 97, close: 96 }, // doji
    { open: 96, low: 95, high: 98, close: 97 }, // no toca soporte
    { open: 91, low: 90, high: 93, close: 92 }, // salto bajo soporte
    { open: 104, low: 103, high: 108, close: 107 }, // rompe resistencia
  ]) {
    const signals = supportResistanceSignals([...waveBars(), { ...candle, time: 9999999999 }]);
    assert.equal(signals.some((signal) => signal.index === 120), false);
  }
  assert.deepEqual(supportResistanceSignals([]), []);
  assert.deepEqual(supportResistanceSignals(waveBars().slice(0, 9)), []);
});

test('señales S/R: añadir velas futuras no modifica las señales históricas', () => {
  const bars = waveBars();
  bars.push({ open: 96, low: 94, high: 98, close: 97, time: bars.at(-1).time + 86400 });
  const original = supportResistanceSignals(bars);
  const future = [...bars, ...waveBars().map((bar, index) => ({ ...bar, time: bars.at(-1).time + (index + 1) * 86400,
    open: bar.open * 2, close: bar.close * 2, high: bar.high * 2, low: bar.low * 2 }))];
  assert.deepEqual(supportResistanceSignals(future).filter((signal) => signal.index < bars.length), original);
});

test('histórico S/R: el endpoint confirma la señal solo después de cerrar la vela', async (t) => {
  const bars = waveBars();
  bars.push({ open: 96, low: 94, high: 98, close: 97, time: bars.at(-1).time + 86400 });
  t.mock.method(alpaca, 'stockBars', async () => ({ bars: [...bars].reverse().map((bar) => ({
    t: new Date(bar.time * 1000).toISOString(), o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: 100,
  })) }));
  let now = bars.at(-1).time * 1000 + 3600000;
  t.mock.method(Date, 'now', () => now);
  const query = { timeframe: '1Day', limit: 121, start: '2026-01-01', end: '2026-05-02' };
  const open = await marketService.bars('ZZBOUNCE', query);
  assert.equal(open.levelSignals.some((signal) => signal.index === 120), false);
  now += 86400000;
  const closed = await marketService.bars('ZZBOUNCE', query);
  assert.equal(closed.levelSignals.find((signal) => signal.index === 120).side, 'buy');
});

test('soportes: agrupa extremos repetidos y devuelve zonas por debajo/encima del precio', () => {
  const levels = supportResistance(wave, 100);
  assert.equal(levels.basis, 'closes');
  assert.ok(Math.abs(levels.nearestSupport.price - 95) < 0.01);
  assert.ok(Math.abs(levels.nearestResistance.price - 105) < 0.01);
  assert.ok(levels.zones.every((z) => z.touches >= 2 && z.lower < z.upper && Number.isFinite(z.distancePct)));
  assert.ok(levels.zones.length <= 6);
});

test('soportes: high/low usa mechas; roles se clasifican respecto al precio consultado', () => {
  const bars = wave.map((close, time) => ({ time, close, high: close + 1, low: close - 1 }));
  const levels = supportResistance(bars, 100);
  assert.equal(levels.basis, 'high-low');
  assert.ok(Math.abs(levels.nearestSupport.price - 94) < 0.01);
  assert.ok(Math.abs(levels.nearestResistance.price - 106) < 0.01);
  const breakout = supportResistance(bars, 110);
  assert.equal(breakout.nearestResistance, null);
  assert.ok(breakout.zones.every((z) => z.type === 'support'));
});

test('soportes: sin historial, planos, tendencia o datos inválidos no inventan zonas', () => {
  for (const input of [[], [100, 101], Array(50).fill(100), Array.from({ length: 50 }, (_, i) => 100 + i), Array(50).fill(NaN)]) {
    const levels = supportResistance(input, 100);
    assert.deepEqual(levels.zones, []);
    assert.equal(levelFit('diagonal', levels), null);
  }
});

test('soportes: pivotes finales sin dos observaciones de confirmación no crean zona', () => {
  const data = [100, 101, 105, 101, 100, 99, 100, 101, 105];
  assert.equal(supportResistance(data, 100).nearestResistance, null);
  assert.equal(supportResistance([...data, 101, 100], 100).nearestResistance.touches, 2);
});

test('soportes: ventana acotada y solo información recibida; no hay extremos de futuro', () => {
  const old = wave.map((v) => v * 2);
  const levels = supportResistance([...old, ...wave, ...wave], 100);
  assert.equal(levels.lookback, 200);
  assert.ok(levels.zones.every((z) => z.price < 110));
});

test('técnico: zonas aportan 15 % al encaje; sin zonas conserva fórmula; cores ajenos no votan niveles', () => {
  const signals = marketSignals(wave, 95.2);
  const args = { ivToHv: 1.2, termSlope: 1, signals };
  const plain = templateFit({ ...args, signals: { ...signals, supportResistance: null } });
  const combined = templateFit(args);
  for (const key of Object.keys(combined)) {
    assert.ok(Math.abs(combined[key] - (0.85 * plain[key] + 0.15 * levelFit(key, signals.supportResistance))) < 1e-12);
  }
  assert.ok(levelFit('diagonal', signals.supportResistance) > levelFit('diagonal', supportResistance(wave, 104.8)));
  assert.equal(levelFit('short-strangle', { nearestSupport: { distancePct: 46 }, nearestResistance: { distancePct: 8 } }), 0.5);
  assert.equal(scoreCores({ probability: 0.6, levels: 1 }, ['probability'], 1), 60);
  assert.equal(scoreCores({ probability: 0.6, levels: 0 }, ['probability'], 1), 60);
});

test('histórico: zonas se calculan con rango consultado y sin la última vela en formación', async (t) => {
  t.mock.method(alpaca, 'stockSnapshot', () => assert.fail('Rango cerrado no debe consultar presente'));
  const bars = wave.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), o: c, h: c + 1, l: c - 1, c, v: 100 }));
  t.mock.method(alpaca, 'stockBars', async () => ({ bars: [...bars].reverse() }));
  const result = await marketService.bars('ZZLEVEL', { timeframe: '1Day', limit: 120, start: '2026-01-01', end: '2026-05-01' });
  assert.equal(result.supportResistance.lookback, 119);
  assert.equal(result.supportResistance.price, wave.at(-1));
  assert.ok(result.supportResistance.zones.length > 0);
});

test('gráfica: dibuja límites, reemplaza líneas anteriores y las quita al desactivar', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  const elements = { '#showLevels': { checked: true }, '#levelsInfo': {} };
  const lines = [], removed = [];
  const context = vm.createContext({
    $: (key) => elements[key], money: String, num: String, esc: String, css: () => '#000',
    charts: { series: { candles: {
      createPriceLine: (line) => { lines.push(line); return line; },
      removePriceLine: (line) => removed.push(line),
    } } },
  });
  vm.runInContext(html.slice(html.indexOf('function levelsHtml('), html.indexOf('function newsHtml(')), context);
  context.fixture = supportResistance(wave, 100);
  vm.runInContext('currentLevels = fixture; renderSupportResistance()', context);
  assert.equal(lines.length, context.fixture.zones.length * 2);
  assert.match(elements['#levelsInfo'].innerHTML, /Soporte más cercano/);
  vm.runInContext('renderSupportResistance()', context);
  assert.equal(removed.length, lines.length / 2);
  elements['#showLevels'].checked = false;
  vm.runInContext('renderSupportResistance()', context);
  assert.equal(removed.length, lines.length);
  assert.equal(elements['#levelsInfo'].innerHTML, '');
});
