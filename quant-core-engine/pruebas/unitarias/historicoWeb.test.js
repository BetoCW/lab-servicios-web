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
    charts: {
      all: [{ applyOptions() {} }], price: { timeScale: () => ({ fitContent() {} }) },
      series: Object.fromEntries(['candles', 'volume', 'sma20', 'ema9', 'bbUpper', 'bbLower', 'rsi14', 'macd', 'signal', 'histogram'].map((k) => [k, {
        setData(data) { if (k === 'candles') candles.push(data); },
      }])),
    },
  });
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

test('gráfica: descarta respuestas anteriores al cambiar el rango', async () => {
  const { context, elements, calls, candles } = page();
  const first = vm.runInContext("loadBars('AAPL', 1)", context);
  elements['#mkLimit'].value = '1';
  const second = vm.runInContext("loadBars('AAPL', 1)", context);
  const result = (close) => ({
    bars: [{ time: 1767274200, open: 100, high: 120, low: 90, close, volume: 1000 }],
    indicators: Object.fromEntries(['sma20', 'ema9', 'bbUpper', 'bbLower', 'rsi14', 'macd', 'signal', 'histogram'].map((k) => [k, [null]])),
  });
  calls[1].resolve(result(110));
  await second;
  calls[0].resolve(result(100));
  await first;
  assert.equal(candles.length, 1);
  assert.equal(candles[0][0].close, 110);
  assert.match(elements['#mkHistoryStatus'].textContent, /1 de hasta 1 velas/);
});
