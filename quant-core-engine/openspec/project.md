# Proyecto: Quant Core Engine & Market Data (F0)

## Propósito
Equipo F0 de la plataforma de inversiones: construye el motor matemático analítico central y el
pipeline de datos de mercado que consumen los demás equipos.

## Stack
- **Motor**: Rust → WebAssembly (`engine/`), expuesto como `@core/quant-engine` (`packages/quant-engine/`).
- **APIs**: Node.js + Express 5 (REST) y GraphQL Yoga (`api/`).
- **Datos de mercado y ejecución**: Alpaca (Trading API paper + Market Data API).
- **Persistencia**: Supabase (PostgreSQL), proyecto `quant-core-engine-f0`, esquema en `supabase/migrations/`.

## Convenciones
- Código y documentación en español; nombres de campos JSON en camelCase en respuestas y
  snake_case en los bodies que se reenvían a Alpaca.
- Alpaca es la fuente de verdad de watchlists y órdenes; Supabase guarda el espejo.
- Las cadenas de opciones y estrategias son recursos propios (Supabase) alimentados por Alpaca.
- Todo cambio de contrato se propone primero en `openspec/changes/<id>/` y luego se fusiona en `openspec/specs/`.

## Capacidades
| Spec | Estado |
|---|---|
| [`market-data-api`](specs/market-data-api/spec.md) | Implementado (4 APIs CRUD) |
| [`quant-engine`](specs/quant-engine/spec.md) | Preparado (compila y tiene pruebas; aún sin consumidores) |
