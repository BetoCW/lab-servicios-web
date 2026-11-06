// API 1 — Watchlists. Fuente de verdad: Alpaca. Supabase guarda el espejo sincronizado.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check } from '../lib/errors.js';

const toRow = (watchlist) => ({
  alpaca_id: watchlist.id,
  name: watchlist.name,
  symbols: (watchlist.assets ?? []).map((asset) => asset.symbol),
});

const toDto = (watchlist) => ({
  id: watchlist.id,
  name: watchlist.name,
  symbols: (watchlist.assets ?? []).map((asset) => asset.symbol),
  createdAt: watchlist.created_at,
  updatedAt: watchlist.updated_at,
});

/** Sincroniza las listas de seguimiento recibidas de Alpaca hacia la tabla espejo en Supabase. */
async function mirror(watchlists) {
  if (!watchlists.length) return;
  await q(db().from('watchlists').upsert(watchlists.map(toRow), { onConflict: 'alpaca_id' }));
}

const normSymbols = (symbols = []) => [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];

export const watchlistsService = {
  async list() {
    // El listado de Alpaca no trae los assets; se pide el detalle de cada una.
    const summaries = await alpaca.listWatchlists();
    const full = await Promise.all(summaries.map((summary) => alpaca.getWatchlist(summary.id)));
    await mirror(full);
    return full.map(toDto);
  },

  async get(id) {
    const watchlist = await alpaca.getWatchlist(id);
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  async create(body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { type: 'array' } });
    const watchlist = await alpaca.createWatchlist({ name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  /** PUT: reemplaza nombre y la lista completa de símbolos. */
  async update(id, body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { required: true, type: 'array' } });
    const watchlist = await alpaca.updateWatchlist(id, { name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  async remove(id) {
    await alpaca.deleteWatchlist(id);
    await q(db().from('watchlists').delete().eq('alpaca_id', id));
  },

  async addSymbol(id, body) {
    check(body, { symbol: { required: true, type: 'string' } });
    const watchlist = await alpaca.addToWatchlist(id, body.symbol.trim().toUpperCase());
    await mirror([watchlist]);
    return toDto(watchlist);
  },

  async removeSymbol(id, symbol) {
    const watchlist = await alpaca.removeFromWatchlist(id, symbol.toUpperCase());
    await mirror([watchlist]);
    return toDto(watchlist);
  },
};
