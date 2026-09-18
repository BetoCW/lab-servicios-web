import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

// Configuracion de variables de entorno
import config from './config/config';
// Rutas
import routerAPI from './api/v1/routes';
// Swagger
import { swaggerDocs } from './docs/swagger';
// Middlewares
import { notFound, errorHandler } from './api/v1/middlewares/error.handler';

// app.js configura Express: middlewares, rutas, documentacion y manejo de
// errores. No levanta el servidor ni abre la conexion a la base de datos.
const app = express();

// Configuraciones
app.set('port', config.PORT);

// Middlewares generales
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rutas informativas
const api = config.API_URL;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'app_restful_express' }));

app.get(`${api}`, (req, res) => {
  res.send(
    `<h1>RESTful running in root</h1>
     <p>Catalogo de Institutos: <b>${api}/institutos</b></p>
     <p>Documentacion Swagger: <b>${api}/api-docs</b></p>`,
  );
});

// Rutas de la API (modelo -> servicio -> controlador -> ruteo)
routerAPI(app);

// Documentacion OpenAPI/Swagger
swaggerDocs(app);

// Siempre al final: primero el 404 generico y despues el manejador de errores
app.use(notFound);
app.use(errorHandler);

export default app;
