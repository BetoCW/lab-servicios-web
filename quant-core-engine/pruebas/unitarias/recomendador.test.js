// Pruebas del recomendador: señales de mercado, puntaje, filtro de riesgo del botón automático,
// piernas del backtest y la validación con IA (sin llamar a la red).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, composite, marketSignals, templateFit, volSide } from '../../api/src/lib/scoring.js';
import { riskFilter, RISK_RULES } from '../../api/src/services/autoTrade.service.js';
import { backtestLegs } from '../../api/src/services/backtest.service.js';
import { aiService, extractJson, normalizeVerdict } from '../../api/src/services/ai.service.js';
import { buildCategoryWinners, recommendService } from '../../api/src/services/recommend.service.js';
import { riskService } from '../../api/src/services/risk.service.js';
import { backtestService } from '../../api/src/services/backtest.service.js';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { config } from '../../api/src/config.js';
import { DEFAULT_CORES, parseCores, scoreCores } from '../../api/src/lib/cores.js';

/** Serie sintética: 120 cierres con una oscilación suave para no depender de datos reales. */
const wave = Array.from({ length: 120 }, (_, i) => 100 + 5 * Math.sin(i / 6) + i * 0.05);

test('cores: valida selección y normaliza orden, espacios y duplicados', () => {
  assert.deepEqual(parseCores(undefined), DEFAULT_CORES);
  assert.deepEqual(parseCores('ai, technical,ai'), ['technical', 'ai']);
  assert.deepEqual(parseCores(['ai']), ['ai']);
  for (const value of ['', [], null, {}, 'unknown', 'technical,', ['ai', 1]]) {
    assert.throws(() => parseCores(value), { status: 400 });
  }
});

test('cores: solo votan los activos; IA sola ignora la compuerta EV y los otros votos', () => {
  const parts = { fit: 0.1, probability: 0.2, expectedValue: 0.3, ai: 1 };
  assert.equal(scoreCores(parts, ['ai'], -100), 100);
  assert.equal(scoreCores({ ...parts, fit: 1, probability: 1, expectedValue: 1 }, ['ai'], 100), 100);
  assert.equal(scoreCores(parts, ['technical'], -100), 10);
  assert.equal(scoreCores(parts, ['probability'], -100), 20);
  close(scoreCores(parts, ['technical', 'risk'], 100), 44);
  const input = { probProfit: 0.2, expectedValue: -50, cvar95: 100, fit: 0.1 };
  const original = composite(input);
  assert.equal(scoreCores(original.parts, DEFAULT_CORES, input.expectedValue), original.score);
  assert.throws(() => scoreCores({}, ['ai'], 1), { status: 400 });
});

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

  // Verificación de escala segmentada monotónica:
  // probProfit: 1 (0.40), ev: 0 -> evScore: 0.5 (0.15), fit: 0 -> raw 0.55; por ser EV <= 0 escala * 30 = 16.5
  const nonPositive = composite({ probProfit: 1, expectedValue: 0, cvar95: 100, fit: 0 });
  close(nonPositive.score, 16.5);

  // Compuerta estricta: incluso con probProfit=0 y fit=0, un EV > 0 supera a cualquier EV <= 0 con prob=1 y fit=1
  const positiveLowProb = composite({ probProfit: 0.05, expectedValue: 1, cvar95: 500, fit: 0.05 });
  const negativeHighProb = composite({ probProfit: 1, expectedValue: -1, cvar95: 500, fit: 1 });
  assert.ok(positiveLowProb.score > negativeHighProb.score, 'EV > 0 siempre supera a EV <= 0');

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

