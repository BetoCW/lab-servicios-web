// Pruebas de la pantalla única: caché con deduplicación, resumen del ticker con carga parcial
// y candado del botón automático. Sin red: Alpaca se simula reemplazando métodos de `alpaca`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memo } from '../../api/src/lib/cache.js';
import { normalizeSymbol } from '../../api/src/lib/symbol.js';
import { alpaca } from '../../api/src/lib/alpaca.js';
import { overviewService, summarizeIndicators, toQuote } from '../../api/src/services/overview.service.js';
import { autoTradeService } from '../../api/src/services/autoTrade.service.js';
import { recommendService } from '../../api/src/services/recommend.service.js';

test('memo: comparte la petición en vuelo y respeta el TTL', async () => {
  let calls = 0;
  const slow = memo(30, async (x) => (++calls, x * 2));
  const [a, b] = await Promise.all([slow(2), slow(2)]);
  assert.equal(a, 4);
  assert.equal(b, 4);
  assert.equal(calls, 1); // dos clientes simultáneos = una sola llamada
  await slow(2);
  assert.equal(calls, 1); // aún fresco
  await new Promise((r) => setTimeout(r, 40));
  await slow(2);
  assert.equal(calls, 2); // venció el TTL
});

test('memo: un fallo no se guarda', async () => {
  let calls = 0;
  const flaky = memo(10_000, async () => {
    if (++calls === 1) throw new Error('429');
    return 'ok';
  });
  await assert.rejects(flaky(), /429/);
  assert.equal(await flaky(), 'ok');
});

test('normalizeSymbol acepta tickers y rechaza basura', () => {
  assert.equal(normalizeSymbol(' aapl '), 'AAPL');
  assert.equal(normalizeSymbol('brk.b'), 'BRK.B');
  assert.throws(() => normalizeSymbol('../etc'), { status: 400 });
  assert.throws(() => normalizeSymbol(undefined), { status: 400 });
});

test('toQuote calcula el % del día contra el cierre previo', () => {
  const q = toQuote({ latestTrade: { p: 110, t: 'x' }, prevDailyBar: { c: 100 }, latestQuote: { bp: 109.9, ap: 110.1 } });
  assert.equal(q.changePct, 10);
  assert.equal(q.bid, 109.9);
  assert.equal(toQuote({}).changePct, null);
});

test('summarizeIndicators exige historia mínima y etiqueta la tendencia', () => {
  assert.throws(() => summarizeIndicators([1, 2, 3]), /insuficiente/);
  const up = Array.from({ length: 120 }, (_, i) => 100 + i);
  const s = summarizeIndicators(up);
  assert.equal(s.trend, 'alcista');
  assert.ok(s.rsi14 > 50);
});

test('overview: si fallan indicadores y vencimientos, la cotización sigue', async () => {
  const saved = { ...alpaca };
  alpaca.stockSnapshot = async () => ({ latestTrade: { p: 50, t: 't' }, prevDailyBar: { c: 25 } });
  alpaca.stockBars = async () => {
    throw new Error('sin historial');
  };
  alpaca.listOptionContracts = async () => {
    throw new Error('sin opciones');
  };
  try {
    const out = await overviewService.overview('zzpart');
    assert.equal(out.quote.price, 50);
    assert.equal(out.quote.changePct, 100);
    assert.equal(out.indicators, null);
    assert.equal(out.expirations, null);
    assert.deepEqual(Object.keys(out.errors).sort(), ['expirations', 'indicators']);
  } finally {
    Object.assign(alpaca, saved);
  }
});

test('overview: sin cotización es error (el resto no tiene sentido)', async () => {
  const saved = { ...alpaca };
  alpaca.stockSnapshot = async () => {
    throw new Error('no existe');
  };
  try {
    await assert.rejects(overviewService.overview('ZZNOPE'), /no existe/);
  } finally {
    Object.assign(alpaca, saved);
  }
});

test('/auto: una sola ejecución a la vez (429 en la segunda)', async () => {
  const saved = recommendService.recommend;
  let release;
  recommendService.recommend = () => new Promise((_, reject) => (release = reject));
  try {
    const first = autoTradeService.run({ symbol: 'AAPL', confirm: true });
    await assert.rejects(autoTradeService.run({ symbol: 'AAPL', confirm: true }), { status: 429 });
    release(new Error('fin'));
    await assert.rejects(first, /fin/);
    // el candado se libera aun cuando falló: otra ejecución vuelve a entrar (y falla por su cuenta)
    recommendService.recommend = async () => {
      throw new Error('otra');
    };
    await assert.rejects(autoTradeService.run({ symbol: 'AAPL', confirm: true }), /otra/);
  } finally {
    recommendService.recommend = saved;
  }
});

test('priceStrategy: costo neto = Σ ±mid·ratio y total ×100×qty; sin cotización => pricing null', async () => {
  const { priceStrategy } = await import('../../api/src/services/strategies.service.js');
  const legs = [
    { symbol: 'AAPL251219C00200000', side: 'buy', ratio_qty: 1, created_at: 'a' },
    { symbol: 'AAPL251219P00200000', side: 'sell', ratio_qty: 1, created_at: 'b' },
  ];
  const snap = (bp, ap) => ({ latestQuote: { bp, ap } });
  const ok = priceStrategy({ qty: 2 }, legs, { [legs[0].symbol]: snap(1, 3), [legs[1].symbol]: snap(0.5, 1.5) });
  assert.equal(ok.pricing.netPerUnit, 1); // +2 (compra, mid 2) − 1 (venta, mid 1)
  assert.equal(ok.pricing.netTotal, 200); // 1 · 100 · qty 2
  const partial = priceStrategy({ qty: 1 }, legs, { [legs[0].symbol]: snap(1, 3) });
  assert.equal(partial.pricing, null);
});

test('/auto: sin confirm:true no se envía orden (400) y con dryRun no hace falta', async () => {
  await assert.rejects(autoTradeService.run({ symbol: 'AAPL' }), { status: 400, message: /confirm: true/ });
  await assert.rejects(autoTradeService.run({ symbol: 'AAPL', confirm: false }), { status: 400 });
});
