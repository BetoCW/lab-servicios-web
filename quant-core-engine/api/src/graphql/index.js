// GraphQL sobre los mismos 4 servicios que REST: un solo lugar con la lógica.
import { createSchema, createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { watchlistsService as watchlists } from '../services/watchlists.service.js';
import { ordersService as orders } from '../services/orders.service.js';
import { optionChainsService as chains } from '../services/optionChains.service.js';
import { strategiesService as strategies } from '../services/strategies.service.js';
import { riskService } from '../services/risk.service.js';

const typeDefs = /* GraphQL */ `
  type Watchlist { id: ID! name: String! symbols: [String!]! createdAt: String updatedAt: String }

  type OrderLeg { symbol: String side: String ratioQty: Float status: String }
  type Order {
    id: ID! clientOrderId: String symbol: String assetClass: String orderClass: String
    side: String type: String timeInForce: String qty: Float filledQty: Float
    limitPrice: Float stopPrice: Float filledAvgPrice: Float status: String
    legs: [OrderLeg!]! submittedAt: String replaces: ID replaceMode: String
  }
  type CanceledOrder { id: ID! status: Int }

  type OptionQuote {
    symbol: String! type: String! strike: Float! expiration: String! openInterest: Float
    bid: Float ask: Float mid: Float last: Float impliedVolatility: Float
    delta: Float gamma: Float theta: Float vega: Float rho: Float quoteTime: String
  }
  type OptionChain {
    id: ID! underlying: String! expirationFrom: String expirationTo: String optionType: String
    strikeMin: Float strikeMax: Float underlyingPrice: Float contractsCount: Int
    lastRefreshedAt: String createdAt: String updatedAt: String
    quotes(expiration: String, type: String): [OptionQuote!]!
  }

  type LegQuote { bid: Float ask: Float mid: Float iv: Float delta: Float }
  type StrategyLeg {
    id: ID! symbol: String! side: String! ratioQty: Int! positionIntent: String
    root: String expiration: String type: String strike: Float quote: LegQuote
  }
  type StrategyPricing { netPerUnit: Float netTotal: Float }
  type Strategy {
    id: ID! name: String! underlying: String! description: String qty: Int! orderType: String!
    limitPrice: Float status: String! alpacaOrderId: ID legs: [StrategyLeg!]! pricing: StrategyPricing
    createdAt: String updatedAt: String
  }
  type SubmitResult { strategy: Strategy! order: Order! }

  type HistogramBin { from: Float! to: Float! count: Int! }
  type StrategyRisk {
    spot: Float! underlyingVol: Float! horizonDays: Float! paths: Int!
    probProfit: Float! mean: Float! std: Float! var95: Float! cvar95: Float! min: Float! max: Float!
    histogram: [HistogramBin!]! regT: Float! span: Float!
    delta: Float! gamma: Float! vega: Float! theta: Float!
    marketCost: Float modelCost: Float! monteCarloMs: Float!
  }

  input WatchlistInput { name: String! symbols: [String!] }
  input OrderInput {
    symbol: String! qty: Float! side: String! type: String! time_in_force: String!
    limit_price: Float stop_price: Float position_intent: String client_order_id: String
  }
  input ReplaceOrderInput { qty: Float limit_price: Float stop_price: Float time_in_force: String }
  input OptionChainInput {
    underlying: String! expiration_from: String expiration_to: String option_type: String
    strike_min: Float strike_max: Float
  }
  input StrategyLegInput { symbol: String! side: String! ratio_qty: Int position_intent: String }
  input StrategyInput {
    name: String! underlying: String! description: String qty: Int order_type: String
    limit_price: Float legs: [StrategyLegInput!]!
  }

  type Query {
    watchlists: [Watchlist!]!
    watchlist(id: ID!): Watchlist
    orders(status: String, limit: Int, symbols: String): [Order!]!
    order(id: ID!): Order
    optionChains(underlying: String): [OptionChain!]!
    optionChain(id: ID!): OptionChain
    strategies(status: String, underlying: String): [Strategy!]!
    strategy(id: ID!): Strategy
    strategyRisk(id: ID!, paths: Int, seed: Int): StrategyRisk
  }

  type Mutation {
    createWatchlist(input: WatchlistInput!): Watchlist!
    updateWatchlist(id: ID!, input: WatchlistInput!): Watchlist!
    deleteWatchlist(id: ID!): Boolean!
    addWatchlistSymbol(id: ID!, symbol: String!): Watchlist!
    removeWatchlistSymbol(id: ID!, symbol: String!): Watchlist!

    createOrder(input: OrderInput!): Order!
    replaceOrder(id: ID!, input: ReplaceOrderInput!): Order!
    cancelOrder(id: ID!): Order!
    cancelAllOrders: [CanceledOrder!]!

    createOptionChain(input: OptionChainInput!): OptionChain!
    updateOptionChain(id: ID!, input: OptionChainInput!): OptionChain!
    refreshOptionChain(id: ID!): OptionChain!
    deleteOptionChain(id: ID!): Boolean!

    createStrategy(input: StrategyInput!): Strategy!
    updateStrategy(id: ID!, input: StrategyInput!): Strategy!
    deleteStrategy(id: ID!): Boolean!
    submitStrategy(id: ID!): SubmitResult!
  }
`;

// Los errores HTTP de los servicios salen como errores GraphQL con su código.
const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    throw new GraphQLError(err.message, { extensions: { status: err.status ?? 500, details: err.details } });
  }
};
const done = (fn) => wrap(async (...a) => (await fn(...a), true));

