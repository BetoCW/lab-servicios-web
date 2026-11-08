/**
 * ============================================================================
 *  services/assets.service.js — Buscador de tickers (símbolos y subyacentes)
 * ============================================================================
 *  PARA QUÉ SIRVE
 *    Quien no conoce el mercado no se sabe los tickers. Este servicio deja escribir
 *    "apple", "tesla" o "AA" y devuelve AAPL, TSLA, etc., con el nombre de la empresa,
 *    la bolsa y si tiene opciones listadas (lo necesario para armar estrategias).
 *
 *  DE DÓNDE SALEN LOS DATOS
 *    GET /v2/assets de Alpaca: ~14 000 acciones y ETFs negociables de EE. UU. Se descarga
 *    una vez y se guarda 6 horas en memoria; cada búsqueda es instantánea y no gasta
 *    peticiones del límite de Alpaca (200 por minuto).
 *
 *  CÓMO SE ORDENAN LOS RESULTADOS (de mejor a peor coincidencia)
 *    0. El ticker es exactamente lo escrito          (escribes "AAPL"  → AAPL primero)
 *    1. El ticker empieza con lo escrito             ("AA" → AAL, AAPL...)
 *    2. Una palabra del nombre empieza con lo escrito ("apple" → Apple Inc.)
 *    3. El nombre contiene lo escrito                 ("pple" → Apple Inc.)
 *    Dentro del mismo nivel van primero los que tienen opciones y luego los de ticker más corto.
 * ============================================================================
 */
import { alpaca } from '../lib/alpaca.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
/** Lista inicial cuando el campo está vacío: los subyacentes más comunes para empezar. */
const POPULAR = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'NFLX', 'IWM'];

let cache = null;

/** Quita acentos y pasa a minúsculas para comparar sin importar cómo se escriba. */
const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Descarga (o reutiliza del caché) la lista de activos negociables.
 * @returns {Promise<Array<{symbol: string, name: string, exchange: string, hasOptions: boolean, _name: string}>>}
 */
async function loadAssets() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.list;
  const raw = await alpaca.assets({ status: 'active', asset_class: 'us_equity' });
  const list = raw
    .filter((asset) => asset.tradable)
    .map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      hasOptions: (asset.attributes ?? []).includes('has_options'),
      _name: normalize(asset.name),
    }));
  cache = { at: Date.now(), list };
  return list;
}

/**
 * Nivel de coincidencia de un activo con el texto buscado (0 = mejor, null = no coincide).
 * @param {{symbol: string, _name: string}} asset - Activo con el nombre ya normalizado.
 * @param {string} query - Texto buscado, normalizado.
 * @returns {number|null}
 */
function matchLevel(asset, query) {
  const symbol = asset.symbol.toLowerCase();
  if (symbol === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (asset._name.split(/[\s.,&()-]+/).some((word) => word.startsWith(query))) return 2;
  if (asset._name.includes(query)) return 3;
  return null;
}

/**
 * Filtra y ordena activos por coincidencia con el texto buscado (función pura, probada aparte).
 *
 * @param {Array<object>} list - Activos cargados.
 * @param {string} rawQuery - Texto escrito por la persona (ticker o parte del nombre).
 * @param {{limit?: number, optionsOnly?: boolean}} [options] - Máximo de resultados y si solo se quieren los que tienen opciones.
 * @returns {Array<{symbol: string, name: string, exchange: string, hasOptions: boolean}>}
 */
export function rankAssets(list, rawQuery, { limit = DEFAULT_LIMIT, optionsOnly = false } = {}) {
  const query = normalize(rawQuery);
  const pool = optionsOnly ? list.filter((asset) => asset.hasOptions) : list;
  let results;
  if (!query) {
    results = POPULAR.map((symbol) => pool.find((asset) => asset.symbol === symbol)).filter(Boolean);
  } else {
    results = pool
      .map((asset) => ({ asset, level: matchLevel(asset, query) }))
      .filter((entry) => entry.level !== null)
      .sort(
        (a, b) =>
          a.level - b.level ||
          Number(b.asset.hasOptions) - Number(a.asset.hasOptions) ||
          a.asset.symbol.length - b.asset.symbol.length ||
          a.asset.symbol.localeCompare(b.asset.symbol),
      )
      .map((entry) => entry.asset);
  }
  return results.slice(0, limit).map(({ symbol, name, exchange, hasOptions }) => ({ symbol, name, exchange, hasOptions }));
}

export const assetsService = {
  /**
   * Busca tickers por símbolo o por nombre de la empresa.
   *
   * @param {{q?: string, limit?: string|number, optionsOnly?: string}} [query={}] - Parámetros de la URL.
   * @returns {Promise<{ query: string, total: number, results: Array<object> }>} Resultados ordenados; `total` = activos disponibles.
   */
  async search(query = {}) {
    const list = await loadAssets();
    const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const optionsOnly = query.optionsOnly === 'true' || query.optionsOnly === '1';
    return { query: String(query.q ?? ''), total: list.length, results: rankAssets(list, query.q, { limit, optionsOnly }) };
  },
};
