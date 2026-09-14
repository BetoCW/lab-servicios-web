import dotenv from 'dotenv';

// Carga las variables del archivo .env (quiet evita el mensaje informativo de dotenv 17)
dotenv.config({ quiet: true });

// Punto central de configuración: el resto del proyecto usa config.X en lugar de process.env.X
export default {
  HOST: process.env.HOST || 'localhost',
  PORT: process.env.PORT || 3020,
  API_URL: process.env.API_URL || '/api/v1',
  // Sin valor por defecto a propósito: las credenciales jamás van escritas en el código
  CONNECTION_STRING: process.env.CONNECTION_STRING,
  DATABASE: process.env.DATABASE || 'CatalogosDB',
};
