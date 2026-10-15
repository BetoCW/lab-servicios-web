import 'dotenv/config';

const env = process.env;

// El dashboard de Alpaca muestra el endpoint con /v2 al final; las rutas ya lo incluyen.
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

  supabase: {
    url: env.SUPABASE_URL ?? '',
    // Llave secreta (sb_secret_...) o service_role: solo vive en el servidor.
    secretKey: env.SUPABASE_SECRET_KEY ?? '',
  },
};

export const missingConfig = () =>
  [
    ['ALPACA_KEY_ID', config.alpaca.keyId],
    ['ALPACA_SECRET_KEY', config.alpaca.secretKey],
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SECRET_KEY', config.supabase.secretKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
