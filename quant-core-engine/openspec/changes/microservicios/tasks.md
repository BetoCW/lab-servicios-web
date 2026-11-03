# Tareas

## 1. Separación
- [x] 1.1 Exportar un router por API en `routes/index.js` (`/account` como router propio)
- [x] 1.2 `serviceApp(name)`: un proceso por API que monta solo sus routers
- [x] 1.3 `gatewayApp()`: proxy `/api/v1/*` → servicio dueño, 503 si no responde
- [x] 1.4 `npm run dev` (microservicios) y `docker-compose.yml`
- [x] 1.5 `GET /market/{symbol}/bars` (velas + indicadores) en el servicio option-chains; gráfica en vivo en el front

## 2. Monitoreo
- [x] 2.1 `/health` por servicio y agregado en el gateway
- [x] 2.2 `/metrics` en formato Prometheus (peticiones y latencia por ruta y status)
- [x] 2.3 Prometheus + Grafana con dashboard provisionado

## 3. Pruebas
- [x] 3.1 Unitarias (`pruebas/unitarias/`)
- [x] 3.2 Integración gateway ↔ servicio (`pruebas/integracion/`)
- [x] 3.3 Contrato OpenAPI ↔ implementación y `/health` (`pruebas/contrato/`)
- [x] 3.4 Carga con k6 (`pruebas/carga/k6.js`)
- [x] 3.5 E2E / smoke contra Alpaca y Supabase reales a través del gateway (`pruebas/e2e/smoke.js`)
- [x] 3.6 Regresión en CI (`.github/workflows/quant-ci.yml`)
