import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanService, LIQUID_UNIVERSE, parseScanQuery } from '../../api/src/services/scan.service.js';

// Recomendador simulado: puntaje = largo del ticker * 10 + índice de plantilla; 'BAD' falla.
function fakeRecommend(calls = []) {
  return async (symbol, query) => {
    calls.push({ symbol, query });
    if (symbol === 'BAD') throw new Error('BAD no tiene opciones listadas');
    const templates = query.templates ?? ['short-straddle', 'short-strangle', 'calendar', 'diagonal'];
    return {
      symbol,
      signals: { spot: 100, ivPct: 30, hv30Pct: 25, nearExpiration: '2027-01-15', farExpiration: '2027-02-19' },
      ranking: templates.map((template, i) => ({
        template, name: template, score: symbol.length * 10 + i,
        legs: [{ symbol: `${symbol}C`, side: 'sell', ratio_qty: 1 }],
        metrics: { probProfit: 0.6, expectedValue: i - 1, var95: 50, netCost: -2 },
      })),
    };
  };
}

test('explorar: valida horizonte, universo y límite', () => {
  assert.deepEqual(parseScanQuery({}), { horizonDays: 90, universe: 'liquid', limit: 20, cores: ['technical', 'probability', 'risk'] });
  assert.throws(() => parseScanQuery({ horizonDays: '400' }), { status: 400, message: /30 y 120/ });
  assert.throws(() => parseScanQuery({ universe: 'mars' }), { status: 400 });
  assert.throws(() => parseScanQuery({ limit: '0' }), { status: 400 });
});

test('scan: ranking único empresa + estrategia, ordenado y limitado; las fallas van a skipped', async () => {
  const calls = [];
  const service = createScanService({
    recommend: fakeRecommend(calls),
    listWatchlists: async () => [{ symbols: ['AAPL', 'BAD'] }, { symbols: ['SPY', 'AAPL'] }],
  });
  const out = await service.scan({ universe: 'watchlists', limit: '5', horizonDays: '60' });
  assert.equal(out.scanned, 3);
  assert.deepEqual(out.skipped, [{ symbol: 'BAD', reason: 'BAD no tiene opciones listadas' }]);
  assert.equal(out.rows.length, 5);
  assert.deepEqual(out.rows.slice(0, 4).map((r) => `${r.symbol}:${r.template}`), ['AAPL:diagonal', 'AAPL:calendar', 'AAPL:short-strangle', 'AAPL:short-straddle']);
  assert.ok(out.rows.every((r, i, all) => i === 0 || all[i - 1].score >= r.score));
  assert.ok(calls.every(({ query }) => query.horizonDays === 60 && query.paths === 4000 && !query.templates));
  assert.equal(out.rows[0].actionable, true);
  assert.equal(out.rows[3].actionable, false);
});

test('scan: universo líquido por defecto y watchlists vacías dan 400', async () => {
  const calls = [];
  const service = createScanService({ recommend: fakeRecommend(calls), listWatchlists: async () => [{ symbols: [] }] });
  const out = await service.scan();
  assert.equal(out.scanned, LIQUID_UNIVERSE.length);
  assert.equal(calls.length, LIQUID_UNIVERSE.length);
  await assert.rejects(service.scan({ universe: 'watchlists' }), { status: 400 });
});

test('screen: fuerza la plantilla en cada empresa y devuelve el top por puntaje', async () => {
  const calls = [];
  const service = createScanService({ recommend: fakeRecommend(calls), listWatchlists: async () => [] });
  const out = await service.screen({ template: 'long-strangle', limit: '3' });
  assert.equal(out.template, 'long-strangle');
  assert.equal(out.rows.length, 3);
  assert.ok(out.rows.every((r) => r.template === 'long-strangle'));
  assert.ok(calls.every(({ query }) => query.templates.length === 1 && query.templates[0] === 'long-strangle'));
  assert.equal(new Set(out.rows.map((r) => r.symbol)).size, 3);
  await assert.rejects(service.screen({ template: 'iron-butterfly' }), { status: 400, message: /template debe ser/ });
});

test('screen: propaga Noticias y sus fuentes; un fallo del feed queda en skipped', async () => {
  const service = createScanService({
    listWatchlists: async () => [{ symbols: ['TEST', 'FAIL'] }],
    recommend: async (symbol, query) => {
      assert.deepEqual(query.cores, ['news']);
      if (symbol === 'FAIL') throw new Error('Core Noticias no disponible');
      const rec = await fakeRecommend()(symbol, query);
      rec.news = { status: 'ok', articles: [{ headline: 'Test', url: 'https://example.com' }] };
      rec.ranking[0].news = { score: 0.4, reason: 'Mención de evento' };
      return rec;
    },
  });
  const out = await service.screen({ universe: 'watchlists', template: 'short-strangle', cores: 'news', limit: 10 });
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].news.fit, 0.4);
  assert.equal(out.rows[0].news.articles[0].headline, 'Test');
  assert.match(out.skipped[0].reason, /Noticias/);
});
