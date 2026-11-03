# microservices

## ADDED Requirements

### Requirement: Un proceso por API
El sistema SHALL ejecutar cada API F0 como un microservicio independiente: `watchlists` (3061),
`orders` con `/account` (3062), `option-chains` (3063) y `strategies` (3064), reutilizando los
mismos servicios que el monolito.

#### Scenario: Falla aislada
- **WHEN** el microservicio `strategies` está caído
- **THEN** `GET /api/v1/watchlists` en el gateway sigue respondiendo `200`
- **AND** `/api/v1/strategies` responde `503` con el nombre del servicio que no responde

### Requirement: API Gateway
El sistema SHALL exponer un gateway en el puerto 3060 que reenvíe `/api/v1/<recurso>` al
microservicio dueño conservando método, query, body y status, y que sirva `/graphql`, `/api-docs` y `/app`.

#### Scenario: Error de validación propagado
- **WHEN** se hace `GET /api/v1/watchlists/no-es-uuid` al gateway
- **THEN** responde `400` con el mismo body que produce el microservicio

### Requirement: Salud y métricas
Cada proceso SHALL exponer `GET /health` (`200 { status: "ok", service }`, o `503` con
`status: "degraded"` si falta configuración) y `GET /metrics` en formato de texto Prometheus con
`http_requests_total` y `http_request_duration_seconds` etiquetados por `service`, `method`, `route` y `status`.

#### Scenario: Salud agregada
- **WHEN** se hace `GET /health` al gateway y un microservicio no responde
- **THEN** responde `503` y en `services` ese microservicio aparece como `down`
