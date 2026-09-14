import mongoose from 'mongoose';
import config from './config';

// Abre la conexión con MongoDB (Atlas o local) usando las variables de entorno
export const connectDB = async () => {
  if (!config.CONNECTION_STRING) {
    throw new Error('Falta CONNECTION_STRING en el archivo .env (usa .env.example como guía).');
  }

  const db = await mongoose.connect(config.CONNECTION_STRING, {
    dbName: config.DATABASE,
  });
  console.log('DB conectada a:', db.connection.name);
  return db;
};

export const disconnectDB = () => mongoose.disconnect();
