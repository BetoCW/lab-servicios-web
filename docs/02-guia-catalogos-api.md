# 02 · Guía paso a paso: catalogos-api

Tutorial para construir desde cero el **Catálogo de catálogos** con Express y MongoDB Atlas. El resultado final es la carpeta [`catalogos-api`](../catalogos-api); si te atoras, compara tu archivo con el de ahí.

## ¿Qué es un catálogo de catálogos?

Es un **dato maestro**: en lugar de una tabla por cada lista (tipos de vehículo, estatus, giros…), hay **un solo modelo genérico** donde cada documento es un catálogo (`key`, `label`) con sus valores embebidos (`values[]`).

Cada valor puede tener un padre (`parentId`), así se forman jerarquías de N niveles:

```
education_levels
├── SUPERIOR                 (parentId: null)      nivel 1
│   ├── LICENCIATURA         (parentId: SUPERIOR)  nivel 2
│   │   ├── ING_SISTEMAS     (parentId: LICENCIATURA) nivel 3
│   │   └── ING_INDUSTRIAL
│   └── POSGRADO
└── MEDIA_SUPERIOR
```

¿Por qué embebido y no una colección aparte? Los catálogos se leen completos para llenar combos y tablas, cambian poco y son pequeños (cientos de valores, muy lejos del límite de 16 MB por documento). Con valores embebidos el documento **ya es** la respuesta de la API.

## Paso 1. Crear el proyecto e instalar dependencias

```bash
mkdir catalogos-api && cd catalogos-api
npm init -y
npm install express mongoose cors morgan dotenv @hapi/boom uuid @babel/runtime
npm install --save-dev @babel/core @babel/preset-env @babel/node @babel/cli @babel/plugin-transform-runtime nodemon
```

