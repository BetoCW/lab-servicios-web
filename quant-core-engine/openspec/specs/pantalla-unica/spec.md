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
# Detalle de señales técnicas

- Dado un cruce alcista o bajista de EMA9/SMA20 o MACD/señal, una salida de
  sobreventa/sobrecompra del RSI, o un retorno al interior de Bollinger, cuando
  se consulta histórico, entonces la gráfica marca compra/venta en su vela y
  muestra la fecha. El detalle incluye fecha y hora local, cierre y motivo.
- Dados filtros de indicadores desmarcados, entonces tanto las flechas como el
  resumen y la tabla excluyen esas señales. Sin señales se informa explícitamente.
- Las señales se calculan solo con los datos disponibles hasta esa vela, sin datos futuros.
  En temporalidades semanales/mensuales representan la vela de ese período; la
  señal de la vela en curso puede cambiar con su cierre.

### Requirement: Flechas por rebote en soportes y resistencias

`GET /market/{symbol}/bars` incluye `levelSignals` con índice de vela, tiempo,
lado, cierre, zona histórica y motivo. Cada zona se calcula con hasta 200 velas
anteriores a la vela evaluada, manteniendo los pivotes confirmados y el mínimo
de dos contactos del detector existente. No se proyectan zonas actuales al pasado.

#### Scenario: Rebote confirmado en soporte
- **GIVEN** el cierre anterior está sobre el límite superior de un soporte conocido
- **WHEN** una vela cerrada intersecta esa zona, cierra sobre su límite superior y tiene cierre mayor que apertura
- **THEN** aparece una flecha verde de compra y una fila con fecha, cierre, límites de la zona y motivo

#### Scenario: Rechazo confirmado en resistencia
- **GIVEN** el cierre anterior está bajo el límite inferior de una resistencia conocida
- **WHEN** una vela cerrada intersecta esa zona, cierra bajo su límite inferior y tiene cierre menor que apertura
- **THEN** aparece una flecha roja de venta con su detalle

#### Scenario: Sin confirmación o sin evidencia
- **WHEN** la vela sigue abierta, no hay zona confirmada, o toca/rompe una zona sin cumplir las reglas de rebote/rechazo
- **THEN** no genera señal de soportes/resistencias

#### Scenario: Filtro y estabilidad histórica
- **WHEN** se desmarca Soportes y resistencias
- **THEN** se ocultan sus zonas, flechas, resumen y filas de detalle
- **WHEN** se añaden velas futuras al mismo historial
- **THEN** las señales ya confirmadas conservan sus datos y fecha
