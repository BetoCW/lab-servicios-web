import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { HttpError } from './errors.js';

let client;

/**
 * Obtiene o inicializa la instancia singleton del cliente Supabase con privilegios administrativos.
 * @returns {import('@supabase/supabase-js').SupabaseClient} Cliente de Supabase conectado.
 * @throws {HttpError} Si faltan las variables de entorno de conexión.
 */
export function db() {
  if (!config.supabase.url || !config.supabase.secretKey) {
    throw new HttpError(503, 'Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en el .env');
  }
  client ??= createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Desenvuelve { data, error } retornado por supabase-js y convierte el error en HttpError (500).
 * @param {Promise<{ data: any, error: any }>} queryPromise
 * @returns {Promise<any>}
 */
export async function unwrapQuery(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw new HttpError(500, `Supabase: ${error.message}`, { code: error.code, hint: error.hint });
  return data;
}

// Alias retrocompatible para servicios y pruebas existentes
export const q = unwrapQuery;
