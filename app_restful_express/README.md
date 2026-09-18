# app_restful_express

Proyecto **DEMO** de la *T1-Actividad 3*: API RESTful del **Catálogo de Institutos** construida con
**Express / JavaScript** y **MongoDB**, con arquitectura de microservicios por capas y documentación
**Swagger/OpenAPI**.

> Proyecto gemelo: [`app_restful_sap_cds`](../app_restful_sap_cds) resuelve exactamente el mismo
> caso de uso con **SAP CDS / NodeJS**. Los dos apuntan a la misma base de datos y a la misma
> colección, así que se pueden comparar respuesta contra respuesta.

## Arquitectura por capas

```
HTTP -> routes -> controllers -> services -> models (Mongoose) -> MongoDB
```

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Ruteo | `src/api/v1/routes/institutos.routes.js` | URL + método HTTP. También contiene los comentarios `@openapi`. |
| Controlador | `src/api/v1/controllers/institutos.controller.js` | Lee `req`, llama al servicio y responde con el código HTTP correcto. No conoce Mongoose. |
| Servicio | `src/api/v1/services/institutos.service.js` | Reglas de negocio y acceso a datos. Única capa que habla con Mongoose. |
| Modelo | `src/api/v1/models/Institutos.js` | Esquema, tipos e índices de la colección. |
| Configuración | `src/config/config.js`, `src/config/database.config.js` | Variables de entorno y conexión a MongoDB. |
| Middlewares | `src/api/v1/middlewares/` | Manejo de errores y respuestas homogéneas. |
| Documentación | `src/docs/swagger.js` | Definición base de OpenAPI 3.0 y montaje de Swagger UI. |

`src/app.js` arma Express (middlewares, rutas, Swagger, errores) y `src/index.js` solo conecta la
base de datos y levanta el servidor.

## Instalación

```bash
cd app_restful_express
npm install
cp .env.example .env        # en Windows: copy .env.example .env
```

Llena el `.env` con tus datos. **El `.env` nunca se sube a GitHub.**

| Variable | Descripción | Ejemplo |
|---|---|---|
| `HOST` | Host del servidor | `localhost` |
| `PORT` | Puerto del servidor | `3050` |
| `API_URL` | Prefijo de la versión de la API | `/api/v1` |
| `CONNECTION_STRING` | Cadena de conexión de MongoDB | `mongodb+srv://...` o `mongodb://localhost:27018` |
| `DATABASE` | Base de datos | `db_eeducation` |
| `COLLECTION` | Colección | `cat_institutos` |

## Ejecución

```bash
npm run seed     # carga los 3 institutos de prueba
npm run dev      # servidor con recarga automática (nodemon + babel-node)
npm run swagger  # genera docs/openapi.json
```

- API: <http://localhost:3050/api/v1/institutos>
- Swagger UI: <http://localhost:3050/api/v1/api-docs>
- OpenAPI JSON: <http://localhost:3050/api/v1/api-docs.json>

## Endpoints

| Método | Ruta | Descripción | Códigos |
|---|---|---|---|
| GET | `/api/v1/institutos` | Lista completa del catálogo | 200, 404 |
| GET | `/api/v1/institutos/:id` | Un instituto (`?keyType=OK\|BK`) | 200, 404 |
| POST | `/api/v1/institutos` | Alta de un instituto | 201, 400, 409 |
| POST | `/api/v1/institutos/manyInstitutos` | Alta masiva con un arreglo JSON | 201, 409 |
| PUT | `/api/v1/institutos/:id` | Actualización | 200, 400, 404 |
| PUT | `/api/v1/institutos/:id/infoAdicional` | Agrega o actualiza `informacion_adicional[]` | 200, 404 |
| DELETE | `/api/v1/institutos/:id` | Baja lógica; `?modo=fisico` borra el documento | 200, 404 |

El header opcional `x-user` guarda quién hizo el cambio en `detail_row`.

## Pruebas

- `request/institutos.http` — extensión *REST Client* de VS Code, incluye los casos de error.
- `postman/app_restful_express.postman_collection.json` — colección de Postman.

## Base de datos local (opcional)

```bash
docker compose -f ../database/docker-compose.yml up -d mongo   # MongoDB 8 en el puerto 27018
```

Después pon `CONNECTION_STRING=mongodb://localhost:27018` en el `.env`.
