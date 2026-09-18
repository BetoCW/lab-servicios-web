const mongoose = require('mongoose');
const config = require('./config');

// Conexion a la base de datos NoSQL (MongoDB) por variables de entorno.
// SAP CDS no trae un driver nativo de MongoDB, asi que el microservicio abre
// su propia conexion con Mongoose y la usa dentro de los manejadores de eventos.
let connection = null;

const connectDB = async () => {
  if (connection) return connection;

  if (!config.CONNECTION_STRING) {
    throw new Error(
      'Falta CONNECTION_STRING en el archivo .env. Usa .env.example como guia.',
    );
  }

  connection = await mongoose.connect(config.CONNECTION_STRING, {
    dbName: config.DATABASE,
  });

  console.log('Database is connected to:', connection.connection.name);
  return connection;
};

const disconnectDB = async () => {
  if (!connection) return;
  await mongoose.disconnect();
  connection = null;
};

module.exports = { connectDB, disconnectDB, mongoose };
