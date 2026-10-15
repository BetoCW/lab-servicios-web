import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { HttpError } from './errors.js';

let client;

export function db() {
  if (!config.supabase.url || !config.supabase.secretKey) {
    throw new HttpError(503, 'Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en el .env');
  }
  client ??= createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Desenvuelve { data, error } de supabase-js y convierte el error en HttpError. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new HttpError(500, `Supabase: ${error.message}`, { code: error.code, hint: error.hint });
  return data;
}
