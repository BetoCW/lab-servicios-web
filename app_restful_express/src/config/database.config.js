import mongoose from 'mongoose';
import config from './config';

// Abre la conexion con la base de datos NoSQL (MongoDB Atlas o Mongo local)
// usando exclusivamente las variables de entorno del archivo .env.
export const connectDB = async () => {
  if (!config.CONNECTION_STRING) {
    throw new Error(
      'Falta CONNECTION_STRING en el archivo .env. Usa .env.example como guia.',
    );
  }

  const db = await mongoose.connect(config.CONNECTION_STRING, {
    dbName: config.DATABASE,
  });

  console.log('Database is connected to:', db.connection.name);
  return db;
};

export const disconnectDB = () => mongoose.disconnect();

export { mongoose };
