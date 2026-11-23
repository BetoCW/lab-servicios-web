# market-data-api

## Purpose

Proveer endpoints REST y GraphQL para el acceso a datos de mercado de Alpaca, administración de listas de seguimiento, órdenes de trading, ingesta de cadenas de opciones y valoración cuantitativa de estrategias multi-leg con persistencia sincronizada en Supabase.

## Requirements

### Requirement: Watchlists CRUD
El sistema SHALL exponer `GET/POST /watchlists`, `GET/PUT/DELETE /watchlists/{id}`,
`POST /watchlists/{id}/symbols` y `DELETE /watchlists/{id}/symbols/{symbol}`, ejecutando cada
operación en Alpaca (`/v2/watchlists`) y reflejando el resultado en la tabla `watchlists`.

#### Scenario: Crear una watchlist
- **WHEN** se hace `POST /watchlists` con `{ "name": "Tech", "symbols": ["AAPL"] }`
- **THEN** responde `201` con `{ id, name, symbols }` donde `id` es el id de Alpaca
- **AND** existe una fila en `watchlists` con `alpaca_id = id`

#### Scenario: Body inválido
- **WHEN** se hace `POST /watchlists` sin `name`
- **THEN** responde `400` con `details` listando los campos faltantes

### Requirement: Orders CRUD
El sistema SHALL exponer `GET/POST/DELETE /orders` y `GET/PATCH/DELETE /orders/{id}` sobre
Alpaca `/v2/orders` (paper), guardando cada orden observada en la tabla `orders`.

#### Scenario: Reemplazar una orden
- **WHEN** se hace `PATCH /orders/{id}` con `{ "limit_price": 1.05 }`
- **THEN** responde la orden **nueva** que regresa Alpaca (otro `id`)
- **AND** la orden original queda en `orders` con el estado que reporte Alpaca (`pending_replace` o `replaced`)

#### Scenario: Reemplazar con el mercado cerrado
- **WHEN** la orden está en `accepted` o `pending_new` (Alpaca responde 422 al PATCH)
- **THEN** se cancela y se reenvía con los campos cambiados, y la respuesta lleva `replaceMode = cancel_resubmit` y `replaces = <id original>`

#### Scenario: Cancelar
- **WHEN** se hace `DELETE /orders/{id}`
- **THEN** responde la orden con el estado que reporta Alpaca después de cancelar

### Requirement: Option chains CRUD (ingesta)
El sistema SHALL permitir seguir cadenas de opciones: `POST /option-chains` guarda los filtros
(subyacente, rango de vencimientos, tipo, rango de strikes) e ingesta contratos
(`/v2/options/contracts`) y snapshots (`/v1beta1/options/snapshots`: bid/ask, último, IV y griegas)
en `option_quotes`; `PUT` reemplaza filtros y re-ingesta; `POST /{id}/refresh` re-ingesta;
`DELETE` borra la cadena y sus cotizaciones. La ingesta SHALL limitarse a 300 contratos por cadena.

#### Scenario: Ingesta fallida
- **WHEN** Alpaca rechaza la ingesta durante `POST /option-chains`
- **THEN** no queda ninguna fila en `option_chains` y se responde el status de Alpaca

### Requirement: Strategies CRUD
El sistema SHALL guardar estrategias de 1 a 4 piernas (`strategies` + `strategy_legs`) cuyos
símbolos OCC existan en Alpaca y pertenezcan al subyacente declarado; `GET /{id}` SHALL valorar
cada pierna con la cotización viva (mid) y el costo neto; `PUT` solo aplica en `draft`;
`POST /{id}/submit` SHALL enviar una orden `order_class = mleg` con `time_in_force = day`.

#### Scenario: Pierna de otro subyacente
- **WHEN** se crea una estrategia `underlying = SPY` con una pierna `AAPL...`
- **THEN** responde `400` indicando el subyacente real del contrato

#### Scenario: Editar una estrategia enviada
- **WHEN** se hace `PUT /strategies/{id}` y el estado es `submitted`
- **THEN** responde `409`

### Requirement: Riesgo de estrategias con el motor
`GET /strategies/{id}/risk` SHALL tomar el precio del subyacente y el mid e IV de cada pierna de
Alpaca (si falta la IV, el motor la calcula del mid) y regresar, calculado con `@core/quant-engine`:
Monte Carlo del P&L al primer vencimiento (`paths`, `seed`), matriz de P&L precio × vol, P&L al
vencimiento por movimiento del subyacente, márgenes Reg T y SPAN, griegas del portafolio, precio del
motor vs. mid de mercado por pierna y tiempos de cómputo.

