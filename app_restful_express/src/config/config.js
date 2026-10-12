import dotenv from 'dotenv';

// Carga las variables declaradas en el archivo .env
dotenv.config({ quiet: true });

// Punto unico de configuracion: el resto del proyecto usa config.X y nunca process.env.X.
// Las credenciales NO llevan valor por defecto: si falta el .env, la app debe fallar.
export default {
  HOST: process.env.HOST || 'localhost',
  PORT: process.env.PORT || 3050,
  API_URL: process.env.API_URL || '/api/v1',

  // --- NoSQL: MongoDB ---
  CONNECTION_STRING: process.env.CONNECTION_STRING,
  DATABASE: process.env.DATABASE || 'db_eeducation',
  COLLECTION: process.env.COLLECTION || 'cat_institutos',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // --- T2-Actividad 2: Catalogo de Catalogos (proyecto final) ---
  // Coleccion de MongoDB con los catalogos y sus valores embebidos
  CATALOGS_COLLECTION: process.env.CATALOGS_COLLECTION || 'catalogs',

  // --- SQL: Supabase (PostgreSQL) ---
  // Supabase > Project Settings > Database > Connection string (URI)
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
  SUPABASE_DB_SSL: process.env.SUPABASE_DB_SSL === 'true',

  // --- Sesion: el usuario elige la base de datos al iniciar sesion ---
  DB_SERVERS: ['mongodb', 'supabase'],
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
};
