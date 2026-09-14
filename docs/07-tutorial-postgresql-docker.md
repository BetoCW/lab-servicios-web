# 07 · Tutorial: PostgreSQL con Docker desde cero

Tutorial para quien **nunca ha usado Docker ni PostgreSQL**. Al terminar vas a tener PostgreSQL 17 corriendo en tu PC con el esquema del proyecto (catálogos, institutos y productos/servicios), datos de prueba y un visor web, sin instalar PostgreSQL directamente en Windows.

Tiempo estimado: 30 a 45 minutos (la primera descarga es la parte más lenta).

> Todos los comandos se probaron en Windows 11 con Docker Desktop 29. Se recomienda **PowerShell** o la terminal de **VS Code**; en macOS/Linux son idénticos. En **Git Bash** hay dos detalles: los comandos interactivos (`docker exec -it …`) pueden requerir anteponer `winpty`, y las rutas del contenedor que empiezan con `/` necesitan `MSYS_NO_PATHCONV=1` al inicio del comando (ver [problemas comunes](#15-problemas-comunes)).

---

## 1. Conceptos en 2 minutos

| Palabra | Qué es | En este tutorial |
|---|---|---|
| **Imagen** | Plantilla de solo lectura con un programa ya instalado | `postgres:17-alpine` (PostgreSQL 17 sobre Linux Alpine) |
| **Contenedor** | Una imagen **en ejecución**. Puedes crearlo, detenerlo y borrarlo sin afectar tu PC | `lsw-postgres` |
| **Volumen** | Carpeta administrada por Docker donde se guardan los datos. Si borras el contenedor, el volumen **sobrevive** | `lab-servicios-web_pg_data` |
| **Puerto** | "Puerta" para entrar al contenedor desde tu PC: `5433:5432` = el 5433 de tu PC va al 5432 del contenedor | `localhost:5433` |
| **Docker Compose** | Archivo `.yml` que describe uno o varios contenedores para levantarlos con un solo comando | [`database/docker-compose.yml`](../database/docker-compose.yml) |
| **psql** | La terminal oficial de PostgreSQL para escribir SQL | Viene dentro del contenedor, no la instalas |

```mermaid
flowchart LR
    PC[Tu PC<br/>localhost:5433] -->|puerto| C[Contenedor lsw-postgres<br/>PostgreSQL 17 :5432]
    C --> V[(Volumen pg_data<br/>tus datos)]
    S[database/postgres/*.sql] -->|solo la primera vez| C
```

---

## 2. Instalar Docker Desktop (una sola vez)

1. Descarga **Docker Desktop** desde <https://www.docker.com/products/docker-desktop/> e instálalo con las opciones por defecto (usa **WSL 2**).
2. Reinicia la PC si te lo pide.
3. Abre Docker Desktop y espera a que abajo a la izquierda diga **Engine running** (ballena en verde).
4. Comprueba en una terminal:

   ```bash
   docker version
   docker compose version
   docker run --rm hello-world
   ```

   Si el último comando imprime `Hello from Docker!`, todo está listo.

> Si Docker Desktop dice que falta WSL: abre PowerShell **como administrador**, ejecuta `wsl --install`, reinicia y vuelve a abrir Docker Desktop.

---

## 3. Obtener el proyecto

```bash
git clone https://github.com/BetoCW/lab-servicios-web.git
cd lab-servicios-web
```

Si ya lo tenías clonado: `git pull origin main`.

Lo que vamos a usar:

```
database/
├── docker-compose.yml     define los contenedores
└── postgres/
    ├── 01_schema.sql      tablas, llaves, restricciones, índices y triggers
    ├── 02_seed.sql        datos de prueba
    └── 03_views.sql       vistas que devuelven el mismo JSON que MongoDB
```

---

## 4. Entender el `docker-compose.yml`

Esta es la parte de PostgreSQL del archivo, explicada línea por línea:

```yaml
postgres:
  image: postgres:17-alpine          # imagen oficial de PostgreSQL 17 (versión ligera)
  container_name: lsw-postgres       # nombre fijo para usarlo en los comandos
  environment:
    POSTGRES_USER: lab               # usuario administrador que se crea al iniciar
    POSTGRES_PASSWORD: lab_local_2026 # contraseña SOLO para tu contenedor local
    POSTGRES_DB: eeducation          # base de datos que se crea al iniciar
  ports:
    - "5433:5432"                    # tu PC:5433 -> contenedor:5432
  volumes:
    - pg_data:/var/lib/postgresql/data              # aquí viven los datos
    - ./postgres:/docker-entrypoint-initdb.d:ro     # scripts que se ejecutan la primera vez
```

Dos reglas importantes de la imagen oficial:

1. Los archivos `.sql` de `/docker-entrypoint-initdb.d` se ejecutan **en orden alfabético** (por eso se llaman `01_`, `02_`, `03_`) y **solo cuando el volumen está vacío**, es decir, la primera vez. Si cambias un `.sql` después, no se vuelve a ejecutar solo (ver [paso 10](#10-empezar-desde-cero)).
2. Usamos el puerto **5433** en tu PC para no chocar con un PostgreSQL que ya tengas instalado (que normalmente usa el 5432).

> Nota para PostgreSQL 18 o superior: la imagen cambió la ruta de datos a `/var/lib/postgresql/18/docker`. Con la versión 17 del proyecto, el volumen debe quedarse en `/var/lib/postgresql/data` como está.

---

## 5. Levantar PostgreSQL

Desde la carpeta raíz del repositorio:

```bash
docker compose -f database/docker-compose.yml up -d postgres
```

- `up` crea y arranca el contenedor. La primera vez descarga la imagen (~100 MB).
- `-d` lo deja corriendo en segundo plano.
- `postgres` levanta solo ese servicio (el archivo también trae MongoDB).

Comprueba que está arriba:

```bash
docker compose -f database/docker-compose.yml ps
```

```
NAME           IMAGE                STATUS         PORTS
lsw-postgres   postgres:17-alpine   Up 4 seconds   0.0.0.0:5433->5432/tcp
```

Comprueba que se ejecutaron los scripts:

```bash
docker logs lsw-postgres
```

Busca estas líneas (sin ningún `ERROR`):

```
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/01_schema.sql
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/02_seed.sql
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/03_views.sql
PostgreSQL init process complete; ready for start up.
LOG:  database system is ready to accept connections
```

---

## 6. Entrar con `psql`

```bash
docker exec -it lsw-postgres psql -U lab -d eeducation
```

- `docker exec -it lsw-postgres` abre una terminal **dentro** del contenedor.
- `psql -U lab -d eeducation` entra como el usuario `lab` a la base `eeducation`.

Verás el prompt:

```
eeducation=#
```

### Comandos de `psql` que más vas a usar

Los que empiezan con `\` son de psql (no llevan `;`). El SQL normal **siempre** termina en `;`.

| Comando | Qué hace |
|---|---|
| `\l` | Lista las bases de datos |
| `\dt` | Lista las tablas |
| `\dv` | Lista las vistas |
| `\d catalog_values` | Describe una tabla: columnas, llaves, índices, restricciones |
| `\x` | Activa/desactiva la vista vertical (útil para filas anchas) |
| `\?` | Ayuda de comandos de psql |
| `\q` | Salir |

Prueba `\dt`:

```
                  List of relations
 Schema |            Name             | Type  | Owner
--------+-----------------------------+-------+-------
 public | bitacora                    | table | lab
 public | catalog_values              | table | lab
 public | catalogs                    | table | lab
 public | institutos                  | table | lab
 public | prod_serv                   | table | lab
 public | prod_serv_estatus           | table | lab
 public | prod_serv_info_ad           | table | lab
 public | prod_serv_presenta          | table | lab
 public | prod_serv_presenta_archivos | table | lab
(9 rows)
```

> Si la salida es muy larga, psql la muestra por páginas: usa las flechas y presiona `q` para salir de la paginación.

---

## 7. Consultas guiadas

Copia y pega cada consulta dentro de `psql`.

### 7.1 Catálogos cargados

```sql
SELECT key, label, collection FROM catalogs ORDER BY sequence;
```

```
        key         |              label               | collection
--------------------+----------------------------------+------------
 institute_business | Giros de Institutos              | eeducation
 prod_serv_status   | Estatus de Productos y Servicios | eeducation
 prod_serv_type     | Tipos de Productos y Servicios   | eeducation
 education_levels   | Niveles Educativos               | eeducation
 file_type          | Tipos de Archivo                 | config
 vehicle_type       | Tipos de Vehículo                | config
 strategies         | Estrategias                      | trading
(7 rows)
```

### 7.2 Árbol de un catálogo (maestro-detalle)

La vista `v_catalog_values_tree` usa una consulta recursiva (`WITH RECURSIVE`) para calcular el nivel de cada valor:

```sql
SELECT repeat('  ', level - 1) || code AS arbol, value
FROM v_catalog_values_tree t
JOIN catalogs c ON c.id = t.catalog_id
WHERE c.key = 'prod_serv_type'
ORDER BY path;
```

```
      arbol       |           value
------------------+----------------------------
 SERVICIO_ESCOLAR | Servicio escolar
   CONSTANCIAS    | Constancias y certificados
   CREDENCIALES   | Credenciales
 CURSO            | Curso
   IDIOMAS        | Idiomas
   VERANO         | Curso de verano
 PRODUCTO         | Producto
   PAPELERIA      | Papelería institucional
(8 rows)
```

### 7.3 El mismo JSON que devuelve la API con MongoDB

```sql
SELECT jsonb_pretty(catalog) FROM v_catalogs_json WHERE key = 'institute_business';
```

Resultado (recortado):

```json
{
  "key": "institute_business",
  "label": "Giros de Institutos",
  "values": [
    { "code": "EDUCACION", "value": "Educación", "alias": "EDU", "level": 1, "parentId": null, "sequence": 1 },
    { "code": "INVESTIGACION", "value": "Investigación", "alias": "INV", "level": 1, "parentId": null, "sequence": 2 }
  ],
  "collection": "eeducation"
}
```

Esto es lo que permite que en el proyecto final la API responda igual con cualquiera de los dos motores.

### 7.4 JOIN entre tablas: productos con su presentación principal

```sql
SELECT i.alias, ps.id_prod_serv_ok, ps.des_prod_serv, p.des_presenta, p.precio
FROM prod_serv ps
JOIN institutos i ON i.id_instituto_ok = ps.id_instituto_ok
JOIN prod_serv_presenta p ON p.prod_serv_id = ps.id
WHERE p.principal = 'S'
ORDER BY i.alias;
```

```
  alias  | id_prod_serv_ok |              des_prod_serv              |         des_presenta          | precio
---------+-----------------+-----------------------------------------+-------------------------------+---------
 CLE-ITT | 4-INGLES-N1     | Curso de inglés nivel 1                 | Modalidad sabatina            | 1800.00
 ITBB    | 3-VER-PYTHON    | Curso de verano: programación en Python | Presencial                    | 1500.00
 ITT     | 1-CONST-EST     | Constancia de estudios                  | Constancia simple             |   50.00
 ITT     | 1-CRED-EST      | Credencial de estudiante                | Credencial de primer ingreso  |    0.00
 ITT     | 1-PAP-LIBRETA   | Libreta institucional                   | Libreta profesional 100 hojas |   65.00
(5 rows)
```

---

## 8. Práctica: crear, modificar y dar de baja

Vas a crear el catálogo **Métodos de pago** con un valor hijo. Al final lo borramos para dejar la base como estaba.

### 8.1 Alta del catálogo

```sql
INSERT INTO catalogs (key, label, collection, created_by, updated_by)
VALUES ('payment_method', 'Métodos de pago', 'eeducation', 'MI_USUARIO', 'MI_USUARIO')
RETURNING id, key;
```

`RETURNING` devuelve el `id` (uuid) que PostgreSQL generó.

### 8.2 Alta de valores (nivel 1)

En lugar de copiar el uuid a mano, se busca con un `SELECT`:

```sql
INSERT INTO catalog_values (catalog_id, code, value, sequence)
SELECT id, 'CASH', 'Efectivo', 1 FROM catalogs WHERE key = 'payment_method';

INSERT INTO catalog_values (catalog_id, code, value, sequence)
SELECT id, 'CARD', 'Tarjeta', 2 FROM catalogs WHERE key = 'payment_method';
```

### 8.3 Alta de un valor hijo (nivel 2)

```sql
INSERT INTO catalog_values (catalog_id, parent_id, code, value, sequence)
SELECT c.id, v.id, 'CARD_DEBIT', 'Débito', 1
FROM catalogs c
JOIN catalog_values v ON v.catalog_id = c.id AND v.code = 'CARD'
WHERE c.key = 'payment_method';
```

Revisa el resultado en formato JSON: `CARD_DEBIT` debe salir con `"level": 2` y el `parentId` de `CARD`.

```sql
SELECT jsonb_pretty(catalog -> 'values') FROM v_catalogs_json WHERE key = 'payment_method';
```

### 8.4 Provoca errores a propósito (las restricciones te protegen)

Cada uno de estos comandos **debe fallar**. Lee el mensaje: dice qué restricción se violó.

```sql
-- Código repetido dentro del mismo catálogo
INSERT INTO catalog_values (catalog_id, code, value, sequence)
SELECT id, 'CASH', 'Otra vez', 3 FROM catalogs WHERE key = 'payment_method';
```
```
ERROR:  duplicate key value violates unique constraint "catalog_values_code_scope"
```

```sql
-- El código debe ir en MAYÚSCULAS (UPPER_SNAKE)
INSERT INTO catalog_values (catalog_id, code, value, sequence)
SELECT id, 'cheque', 'Cheque', 3 FROM catalogs WHERE key = 'payment_method';
```
```
ERROR:  new row for relation "catalog_values" violates check constraint "catalog_values_code_check"
```

```sql
-- Precio negativo
UPDATE prod_serv_presenta SET precio = -10 WHERE id_presenta_ok = '1-CONST-EST-SIMPLE';
```
```
ERROR:  new row for relation "prod_serv_presenta" violates check constraint "prod_serv_presenta_precio_check"
```

```sql
-- Dos presentaciones principales en el mismo producto
UPDATE prod_serv_presenta SET principal = 'S' WHERE id_presenta_ok = '1-CONST-EST-KARDEX';
```
```
ERROR:  duplicate key value violates unique constraint "uq_prod_serv_presenta_principal"
```

### 8.5 Modificar

```sql
UPDATE catalogs SET label = 'Formas de pago'
WHERE key = 'payment_method'
RETURNING key, label, updated_at > created_at AS se_actualizo;
```

`se_actualizo` sale en `t` (true): el trigger `set_updated_at` actualizó la fecha automáticamente.

### 8.6 Baja lógica (no se borra el registro)

```sql
UPDATE catalogs SET active = false, deleted_at = now() WHERE key = 'payment_method';

SELECT count(*) AS en_vista FROM v_catalogs_json WHERE key = 'payment_method';
```

`en_vista` da `0`: la vista ya no lo muestra, pero la fila sigue en la tabla `catalogs`.

### 8.7 Transacciones: probar sin miedo

Todo lo que ejecutes entre `BEGIN` y `ROLLBACK` se deshace:

```sql
BEGIN;
DELETE FROM catalogs WHERE key = 'payment_method';   -- borra el catálogo y, en cascada, sus valores
SELECT count(*) FROM catalog_values v JOIN catalogs c ON c.id = v.catalog_id WHERE c.key = 'payment_method';
ROLLBACK;                                            -- ¡se deshace todo!

SELECT key FROM catalogs WHERE key = 'payment_method'; -- sigue existiendo
```

Si en lugar de `ROLLBACK` escribes `COMMIT;`, los cambios se guardan.

### 8.8 Limpiar la práctica

```sql
DELETE FROM catalogs WHERE key = 'payment_method';
```

Sal de psql con `\q`.

---

## 9. Ver la base con un visor web (opcional)

El `docker-compose.yml` trae **pgweb**, un visor que ya viene conectado a la base:

```bash
docker compose -f database/docker-compose.yml --profile visores up -d pgweb
```

Abre <http://localhost:8081>:

- Panel izquierdo: tablas y vistas.
- **Rows**: registros de la tabla seleccionada.
- **Structure / Indexes / Constraints**: diseño de la tabla.
- **Query**: escribe SQL y presiona **Run Query**.

### Con otro cliente (DBeaver, extensión de VS Code, pgAdmin)

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `5433` |
| Base de datos | `eeducation` |
| Usuario | `lab` |
| Contraseña | `lab_local_2026` |

Cadena de conexión (para Node.js con el paquete `pg`, por ejemplo):

```
postgresql://lab:lab_local_2026@localhost:5433/eeducation
```

---

## 10. Empezar desde cero

Úsalo si rompiste algo o si cambiaron los archivos `.sql` en el repositorio:

```bash
docker compose -f database/docker-compose.yml rm -sfv postgres
docker volume rm lab-servicios-web_pg_data
docker compose -f database/docker-compose.yml up -d postgres
```

1. `rm -sfv postgres` detiene y borra el contenedor.
2. `docker volume rm` borra los datos. **Esto no se puede deshacer.**
3. `up -d` lo crea otra vez: como el volumen está vacío, los scripts `01`, `02` y `03` se ejecutan de nuevo.

> Para borrar **todo** lo del archivo (Mongo, Postgres y sus volúmenes): `docker compose -f database/docker-compose.yml down -v`.

---

## 11. Respaldar y restaurar

Estos comandos funcionan igual en PowerShell y en Git Bash porque el archivo se genera **dentro** del contenedor y luego se copia.

### Respaldo

```bash
docker exec lsw-postgres pg_dump -U lab -d eeducation --clean --if-exists -f /tmp/respaldo.sql
docker cp lsw-postgres:/tmp/respaldo.sql ./respaldo.sql
```

### Restaurar en una base nueva

```bash
docker exec lsw-postgres createdb -U lab eeducation_copia
docker cp ./respaldo.sql lsw-postgres:/tmp/restaurar.sql
docker exec lsw-postgres psql -U lab -d eeducation_copia -f /tmp/restaurar.sql
docker exec lsw-postgres psql -U lab -d eeducation_copia -c "SELECT count(*) FROM prod_serv;"
```

Para borrar la copia: `docker exec lsw-postgres dropdb -U lab eeducation_copia`.

> No subas respaldos al repositorio: agrégalos a tu `.gitignore` o guárdalos fuera de la carpeta.

---

## 12. Día a día: comandos rápidos

| Quiero… | Comando |
|---|---|
| Encender PostgreSQL | `docker compose -f database/docker-compose.yml up -d postgres` |
| Apagarlo (conserva los datos) | `docker compose -f database/docker-compose.yml stop postgres` |
| Ver si está corriendo | `docker compose -f database/docker-compose.yml ps` |
| Ver sus mensajes | `docker logs -f lsw-postgres` (sal con `Ctrl+C`) |
| Entrar a psql | `docker exec -it lsw-postgres psql -U lab -d eeducation` |
| Ejecutar un `.sql` del repo | `docker exec lsw-postgres psql -U lab -d eeducation -f /docker-entrypoint-initdb.d/03_views.sql` |
| Visor web | `docker compose -f database/docker-compose.yml --profile visores up -d pgweb` → <http://localhost:8081> |
| Empezar desde cero | ver [paso 10](#10-empezar-desde-cero) |

---

## 13. Sin Docker Compose (solo para entender)

Así se crea un PostgreSQL "vacío" con un solo comando, sin los scripts del proyecto:

```bash
docker run -d --name pg-prueba -e POSTGRES_PASSWORD=mi_clave_local -p 5434:5432 postgres:17-alpine
docker exec -it pg-prueba psql -U postgres
```

Cuando termines: `docker rm -f pg-prueba`. Compose hace lo mismo pero guardando toda la configuración en un archivo, por eso el proyecto usa Compose.

---

## 14. Llevarlo a Supabase (proyecto final)

Supabase es PostgreSQL en la nube, así que los mismos scripts funcionan:

1. Crea un proyecto en <https://supabase.com>.
2. Menú **SQL Editor** → **New query**.
3. Pega y ejecuta, **en este orden**, el contenido de `01_schema.sql`, `02_seed.sql` y `03_views.sql`.
4. Revisa las tablas en **Table Editor**.

La contraseña de Supabase **no** es la del contenedor local: guárdala solo en tu `.env`.

---

## 15. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `error during connect` / `Cannot connect to the Docker daemon` | Docker Desktop no está abierto | Ábrelo y espera a **Engine running** |
| `Bind for 0.0.0.0:5433 failed: port is already allocated` | Otro programa usa el 5433 | Cambia `"5433:5432"` por `"5435:5432"` en el compose y usa ese puerto |
| `relation "catalogs" does not exist` | Los scripts no se ejecutaron porque el volumen ya existía | Haz el [paso 10](#10-empezar-desde-cero) |
| `docker logs` muestra `ERROR` en un `.sql` | Modificaste un script y tiene un error | Corrige el `.sql` y haz el paso 10 |
| `password authentication failed for user "lab"` | Cambiaste `POSTGRES_PASSWORD` después de crear el volumen (la contraseña se fija solo la primera vez) | Usa la contraseña original o haz el paso 10 |
| `database "eeducation" does not exist` | Escribiste mal el nombre o cambiaste `POSTGRES_DB` | Revisa con `\l` dentro de psql |
| `the input device is not a TTY` | Git Bash (mintty) no es una terminal compatible con `-it` | Usa PowerShell, o antepón `winpty`: `winpty docker exec -it lsw-postgres psql -U lab -d eeducation` |
| `C:/Program Files/Git/tmp/respaldo.sql: No such file or directory` (o `.../docker-entrypoint-initdb.d/...`) | Git Bash convierte las rutas que empiezan con `/` en rutas de Windows | Usa PowerShell, o antepón `MSYS_NO_PATHCONV=1`: `MSYS_NO_PATHCONV=1 docker exec lsw-postgres pg_dump -U lab -d eeducation -f /tmp/respaldo.sql` |
| psql se queda con el prompt `eeducation-#` | Olvidaste el `;` al final | Escribe `;` y Enter (o `\r` para cancelar) |
| Acentos raros en PowerShell | Codificación de la consola | Ejecuta `chcp 65001` antes de entrar a psql |
