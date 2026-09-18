import app from './app';
import config from './config/config';
import { connectDB } from './config/database.config';

// index.js solo "enciende" la aplicacion: conecta a la base de datos NoSQL y
// pone el servidor a escuchar. No contiene logica de negocio.
const start = async () => {
  try {
    await connectDB();

    app.listen(app.get('port'), () => {
      const base = `http://${config.HOST}:${app.get('port')}${config.API_URL}`;
      console.log(`Server is running on: ${base}`);
      console.log(`Catalogo de Institutos: ${base}/institutos`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
