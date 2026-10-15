---
name: supabase-migrate
description: Crear y aplicar migraciones SQL al proyecto Supabase quant-core-engine-f0 y verificar el resultado. Úsala al agregar/cambiar tablas, índices, triggers o RLS del proyecto quant-core-engine.
---

# Migraciones Supabase (quant-core-engine-f0)

Proyecto: `quant-core-engine-f0` · ref `baefggsjvchvnuudlpbl` · us-east-1 · URL `https://baefggsjvchvnuudlpbl.supabase.co`

## 1. Escribir la migración
- Archivo nuevo: `quant-core-engine/supabase/migrations/NNN_descripcion.sql` (siguiente número).
- Idempotente: `create table if not exists`, `create index if not exists`, `create or replace function`.
- Toda tabla: `alter table ... enable row level security`. Si tiene `updated_at`, trigger con `public.set_updated_at()`.

## 2. Aplicarla (elige una)
**A. SQL Editor del dashboard** (funciona aunque 5432/6543 estén bloqueados):
`https://supabase.com/dashboard/project/baefggsjvchvnuudlpbl/sql/new` → pegar → Run.
Si avisa "destructive operations" por un `drop trigger if exists`, es esperado; usa "Run and enable RLS".

**B. psql** (desde una red con salida a Postgres):
```bash
psql "postgresql://postgres.baefggsjvchvnuudlpbl:<DB_PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -f quant-core-engine/supabase/migrations/NNN_descripcion.sql
```

## 3. Verificar
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
```
Todas deben salir con `rowsecurity = true`. Luego corre la skill `f0-smoke-test`.

## 4. Propagar
Actualiza servicio (`api/src/services`), tipos GraphQL, OpenAPI y `openspec/specs/market-data-api/spec.md`.
