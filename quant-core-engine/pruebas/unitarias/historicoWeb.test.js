import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');

test('gráfica: el JavaScript de la página compila', () => {
  for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

function page() {
  const elements = {
    '#mkHistory': { reportValidity: () => true },
    '#mkTf': { value: '1Week' }, '#mkLimit': { value: '123' },
    '#mkStart': { value: '2026-01-01' }, '#mkEnd': { value: '' },
    '#mkLive': {}, '#mkHistoryStatus': {},
  };
  const calls = [], candles = [];
  const context = vm.createContext({
    $: (id) => elements[id], URLSearchParams, Date,
    ticker: () => 'AAPL', ticket: 1,
    api: (_, path) => new Promise((resolve) => calls.push({ path, resolve })),
    localTime: (time) => time, css: () => '#000000', drawOverlay: () => {},
    marketSignals: [], renderMarketSignals: () => {},
    currentLevels: null, renderSupportResistance: () => {},
    charts: {
      all: [{ applyOptions() {} }], price: { timeScale: () => ({ fitContent() {} }) },
      series: Object.fromEntries(['candles', 'volume', 'sma20', 'ema9', 'bbUpper', 'bbLower', 'rsi14', 'macd', 'signal', 'histogram'].map((k) => [k, {
        setData(data) { if (k === 'candles') candles.push(data); },
      }])),
    },
  });
  const signalStart = html.indexOf('function buildMarketSignals(');
  const signalEnd = html.indexOf('function renderMarketSignals()', signalStart);
  assert.notEqual(signalStart, -1, 'buildMarketSignals debe existir en la página');
  assert.notEqual(signalEnd, -1, 'renderMarketSignals debe existir después de buildMarketSignals');
  vm.runInContext(html.slice(signalStart, signalEnd), context);
  const source = html.slice(html.indexOf("let lastKey = ''"), html.indexOf('// Precio, % del día'));
  vm.runInContext(source, context);
  return { context, elements, calls, candles };
}

test('gráfica: envía cantidad, temporalidad y fechas locales; omite fin vacío', () => {
  const { context, elements } = page();
  let params = vm.runInContext('historyParams()', context);
  assert.equal(params.get('timeframe'), '1Week');
  assert.equal(params.get('limit'), '123');
  assert.equal(params.get('start'), new Date('2026-01-01T00:00:00').toISOString());
  assert.equal(params.has('end'), false);
  elements['#mkEnd'].value = '2026-01-31';
  params = vm.runInContext('historyParams()', context);
  assert.equal(params.get('end'), new Date('2026-01-31T23:59:59.999').toISOString());
  elements['#mkEnd'].onchange();
  assert.equal(elements['#mkLive'].disabled, true);
  elements['#mkStart'].value = '2026-02-01';
  assert.throws(() => vm.runInContext('historyParams()', context), /fecha de inicio/);
});

test('gráfica: cada indicador genera señales de compra y venta con fecha', () => {
  const { context } = page();
  const closes = [100, 100, 100, 100, 100, 100, 20, 35, 30];
  const bars = closes.map((close, index) => ({
    time: Date.UTC(2026, 0, index + 1, 12) / 1000,
    close,
  }));
  const indicators = {
    ema9: [1, 2, 0, 0, 0, 0, 0, 0, 0],
    sma20: Array(9).fill(1),
    macd: [0, 2, 2, 0, 0, 0, 0, 0, 0],
    signal: Array(9).fill(1),
    rsi14: [50, 50, 50, 50, 50, 28, 32, 72, 68],
    bbLower: Array(9).fill(30),
    bbUpper: [200, 200, 200, 200, 200, 101, 100, 34, 34],
  };
  const signals = vm.runInContext(
    `buildMarketSignals(${JSON.stringify(bars)}, ${JSON.stringify(indicators)})`,
    context,
  );
  assert.deepEqual(Array.from(signals, ({ key, side }) => [key, side]), [
    ['averages', 'buy'], ['macd', 'buy'],
    ['averages', 'sell'], ['macd', 'sell'],
    ['rsi', 'buy'], ['bollinger', 'buy'],
    ['rsi', 'sell'], ['bollinger', 'sell'],
  ]);
  assert.equal(signals[0].date, new Date(bars[1].time * 1000).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }));
  assert.ok(signals.every(({ date }) => typeof date === 'string' && date.length > 0));
  assert.equal(signals[0].price, 100);
  assert.match(signals[0].reason, /Cruce alcista/);
  assert.match(signals[2].reason, /Cruce bajista/);
  assert.ok(signals.every(({ timestamp, reason }) => timestamp.length > 0 && reason.length > 0));
});

