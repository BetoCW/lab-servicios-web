# app_restful_sap_cds

Proyecto **DEMO** de la *T1-Actividad 3*: el mismo **Catálogo de Institutos** de
[`app_restful_express`](../app_restful_express), pero resuelto con **SAP CDS (CAP) / NodeJS**
sobre **MongoDB**, expuesto a la vez como **OData V4** y como **REST plano**, con documentación
**Swagger/OpenAPI**.

## Qué cambia respecto a Express

En CAP no se escriben rutas ni controladores: se **declara el modelo** en CDS y el framework
genera el servicio, el `$metadata`, el OpenAPI y las opciones de consulta de OData. Solo se
programa lo que el framework no puede adivinar: en este proyecto, el acceso a MongoDB.

```
HTTP -> (CAP: protocolo, parseo, CQN) -> srv.on handlers -> services -> models (Mongoose) -> MongoDB
```

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Modelo de datos | `db/schema.cds` | Entidad `Institutos`, composición `InfoAdicional` y tipo `DetailRow`. |
| Definición del servicio | `srv/institutos-service.cds` | Proyecciones, rutas por protocolo y la acción `bajaLogica`. |
| Controlador | `srv/institutos-service.js` | Manejadores `on('READ'/'CREATE'/'UPDATE'/'DELETE')` y traducción de errores a HTTP. |
| Traductor CQN | `srv/services/cqn.js` | Convierte `$filter`, `$select`, `$orderby`, `$top`, `$skip` a consultas de MongoDB. |
| Servicio | `srv/services/institutos.service.js` | Reglas de negocio y acceso a datos. Única capa que habla con Mongoose. |
| Modelo Mongoose | `srv/models/Institutos.js` | Esquema e índices, espejo de `db/schema.cds`. |
| Configuración | `srv/config/` | Variables de entorno y conexión a MongoDB. |
| Arranque | `server.js` | Monta Swagger UI y `/health` en el bootstrap de CAP. |

> **Por qué Mongoose:** SAP CDS trae adaptadores para SQLite, PostgreSQL y SAP HANA, pero no para
> MongoDB. Por eso los manejadores propios (`srv.on`) sustituyen al motor de persistencia de CAP y
> resuelven la consulta contra MongoDB. El SQLite en memoria que declara `package.json` solo sirve
> para que CAP arranque; **ningún dato se guarda ahí**.

## Instalación

```bash
npm install -g @sap/cds-dk    # una sola vez, si aún no lo tienes
cd app_restful_sap_cds
npm install
cp .env.example .env          # en Windows: copy .env.example .env
```

Las variables del `.env` son las mismas que en el proyecto de Express (`CONNECTION_STRING`,
`DATABASE`, `COLLECTION`…), salvo el puerto, que aquí es `4004`.

## Ejecución

```bash
npm run seed     # carga los mismos 3 institutos de prueba
npm start        # o: npm run dev  (cds watch, con recarga automática)
npm run swagger  # genera docs/*.openapi3.json
```

- OData V4: <http://localhost:4004/api/v1/Institutos>
- REST plano: <http://localhost:4004/rest/api/v1/Institutos>
- Metadatos: <http://localhost:4004/api/v1/$metadata>
- Swagger UI: <http://localhost:4004/api-docs/api/v1>

## Endpoints

| Operación | OData V4 | REST plano | Códigos |
|---|---|---|---|
| Lista | `GET /api/v1/Institutos` | `GET /rest/api/v1/Institutos` | 200 |
| Detalle | `GET /api/v1/Institutos('1')` | `GET /rest/api/v1/Institutos/1` | 200, 404 |
| Alta | `POST /api/v1/Institutos` | `POST /rest/api/v1/Institutos` | 201, 400, 409 |
| Cambio | `PUT /api/v1/Institutos('1')` | `PUT /rest/api/v1/Institutos/1` | 200, 400 |
| Baja física | `DELETE /api/v1/Institutos('1')` | `DELETE /rest/api/v1/Institutos/1` | 204, 404 |
| Baja lógica | `POST /api/v1/bajaLogica` | — | 200, 404 |

Opciones de consulta soportadas sin escribir código en el controlador:

```http
GET /api/v1/Institutos?$filter=Matriz eq 'N'
GET /api/v1/Institutos?$filter=contains(DesInstituto,'Tepic')
GET /api/v1/Institutos?$select=IdInstitutoOK,DesInstituto&$orderby=Alias desc
GET /api/v1/Institutos?$top=2&$skip=0&$count=true
```

## Pruebas

- `request/institutos.http` — extensión *REST Client* de VS Code, con los dos protocolos.
- `postman/app_restful_sap_cds.postman_collection.json` — colección de Postman.