const resolvers = {
  Query: {
    watchlists: wrap(() => watchlists.list()),
    watchlist: wrap((_, { id }) => watchlists.get(id)),
    orders: wrap((_, args) => orders.list(args)),
    order: wrap((_, { id }) => orders.get(id)),
    optionChains: wrap((_, args) => chains.list(args)),
    optionChain: wrap((_, { id }) => chains.get(id)),
    strategies: wrap((_, args) => strategies.list(args)),
    strategy: wrap((_, { id }) => strategies.get(id)),
    strategyRisk: wrap(async (_, { id, paths, seed }) => {
      const r = await riskService.analyze(id, { paths, seed });
      return {
        ...r.inputs, ...r.monteCarlo, ...r.margin, ...r.greeks,
        marketCost: r.cost.market, modelCost: r.cost.model, monteCarloMs: r.performance.monteCarloMs,
      };
    }),
  },
  Mutation: {
    createWatchlist: wrap((_, { input }) => watchlists.create(input)),
    updateWatchlist: wrap((_, { id, input }) => watchlists.update(id, { symbols: [], ...input })),
    deleteWatchlist: done((_, { id }) => watchlists.remove(id)),
    addWatchlistSymbol: wrap((_, { id, symbol }) => watchlists.addSymbol(id, { symbol })),
    removeWatchlistSymbol: wrap((_, { id, symbol }) => watchlists.removeSymbol(id, symbol)),

    createOrder: wrap((_, { input }) => orders.create(input)),
    replaceOrder: wrap((_, { id, input }) => orders.replace(id, input)),
    cancelOrder: wrap((_, { id }) => orders.cancel(id)),
    cancelAllOrders: wrap(() => orders.cancelAll()),

    createOptionChain: wrap((_, { input }) => chains.create(input)),
    updateOptionChain: wrap((_, { id, input }) => chains.update(id, input)),
    refreshOptionChain: wrap((_, { id }) => chains.refresh(id)),
    deleteOptionChain: done((_, { id }) => chains.remove(id)),

    createStrategy: wrap((_, { input }) => strategies.create(input)),
    updateStrategy: wrap((_, { id, input }) => strategies.update(id, input)),
    deleteStrategy: done((_, { id }) => strategies.remove(id)),
    submitStrategy: wrap((_, { id }) => strategies.submit(id)),
  },
  OptionChain: {
    // Si el padre ya trae quotes (optionChain) se filtran ahí; si no, se piden.
    quotes: wrap(async (parent, { expiration, type }) => {
      const all = parent.quotes ?? (await chains.get(parent.id)).quotes;
      return all.filter((qt) => (!expiration || qt.expiration === expiration) && (!type || qt.type === type));
    }),
  },
};

export const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: '/graphql',
  maskedErrors: false,
  landingPage: false,
});
