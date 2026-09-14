import app from './app';
import config from './config/config';
import { connectDB } from './config/database.config';

// index.js solo "enciende" el servidor: primero conecta a la BD y después escucha peticiones
const start = async () => {
  try {
    await connectDB();
    app.listen(app.get('port'), () => {
      const base = `http://${config.HOST}:${app.get('port')}${config.API_URL}`;
      console.log(`Server corriendo en: ${base}  (rutas: /institutos, /prod-serv)`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
