# 03 · Guía paso a paso: eeducation-api (Institutos y Productos/Servicios)

Proyecto **AppRESTeEducation** para los integrantes nuevos. Sigue la misma arquitectura que [catalogos-api](02-guia-catalogos-api.md), así que los pasos 1 a 5 (crear proyecto, Babel, estructura, `.env`, conexión) son iguales; aquí solo cambian el puerto (`3030`) y la base de datos (`eEducationDB`).

## El modelo del docente: `Ok`, `BK` y `detail_row`

Los modelos del docente usan una convención que conviene entender antes de programar:

| Sufijo / campo | Significado | Ejemplo |
|---|---|---|
| `IdXxxOK` | Llave de negocio **interna** (la que usa la API en las URLs) | `IdInstitutoOK: "1"` |
| `IdXxxBK` | Llave de negocio **externa** (clave oficial, código del proveedor…) | `IdInstitutoBK: "18DIT0002Z"` |
| `DesXxx` | Descripción | `DesInstituto` |
| `cat_xxx_yyy` | Arreglo de subdocumentos | `cat_prod_serv_presenta` |
| `detail_row` | Auditoría: `Activo` (S/N), `Borrado` (S/N) y `detail_row_reg[]` (fecha y usuario de cada cambio) | ver abajo |

```json
"detail_row": {
  "Activo": "S",
  "Borrado": "N",
  "detail_row_reg": [
    { "FechaReg": "2026-09-14T03:15:02.575Z", "UsuarioReg": "KPEREZ" }
  ]
}
```

## Paso 6. Modelos

- [`detailRow.js`](../eeducation-api/src/api/v1/models/detailRow.js): esquema reutilizable de auditoría (se usa en documentos y subdocumentos).
- [`Institutos.js`](../eeducation-api/src/api/v1/models/Institutos.js): un instituto puede depender de otro con `IdInstitutoSupOK` (por ejemplo, la Coordinación de Lenguas Extranjeras depende del ITT).
- [`ProdServ.js`](../eeducation-api/src/api/v1/models/ProdServ.js): producto o servicio de un instituto con subdocumentos:

```
ProdServ
├── cat_prod_serv_estatus[]   historial; solo uno con Actual = 'S'
├── cat_prod_serv_info_ad[]   datos extra etiqueta/valor
└── cat_prod_serv_presenta[]  variantes con precio; solo una Principal = 'S'
    └── cat_prod_serv_archivos[]  imágenes, PDF, video
```

## Paso 7. Services: reglas de negocio

**Institutos**
- `IdInstitutoOK` no se repite (409) ni se puede cambiar con PUT.
- `IdInstitutoSupOK` debe existir y no puede ser el mismo instituto.
- `DELETE` hace **borrado lógico** (`Activo = N`, `Borrado = S` + registro en bitácora).
- `DELETE ?fisico=true` elimina el documento **solo si** no tiene productos ni institutos dependientes (si no, 409).

**Productos/Servicios**
- El instituto debe existir.
- Al crear se registra el estatus inicial `PS_ACTIVO` (o el que mandes en `IdTipoEstatusOK`).
- `POST /:id/estatus` apaga el estatus actual y agrega el nuevo al historial (no se puede repetir el actual).
- Marcar una presentación como `Principal: "S"` quita la marca de las demás.
- `Precio` no puede ser negativo (validación del esquema → 400).

## Paso 8. Integración con catalogos-api (microservicios)

Si en `.env` defines `CATALOGOS_API_URL=http://localhost:3020/api/v1`, antes de guardar se valida contra el catálogo de catálogos:

| Campo | Catálogo |
|---|---|
| `Institutos.Giro` | `institute_business` |
| `ProdServ.IdTipoProdServOK` | `prod_serv_type` |
| `cat_prod_serv_estatus.IdTipoEstatusOK` | `prod_serv_status` |
| `cat_prod_serv_archivos.IdTipoArchivoOK` | `file_type` |

Ver [`utils/catalogosClient.js`](../eeducation-api/src/utils/catalogosClient.js). Si la variable está vacía, la validación se omite y el proyecto funciona solo. Si está configurada pero `catalogos-api` no responde, se devuelve **503**.

## Paso 9. Endpoints

Base: `http://localhost:3030/api/v1`

### Institutos

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| GET | `/institutos` | Lista (`?includeDeleted=true`) | 200 |
| POST | `/institutos` | Alta | 201, 400, 409 |
| GET | `/institutos/:id` | Uno por `IdInstitutoOK` | 200, 404 |
| PUT | `/institutos/:id` | Edición | 200, 400, 404 |
| DELETE | `/institutos/:id` | Borrado lógico (`?fisico=true` físico) | 200, 404, 409 |
| GET | `/institutos/:id/prod-serv` | Productos/servicios del instituto | 200, 404 |

### Productos/Servicios

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| GET | `/prod-serv` | Lista (`?IdInstitutoOK=1`, `?includeDeleted=true`) | 200 |
| POST | `/prod-serv` | Alta con presentaciones e info adicional | 201, 400, 409 |
| GET | `/prod-serv/:id` | Uno por `IdProdServOK` | 200, 404 |
| PUT | `/prod-serv/:id` | Edición | 200, 400, 404 |
| DELETE | `/prod-serv/:id` | Borrado lógico (`?fisico=true` físico) | 200, 404 |
| POST | `/prod-serv/:id/estatus` | Cambia estatus | 201, 400, 404, 409 |
| POST | `/prod-serv/:id/presentaciones` | Agrega presentación | 201, 400, 404, 409 |
| PUT | `/prod-serv/:id/presentaciones/:idPresenta` | Edita presentación | 200, 400, 404 |
| DELETE | `/prod-serv/:id/presentaciones/:idPresenta` | Borrado lógico | 200, 404 |

Ejemplo de alta:

```http
POST /api/v1/prod-serv
Content-Type: application/json
x-user: KPEREZ

{
  "IdInstitutoOK": "1",
  "IdProdServOK": "1-CERT-ING",
  "DesProdServ": "Certificado de inglés",
  "IdTipoProdServOK": "CONSTANCIAS",
  "cat_prod_serv_presenta": [
    { "IdPresentaOK": "1-CERT-ING-DIG", "DesPresenta": "Digital", "Precio": 150, "Principal": "S" }
  ]
}
```

## Paso 10. Correr y probar

```bash
npm run seed    # 3 institutos y 5 productos/servicios
npm run dev     # Server corriendo en: http://localhost:3030/api/v1
```

Para probar la integración, levanta también `catalogos-api` en otra terminal. Importa [`postman/eeducation-api.postman_collection.json`](../eeducation-api/postman/eeducation-api.postman_collection.json).
