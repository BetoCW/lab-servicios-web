# catalogos-api

API REST del **Catálogo de catálogos** (etiquetas → valores con N niveles) con Express 5, Mongoose 9 y MongoDB Atlas.

Guía completa paso a paso: [docs/02-guia-catalogos-api.md](../docs/02-guia-catalogos-api.md)

## Uso

```bash
npm install
cp .env.example .env     # llena CONNECTION_STRING
npm run seed             # 7 catálogos de prueba (no reemplaza existentes; --force para reemplazar)
npm run dev              # http://localhost:3020/api/v1/catalogs
```

| Script | Descripción |
|---|---|
| `npm run dev` | Desarrollo con recarga automática |
| `npm run seed` | Carga `seed/catalogs.json` |
| `npm run build` / `npm start` | Compila a `dist/` y ejecuta la versión compilada |

## Endpoints (`/api/v1/catalogs`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista de catálogos |
| POST | `/` | Crear catálogo |
| GET | `/:key` | Obtener catálogo (`?includeDeleted=true`) |
| PUT | `/:key` | Actualizar catálogo |
| DELETE | `/:key` | Borrado lógico |
| GET | `/:key/tree` | Árbol de valores (`?parentId=`) |
| GET | `/:key/children` | Hijos directos (`?parentId=`) |
| POST | `/:key/values` | Agregar valor |
| PUT | `/:key/values/:valueId` | Actualizar / mover valor |
| DELETE | `/:key/values/:valueId` | Borrado lógico del valor y descendientes |

Header opcional `x-user` para auditoría (`createdBy` / `updatedBy`).

Colección Postman: [`postman/catalogos-api.postman_collection.json`](postman/catalogos-api.postman_collection.json)
