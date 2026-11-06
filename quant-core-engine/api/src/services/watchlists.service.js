// Servicio 1 — Listas de seguimiento (Watchlists). Fuente de la verdad: Alpaca. Supabase mantiene el espejo/caché.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check } from '../lib/errors.js';

/**
 * Convierte una entidad de watchlist de Alpaca a fila de base de datos Supabase.
 * @param {object} watchlist - Entidad de watchlist devuelta por Alpaca.
 * @returns {{ alpaca_id: string, name: string, symbols: string[] }}
 */
const toRow = (watchlist) => ({
  alpaca_id: watchlist.id,
  name: watchlist.name,
  symbols: (watchlist.assets ?? []).map((asset) => asset.symbol),
});

/**
 * Transforma una entidad de watchlist de Alpaca en el DTO de respuesta para el cliente.
 * @param {object} watchlist - Entidad de watchlist devuelta por Alpaca.
 * @returns {{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }}
 */
const toDto = (watchlist) => ({
  id: watchlist.id,
  name: watchlist.name,
  symbols: (watchlist.assets ?? []).map((asset) => asset.symbol),
  createdAt: watchlist.created_at,
  updatedAt: watchlist.updated_at,
});

/**
 * Sincroniza las listas de seguimiento de Alpaca en la tabla espejo de Supabase.
 * @param {object[]} watchlists - Arreglo de objetos de watchlist de Alpaca.
 * @returns {Promise<void>}
 */
async function mirror(watchlists) {
  if (!watchlists.length) return;
  await q(db().from('watchlists').upsert(watchlists.map(toRow), { onConflict: 'alpaca_id' }));
}

/**
 * Normaliza un arreglo de símbolos eliminando duplicados y espacios, convirtiendo a mayúsculas.
 * @param {string[]} [symbols=[]] - Símbolos de entrada en bruto.
 * @returns {string[]} Símbolos únicos y normalizados.
 */
const normSymbols = (symbols = []) => [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];

export const watchlistsService = {
  /**
   * Obtiene la lista completa de watchlists con sus activos asociados.
   * @returns {Promise<Array<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>>}
   */
  async list() {
    // La lista resumida de Alpaca no incluye los activos; obtenemos el detalle de cada una.
    const summaries = await alpaca.listWatchlists();
    const full = await Promise.all(summaries.map((summary) => alpaca.getWatchlist(summary.id)));
    await mirror(full);
    return full.map(toDto);
  },

  /**
   * Obtiene una lista de seguimiento por su identificador.
   * @param {string} id - Identificador de la watchlist.
   * @returns {Promise<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>}
   */
  async get(id) {
    const watchlist = await alpaca.getWatchlist(id);
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  /**
   * Crea una nueva lista de seguimiento en Alpaca y la sincroniza en Supabase.
   * @param {{ name: string, symbols?: string[] }} body - Datos de creación de la watchlist.
   * @returns {Promise<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>}
   */
  async create(body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { type: 'array' } });
    const watchlist = await alpaca.createWatchlist({ name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  /**
   * Reemplaza el nombre y la lista de símbolos de una watchlist existente.
   * @param {string} id - Identificador de la watchlist.
   * @param {{ name: string, symbols: string[] }} body - Datos a reemplazar.
   * @returns {Promise<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>}
   */
  async update(id, body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { required: true, type: 'array' } });
    const watchlist = await alpaca.updateWatchlist(id, { name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  /**
   * Elimina una lista de seguimiento en Alpaca y remueve su registro en Supabase.
   * @param {string} id - Identificador de la watchlist.
   * @returns {Promise<void>}
   */
  async remove(id) {
    await alpaca.deleteWatchlist(id);
    await q(db().from('watchlists').delete().eq('alpaca_id', id));
  },

  /**
   * Agrega un símbolo de activo a una lista de seguimiento existente.
   * @param {string} id - Identificador de la watchlist.
   * @param {{ symbol: string }} body - Datos con el símbolo a agregar.
   * @returns {Promise<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>}
   */
  async addSymbol(id, body) {
    check(body, { symbol: { required: true, type: 'string' } });
    const watchlist = await alpaca.addToWatchlist(id, body.symbol.trim().toUpperCase());
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  /**
   * Remueve un símbolo de activo de una lista de seguimiento.
   * @param {string} id - Identificador de la watchlist.
   * @param {string} symbol - Símbolo a remover.
   * @returns {Promise<{ id: string, name: string, symbols: string[], createdAt: string, updatedAt: string }>}
   */
  async removeSymbol(id, symbol) {
    const watchlist = await alpaca.removeFromWatchlist(id, symbol.toUpperCase());
    await mirror([watchlist]);
    return toDto(watchlist);
  },
};
