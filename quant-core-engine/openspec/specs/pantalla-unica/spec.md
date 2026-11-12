# pantalla-unica Specification

## Purpose

Consolida las consultas del espacio de trabajo en una sola vista optimizada con cotizaciones en vivo, indicadores técnicos, vencimientos y ejecución protegida minimizando el presupuesto de peticiones hacia Alpaca.

## Requirements

### Requirement: Resumen del ticker en una llamada
El sistema SHALL ofrecer `GET /market/overview?symbol=` con cotización, indicadores diarios resumidos (SMA20, EMA9, RSI14, Bollinger, HV30) y vencimientos de opciones de los próximos 120 días.

#### Scenario: Falla un bloque secundario
- **WHEN** Alpaca no entrega velas diarias o contratos de opciones
- **THEN** la respuesta es 200, el bloque caído es `null` y su motivo va en `errors`

#### Scenario: Ticker inexistente o inválido
- **WHEN** el ticker no es válido o Alpaca no tiene cotización
- **THEN** responde 400 (formato) o el status de Alpaca (404), sin cuerpo parcial

### Requirement: Presupuesto de peticiones a Alpaca
El sistema SHALL deduplicar peticiones idénticas simultáneas y cachear: snapshot 2 s, historial 5 min, vencimientos 10 min, recomendación 20 s. Los fallos no se cachean.

#### Scenario: Dos clientes piden lo mismo a la vez
- **WHEN** dos peticiones del mismo ticker llegan antes de que termine la primera
- **THEN** solo se consulta a Alpaca una vez

### Requirement: Precios de todas las estrategias en una consulta
`GET /strategies?priced=true` SHALL devolver `pricing` y cotizaciones por pierna usando una sola consulta de snapshots.

#### Scenario: Consulta de estrategias con precios en vivo
- **WHEN** un cliente invoca `GET /strategies?priced=true`
- **THEN** la respuesta incluye `pricing` y cotizaciones calculadas con una única consulta de snapshots de Alpaca

### Requirement: Ejecución automática protegida
`POST /strategies/auto` SHALL rechazar con 429 una segunda ejecución simultánea y un segundo envío del mismo ticker dentro de 60 s; un fallo al enviar libera el bloqueo.

#### Scenario: Ejecución simultánea o recurrente dentro del intervalo protegido
- **WHEN** se invoca `POST /strategies/auto` mientras hay una ejecución en curso o dentro de los 60 s posteriores para el mismo ticker
- **THEN** la petición es rechazada con código HTTP 429
