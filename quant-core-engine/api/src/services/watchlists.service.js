// API 1 — Watchlists. Fuente de verdad: Alpaca. Supabase guarda el espejo.
import { alpaca } from '../lib/alpaca.js';
import { db, q } from '../lib/supabase.js';
import { check } from '../lib/errors.js';

const toRow = (w) => ({
  alpaca_id: w.id,
  name: w.name,
  symbols: (w.assets ?? []).map((a) => a.symbol),
});

const toDto = (w) => ({
  id: w.id,
  name: w.name,
  symbols: (w.assets ?? []).map((a) => a.symbol),
  createdAt: w.created_at,
  updatedAt: w.updated_at,
});

async function mirror(watchlists) {
  if (!watchlists.length) return;
  await q(db().from('watchlists').upsert(watchlists.map(toRow), { onConflict: 'alpaca_id' }));
}

const normSymbols = (symbols = []) => [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];

export const watchlistsService = {
  async list() {
    // El listado de Alpaca no trae los assets; se pide el detalle de cada una.
    const summaries = await alpaca.listWatchlists();
    const full = await Promise.all(summaries.map((w) => alpaca.getWatchlist(w.id)));
    await mirror(full);
    return full.map(toDto);
  },

  async get(id) {
    const w = await alpaca.getWatchlist(id);
    await mirror([w]);
    return toDto(w);
  },

  async create(body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { type: 'array' } });
    const w = await alpaca.createWatchlist({ name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([w]);
    return toDto(w);
  },

  /** PUT: reemplaza nombre y la lista completa de símbolos. */
  async update(id, body) {
    check(body, { name: { required: true, type: 'string' }, symbols: { required: true, type: 'array' } });
    const w = await alpaca.updateWatchlist(id, { name: body.name.trim(), symbols: normSymbols(body.symbols) });
    await mirror([w]);
    return toDto(w);
  },

  async remove(id) {
    await alpaca.deleteWatchlist(id);
    await q(db().from('watchlists').delete().eq('alpaca_id', id));
  },

  async addSymbol(id, body) {
    check(body, { symbol: { required: true, type: 'string' } });
    const w = await alpaca.addToWatchlist(id, body.symbol.trim().toUpperCase());
    await mirror([w]);
    return toDto(w);
  },

  async removeSymbol(id, symbol) {
    const w = await alpaca.removeFromWatchlist(id, symbol.toUpperCase());
    await mirror([w]);
    return toDto(w);
  },
};
