# eeducation-api (AppRESTeEducation)

API REST de **Institutos** y **Productos/Servicios** con Express 5, Mongoose 9 y MongoDB Atlas, usando la convención de modelos del docente (`IdXxxOK`, `IdXxxBK`, `detail_row`).

Guía completa paso a paso: [docs/03-guia-eeducation-api.md](../docs/03-guia-eeducation-api.md)

## Uso

```bash
npm install
cp .env.example .env     # llena CONNECTION_STRING
npm run seed             # 3 institutos y 5 productos/servicios (--force para reemplazar)
npm run dev              # http://localhost:3030/api/v1
```

Si `CATALOGOS_API_URL` apunta a una instancia de [catalogos-api](../catalogos-api), los códigos de giro, tipo, estatus y tipo de archivo se validan contra el catálogo de catálogos.

## Endpoints (`/api/v1`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/institutos` | Lista (`?includeDeleted=true`) |
| POST | `/institutos` | Crear |
| GET | `/institutos/:id` | Obtener por `IdInstitutoOK` |
| PUT | `/institutos/:id` | Actualizar |
| DELETE | `/institutos/:id` | Borrado lógico (`?fisico=true` físico) |
| GET | `/institutos/:id/prod-serv` | Productos/servicios del instituto |
| GET | `/prod-serv` | Lista (`?IdInstitutoOK=`, `?includeDeleted=true`) |
| POST | `/prod-serv` | Crear |
| GET | `/prod-serv/:id` | Obtener por `IdProdServOK` |
| PUT | `/prod-serv/:id` | Actualizar |
| DELETE | `/prod-serv/:id` | Borrado lógico (`?fisico=true` físico) |
| POST | `/prod-serv/:id/estatus` | Cambiar estatus (historial) |
| POST | `/prod-serv/:id/presentaciones` | Agregar presentación |
| PUT | `/prod-serv/:id/presentaciones/:idPresenta` | Actualizar presentación |
| DELETE | `/prod-serv/:id/presentaciones/:idPresenta` | Borrado lógico de presentación |

Header opcional `x-user` para la bitácora `detail_row_reg`.

Colección Postman: [`postman/eeducation-api.postman_collection.json`](postman/eeducation-api.postman_collection.json)
