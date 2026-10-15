---
name: alpaca-api
description: Referencia rápida de los endpoints de Alpaca (Trading API paper y Market Data) que usa quant-core-engine, con formas de request/response y reglas de opciones. Úsala antes de agregar o cambiar cualquier llamada a Alpaca, o al depurar un error que venga de Alpaca.
---

# Alpaca — referencia para el equipo F0

Base URLs (en `api/.env`):
- Trading (paper): `https://paper-api.alpaca.markets`
- Market data: `https://data.alpaca.markets`
- Headers: `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`

## Endpoints en uso

| Recurso | Método y ruta | Notas |
|---|---|---|
| Cuenta | `GET /v2/account` | `options_trading_level` ≥ 3 para spreads |
| Watchlists | `GET/POST /v2/watchlists` | El listado no trae `assets`; pedir el detalle |
| | `GET/PUT/DELETE /v2/watchlists/{id}` | PUT reemplaza `name` y `symbols` |
| | `POST /v2/watchlists/{id}` `{symbol}` · `DELETE /v2/watchlists/{id}/{symbol}` | |
| Órdenes | `GET /v2/orders?status=all&nested=true` · `POST /v2/orders` | números como string |
| | `PATCH /v2/orders/{id}` | crea una orden NUEVA; la original pasa a `replaced` |
| | `DELETE /v2/orders/{id}` (204) · `DELETE /v2/orders` (207) | |
| Contratos | `GET /v2/options/contracts?underlying_symbols=&expiration_date_gte=&...` | paginado con `next_page_token` |
| | `GET /v2/options/contracts/{symbol}` | valida un OCC |
| Snapshots | `GET /v1beta1/options/snapshots?symbols=A,B&feed=indicative` | `latestQuote{bp,ap}`, `latestTrade{p}`, `impliedVolatility`, `greeks` |
| Acciones | `GET /v2/stocks/{symbol}/snapshot?feed=iex` | precio del subyacente |

## Reglas de opciones
- `time_in_force` = `day` siempre.
- Multi-leg: `order_class: "mleg"`, máx. 4 `legs: [{symbol, ratio_qty, side, position_intent}]`; `qty` a nivel orden.
- OCC: `RAIZ + AAMMDD + C|P + strike×1000 (8 dígitos)` → helper `api/src/lib/occ.js`.
- Feed `indicative` es gratis (retrasado); `opra` requiere suscripción.

## Cómo verificar un endpoint nuevo
1. Lee la página exacta en https://docs.alpaca.markets/reference (WebFetch) y confirma ruta/campos.
2. Agrega el método en `api/src/lib/alpaca.js` (no uses fetch directo en servicios).
3. Prueba con el servidor corriendo y corre la skill `f0-smoke-test`.
