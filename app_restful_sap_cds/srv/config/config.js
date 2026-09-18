const dotenv = require('dotenv');

// Carga las variables declaradas en el archivo .env
dotenv.config({ quiet: true });

// Punto unico de configuracion. Igual que en app_restful_express, las
// credenciales NO llevan valor por defecto: sin .env la aplicacion falla.
module.exports = {
  HOST: process.env.HOST || 'localhost',
  PORT: process.env.PORT || 4004,
  API_URL: process.env.API_URL || '/api/v1',

  CONNECTION_STRING: process.env.CONNECTION_STRING,
  DATABASE: process.env.DATABASE || 'db_eeducation',
  COLLECTION: process.env.COLLECTION || 'cat_institutos',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
};
