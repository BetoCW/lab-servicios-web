import 'dotenv/config';

const env = process.env;

/**
 * Normaliza la URL base de un servicio externo eliminando barras finales y sufijos de versión redundantes (/v2).
 * @param {string} url - URL original configurada en el entorno.
 * @returns {string} URL base saneada.
 */
const baseUrl = (url) => url.replace(/\/+$/, '').replace(/\/v\d+(beta\d+)?$/, '');

export const config = {
  host: env.HOST ?? 'localhost',
  port: Number(env.PORT ?? 3060),
  apiUrl: env.API_URL ?? '/api/v1',

  alpaca: {
    keyId: env.ALPACA_KEY_ID ?? '',
    secretKey: env.ALPACA_SECRET_KEY ?? '',
    // Paper trading por defecto: nunca se mueve dinero real.
    tradingUrl: baseUrl(env.ALPACA_TRADING_URL || 'https://paper-api.alpaca.markets'),
    dataUrl: baseUrl(env.ALPACA_DATA_URL || 'https://data.alpaca.markets'),
    // indicative = gratis (retrasado), opra = tiempo real (requiere suscripción)
    optionsFeed: env.ALPACA_OPTIONS_FEED ?? 'indicative',
    stocksFeed: env.ALPACA_STOCKS_FEED ?? 'iex',
  },

  // Microservicios (npm run dev / docker compose): a dónde reenvía el gateway.
  services: {
    watchlists: env.WATCHLISTS_URL ?? 'http://localhost:3061',
    orders: env.ORDERS_URL ?? 'http://localhost:3062',
    'option-chains': env.OPTION_CHAINS_URL ?? 'http://localhost:3063',
    strategies: env.STRATEGIES_URL ?? 'http://localhost:3064',
  },

  supabase: {
    url: env.SUPABASE_URL ?? '',
    // Llave secreta (sb_secret_...) o service_role: solo vive en el servidor.
    secretKey: env.SUPABASE_SECRET_KEY ?? '',
  },
};

/**
 * Evalúa y recopila los nombres de variables de entorno requeridas que están ausentes o vacías.
 * @returns {string[]} Lista de variables faltantes para la operación completa.
 */
export const missingConfig = () =>
  [
    ['ALPACA_KEY_ID', config.alpaca.keyId],
    ['ALPACA_SECRET_KEY', config.alpaca.secretKey],
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SECRET_KEY', config.supabase.secretKey],
  ]
    .filter(([, envValue]) => !envValue)
    .map(([configKey]) => configKey);
