// Validación única de tickers (antes copiada en market y recommend). Acepta AAPL, BRK.B; rechaza el resto.
import { badRequest } from './errors.js';

const TICKER = /^[A-Z][A-Z.]{0,9}$/;

/**
 * Normaliza a mayúsculas y valida un ticker.
 * @param {unknown} raw - Valor recibido en la URL o el cuerpo.
 * @returns {string} Ticker en mayúsculas.
 * @throws {import('./errors.js').HttpError} 400 si no es un ticker válido.
 */
export function normalizeSymbol(raw) {
  const symbol = String(raw ?? '').trim().toUpperCase();
  if (!TICKER.test(symbol)) throw badRequest('symbol debe ser un ticker válido (ej. AAPL)');
  return symbol;
}
