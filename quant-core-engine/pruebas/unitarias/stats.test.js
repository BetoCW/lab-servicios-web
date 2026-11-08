// Pruebas de las fórmulas de riesgo (api/src/lib/stats.js) con números que se pueden verificar a mano.
// Sirven también como "ejemplos resueltos" para explicar cada fórmula al exponer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beta,
  histogramPercentile,
  historicalVol,
  logReturns,
  maxDrawdown,
  mean,
  meanConfidenceInterval95,
  percentile,
  proportionConfidenceInterval95,
  sharpe,
  sortino,
  stdev,
  varCvar,
} from '../../api/src/lib/stats.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

test('media y desviación estándar muestral', () => {
  close(mean([2, 4, 4, 4, 5, 5, 7, 9]), 5);
  // Σ(x-5)² = 32; muestral: √(32/7)
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
  assert.ok(Number.isNaN(stdev([1])));
});

test('retornos logarítmicos: ln(Pt / Pt-1)', () => {
  const returns = logReturns([100, 110, 99]);
  close(returns[0], Math.log(1.1));
  close(returns[1], Math.log(0.9));
});

test('volatilidad histórica anualizada = desviación diaria × √252', () => {
  const closes = [100, 101, 99, 102, 100, 103];
  const daily = stdev(logReturns(closes));
  close(historicalVol(closes, 30), daily * Math.sqrt(252));
});

test('percentil por interpolación lineal', () => {
  const sorted = [10, 20, 30, 40, 50];
  close(percentile(sorted, 0), 10);
  close(percentile(sorted, 0.5), 30);
  close(percentile(sorted, 0.25), 20);
  close(percentile(sorted, 0.1), 14); // entre 10 y 20, al 40 % del tramo
});

test('VaR y CVaR históricos regresan pérdida en positivo', () => {
  // 20 resultados: -100 el peor, luego -90, ... el percentil 5 queda entre los dos peores.
  const pnls = Array.from({ length: 20 }, (_, i) => -100 + i * 10); // -100 ... 90
  const { var: valueAtRisk, cvar } = varCvar(pnls, 0.95);
  close(valueAtRisk, 90.5); // posición (20-1)·0.05 = 0.95 → entre -100 y -90, al 95 % del tramo = -90.5
  close(cvar, 100); // solo el resultado ≤ -90.5 es -100
  assert.ok(cvar >= valueAtRisk, 'CVaR siempre ≥ VaR');
});

test('drawdown máximo: mayor caída desde un máximo previo', () => {
  close(maxDrawdown([100, 120, 90, 110, 80]), (80 - 120) / 120); // −33.3 %
  close(maxDrawdown([1, 2, 3, 4]), 0);
});

test('Sharpe y Sortino: signo y relación', () => {
  const up = [0.01, 0.012, 0.008, 0.011, 0.009, 0.01];
  assert.ok(sharpe(up, 0) > 0);
  const mixed = [0.02, -0.01, 0.03, -0.02, 0.01, 0.02];
  assert.ok(sortino(mixed, 0) > sharpe(mixed, 0), 'Sortino ignora la volatilidad alcista, por eso es mayor');
});

test('beta: 1 contra sí mismo, 2 si se mueve el doble, negativa si va al revés', () => {
  const index = [0.01, -0.02, 0.015, 0.005, -0.01];
  close(beta(index, index), 1);
  close(beta(index.map((r) => r * 2), index), 2);
  close(beta(index.map((r) => -r), index), -1);
});

test('intervalos de confianza del 95 %', () => {
  const [low, high] = meanConfidenceInterval95(100, 50, 10000); // margen = 1.96·50/100 = 0.98
  close(low, 99.02);
  close(high, 100.98);
  const [pLow, pHigh] = proportionConfidenceInterval95(0.5, 10000); // margen = 1.96·0.005
  close(pLow, 0.4902);
  close(pHigh, 0.5098);
  assert.deepEqual(proportionConfidenceInterval95(1, 100), [1, 1], 'queda acotada a [0,1]');
});

test('percentil de un histograma interpola dentro del intervalo', () => {
  const histogram = [
    { from: 0, to: 10, count: 50 },
    { from: 10, to: 20, count: 50 },
  ];
  close(histogramPercentile(histogram, 0.5), 10);
  close(histogramPercentile(histogram, 0.25), 5);
  close(histogramPercentile(histogram, 0.75), 15);
});
