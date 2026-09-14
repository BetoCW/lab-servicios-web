# 05 · Bases de datos locales con Docker (MongoDB y PostgreSQL)

Opcional. Sirve para practicar sin internet, para no tocar la base compartida de Atlas y para probar el **esquema relacional** del proyecto final.

## Levantar

```bash
docker compose -f database/docker-compose.yml up -d mongo postgres
```

| Servicio | Conexión desde tu PC |
|---|---|
| MongoDB 8 | `mongodb://localhost:27018` |
| PostgreSQL 17 | `postgresql://lab:lab_local_2026@localhost:5433/eeducation` |

La primera vez que se crea el contenedor de Postgres se ejecutan en orden los scripts de [`database/postgres`](../database/postgres):

1. `01_schema.sql`: tablas, llaves, restricciones, índices y triggers.
2. `02_seed.sql`: los mismos datos de prueba que las APIs.
3. `03_views.sql`: vistas que devuelven el **mismo JSON** que MongoDB.

Para volver a ejecutarlos desde cero: `docker compose -f database/docker-compose.yml down -v` y otra vez `up -d`.

## Usar Mongo local en las APIs

En el `.env` de la API:

```
CONNECTION_STRING=mongodb://localhost:27018
```

y corre `npm run seed`.

## Visores web (opcional)

```bash
docker compose -f database/docker-compose.yml --profile visores up -d
```

- pgweb (Postgres local, ya conectado): <http://localhost:8081>
- mongo-express (Mongo local): <http://localhost:8082>

## Consultas útiles en PostgreSQL

```bash
docker exec -it lsw-postgres psql -U lab -d eeducation
```

```sql
-- Tablas
\dt

-- Árbol de un catálogo con su nivel
SELECT repeat('  ', level - 1) || code AS arbol
FROM v_catalog_values_tree t JOIN catalogs c ON c.id = t.catalog_id
WHERE c.key = 'education_levels' ORDER BY path;

-- Catálogo en el mismo formato JSON que la API
SELECT jsonb_pretty(catalog) FROM v_catalogs_json WHERE key = 'file_type';

-- Producto con presentaciones y archivos
SELECT jsonb_pretty(prod_serv) FROM v_prod_serv_json WHERE id_prod_serv_ok = '1-CONST-EST';
```

## En Supabase (proyecto final)

Supabase es PostgreSQL administrado. Copia el contenido de `01_schema.sql`, `02_seed.sql` y `03_views.sql` en *SQL Editor* y ejecútalos en ese orden. La extensión `pgcrypto` ya viene habilitada.