#### Scenario: Pierna vencida
- **WHEN** alguna pierna ya venció
- **THEN** responde `400` listando los símbolos vencidos

#### Scenario: Spread vertical
- **WHEN** se analiza un bull call spread de débito
- **THEN** el margen Reg T es igual al débito neto (su pérdida máxima)

### Requirement: Paridad GraphQL
Cada operación REST SHALL tener su query o mutation equivalente en `/graphql`, resuelta por el
mismo servicio, y los errores SHALL llevar `extensions.status` con el código HTTP.

#### Scenario: Consulta equivalente
- **WHEN** se ejecuta una query o mutation GraphQL válida
- **THEN** responde con los mismos datos y estructura de campos que el endpoint REST equivalente

### Requirement: Configuración faltante
El sistema SHALL rechazar peticiones cuando falten credenciales requeridas.

#### Scenario: Variables de entorno ausentes
- **WHEN** faltan llaves de Alpaca o Supabase en `.env`
- **THEN** las operaciones responden `503` con el nombre de la variable faltante

### Requirement: Velas e indicadores en vivo
El sistema SHALL exponer `GET /market/{symbol}/bars?timeframe=1Min|5Min|15Min|1Hour|1Day&limit=50..1000`
(microservicio `option-chains`) con las velas OHLCV más recientes de Alpaca (`/v2/stocks/{symbol}/bars`,
feed IEX), la última vela actualizada con el último trade, y los indicadores SMA20, EMA9, Bollinger 20/2,
RSI14 (Wilder) y MACD 12/26/9 alineados con las velas (`null` durante el calentamiento).

#### Scenario: Temporalidad inválida
- **WHEN** se hace `GET /market/SPY/bars?timeframe=2Min`
- **THEN** responde `400` listando las temporalidades válidas

#### Scenario: Precio en vivo
- **WHEN** el último trade cae dentro del periodo de la última vela
- **THEN** su `close` es el precio del trade y `high`/`low` lo incluyen

### Requirement: Explorar oportunidades en varias empresas
El sistema SHALL exponer `GET /strategies/scan?horizonDays=30..120&universe=watchlists|liquid&limit=1..50&cores=...`
que corre el recomendador en cada empresa del universo con vencimientos dentro de `horizonDays` (por defecto 90)
y devuelve `{ generatedAt, horizonDays, universe, rows: [{ symbol, template, name, score, expectedValue, probProfit, nearExpiration }], skipped: [{ symbol, reason }] }`
ordenado por `score` descendente, como máximo `limit` filas (por defecto 20).

#### Scenario: Ranking empresa + estrategia
- **WHEN** se hace `GET /strategies/scan?horizonDays=90`
- **THEN** responde `200` con filas de distintas empresas y estrategias ordenadas por puntaje, todas con vencimiento a 90 días o menos

#### Scenario: Una empresa falla
- **WHEN** una empresa del universo no tiene opciones o Alpaca responde error
- **THEN** aparece en `skipped` con el motivo y el resto del ranking se devuelve normalmente

#### Scenario: Horizonte inválido
- **WHEN** se hace `GET /strategies/scan?horizonDays=400`
- **THEN** responde `400` indicando el rango válido 30–120

### Requirement: Top de empresas para una estrategia
El sistema SHALL exponer `GET /strategies/screen?template=<plantilla>&horizonDays=..&universe=..&limit=1..50`
que devuelve las empresas del universo ordenadas por el puntaje de esa plantilla (por defecto las 10 mejores),
con el mismo formato de filas y `skipped` que el scan.

#### Scenario: Top 10 de short strangle
- **WHEN** se hace `GET /strategies/screen?template=short-strangle`
- **THEN** responde `200` con hasta 10 filas, todas con `template = short-strangle`, ordenadas por `score` descendente

#### Scenario: Plantilla desconocida
- **WHEN** se hace `GET /strategies/screen?template=iron-butterfly`
- **THEN** responde `400` listando las plantillas válidas

### Requirement: Paridad GraphQL de exploración
El sistema SHALL exponer las queries `strategyScan` y `strategyScreen` con los mismos argumentos y resultados que REST.

#### Scenario: Mismo formato
- **WHEN** se consulta `strategyScan(horizonDays: 90)`
- **THEN** devuelve el mismo formato `ScanResult` (filas, skipped, scanned) que `GET /strategies/scan?horizonDays=90`
