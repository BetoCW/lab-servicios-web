/**
 * ============================================================================
 *  services/scan.service.js — Explorar oportunidades en varias empresas
 * ============================================================================
 *  QUÉ HACE
 *    - scan:   "en los próximos N días, ¿qué operaciones hay?" → corre el recomendador
 *              en cada empresa de un universo y junta TODAS las estrategias evaluadas en
 *              un solo ranking empresa + estrategia.
 *    - screen: "te doy una estrategia, dime las 10 mejores empresas" → mismo recorrido,
 *              pero forzando esa plantilla en cada empresa y ordenando por su puntaje.
 *
 *  UNIVERSO
 *    liquid     = lista fija de tickers con opciones líquidas (LIQUID_UNIVERSE).
 *    watchlists = símbolos únicos de las watchlists guardadas.
 *
 *  COSTO (Alpaca limita a 200 req/min)
 *    ~4 llamadas por empresa; se recorren máximo CONCURRENCY empresas a la vez, con menos
 *    trayectorias de Monte Carlo (SCAN_PATHS) y el resultado se guarda 10 min en la ruta.
 *    Una empresa que falla (sin opciones, error de Alpaca) va a `skipped` y no tumba el resto.
 * ============================================================================
 */
import '../../../web/templates.js';
import { badRequest } from '../lib/errors.js';
import { parseCores } from '../lib/cores.js';
import { recommendService } from './recommend.service.js';
import { watchlistsService } from './watchlists.service.js';

const { TEMPLATES } = globalThis.F0Templates;

export const LIQUID_UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'AMZN', 'META', 'GOOGL', 'TSLA',
  'NFLX', 'AVGO', 'JPM', 'BAC', 'XOM', 'CVX', 'KO', 'PFE', 'DIS', 'INTC', 'WMT', 'COST',
];
export const UNIVERSES = ['liquid', 'watchlists'];
const CONCURRENCY = 4;
const SCAN_PATHS = 4000;
const MAX_SYMBOLS = 40;

const round = (value, decimals = 2) => (Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null);

/**
 * Valida y normaliza los parámetros comunes de scan y screen.
 * @param {object} query - Query string (horizonDays, universe, limit, cores).
 * @param {number} defaultLimit - Límite por defecto (20 scan, 10 screen).
 * @returns {{horizonDays: number, universe: string, limit: number, cores: string[]}}
 * @throws {import('../lib/errors.js').HttpError} 400 si algún parámetro está fuera de rango.
 */
export function parseScanQuery(query = {}, defaultLimit = 20) {
  const horizonDays = Number(query.horizonDays ?? 90);
  if (!Number.isInteger(horizonDays) || horizonDays < 30 || horizonDays > 120) throw badRequest('horizonDays debe ser un entero entre 30 y 120');
  const universe = String(query.universe ?? 'liquid');
  if (!UNIVERSES.includes(universe)) throw badRequest(`universe debe ser uno de: ${UNIVERSES.join(', ')}`);
  const limit = Number(query.limit ?? defaultLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw badRequest('limit debe ser un entero entre 1 y 50');
  return { horizonDays, universe, limit, cores: parseCores(query.cores) };
}

/**
 * Corre `worker` sobre cada elemento con como máximo `size` promesas a la vez.
 * @template T, R
 * @param {T[]} items - Elementos a procesar.
 * @param {number} size - Concurrencia máxima.
 * @param {(item: T) => Promise<R>} worker - Tarea por elemento.
 * @returns {Promise<R[]>} Resultados en el mismo orden que `items`.
 */
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return results;
}

/**
 * Convierte una fila del ranking del recomendador en una fila del scan.
 * @param {object} rec - Respuesta de recommendService.recommend.
 * @param {object} entry - Fila de su ranking.
 * @returns {object} Fila compacta empresa + estrategia.
 */
