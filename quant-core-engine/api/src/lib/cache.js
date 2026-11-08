/**
 * ============================================================================
 *  lib/cache.js — Caché con tiempo de vida + deduplicación de peticiones en vuelo
 * ============================================================================
 *  PARA QUÉ SIRVE
 *    Alpaca limita a 200 peticiones por minuto. Una sola pantalla pide cotización, velas,
 *    indicadores y vencimientos; varias pestañas o un doble clic multiplicarían esas llamadas.
 *    `memo` resuelve dos cosas con 20 líneas:
 *      1. TTL: si ya se pidió hace menos de `ttlMs`, se devuelve lo guardado (0 peticiones).
 *      2. En vuelo: si dos clientes piden lo mismo al mismo tiempo, comparten UNA sola promesa
 *         (evita la "estampida" cuando el caché aún está vacío).
 *    Los errores NO se guardan: el siguiente intento vuelve a preguntar a Alpaca.
 *
 *  FÓRMULA DEL AHORRO (para exponer)
 *    llamadas/min = (60 000 / ttlMs) por clave activa, sin importar cuántos clientes pregunten.
 *    Ej.: cotización con TTL 2 s y 1 ticker → máximo 30 llamadas/min aunque haya 10 pestañas.
 *
 *  LÍMITE: memoria de un solo proceso (cada microservicio tiene su propio caché);
 *  si se escala a varias réplicas, migrar a Redis.
 * ============================================================================
 */
const MAX_ENTRIES = 500; // tope para que un atacante no llene la memoria con claves distintas

/**
 * Envuelve una función asíncrona con caché TTL y deduplicación de llamadas simultáneas.
 *
 * @param {number} ttlMs - Milisegundos que un resultado se considera fresco.
 * @param {(...args:any[]) => Promise<any>} fn - Función costosa (normalmente una llamada a Alpaca).
 * @param {(...args:any[]) => string} [keyOf] - Cómo construir la clave; por defecto une los argumentos.
 * @returns {(...args:any[]) => Promise<any>} Misma función, con caché.
 */
export function memo(ttlMs, fn, keyOf = (...args) => args.map((arg) => JSON.stringify(arg)).join('|')) {
  const entries = new Map(); // clave -> { at, promise }
  return (...args) => {
    const key = keyOf(...args);
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
    const promise = Promise.resolve(fn(...args));
    entries.set(key, { at: Date.now(), promise });
    promise.catch(() => entries.get(key)?.promise === promise && entries.delete(key)); // no cachear fallos
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value); // sale la más antigua
    return promise;
  };
}
