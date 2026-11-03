# Quant Core Engine & Market Data (F0)

Equipo F0 de la plataforma de inversiones: **motor matemático analítico central** y **pipeline de
datos de mercado**.

| Carpeta | Qué es | Estado |
|---|---|---|
| [`api/`](api) | 4 APIs CRUD (REST + GraphQL) conectadas a **Alpaca** y persistidas en **Supabase** · puerto 3060 | En uso |
| [`supabase/migrations/`](supabase/migrations) | Esquema del proyecto Supabase `quant-core-engine-f0` | Aplicado |
| [`engine/`](engine) | Motor en Rust → WebAssembly: Black-Scholes, binomial americano, griegas, IV, Reg T / SPAN, Monte Carlo | En uso (riesgo de estrategias) |
| [`packages/quant-engine/`](packages/quant-engine) | `@core/quant-engine`: contrato síncrono en JS sobre el `.wasm` | En uso |
| [`openspec/`](openspec) | Contratos OpenSpec de las APIs y del motor | — |

```mermaid
flowchart LR
    C[Cliente<br/>Swagger · REST Client · GraphQL] --> API
    subgraph API["api/ :3060"]
        R[REST /api/v1] --> S[Servicios]
        G[GraphQL /graphql] --> S
    end
    S -->|watchlists · orders · contracts · snapshots · mleg| A[(Alpaca Paper<br/>Trading + Market Data)]
    S -->|espejo y recursos propios| B[(Supabase<br/>quant-core-engine-f0)]
    S -->|GET /strategies/{id}/risk| E[engine/ Rust → WASM<br/>@core/quant-engine]
```

## Las 4 APIs

| # | Recurso | Alpaca | GET | POST | PUT / PATCH | DELETE |
|---|---|---|---|---|---|---|
| 1 | `/api/v1/watchlists` | `/v2/watchlists` | lista, detalle | crear, agregar símbolo | PUT nombre + símbolos | borrar, quitar símbolo |
| 2 | `/api/v1/orders` | `/v2/orders` | lista, detalle | enviar orden | PATCH reemplazar | cancelar una / todas |
| 3 | `/api/v1/option-chains` | `/v2/options/contracts` + `/v1beta1/options/snapshots` | lista, cadena con IV y griegas | seguir + ingestar, `/{id}/refresh` | PUT filtros + re-ingesta | dejar de seguir |
| 4 | `/api/v1/strategies` | contratos OCC + orden `mleg` | lista, detalle valorado en vivo, **`/{id}/risk` (motor)** | crear, `/{id}/submit` | PUT (solo draft) | borrar (cancela si se envió) |

Todas tienen su equivalente en **GraphQL** (`/graphql`) y están documentadas en **Swagger** (`/api-docs`).

## Cómo correrlo

```bash
cd quant-core-engine/api
npm install
cp .env.example .env     # y llena las 4 variables de abajo
npm run dev              # 4 microservicios + gateway en http://localhost:3060
cd ../pruebas && npm run smoke   # en otra terminal: recorre todo el CRUD de las 4 APIs
```

