import dotenv from 'dotenv';

// Carga las variables del archivo .env (quiet evita el mensaje informativo de dotenv 17)
dotenv.config({ quiet: true });

// Punto central de configuración: el resto del proyecto usa config.X en lugar de process.env.X
export default {
  HOST: process.env.HOST || 'localhost',
  PORT: process.env.PORT || 3030,
  API_URL: process.env.API_URL || '/api/v1',
  // Sin valor por defecto a propósito: las credenciales jamás van escritas en el código
  CONNECTION_STRING: process.env.CONNECTION_STRING,
  DATABASE: process.env.DATABASE || 'eEducationDB',
  // Opcional: URL del microservicio catalogos-api para validar códigos (ej. http://localhost:3020/api/v1)
  CATALOGOS_API_URL: process.env.CATALOGOS_API_URL || '',
};
