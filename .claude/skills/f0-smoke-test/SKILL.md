---
name: f0-smoke-test
description: Levanta la API de quant-core-engine y recorre GET/POST/PUT/PATCH/DELETE de las 4 APIs (watchlists, orders, option-chains, strategies) más GraphQL contra Alpaca paper y Supabase reales. Úsala para comprobar que las APIs funcionan después de cualquier cambio.
---

# Smoke test de las 4 APIs F0

Requisitos: `quant-core-engine/api/.env` con `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

```bash
cd quant-core-engine/api
npm install            # solo la primera vez
npm run dev &          # puerto 3060
sleep 2
curl -s localhost:3060/ | jq .missingConfig   # debe ser []
npm run smoke
```

`scripts/smoke.js` crea, edita y borra: una watchlist, una cadena de SPY (calls, 3 semanas),
un bull call spread (lo envía como mleg limit 0.01 y lo cancela al borrar) y una orden limit
de AAPL a $1 (la reemplaza y la cancela). Imprime una tabla `ok | method | path | status | note`.

Interpretación:
- `503` → falta una variable del `.env` (el mensaje dice cuál).
- `403`/`422` de Alpaca en `/submit` → nivel de opciones insuficiente o mercado cerrado para mleg; revisa `GET /api/v1/account` (`optionsLevel`).
- `500 Supabase: ...` → tabla/columna faltante: aplica migraciones (skill `supabase-migrate`).

Reporta la tabla tal cual; no la resumas como "todo bien" si hay FAIL.