const toRow = (rec, entry) => ({
  symbol: rec.symbol,
  template: entry.template,
  name: entry.name,
  score: entry.score,
  news: rec.news ? { ...rec.news, fit: entry.news?.score, reason: entry.news?.reason } : null,
  actionable: entry.metrics.expectedValue > 0,
  probProfit: round(entry.metrics.probProfit, 4),
  expectedValue: round(entry.metrics.expectedValue),
  var95: round(entry.metrics.var95),
  netCost: round(entry.metrics.netCost),
  spot: rec.signals.spot,
  ivPct: rec.signals.ivPct,
  hv30Pct: rec.signals.hv30Pct,
  nearExpiration: rec.signals.nearExpiration,
  farExpiration: rec.signals.farExpiration,
  legs: entry.legs.map((leg) => ({ symbol: leg.symbol, side: leg.side, ratio_qty: leg.ratio_qty })),
});

/**
 * Crea el servicio con dependencias inyectables (las pruebas pasan un recomendador simulado).
 * @param {{recommend: Function, listWatchlists: Function}} deps - Recomendador y lector de watchlists.
 * @returns {{scan: Function, screen: Function}} Servicio de exploración.
 */
export function createScanService({ recommend, listWatchlists }) {
  async function symbolsOf(universe) {
    if (universe === 'liquid') return LIQUID_UNIVERSE;
    const lists = await listWatchlists();
    const symbols = [...new Set(lists.flatMap((list) => list.symbols ?? []))].slice(0, MAX_SYMBOLS);
    if (!symbols.length) throw badRequest('Tus watchlists no tienen símbolos; agrega alguno o usa universe=liquid');
    return symbols;
  }

  async function sweep({ horizonDays, universe, cores }, templates) {
    const symbols = await symbolsOf(universe);
    const skipped = [];
    const recs = await pool(symbols, CONCURRENCY, async (symbol) => {
      try {
        return await recommend(symbol, { paths: SCAN_PATHS, cores, horizonDays, templates });
      } catch (error) {
        skipped.push({ symbol, reason: error.message });
        return null;
      }
    });
    const rows = recs.filter(Boolean).flatMap((rec) => rec.ranking.filter((entry) => !entry.error && entry.metrics).map((entry) => toRow(rec, entry)));
    return { symbols, rows: rows.sort((a, b) => b.score - a.score), skipped };
  }

  return {
    /**
     * Ranking único empresa + estrategia en el universo, con vencimientos de hasta horizonDays.
     * @param {object} query - horizonDays (30–120, 90), universe (liquid|watchlists), limit (1–50, 20), cores.
     * @returns {Promise<object>} { generatedAt, horizonDays, universe, cores, scanned, rows, skipped }.
     */
    async scan(query = {}) {
      const params = parseScanQuery(query, 20);
      const { symbols, rows, skipped } = await sweep(params);
      return { generatedAt: new Date().toISOString(), ...params, scanned: symbols.length, rows: rows.slice(0, params.limit), skipped };
    },

    /**
     * Las mejores empresas para UNA plantilla (la plantilla se fuerza aunque el core técnico no la elegiría).
     * @param {object} query - template (obligatoria) + los mismos parámetros que scan (limit por defecto 10).
     * @returns {Promise<object>} Igual que scan, con `template` y una fila por empresa.
     */
    async screen(query = {}) {
      const template = String(query.template ?? '');
      if (!TEMPLATES[template]) throw badRequest(`template debe ser una de: ${Object.keys(TEMPLATES).join(', ')}`);
      const params = parseScanQuery(query, 10);
      const { symbols, rows, skipped } = await sweep(params, [template]);
      const best = rows.filter((row) => row.template === template);
      return { generatedAt: new Date().toISOString(), template, name: TEMPLATES[template], ...params, scanned: symbols.length, rows: best.slice(0, params.limit), skipped };
    },
  };
}

export const scanService = createScanService({
  recommend: (symbol, query) => recommendService.recommend(symbol, query),
  listWatchlists: () => watchlistsService.list(),
});