| Variable | De dónde sale |
|---|---|
| `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` | [app.alpaca.markets](https://app.alpaca.markets) → cuenta **Paper** → *API Keys* → *Generate New Keys* |
| `SUPABASE_URL` | `https://baefggsjvchvnuudlpbl.supabase.co` |
| `SUPABASE_SECRET_KEY` | Dashboard → *Project Settings* → *API Keys* → **Secret key** (`sb_secret_...`) |

`GET http://localhost:3060/` dice qué variables faltan (`missingConfig`). Sin ellas las APIs responden `503`.

## Dónde probar las APIs (sin instalar nada)

Con `npm run dev` corriendo:

| Herramienta | URL / archivo | Para qué |
|---|---|---|
| **Front F0** | https://betocw.github.io/lab-servicios-web/ · o local en http://localhost:3060/app | Demo visual de las 4 APIs: watchlists, cadena con IV/griegas, armar spreads y órdenes |
| **Swagger UI** | http://localhost:3060/api-docs | Probar cada endpoint REST con *Try it out* |
| **GraphiQL** | http://localhost:3060/graphql | Escribir queries/mutations con autocompletado |
| Colección (Insomnia v4) | [`pruebas/colecciones/f0-collection.json`](pruebas/colecciones/f0-collection.json) | 28 peticiones con ids encadenados; se importa en Insomnia, Postman, Bruno, Hoppscotch o Yaak |
| REST Client | [`pruebas/colecciones/f0.http`](pruebas/colecciones/f0.http) | Extensión de VS Code |
| MCP `f0-api` | [`pruebas/mcp/f0-api-mcp.js`](pruebas/mcp/f0-api-mcp.js) (registrado en `.mcp.json`) | Claude Code ejecuta la misma colección |

El front ([`web/index.html`](web/index.html), un solo archivo sin dependencias) se publica solo en
GitHub Pages con cada push a `main` que toque `quant-core-engine/web/` (workflow
`.github/workflows/pages.yml`). Pages solo sirve el HTML: la API con las llaves sigue corriendo en
tu máquina y el front le habla a `http://localhost:3060` (editable arriba a la derecha). Si Chrome
pregunta por *acceso a la red local*, permítelo.

La colección se regenera con `npm run coleccion` en `pruebas/` (fechas de vencimiento relativas a hoy).
Al importarla, ejecuta las carpetas en orden: el *POST crear* de cada una guarda el id en el
environment y las demás peticiones lo reutilizan.

### MCP `f0-api`
Servidor MCP sin dependencias. Herramientas: `f0_status`, `f0_list_requests`, `f0_run_request`,
`f0_run_all`, `f0_call`, `f0_graphql`, `f0_reload_collection`. Claude Code lo carga desde
`.mcp.json` en la raíz del repo (hay que aprobarlo la primera vez y reiniciar la sesión).

## Base de datos (Supabase)

Proyecto **quant-core-engine-f0** (us-east-1, organización CocaCola).
Tablas: `watchlists`, `orders`, `option_chains`, `option_quotes`, `strategies`, `strategy_legs`,
todas con RLS (solo el backend con la llave secreta las lee y escribe).

## Motor: riesgo con datos reales

`GET /api/v1/strategies/{id}/risk?paths=100000` toma de Alpaca el precio del subyacente y el mid e IV
de cada pierna, y corre en el motor Rust/WASM:

- **Monte Carlo** del P&L al vencimiento (GBM con variables antitéticas; ~100,000 trayectorias en ~10 ms)
- **Matriz de P&L** precio × volatilidad y P&L al vencimiento por movimiento del subyacente
- **Margen Reg T** (reconoce spreads verticales) y **SPAN** (16 escenarios)
- **Griegas** del portafolio y **precio del motor vs. mid de Alpaca** por pierna

En el front: pestaña *Estrategias* → **Riesgo (motor)**. Tasa libre de riesgo: `RISK_FREE_RATE` (4% por defecto).

> El Monte Carlo usa una sola volatilidad (la IV promedio de las piernas). El mercado tiene *skew*
> (las puts OTM tienen más IV), por eso el P&L esperado del modelo sale negativo aunque el precio de
> cada pierna coincida con el mercado: esa diferencia es justo lo que el skew está cobrando.

### Pruebas del motor

```bash
cd packages/quant-engine && npm run build   # compila a WASM
cd ../../pruebas && npm run motor && npm test   # 15 pruebas Rust + pruebas JS (motor incluido)
```

```js
import { blackScholes, binomial, impliedVol, spanMargin } from '@core/quant-engine';
blackScholes([{ type: 'call', spot: 42, strike: 40, t: 0.5, rate: 0.1, vol: 0.2 }]); // price ≈ 4.7594
```

## Gráfica en vivo y plantillas de estrategias

- Pestaña **Gráfica en vivo** del front: velas de Alpaca (feed IEX, tiempo real) que se refrescan cada 5 s,
  con SMA20, EMA9, Bollinger, RSI14 y MACD calculados en el microservicio (`GET /api/v1/market/{symbol}/bars`).
  *Superponer estrategia* dibuja los strikes de una estrategia guardada sobre el precio.
- Pestaña **Estrategias** → *Plantilla*: arma **straddle, strangle (long/short), calendar y diagonal** desde
  la cadena abierta ([`web/templates.js`](web/templates.js)): ATM por strike, OTM por delta 0.25 / 0.30. Para
  calendar y diagonal la cadena necesita al menos dos vencimientos con strikes cerca del spot (rango de strikes angosto).

## Microservicios, pruebas y monitoreo (T3-Act 2)

```bash
cd api && npm run dev            # 4 microservicios + gateway (sin Docker)
docker compose up -d --build     # lo mismo + Prometheus :9090 + Grafana :3000 (admin/admin)
```

| Proceso | Puerto | Rutas |
|---|---|---|
| **gateway** | 3060 | proxy `/api/v1/*`, `/graphql`, `/api-docs`, `/app` |
| watchlists | 3061 | `/api/v1/watchlists` |
| orders | 3062 | `/api/v1/orders`, `/api/v1/account` |
| option-chains | 3063 | `/api/v1/option-chains`, `/api/v1/market/{symbol}/bars` |
| strategies | 3064 | `/api/v1/strategies` (motor WASM) |

Todos exponen `GET /health` y `GET /metrics` (Prometheus). El `/health` del gateway agrega el de los 4.
Diseño y spec: [`openspec/changes/microservicios`](openspec/changes/microservicios);
qué API se hizo con IA y cuál se optimizó a mano: [`openspec/config.yaml`](openspec/config.yaml).

| Tipo | Cómo | Estado |
|---|---|---|
Todas las pruebas y verificaciones viven en [`pruebas/`](pruebas) y se corren desde ahí (`cd pruebas`):

| Tipo | Cómo | Estado |
|---|---|---|
| Unitarias | `npm test` → `unitarias/` (API, indicadores, plantillas, motor WASM) · `npm run motor` (Rust) | ✅ |
| Integración | `npm test` → `integracion/gateway.test.js` (gateway ↔ servicio, servicio caído → 503) | ✅ |
| Contrato | `npm test` → `contrato/openapi.test.js` (OpenAPI ↔ rutas, contrato `/health`) | ✅ (Pact: pendiente) |
| E2E / smoke | `npm run smoke` → `e2e/smoke.js` (26 pasos contra Alpaca + Supabase reales) | ✅ |
| Carga | `npm run carga` → `carga/k6.js` (k6 en Docker, p95 < 800 ms) | script listo |
| Seguridad | `npm run seguridad` (`npm audit` + OWASP ZAP baseline en Docker) | script listo |
| Manuales | `colecciones/` (Insomnia/Postman, REST Client) · `mcp/` (Claude Code) | ✅ |
| Regresión | `.github/workflows/quant-ci.yml` (`npm test` + `cargo test` en cada push) | ✅ |
| Health checks | `/health` → apuntar UptimeRobot a la URL pública del gateway | endpoint listo |
| Métricas | Prometheus + Grafana (dashboard *F0 microservicios*) | ✅ |
| Logs | `morgan` por servicio (`docker compose logs -f`) | ELK / Sentry / APM: no implementado |

## Agentes y skills de Claude Code

En [`.claude/`](../.claude) del repo:

| Agente | Para qué |
|---|---|
| `alpaca-integrator` | Endpoints y errores de Alpaca |
| `supabase-dba` | Tablas, RLS y migraciones |
| `quant-math-reviewer` | Validar la matemática del motor |
| `api-contract-guardian` | REST ⇄ GraphQL ⇄ OpenAPI ⇄ OpenSpec alineados |

| Skill | Para qué |
|---|---|
| `alpaca-api` | Referencia de endpoints de Alpaca en uso |
| `supabase-migrate` | Escribir, aplicar y verificar migraciones |
| `f0-smoke-test` | Correr el CRUD completo de las 4 APIs |
| `quant-engine-build` | Compilar el WASM y correr pruebas |
| `openspec-change` | Proponer cambios de contrato |
