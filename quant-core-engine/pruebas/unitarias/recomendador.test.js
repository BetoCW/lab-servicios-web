// Pruebas del recomendador: señales de mercado, puntaje, filtro de riesgo del botón automático,
// piernas del backtest y la validación con IA (sin llamar a la red).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, composite, marketSignals, templateFit, volSide } from '../../api/src/lib/scoring.js';
import { riskFilter, RISK_RULES } from '../../api/src/services/autoTrade.service.js';
import { backtestLegs } from '../../api/src/services/backtest.service.js';
import { aiService, extractJson, normalizeVerdict } from '../../api/src/services/ai.service.js';
import { buildCategoryWinners } from '../../api/src/services/recommend.service.js';
import { config } from '../../api/src/config.js';

/** Serie sintética: 120 cierres con una oscilación suave para no depender de datos reales. */
const wave = Array.from({ length: 120 }, (_, i) => 100 + 5 * Math.sin(i / 6) + i * 0.05);

test('clamp limita al intervalo', () => {
  assert.equal(clamp(5), 1);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(0.4), 0.4);
});

test('marketSignals lee tendencia, Bollinger y volatilidad', () => {
  const s = marketSignals(wave);
  assert.ok(s.hv30 > 0 && s.hvLongRun > 0);
  assert.ok(s.bollingerPosition >= 0 && s.bollingerPosition <= 1);
  assert.equal(Math.sign(s.trendStrength), Math.sign(s.ema9 - s.sma20));
});

test('volSide: vender volatilidad solo si la IV supera 10 % a la histórica', () => {
  assert.equal(volSide(1.2), 'short');
  assert.equal(volSide(1.1), 'long');
  assert.equal(volSide(0.8), 'long');
});

test('templateFit: IV cara favorece vender; IV barata favorece comprar', () => {
  const signals = { trendStrength: 0, bollingerPosition: 0.5 };
  const rich = templateFit({ ivToHv: 1.5, termSlope: null, signals });
  const cheap = templateFit({ ivToHv: 0.7, termSlope: null, signals });
  assert.ok(rich['short-strangle'] > rich['long-strangle']);
  assert.ok(cheap['long-strangle'] > cheap['short-strangle']);
  for (const value of [...Object.values(rich), ...Object.values(cheap)]) assert.ok(value >= 0 && value <= 1);
});

test('composite: más probabilidad y mejor valor esperado dan más puntaje', () => {
  const weak = composite({ probProfit: 0.3, expectedValue: -50, cvar95: 500, fit: 0.2 });
  const strong = composite({ probProfit: 0.7, expectedValue: 80, cvar95: 500, fit: 0.9 });
  assert.ok(strong.score > weak.score);
  assert.ok(strong.score <= 100 && weak.score >= 0);
  // valor esperado 0 -> componente 0.5 exacto
  close(composite({ probProfit: 0, expectedValue: 0, cvar95: 100, fit: 0 }).parts.expectedValue, 0.5);

  // Verificación de ponderación 20% prob / 40% evScore / 40% fit
  // probProfit: 1 (0.20), ev: 0 -> evScore: 0.5 (0.40 * 0.5 = 0.20), fit: 0 -> total 40.0
  const balanced = composite({ probProfit: 1, expectedValue: 0, cvar95: 100, fit: 0 });
  close(balanced.score, 40.0);

  // CVaR mayor penaliza más que un VaR menor
  const withVaR = composite({ probProfit: 0.5, expectedValue: 50, var95: 100, fit: 0.5 });
  const withWorstCvar = composite({ probProfit: 0.5, expectedValue: 50, cvar95: 500, fit: 0.5 });
  assert.ok(withVaR.score > withWorstCvar.score, 'CVaR de cola pesada reduce el puntaje frente a VaR menor');
});

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
}

