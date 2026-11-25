import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNews, newsFit, createNewsService } from '../../api/src/services/news.service.js';
import { parseCores, scoreCores, DEFAULT_CORES } from '../../api/src/lib/cores.js';

const now = Date.parse('2026-11-25T12:00:00Z');
const article = (overrides = {}) => ({ headline: 'Company beats estimates and raises guidance',
  symbols: ['TEST'], created_at: new Date(now - 3600000).toISOString(), source: 'Provider', url: 'https://example.com/news', ...overrides });

test('noticias: selección opcional, peso normalizado y solo vota al activarse', () => {
  assert.deepEqual(parseCores('news,technical,news'), ['technical', 'news']);
  assert.ok(!DEFAULT_CORES.includes('news'));
  assert.equal(scoreCores({ probability: 0.7, news: 0 }, ['probability'], 10), 70);
  assert.equal(scoreCores({ news: 0.8 }, ['news'], -100), 80);
  assert.throws(() => scoreCores({}, ['news'], 10), { status: 400 });
});

test('noticias: excluye ajenas, futuras, viejas, fechas inválidas y titulares duplicados', () => {
  const result = analyzeNews('TEST', [article(), article({ id: 2 }), article({ symbols: ['OTHER'] }),
    article({ headline: 'Old', created_at: new Date(now - 8 * 86400000).toISOString() }),
    article({ headline: 'Future', created_at: new Date(now + 1000).toISOString() }),
    article({ headline: 'Invalid', created_at: 'bad' })], now);
  assert.equal(result.articleCount, 1);
  assert.ok(result.sentiment > 0);
  assert.equal(result.eventPressure, 1);
  assert.equal(result.articles[0].url, 'https://example.com/news');
});

test('noticias: titulares recientes y específicos pesan más', () => {
  const positive = article({ headline: 'Record profit' });
  const negative = article({ headline: 'Fraud lawsuit', created_at: new Date(now - 6 * 86400000).toISOString(), symbols: ['TEST', 'A', 'B', 'C'] });
  const news = analyzeNews('TEST', [positive, negative], now);
  assert.ok(news.sentiment > 0.8);
  const reversed = analyzeNews('TEST', [article({ headline: 'Fraud lawsuit' }), article({ headline: 'Record profit', created_at: negative.created_at })], now);
  assert.ok(reversed.sentiment < 0);
});

test('noticias: eventos penalizan ventas, sentimiento orienta diagonales, compras neutrales', () => {
  const news = analyzeNews('TEST', [article()], now);
  assert.ok(newsFit(news, 'short-strangle').score < 0.5);
  assert.ok(newsFit(news, 'calendar').score < 0.5);
  assert.equal(newsFit(news, 'long-strangle').score, 0.5);
  const negative = analyzeNews('TEST', [article({ headline: 'Fraud lawsuit' })], now);
  assert.ok(newsFit(negative, 'diagonal').score < newsFit(news, 'diagonal').score);
});

test('noticias: sin cobertura se declara neutral; URLs peligrosas se descartan', () => {
  const empty = analyzeNews('TEST', [], now);
  assert.equal(empty.status, 'no-news');
  assert.equal(empty.confidence, 0);
  assert.match(empty.summary, /sin evidencia/);
  assert.equal(newsFit(empty, 'short-straddle').score, 0.5);
  assert.equal(analyzeNews('TEST', [article({ url: 'javascript:alert(1)' })], now).articles[0].url, null);
});

test('noticias: reconoce investigaciones y recomendaciones de analistas en titulares del feed', () => {
  const news = analyzeNews('TEST', [article({ headline: 'Law Firms Announce Securities Investigations into Company' })], now);
  assert.equal(news.sentiment, -1);
  assert.equal(news.eventPressure, 1);
  assert.equal(analyzeNews('TEST', [article({ headline: 'Analyst Initiates Coverage with Buy Rating' })], now).sentiment, 1);
});

test('noticias: consulta limitada, caché por empresa, vencimiento y truncamiento visibles', async () => {
  let time = now, calls = 0;
  const service = createNewsService({ now: () => time, fetchNews: async (query) => {
    calls++;
    assert.equal(query.limit, 50);
    assert.equal(query.include_content, false);
    assert.equal(query.start, new Date(time - 7 * 86400000).toISOString());
    return { news: [article()], next_page_token: 'more' };
  } });
  const a = await service.analyze('TEST');
  assert.equal(a.truncated, true);
  assert.match(a.summary, /50 titulares/);
  assert.equal(await service.analyze('TEST'), a);
  assert.equal(calls, 1);
  await service.analyze('OTHER');
  assert.equal(calls, 2);
  time += 600001;
  await service.analyze('TEST');
  assert.equal(calls, 3);
});

test('noticias: fallo o respuesta inválida son 503 y no se cachean como neutral', async () => {
  let calls = 0;
  const service = createNewsService({ fetchNews: async () => { calls++; if (calls === 1) throw new Error('secret'); return {}; } });
  for (let i = 0; i < 2; i++) await assert.rejects(service.analyze('TEST'), (e) => e.status === 503 && !e.message.includes('secret'));
  assert.equal(calls, 2);
});
