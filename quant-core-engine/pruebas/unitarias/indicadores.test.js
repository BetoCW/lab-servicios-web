// Pruebas unitarias de los indicadores técnicos con valores calculables a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bollinger, ema, macd, rsi, sma } from '../../api/src/lib/indicators.js';

const up = Array.from({ length: 40 }, (_, i) => 100 + i);

test('sma promedia la ventana y deja null el calentamiento', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('ema de una serie constante es la constante', () => {
  assert.deepEqual(ema([5, 5, 5, 5, 5], 3), [null, null, 5, 5, 5]);
  assert.equal(ema([1, 2, 3, 4], 2)[3], 3.5); // semilla 1.5, k=2/3: 2.5 -> 3.5
});

test('bollinger sin volatilidad colapsa en la media', () => {
  const b = bollinger(Array(25).fill(10), 20, 2);
  assert.equal(b.upper[24], 10);
  assert.equal(b.lower[24], 10);
});

test('rsi es 100 si solo sube y ~0 si solo baja', () => {
  assert.equal(rsi(up, 14).at(-1), 100);
  assert.equal(rsi([...up].reverse(), 14).at(-1), 0);
  assert.equal(rsi(up, 14)[13], null);
});

test('macd positivo en tendencia alcista y alineado con la entrada', () => {
  const m = macd(up);
  assert.equal(m.macd.length, up.length);
  assert.ok(m.macd.at(-1) > 0);
  assert.equal(m.macd[24], null);
  assert.notEqual(m.histogram.at(-1), null);
});
