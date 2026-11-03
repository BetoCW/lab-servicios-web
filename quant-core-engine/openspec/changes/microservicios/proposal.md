# Propuesta: separar las 4 APIs F0 en microservicios

## Por qué
T3-Actividad 2 pide aplicar microservicios a todas las APIs del proyecto. Hoy las 4 APIs corren en un
solo proceso (monolito, puerto 3060): una caída o un Monte Carlo pesado en `strategies` afecta a todas.

## Qué cambia
- Cada API corre en su propio proceso: `watchlists :3061`, `orders :3062` (+ `/account`),
  `option-chains :3063`, `strategies :3064`.
- Un **API Gateway** en `:3060` conserva la URL pública: reenvía `/api/v1/<recurso>` al servicio
  dueño y sigue sirviendo GraphQL, Swagger y el front. Los clientes no cambian.
- Cada proceso expone `GET /health` y `GET /metrics` (Prometheus). El `/health` del gateway agrega
  el de los 4 servicios.
- `docker-compose.yml` levanta los 5 procesos más Prometheus y Grafana.
- Se retira el monolito: `npm run dev` levanta los microservicios y el gateway.

## Impacto
- Specs: nueva capacidad `microservices`; `market-data-api` no cambia (mismo contrato REST).
- Código: `api/src/microservices/`, `api/src/lib/metrics.js`, `api/src/app.js` (fábrica), `routes/index.js` (un router por API).
- Riesgo: GraphQL sigue en proceso dentro del gateway (atajo documentado en el código).