test('riskFilter: pasa solo si cumple las cuatro reglas', () => {
  const account = { equity: 100000, buyingPower: 200000 };
  const good = { probProfit: 0.55, expectedValue: 40, var95: 2000, marginRegT: 5000 };
  assert.equal(riskFilter(good, account).passed, true);
  assert.equal(riskFilter({ ...good, probProfit: RISK_RULES.minProbProfit - 0.01 }, account).passed, false);
  assert.equal(riskFilter({ ...good, expectedValue: -1 }, account).passed, false);
  assert.equal(riskFilter({ ...good, var95: 5001 }, account).passed, false); // > 5 % de 100 000
  assert.equal(riskFilter({ ...good, marginRegT: 250000 }, account).passed, false);
  assert.equal(riskFilter(good, account).checks.length, 4);
});

test('backtestLegs arma las piernas de cada plantilla con el signo correcto', () => {
  const [longCall, longPut] = backtestLegs('long-straddle', 100, 0.3);
  assert.deepEqual([longCall.type, longPut.type, longCall.qty, longPut.qty, longCall.strike], ['call', 'put', 1, 1, 100]);
  const shortStrangle = backtestLegs('short-strangle', 100, 0.3);
  assert.deepEqual(shortStrangle.map((l) => l.qty), [-1, -1]);
  assert.ok(shortStrangle[0].strike > 100 && shortStrangle[1].strike < 100);
  const calendar = backtestLegs('calendar', 100, 0.3);
  assert.deepEqual(calendar.map((l) => l.qty), [-1, 1]);
  assert.ok(calendar[1].t > calendar[0].t, 'la pierna comprada vence después');
  assert.throws(() => backtestLegs('inexistente', 100, 0.3));
});

test('IA: extractJson tolera texto alrededor y ```json', () => {
  assert.deepEqual(extractJson('```json\n{"verdict":"approved","reason":"ok"}\n```'), { verdict: 'approved', reason: 'ok' });
  assert.equal(extractJson('sin json'), null);
  assert.equal(extractJson('{roto'), null);
});

test('IA: normalizeVerdict acepta español e inglés', () => {
  assert.equal(normalizeVerdict('Aprobado'), 'approved');
  assert.equal(normalizeVerdict('CAUTION'), 'caution');
  assert.equal(normalizeVerdict('rechazado'), 'rejected');
  assert.equal(normalizeVerdict('quizás'), null);
});

test('IA: sin llave responde "unavailable" y no lanza error', async () => {
  const saved = config.ai.apiKey;
  config.ai.apiKey = '';
  try {
    const result = await aiService.validateRisk({ probProfit: 0.5 });
    assert.equal(result.verdict, 'unavailable');
    assert.match(result.reason, /Sin validación/);
  } finally {
    config.ai.apiKey = saved;
  }
});

test('IA: con la red caída también responde "unavailable"', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = config.ai.apiKey;
  config.ai.apiKey = 'sk-prueba';
  globalThis.fetch = async () => {
    throw new Error('sin red');
  };
  try {
    assert.equal((await aiService.validateRisk({})).verdict, 'unavailable');
  } finally {
    globalThis.fetch = savedFetch;
    config.ai.apiKey = savedKey;
  }
});

test('IA: usa el modelo de respaldo si el principal falla', async () => {
  const savedFetch = globalThis.fetch;
  const saved = { ...config.ai };
  Object.assign(config.ai, { apiKey: 'sk-prueba', model: 'principal', fallbackModels: ['respaldo'] });
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const { model } = JSON.parse(init.body);
    calls.push(model);
    if (model === 'principal') return new Response('{}', { status: 429 });
    return Response.json({ model, choices: [{ message: { content: '{"verdict":"caution","reason":"riesgo alto"}' } }] });
  };
  try {
    const result = await aiService.validateRisk({});
    assert.deepEqual(calls, ['principal', 'respaldo']);
    assert.equal(result.verdict, 'caution');
    assert.equal(result.model, 'respaldo');
  } finally {
    globalThis.fetch = savedFetch;
    Object.assign(config.ai, saved);
  }
});

