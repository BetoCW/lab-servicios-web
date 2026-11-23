## ADDED Requirements

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
