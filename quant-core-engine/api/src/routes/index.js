import { Router } from 'express';
import { watchlistsService as watchlists } from '../services/watchlists.service.js';
import { ordersService as orders } from '../services/orders.service.js';
import { optionChainsService as chains } from '../services/optionChains.service.js';
import { strategiesService as strategies } from '../services/strategies.service.js';
import { riskService } from '../services/risk.service.js';
import { marketService } from '../services/market.service.js';
import { assertUuid } from '../lib/errors.js';
import { alpaca } from '../lib/alpaca.js';

const uuid = (req, _res, next) => {
  assertUuid(req.params.id);
  next();
};

// ---------------------------------------------------------------- 1. watchlists
const watchlistsRouter = Router();
watchlistsRouter.get('/', async (_req, res) => res.json(await watchlists.list()));
watchlistsRouter.post('/', async (req, res) => res.status(201).json(await watchlists.create(req.body)));
watchlistsRouter.get('/:id', uuid, async (req, res) => res.json(await watchlists.get(req.params.id)));
watchlistsRouter.put('/:id', uuid, async (req, res) => res.json(await watchlists.update(req.params.id, req.body)));
watchlistsRouter.delete('/:id', uuid, async (req, res) => {
  await watchlists.remove(req.params.id);
  res.status(204).end();
});
watchlistsRouter.post('/:id/symbols', uuid, async (req, res) => res.status(201).json(await watchlists.addSymbol(req.params.id, req.body)));
watchlistsRouter.delete('/:id/symbols/:symbol', uuid, async (req, res) => res.json(await watchlists.removeSymbol(req.params.id, req.params.symbol)));

// ---------------------------------------------------------------- 2. orders
const ordersRouter = Router();
ordersRouter.get('/', async (req, res) => res.json(await orders.list(req.query)));
ordersRouter.post('/', async (req, res) => res.status(201).json(await orders.create(req.body)));
ordersRouter.delete('/', async (_req, res) => res.status(207).json(await orders.cancelAll()));
ordersRouter.get('/:id', uuid, async (req, res) => res.json(await orders.get(req.params.id)));
ordersRouter.patch('/:id', uuid, async (req, res) => res.json(await orders.replace(req.params.id, req.body)));
ordersRouter.delete('/:id', uuid, async (req, res) => res.json(await orders.cancel(req.params.id)));

// ---------------------------------------------------------------- 3. option-chains
const optionChainsRouter = Router();
optionChainsRouter.get('/', async (req, res) => res.json(await chains.list(req.query)));
optionChainsRouter.post('/', async (req, res) => res.status(201).json(await chains.create(req.body)));
optionChainsRouter.get('/:id', uuid, async (req, res) => res.json(await chains.get(req.params.id, req.query)));
optionChainsRouter.put('/:id', uuid, async (req, res) => res.json(await chains.update(req.params.id, req.body)));
optionChainsRouter.post('/:id/refresh', uuid, async (req, res) => res.json(await chains.refresh(req.params.id)));
optionChainsRouter.delete('/:id', uuid, async (req, res) => {
  await chains.remove(req.params.id);
  res.status(204).end();
});

// ---------------------------------------------------------------- 4. strategies
const strategiesRouter = Router();
strategiesRouter.get('/', async (req, res) => res.json(await strategies.list(req.query)));
strategiesRouter.post('/', async (req, res) => res.status(201).json(await strategies.create(req.body)));
strategiesRouter.get('/:id', uuid, async (req, res) => res.json(await strategies.get(req.params.id)));
strategiesRouter.put('/:id', uuid, async (req, res) => res.json(await strategies.update(req.params.id, req.body)));
strategiesRouter.delete('/:id', uuid, async (req, res) => {
  await strategies.remove(req.params.id);
  res.status(204).end();
});
strategiesRouter.get('/:id/risk', uuid, async (req, res) => res.json(await riskService.analyze(req.params.id, req.query)));
strategiesRouter.post('/:id/submit', uuid, async (req, res) => res.status(201).json(await strategies.submit(req.params.id)));

// ---------------------------------------------------------------- datos de mercado (gráfica)
const marketRouter = Router();
marketRouter.get('/:symbol/bars', async (req, res) => res.json(await marketService.bars(req.params.symbol, req.query)));

// ---------------------------------------------------------------- cuenta
const accountRouter = Router();
accountRouter.get('/', async (_req, res) => {
  const acc = await alpaca.account();
  res.json({ id: acc.id, status: acc.status, currency: acc.currency, cash: acc.cash, buyingPower: acc.buying_power, optionsLevel: acc.options_trading_level });
});

// Un router por ruta: cada microservicio monta solo los suyos.
export const routers = {
  account: accountRouter,
  watchlists: watchlistsRouter,
  orders: ordersRouter,
  'option-chains': optionChainsRouter,
  strategies: strategiesRouter,
  market: marketRouter,
};