test('buildCategoryWinners asigna ganadores por categoría e insignias', () => {
  const sampleUsable = [
    {
      template: 'short-strangle',
      name: 'Venta de Strangle',
      score: 75,
      scoreParts: { probProfit: 0.16, expectedValue: 0.25, fit: 0.34 },
      metrics: { probProfit: 0.80, expectedValue: 30, cvar95: 120 },
    },
    {
      template: 'diagonal',
      name: 'Diagonal Spread',
      score: 70,
      scoreParts: { probProfit: 0.11, expectedValue: 0.35, fit: 0.24 },
      metrics: { probProfit: 0.55, expectedValue: 90, cvar95: 70 },
    },
    {
      template: 'calendar',
      name: 'Calendar Spread',
      score: 65,
      scoreParts: { probProfit: 0.10, expectedValue: 0.15, fit: 0.40 },
      metrics: { probProfit: 0.50, expectedValue: 10, cvar95: 50 },
    },
  ];

  const { categoryWinners, rankingWithBadges } = buildCategoryWinners(sampleUsable);
  assert.equal(categoryWinners.byComposite.template, 'short-strangle');
  assert.equal(categoryWinners.byProbability.template, 'short-strangle');
  assert.equal(categoryWinners.byRiskAdjustedReturn.template, 'diagonal');
  assert.equal(categoryWinners.byFit.template, 'calendar');

  const strangleRow = rankingWithBadges.find((r) => r.template === 'short-strangle');
  assert.ok(strangleRow.badges.includes('byComposite'));
  assert.ok(strangleRow.badges.includes('byProbability'));

  const diagonalRow = rankingWithBadges.find((r) => r.template === 'diagonal');
  assert.ok(diagonalRow.badges.includes('byRiskAdjustedReturn'));

  const calendarRow = rankingWithBadges.find((r) => r.template === 'calendar');
  assert.ok(calendarRow.badges.includes('byFit'));
});

// ---------------------------------------------------------------- buscador de tickers
import { rankAssets } from '../../api/src/services/assets.service.js';

const catalog = [
  { symbol: 'AAPL', name: 'Apple Inc. Common Stock', _name: 'apple inc. common stock', exchange: 'NASDAQ', hasOptions: true },
  { symbol: 'APLE', name: 'Apple Hospitality REIT', _name: 'apple hospitality reit', exchange: 'NYSE', hasOptions: true },
  { symbol: 'AAPX', name: 'T-Rex 2X Long Apple', _name: 't-rex 2x long apple', exchange: 'CBOE', hasOptions: false },
  { symbol: 'TSLA', name: 'Tesla, Inc. Common Stock', _name: 'tesla, inc. common stock', exchange: 'NASDAQ', hasOptions: true },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', _name: 'spdr s&p 500 etf', exchange: 'ARCA', hasOptions: true },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', _name: 'invesco qqq trust', exchange: 'NASDAQ', hasOptions: true },
];

test('buscador: ticker exacto va primero y el nombre de la empresa también encuentra', () => {
  assert.equal(rankAssets(catalog, 'aapl')[0].symbol, 'AAPL');
  assert.deepEqual(rankAssets(catalog, 'apple').map((x) => x.symbol), ['AAPL', 'APLE', 'AAPX']);
  assert.equal(rankAssets(catalog, 'tesla')[0].symbol, 'TSLA');
});

test('buscador: ignora mayúsculas y acentos, y puede pedir solo activos con opciones', () => {
  assert.equal(rankAssets(catalog, 'TESLA')[0].symbol, 'TSLA');
  assert.equal(rankAssets(catalog, 'apple', { optionsOnly: true }).some((x) => x.symbol === 'AAPX'), false);
  assert.equal(rankAssets(catalog, 'zzzz').length, 0);
});

test('buscador: sin texto devuelve los más usados y respeta el límite', () => {
  const popular = rankAssets(catalog, '');
  assert.deepEqual(popular.map((x) => x.symbol), ['SPY', 'QQQ', 'AAPL', 'TSLA']);
  assert.equal(rankAssets(catalog, 'a', { limit: 2 }).length, 2);
});
