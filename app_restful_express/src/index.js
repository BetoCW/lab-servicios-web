import app from './app';
import config from './config/config';
import { connectDB } from './config/database.config';
import { connectSupabase } from './config/supabase.config';

// index.js solo "enciende" la aplicacion: conecta las bases de datos (NoSQL y
// SQL) y pone el servidor a escuchar. No contiene logica de negocio.
const start = async () => {
  try {
    await connectDB();
    await connectSupabase();

    app.listen(app.get('port'), () => {
      const base = `http://${config.HOST}:${app.get('port')}${config.API_URL}`;
      console.log(`Server is running on: ${base}`);
      console.log(`Catalogo de Institutos: ${base}/institutos`);
      console.log(`Catalogo de Catalogos:  ${base}/catalogs (requiere sesion: ${base}/auth/login)`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

start();