test('gráfica: integra las señales S/R recibidas del servidor con sus fechas y motivos', () => {
  const { context } = page();
  const bars = [{ time: 1767274200, close: 97 }, { time: 1767360600, close: 102 }];
  const indicators = Object.fromEntries(['ema9', 'sma20', 'macd', 'signal', 'rsi14', 'bbLower', 'bbUpper'].map((key) => [key, [null, null]]));
  const levels = [{ index: 0, side: 'buy', reason: 'Rebote alcista en soporte: zona 93–95' },
    { index: 1, side: 'sell', reason: 'Rechazo bajista en resistencia: zona 105–107' }];
  const signals = vm.runInContext(`buildMarketSignals(${JSON.stringify(bars)}, ${JSON.stringify(indicators)}, ${JSON.stringify(levels)})`, context);
  assert.deepEqual(Array.from(signals, ({ key, side, price }) => [key, side, price]), [['levels', 'buy', 97], ['levels', 'sell', 102]]);
  assert.match(signals[0].reason, /Rebote alcista/);
  assert.match(signals[1].reason, /Rechazo bajista/);
  assert.ok(signals.every((signal) => signal.date && signal.timestamp));
});

test('gráfica: detalle y flechas respetan filtros e incluyen compra/venta, fecha y precio', () => {
  const elements = { '#signalControls': {}, '#signalSummary': {}, '#signalRows': {} };
  const filters = { averages: true, macd: false, rsi: false, bollinger: false, levels: false };
  let markers;
  const signals = [
    { key: 'averages', side: 'buy', time: 1, date: '01 ene 2026', timestamp: '01/01/2026 12:00', price: 101, reason: 'Cruce alcista' },
    { key: 'macd', side: 'sell', time: 2, date: '02 ene 2026', timestamp: '02/01/2026 12:00', price: 99, reason: 'Cruce bajista' },
    { key: 'levels', side: 'buy', time: 3, date: '03 ene 2026', timestamp: '03/01/2026 12:00', price: 97, reason: 'Rebote alcista en soporte' },
  ];
  const context = vm.createContext({
    $: (selector) => selector.startsWith('#signalControls ')
      ? { checked: filters[selector.match(/data-signal="(.*?)"/)[1]] } : elements[selector],
    charts: { series: { candles: { setMarkers: (value) => { markers = value; } } } },
    marketSignals: signals, css: () => '#000', esc: String, num: String, renderSupportResistance: () => {},
    SIGNALS: { averages: { label: 'EMA9/SMA20', marker: 'EMA/SMA' }, macd: { label: 'MACD', marker: 'MACD' }, rsi: {}, bollinger: {}, levels: { label: 'Soportes/resistencias', marker: 'S/R' } },
  });
  vm.runInContext(html.slice(html.indexOf('function renderMarketSignals()'), html.indexOf('// Autoscale del eje')), context);
  vm.runInContext('renderMarketSignals()', context);
  assert.equal(markers.length, 1);
  assert.match(markers[0].text, /COMPRA 01 ene 2026/);
  assert.match(elements['#signalRows'].innerHTML, /101.*Cruce alcista/);
  assert.doesNotMatch(elements['#signalRows'].innerHTML, /Cruce bajista/);
  filters.macd = true;
  vm.runInContext('renderMarketSignals()', context);
  assert.equal(markers[1].shape, 'arrowDown');
  assert.match(elements['#signalRows'].innerHTML, /VENTA/);
  filters.averages = filters.macd = false;
  vm.runInContext('renderMarketSignals()', context);
  assert.equal(markers.length, 0);
  assert.match(elements['#signalRows'].innerHTML, /Sin señales/);
  filters.levels = true;
  elements['#signalControls'].onchange();
  assert.equal(markers.length, 1);
  assert.equal(markers[0].shape, 'arrowUp');
  assert.match(markers[0].text, /S\/R COMPRA/);
  assert.match(elements['#signalRows'].innerHTML, /Rebote alcista en soporte/);
  assert.match(elements['#signalSummary'].innerHTML, /Soportes\/resistencias: COMPRA/);
  filters.levels = false;
  elements['#signalControls'].onchange();
  assert.equal(markers.length, 0);
});

test('gráfica: descarta respuestas anteriores al cambiar el rango', async () => {
  const { context, elements, calls, candles } = page();
  const first = vm.runInContext("loadBars('AAPL', 1)", context);
  elements['#mkLimit'].value = '1';
  const second = vm.runInContext("loadBars('AAPL', 1)", context);
  const result = (close) => ({
    bars: [{ time: 1767274200, open: 100, high: 120, low: 90, close, volume: 1000 }],
    indicators: Object.fromEntries(['sma20', 'ema9', 'bbUpper', 'bbLower', 'rsi14', 'macd', 'signal', 'histogram'].map((k) => [k, [null]])),
    levelSignals: [{ index: 0, side: 'buy', reason: 'Rebote en soporte de prueba' }],
  });
  calls[1].resolve(result(110));
  await second;
  calls[0].resolve(result(100));
  await first;
  assert.equal(candles.length, 1);
  assert.equal(candles[0][0].close, 110);
  assert.match(elements['#mkHistoryStatus'].textContent, /1 de hasta 1 velas/);
  assert.equal(vm.runInContext('marketSignals[0].key', context), 'levels');
});
