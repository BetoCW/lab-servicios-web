import dotenv from 'dotenv';

// Carga las variables declaradas en el archivo .env
dotenv.config({ quiet: true });

// Punto unico de configuracion: el resto del proyecto usa config.X y nunca process.env.X.
// Las credenciales NO llevan valor por defecto: si falta el .env, la app debe fallar.
export default {
  HOST: process.env.HOST || 'localhost',
  PORT: process.env.PORT || 3050,
  API_URL: process.env.API_URL || '/api/v1',

  CONNECTION_STRING: process.env.CONNECTION_STRING,
  DATABASE: process.env.DATABASE || 'db_eeducation',
  COLLECTION: process.env.COLLECTION || 'cat_institutos',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
};
