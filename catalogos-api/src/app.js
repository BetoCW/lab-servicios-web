import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import config from './config/config';
import routeAPI from './api/v1/routes';
import { notFound, errorHandler } from './api/v1/middlewares/errorHandler';

// app.js configura Express: middlewares, rutas y manejo de errores (no levanta el servidor)
const app = express();

app.set('port', config.PORT);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

routeAPI(app);

// Siempre al final: primero la ruta no encontrada (404) y luego el manejador de errores
app.use(notFound);
app.use(errorHandler);

export default app;
