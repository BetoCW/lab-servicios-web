import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackScholes, binomial, impliedVol, pnlMatrix, monteCarlo, regTMargin, spanMargin } from './index.js';

const hull = { type: 'call', spot: 42, strike: 40, t: 0.5, rate: 0.1, vol: 0.2 };

test('Black-Scholes: ejemplo de Hull', () => {
  const [call, put] = blackScholes([hull, { ...hull, type: 'put' }]);
  assert.ok(Math.abs(call.price - 4.7594) < 1e-4);
  assert.ok(Math.abs(put.price - 0.8086) < 1e-4);
});

test('IV recupera la volatilidad', () => {
  const [{ price }] = blackScholes([hull]);
  assert.ok(Math.abs(impliedVol([{ ...hull, price }])[0] - 0.2) < 1e-8);
});

test('Binomial: put americana de Hull ≈ 4.28', () => {
  const [r] = binomial([{ type: 'put', spot: 50, strike: 50, t: 5 / 12, rate: 0.1, vol: 0.4 }], { steps: 2000 });
  assert.ok(Math.abs(r.price - 4.28) < 0.01);
});

test('Riesgo de un strangle corto', () => {
  const legs = [
    { type: 'call', strike: 110, t: 30 / 365, qty: -1, vol: 0.25 },
    { type: 'put', strike: 90, t: 30 / 365, qty: -1, vol: 0.25 },
  ];
  const m = pnlMatrix(legs, { spot: 100, rate: 0.05, spotShocks: [-0.1, 0, 0.1], volShocks: [0, 0.05] });
  assert.equal(m.length, 3);
  assert.ok(Math.abs(m[1][0]) < 1e-9);
  const mc = monteCarlo(legs, { spot: 100, rate: 0.05, vol: 0.25, horizonDays: 30, paths: 20000 });
  assert.ok(mc.probProfit > 0.5 && mc.var95 > 0);
  assert.ok(regTMargin(legs, { spot: 100, rate: 0.05 }).total > 0);
  assert.equal(spanMargin(legs, { spot: 100, rate: 0.05 }).scenarios.length, 16);
});
