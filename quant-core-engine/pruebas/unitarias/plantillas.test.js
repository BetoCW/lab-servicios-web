// Plantillas del front (web/templates.js): piernas correctas para cada estrategia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../web/templates.js';

const { build } = globalThis.F0Templates;
const NEAR = '2026-11-20', FAR = '2026-12-18';
const quotes = [NEAR, FAR].flatMap((exp) =>
  [490, 495, 500, 505, 510, 515, 520, 480, 485].flatMap((k) => [
    { symbol: `SPY${exp}C${k}`, type: 'call', expiration: exp, strike: k, delta: Math.max(0.02, 0.5 - (k - 500) / 40) },
    { symbol: `SPY${exp}P${k}`, type: 'put', expiration: exp, strike: k, delta: -Math.max(0.02, 0.5 + (k - 500) / 40) },
  ]),
);
const sym = (r) => r.legs.map((l) => `${l.side} ${l.symbol}`);

test('straddle: call y put ATM del mismo vencimiento', () => {
  assert.deepEqual(sym(build('long-straddle', quotes, 501, NEAR)), [`buy SPY${NEAR}C500`, `buy SPY${NEAR}P500`]);
  assert.deepEqual(sym(build('short-straddle', quotes, 501, NEAR)), [`sell SPY${NEAR}C500`, `sell SPY${NEAR}P500`]);
});

test('strangle: call y put OTM con |delta| ≈ 0.25', () => {
  assert.deepEqual(sym(build('long-strangle', quotes, 500, NEAR)), [`buy SPY${NEAR}C510`, `buy SPY${NEAR}P490`]);
});

test('calendar: mismo strike, vende cercano y compra lejano', () => {
  assert.deepEqual(sym(build('calendar', quotes, 499, NEAR)), [`sell SPY${NEAR}C500`, `buy SPY${FAR}C500`]);
});

test('diagonal: vende call OTM cercana y compra call ATM lejana', () => {
  assert.deepEqual(sym(build('diagonal', quotes, 500, NEAR)), [`sell SPY${NEAR}C510`, `buy SPY${FAR}C500`]);
});

test('calendar sin vencimiento posterior falla con mensaje claro', () => {
  assert.throws(() => build('calendar', quotes, 500, FAR), /vencimiento posterior/);
});

test('calendar ignora un vencimiento lejano truncado sin strikes cerca del spot', () => {
  const cut = quotes.filter((q) => q.expiration === NEAR || q.strike < 490); // FAR solo trae 480/485
  assert.throws(() => build('calendar', cut, 500, NEAR), /cerca del spot/);
});
