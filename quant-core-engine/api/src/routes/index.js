import { Router } from 'express';
import { watchlistsService as watchlists } from '../services/watchlists.service.js';
import { ordersService as orders } from '../services/orders.service.js';
import { optionChainsService as chains } from '../services/optionChains.service.js';
import { strategiesService as strategies } from '../services/strategies.service.js';
import { riskService } from '../services/risk.service.js';
import { assertUuid } from '../lib/errors.js';
import { alpaca } from '../lib/alpaca.js';

const uuid = (req, _res, next) => {
  assertUuid(req.params.id);
  next();
};

// ---------------------------------------------------------------- 1. watchlists
const w = Router();
w.get('/', async (_req, res) => res.json(await watchlists.list()));
w.post('/', async (req, res) => res.status(201).json(await watchlists.create(req.body)));
w.get('/:id', uuid, async (req, res) => res.json(await watchlists.get(req.params.id)));
w.put('/:id', uuid, async (req, res) => res.json(await watchlists.update(req.params.id, req.body)));
w.delete('/:id', uuid, async (req, res) => {
  await watchlists.remove(req.params.id);
  res.status(204).end();
});
w.post('/:id/symbols', uuid, async (req, res) => res.status(201).json(await watchlists.addSymbol(req.params.id, req.body)));
w.delete('/:id/symbols/:symbol', uuid, async (req, res) => res.json(await watchlists.removeSymbol(req.params.id, req.params.symbol)));

// ---------------------------------------------------------------- 2. orders
const o = Router();
o.get('/', async (req, res) => res.json(await orders.list(req.query)));
o.post('/', async (req, res) => res.status(201).json(await orders.create(req.body)));
o.delete('/', async (_req, res) => res.status(207).json(await orders.cancelAll()));
o.get('/:id', uuid, async (req, res) => res.json(await orders.get(req.params.id)));
o.patch('/:id', uuid, async (req, res) => res.json(await orders.replace(req.params.id, req.body)));
o.delete('/:id', uuid, async (req, res) => res.json(await orders.cancel(req.params.id)));

// ---------------------------------------------------------------- 3. option-chains
const c = Router();
c.get('/', async (req, res) => res.json(await chains.list(req.query)));
c.post('/', async (req, res) => res.status(201).json(await chains.create(req.body)));
c.get('/:id', uuid, async (req, res) => res.json(await chains.get(req.params.id, req.query)));
c.put('/:id', uuid, async (req, res) => res.json(await chains.update(req.params.id, req.body)));
c.post('/:id/refresh', uuid, async (req, res) => res.json(await chains.refresh(req.params.id)));
c.delete('/:id', uuid, async (req, res) => {
  await chains.remove(req.params.id);
  res.status(204).end();
});

// ---------------------------------------------------------------- 4. strategies
const s = Router();
s.get('/', async (req, res) => res.json(await strategies.list(req.query)));
s.post('/', async (req, res) => res.status(201).json(await strategies.create(req.body)));
s.get('/:id', uuid, async (req, res) => res.json(await strategies.get(req.params.id)));
s.put('/:id', uuid, async (req, res) => res.json(await strategies.update(req.params.id, req.body)));
s.delete('/:id', uuid, async (req, res) => {
  await strategies.remove(req.params.id);
  res.status(204).end();
});
s.get('/:id/risk', uuid, async (req, res) => res.json(await riskService.analyze(req.params.id, req.query)));
s.post('/:id/submit', uuid, async (req, res) => res.status(201).json(await strategies.submit(req.params.id)));

// ---------------------------------------------------------------- raíz
export const api = Router();
api.get('/account', async (_req, res) => {
  const a = await alpaca.account();
  res.json({ id: a.id, status: a.status, currency: a.currency, cash: a.cash, buyingPower: a.buying_power, optionsLevel: a.options_trading_level });
});
api.use('/watchlists', w);
api.use('/orders', o);
api.use('/option-chains', c);
api.use('/strategies', s);
