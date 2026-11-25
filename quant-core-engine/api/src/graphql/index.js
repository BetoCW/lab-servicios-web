// GraphQL sobre los mismos 4 servicios que REST: un solo lugar con la lógica.
import { createSchema, createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { watchlistsService as watchlists } from '../services/watchlists.service.js';
import { ordersService as orders } from '../services/orders.service.js';
import { optionChainsService as chains } from '../services/optionChains.service.js';
import { strategiesService as strategies } from '../services/strategies.service.js';
import { riskService } from '../services/risk.service.js';
import { recommendService } from '../services/recommend.service.js';
import { scanService } from '../services/scan.service.js';

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

  type RankedStrategy {
    execution: ExecutionEstimate
    news: NewsFit
    rank: Int! name: String! score: Float! probProfit: Float expectedValue: Float
    worstSimulated: Float var95: Float marginRegT: Float error: String
  }
  type ScanLeg { symbol: String! side: String! ratio_qty: Int! }
  type ScanRow {
    execution: ExecutionEstimate
    news: NewsAnalysis
    symbol: String! template: String! name: String! score: Float! actionable: Boolean!
    probProfit: Float expectedValue: Float var95: Float netCost: Float spot: Float ivPct: Float hv30Pct: Float
    nearExpiration: String farExpiration: String legs: [ScanLeg!]!
  }
  type ScanSkip { symbol: String! reason: String! }
  type ScanResult {
    generatedAt: String! horizonDays: Int! universe: String! limit: Int! cores: [String!]! scanned: Int!
    template: String name: String rows: [ScanRow!]! skipped: [ScanSkip!]!
  }
  type NewsArticle { headline: String! url: String source: String! publishedAt: String! sentiment: Float! event: Boolean! }
  type ExecutionLeg {
    symbol: String! side: String! contracts: Int! bid: Float ask: Float bidSize: Float askSize: Float quoteTime: String
    ageSeconds: Float valid: Boolean! fresh: Boolean! sizeKnown: Boolean! sizeEnough: Boolean! mid: Float relativeSpreadPct: Float
    entryPenalty: Float entryDebit: Float issues: [String!]!
  }
  type ExecutionEstimate {
    score: Float! status: String! ready: Boolean! asOf: String! feed: String! qty: Int! maxAgeSeconds: Float! commissionsKnown: Boolean!
    entryPenalty: Float roundTripSpread: Float commissions: Float slippageBps: Float! extraSlippage: Float estimatedCost: Float
    entryDebit: Float expectedAfterCosts: Float warnings: [String!]! legs: [ExecutionLeg!]! method: String!
  }
  type NewsFit { score: Float! reason: String! }
  type NewsAnalysis {
    symbol: String! status: String! asOf: String! lookbackDays: Int! sentiment: Float! eventPressure: Float!
    confidence: Float! articleCount: Int! summary: String! method: String! truncated: Boolean!
    articles: [NewsArticle!]! fit: Float reason: String
  }
  type PriceZone { price: Float! lower: Float! upper: Float! touches: Int! type: String! inZone: Boolean! distancePct: Float! }
  type SupportResistance { basis: String! price: Float lookback: Int! zones: [PriceZone!]! nearestSupport: PriceZone nearestResistance: PriceZone method: String! }
  type Recommendation { symbol: String! cores: [String!]! explanation: String! volView: String! ranking: [RankedStrategy!]! news: NewsAnalysis supportResistance: SupportResistance }

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
    recommendStrategies(symbol: String!, cores: [String!]): Recommendation!
    strategyScan(horizonDays: Int, universe: String, limit: Int, cores: [String!]): ScanResult!
    strategyScreen(template: String!, horizonDays: Int, universe: String, limit: Int, cores: [String!]): ScanResult!
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

// Los errores HTTP de los servicios salen como errores GraphQL con su código de estado.
const wrap = (resolverFn) => async (...args) => {
  try {
    return await resolverFn(...args);
  } catch (err) {
    throw new GraphQLError(err.message, { extensions: { status: err.status ?? 500, details: err.details } });
  }
};

const done = (actionFn) =>
  wrap(async (...args) => {
    await actionFn(...args);
    return true;
  });

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
      const riskAnalysisResult = await riskService.analyze(id, { paths, seed });
      return {
        ...riskAnalysisResult.inputs,
        ...riskAnalysisResult.monteCarlo,
        ...riskAnalysisResult.margin,
        ...riskAnalysisResult.greeks,
        marketCost: riskAnalysisResult.cost.market,
        modelCost: riskAnalysisResult.cost.model,
        monteCarloMs: riskAnalysisResult.performance.monteCarloMs,
      };
    }),
    strategyScan: wrap((_, args) => scanService.scan(args)),
    strategyScreen: wrap((_, args) => scanService.screen(args)),
    recommendStrategies: wrap(async (_, { symbol, cores }) => {
      const recommendation = await recommendService.recommend(symbol, { cores });
      return {
        symbol: recommendation.symbol,
        cores: recommendation.cores,
        news: recommendation.news,
        supportResistance: recommendation.signals.supportResistance,
        explanation: recommendation.explanation,
        volView: recommendation.signals.volView,
        ranking: recommendation.ranking.map((entry) => ({
          rank: entry.rank,
          name: entry.name,
          score: entry.score,
          news: entry.news,
          execution: entry.execution,
          error: entry.error ?? null,
          ...(entry.metrics ?? {}),
        })),
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
      const allQuotes = parent.quotes ?? (await chains.get(parent.id)).quotes;
      return allQuotes.filter((quote) => (!expiration || quote.expiration === expiration) && (!type || quote.type === type));
    }),
  },
};

export const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: '/graphql',
  maskedErrors: false,
  landingPage: false,
});