// ---------------------------------------------------------------- medida física (hv30) y actionable
const futureIso = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const makeOcc = (root, iso, type, strike) => {
  const yymmdd = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  const cp = type === 'call' ? 'C' : 'P';
  const k = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${root}${yymmdd}${cp}${k}`;
};

test('riskService.analyzeLegs: usa simulationVol explícita y refleja ventaja de IV > HV en short straddle', async () => {
  const exp = futureIso(30);
  const callSym = makeOcc('TEST', exp, 'call', 100);
  const putSym = makeOcc('TEST', exp, 'put', 100);
  const legs = [
    { symbol: callSym, side: 'sell', ratio_qty: 1 },
    { symbol: putSym, side: 'sell', ratio_qty: 1 },
  ];
  const prefetched = {
    stock: { latestTrade: { p: 100 } },
    snaps: {
      [callSym]: { latestQuote: { bp: 5.5, ap: 5.7 }, impliedVolatility: 0.5 },
      [putSym]: { latestQuote: { bp: 5.3, ap: 5.5 }, impliedVolatility: 0.5 },
    },
    history: { closes: wave, spyCloses: wave },
  };
  const withHv = await riskService.analyzeLegs(
    { name: 'Short straddle', underlying: 'TEST', qty: 1 },
    legs,
    { paths: 4000, seed: 42, simulationVol: 0.15, simulationVolSource: 'hv30' },
    prefetched,
  );
  assert.equal(withHv.inputs.simulationVolSource, 'hv30');
  assert.equal(withHv.inputs.underlyingVol, 0.15);
  assert.ok(withHv.monteCarlo.mean > 0, `Short straddle con IV=0.50 y HV=0.15 debe tener EV > 0, obtuvo ${withHv.monteCarlo.mean}`);

  const withoutHv = await riskService.analyzeLegs(
    { name: 'Short straddle', underlying: 'TEST', qty: 1 },
    legs,
    { paths: 4000, seed: 42 },
    prefetched,
  );
  assert.equal(withoutHv.inputs.simulationVolSource, 'iv-avg');
  assert.equal(withoutHv.inputs.underlyingVol, 0.5);
  assert.ok(withoutHv.monteCarlo.mean <= 0, 'Con IV=simVol en estrategia de crédito, EV debe ser <= 0');
});

test('recommendService.recommend: expone actionable=true con IV > HV30 y actionable=false si ninguna tiene EV > 0', async () => {
  const saved = { ...alpaca };
  const savedAi = aiService.validateRisk;
  let aiCalls = 0;
  aiService.validateRisk = async () => {
    aiCalls++;
    return { verdict: 'approved', reason: 'Revisión simulada', model: 'prueba' };
  };
  const nearExp = futureIso(30);
  const farExp = futureIso(60);
  const spot = 100;
  // Serie estable con hv30 baja (~10-12%) para controlar el régimen.
  const lowVolCloses = Array.from({ length: 120 }, (_, i) => 100 + 0.4 * Math.sin(i / 4));
  const hv30 = marketSignals(lowVolCloses).hv30;

  const nearContracts = [
    { symbol: makeOcc('ZZSIM', nearExp, 'call', 100), type: 'call', strike_price: '100', expiration_date: nearExp },
    { symbol: makeOcc('ZZSIM', nearExp, 'put', 100), type: 'put', strike_price: '100', expiration_date: nearExp },
    { symbol: makeOcc('ZZSIM', nearExp, 'call', 105), type: 'call', strike_price: '105', expiration_date: nearExp },
    { symbol: makeOcc('ZZSIM', nearExp, 'put', 95), type: 'put', strike_price: '95', expiration_date: nearExp },
  ];
  const farContracts = [
    { symbol: makeOcc('ZZSIM', farExp, 'call', 100), type: 'call', strike_price: '100', expiration_date: farExp },
  ];

  const buildSnaps = (ivNear, ivFar) => ({
    [nearContracts[0].symbol]: { latestQuote: { bp: 4.5, ap: 4.7 }, impliedVolatility: ivNear, greeks: { delta: 0.5 } },
    [nearContracts[1].symbol]: { latestQuote: { bp: 4.3, ap: 4.5 }, impliedVolatility: ivNear, greeks: { delta: -0.5 } },
    [nearContracts[2].symbol]: { latestQuote: { bp: 2.0, ap: 2.2 }, impliedVolatility: ivNear, greeks: { delta: 0.25 } },
    [nearContracts[3].symbol]: { latestQuote: { bp: 1.9, ap: 2.1 }, impliedVolatility: ivNear, greeks: { delta: -0.25 } },
    [farContracts[0].symbol]: { latestQuote: { bp: 6.0, ap: 6.2 }, impliedVolatility: ivFar, greeks: { delta: 0.55 } },
  });

  let mode = 'rich';
  alpaca.stockSnapshot = async () => ({ latestTrade: { p: spot } });
  alpaca.stockBars = async () => ({ bars: [...lowVolCloses].reverse().map((c) => ({ c })) });
  alpaca.listOptionContracts = async (q) => (q.type === 'call' ? farContracts : nearContracts);
  alpaca.optionSnapshots = async () =>
    mode === 'rich'
      ? buildSnaps(0.55, 0.5)
      : buildSnaps(hv30 * 1.05, hv30 * 2.2); // ivToHv = 1.05 -> long side, con primas sobrevaloradas en todas

  try {
    const richRes = await recommendService.recommend('ZZRICH', { paths: 4000 });
    assert.equal(richRes.actionable, true);
    assert.equal(richRes.winner.actionable, true);
    assert.equal(richRes.signals.simulationVolSource, 'hv30');
    assert.ok(richRes.winner.metrics.expectedValue > 0);
    assert.equal(aiCalls, 0, 'IA desactivada no se consulta');
    const aiOnly = await recommendService.recommend('ZZAI', { paths: 2000, cores: 'ai' });
    assert.deepEqual(aiOnly.cores, ['ai']);
    assert.equal(aiCalls, 6, 'sin técnico se evalúan ambas direcciones');
    assert.equal(aiOnly.ranking.length, 6);
    assert.ok(aiOnly.ranking.every((entry) => entry.score === 100 && entry.scoreParts.fit === null));
    assert.deepEqual(Object.keys(aiOnly.categoryWinners), ['byComposite']);
    assert.ok(aiOnly.ranking.every((entry) => entry.badges.every((badge) => badge === 'byComposite')));
    const probOnly = await recommendService.recommend('ZZPROB', { paths: 2000, cores: ['probability'] });
    assert.ok(probOnly.ranking.every((entry) => entry.score === Math.round(entry.metrics.probProfit * 1000) / 10));
    assert.equal(aiCalls, 6, 'los otros cores no activan IA');
    aiService.validateRisk = async () => ({ verdict: 'unavailable', reason: 'sin conexión' });
    await assert.rejects(recommendService.recommend('ZZFAIL', { paths: 2000, cores: 'ai' }), /core IA.*sin conexión/);
    await assert.rejects(recommendService.recommend('ZZBAD', { cores: [] }), { status: 400 });
    await assert.rejects(backtestService.run('ZZBT', { cores: 'ai' }), /no admite IA/);

    mode = 'no-edge';
    const noEdgeRes = await recommendService.recommend('ZZNOEDGE', { paths: 4000 });
    assert.equal(noEdgeRes.actionable, false);
    assert.equal(noEdgeRes.winner.actionable, false);
    assert.ok(noEdgeRes.winner.metrics.expectedValue <= 0);
    assert.match(noEdgeRes.explanation, /Sin ventaja estadística positiva/);
  } finally {
    Object.assign(alpaca, saved);
    aiService.validateRisk = savedAi;
  }
});

test('backtestService.run: simula cada ventana con hv30 y produce calibración válida', async () => {
  const saved = { ...alpaca };
  const series = Array.from({ length: 160 }, (_, i) => 100 + 3 * Math.sin(i / 5) + i * 0.04);
  alpaca.stockBars = async () => ({ bars: [...series].reverse().map((c) => ({ c })) });
  try {
    const bt = await backtestService.run('ZZBT');
    assert.ok(bt.samples > 0);
    assert.equal(typeof bt.topPick.winRatePct, 'number');
    assert.equal(bt.calibration.length, 4);
  } finally {
    Object.assign(alpaca, saved);
  }
});