| Paquete | Para qué |
|---|---|
| express | Servidor y rutas |
| mongoose | Modelos/esquemas de MongoDB |
| cors / morgan | Peticiones desde otros orígenes / log de peticiones en consola |
| dotenv | Leer el archivo `.env` |
| @hapi/boom | Crear errores HTTP (`boom.notFound`, `boom.conflict`…) |
| uuid | Identificadores de los valores |
| @babel/* | Usar `import`/`export` |
| nodemon | Reiniciar el servidor al guardar |

> **Corrección respecto al tutorial en PDF:** `.babelrc` usa `@babel/plugin-transform-runtime`, que **necesita instalarse** (y `@babel/runtime` como dependencia). Si no, Babel falla al arrancar.

## Paso 2. Babel y scripts

`.babelrc`

```json
{
  "plugins": ["@babel/plugin-transform-runtime"],
  "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]]
}
```

`targets.node = current` le dice a Babel que tu Node ya entiende `async/await`, así solo convierte los `import/export`.

En `package.json`:

```json
"scripts": {
  "babel-node": "babel-node",
  "dev": "nodemon --exec npm run babel-node -- src/index.js",
  "build": "babel src --out-dir dist",
  "start": "node dist/index.js",
  "seed": "babel-node scripts/seed.js"
}
```

## Paso 3. Estructura de carpetas

```
catalogos-api/
├── .babelrc  .env  .env.example  package.json
├── scripts/seed.js            datos de prueba
├── seed/catalogs.json
├── postman/                   colección para importar
└── src/
    ├── index.js               enciende el servidor
    ├── app.js                 configura Express
    ├── config/
    │   ├── config.js          variables de entorno centralizadas
    │   └── database.config.js conexión a MongoDB
    ├── utils/
    │   ├── buildTree.js       arma el árbol de valores
    │   └── rethrow.js         clasifica errores
    └── api/v1/
        ├── models/Catalog.js
        ├── services/catalog.service.js
        ├── controllers/catalog.controller.js
        ├── routes/catalog.routes.js
        ├── routes/index.js
        └── middlewares/errorHandler.js
```

## Paso 4. Variables de entorno

`.env` (no se sube a GitHub):

```
HOST=localhost
PORT=3020
API_URL=/api/v1
CONNECTION_STRING=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/?appName=<AppName>
DATABASE=CatalogosDB
```

`src/config/config.js` carga el `.env` y expone `config.PORT`, `config.DATABASE`, etc.

> **Corrección:** el tutorial en PDF ponía la connection string real como valor por defecto dentro de `config.js` y terminaba con `module.exports = connectDB`. Aquí `CONNECTION_STRING` **no tiene valor por defecto** (las credenciales nunca van en el código) y no se mezcla `module.exports` con `export default`.

## Paso 5. Conexión

`src/config/database.config.js` exporta `connectDB()`. `index.js` **espera** la conexión antes de llamar a `app.listen`, así el servidor nunca arranca sin base de datos.

## Paso 6. Modelo `Catalog`

Ver [`models/Catalog.js`](../catalogos-api/src/api/v1/models/Catalog.js). Puntos clave:

- `valueSchema` con `{ _id: false }`: cada valor usa su propio `id` uuid y no un ObjectId extra.
- `suppressReservedKeysWarning: true`: `collection` es un nombre reservado en Mongoose, pero forma parte del contrato del docente.
- `toJSON.transform`: convierte `_id` en `id` y quita `__v`.
- Índices:

| Índice | Propósito |
|---|---|
| `{ key: 1 }` único | No hay dos catálogos con el mismo key |
| `{ 'values.parentId': 1 }` | Consultas por nivel |
| `{ key: 1, 'values.code': 1 }` único | `code` único por catálogo |
| `{ key: 1, 'values.sequence': 1 }` | Orden |

## Paso 7. Árbol (`utils/buildTree.js`)

`buildTree(values, parentId)` filtra los hijos de `parentId`, los ordena por `sequence` y se llama a sí misma para cada hijo (recursividad). `getChildren` devuelve solo el primer nivel.

## Paso 8. Service

Reglas implementadas en [`catalog.service.js`](../catalogos-api/src/api/v1/services/catalog.service.js):

- **Borrado lógico**: `DELETE` pone `deletedAt` y `active: false`; el documento no se elimina.
- `PUT /catalogs/:key` solo modifica campos permitidos; **no** cambia `key` ni `values`.
- `code` se guarda en MAYÚSCULAS y no se puede repetir dentro del catálogo.
- `parentId` debe existir; un valor no puede ser su propio padre **ni moverse debajo de uno de sus hijos** (evita ciclos).
- Si no mandas `sequence`, se asigna la siguiente dentro del mismo padre.
- Borrar un valor también borra (lógicamente) a sus descendientes.

> **Corrección:** el import del tutorial `'../../../../utils/buildTree'` apuntaba fuera de `src`. Desde `src/api/v1/services/` la ruta correcta es `'../../../utils/buildTree'`.

## Paso 9. Controller, rutas y errores

- El controller lee `req.params`, `req.query` y el header `x-user` (quién hace el cambio) y responde `200/201`.
- `routes/index.js` monta todo bajo `config.API_URL` → `/api/v1/catalogs`.
- `errorHandler` traduce: duplicado `E11000` → **409**, validación de Mongoose → **400**, JSON mal formado → **400**, errores boom → su código, lo demás → **500**.
- `notFound` responde **404** en JSON para rutas inexistentes.

## Paso 10. Endpoints

Base: `http://localhost:3020/api/v1/catalogs`

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| GET | `/` | Lista catálogos activos | 200 |
| POST | `/` | Crea catálogo (con `values` opcionales) | 201, 400, 409 |
| GET | `/:key` | Un catálogo (`?includeDeleted=true`) | 200, 404 |
| PUT | `/:key` | Edita datos generales | 200, 400, 404 |
| DELETE | `/:key` | Borrado lógico | 200, 404 |
| GET | `/:key/tree` | Árbol completo (`?parentId=` para un subárbol) | 200, 404 |
| GET | `/:key/children` | Hijos directos (`?parentId=`) | 200, 404 |
| POST | `/:key/values` | Agrega valor | 201, 400, 404, 409 |
| PUT | `/:key/values/:valueId` | Edita/mueve valor | 200, 400, 404, 409 |
| DELETE | `/:key/values/:valueId` | Borrado lógico del valor y sus hijos | 200, 404 |

Ejemplo de alta:

```http
POST /api/v1/catalogs
Content-Type: application/json
x-user: KPEREZ

{
  "key": "payment_method",
  "label": "Métodos de pago",
  "collection": "eeducation",
  "values": [
    { "code": "CASH", "value": "Efectivo" },
    { "code": "CARD", "value": "Tarjeta" }
  ]
}
```

## Paso 11. Correr y probar

```bash
npm run seed    # 7 catálogos de ejemplo
npm run dev     # Server corriendo en: http://localhost:3020/api/v1/catalogs
```

Importa [`postman/catalogos-api.postman_collection.json`](../catalogos-api/postman/catalogos-api.postman_collection.json). La petición *Agregar valor* guarda automáticamente el `valueId` para las de editar y borrar.
