import { alpaca } from '../lib/alpaca.js';
import { HttpError } from '../lib/errors.js';

// Política de la app: los nuevos envíos de estrategias se habilitan durante la
// sesión regular del reloj de Alpaca. No se encolan órdenes fuera de esa sesión.
// Se consulta sin caché en cada intento, incluidos los envíos automáticos.
export const marketSession = {
  async assertOpen() {
    let clock;
    try {
      clock = await alpaca.clock();
      if (typeof clock?.is_open !== 'boolean' || !Number.isFinite(Date.parse(clock.next_open))) throw new Error('Invalid clock');
    } catch {
      throw new HttpError(503, 'No se pudo verificar el horario de mercado en Alpaca. No se envió la orden; intenta nuevamente.');
    }
    if (!clock.is_open) {
      throw new HttpError(409, 'La sesión regular del mercado está cerrada. No se envió la orden.', {
        code: 'MARKET_CLOSED', nextOpen: new Date(clock.next_open).toISOString(),
        session: 'regular',
      });
    }
    return clock;
  },
};
