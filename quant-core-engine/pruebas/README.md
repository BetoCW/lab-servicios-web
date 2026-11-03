# Pruebas y verificación del backend F0

Todo lo que verifica el backend vive aquí. Antes: `npm install` en `../api` (las pruebas usan sus dependencias).

| Carpeta | Tipo | Comando |
|---|---|---|
| `unitarias/` | Funciones puras: OCC, validación, métricas, indicadores, plantillas, motor WASM | `npm test` |
| `integracion/` | Gateway ↔ microservicio por HTTP (proxy, 503 si cae, health agregado) | `npm test` |
| `contrato/` | OpenAPI ↔ rutas implementadas y contrato `/health` | `npm test` |
| — | Motor Rust (`engine/src`, pruebas `#[cfg(test)]` junto al código) | `npm run motor` |
| `e2e/` | Smoke de 26 pasos contra Alpaca paper + Supabase reales (requiere `npm run dev` en `../api`) | `npm run smoke` |
| `carga/` | k6: 25 usuarios, p95 < 800 ms, errores < 1 % (Docker) | `npm run carga` |
| — | Seguridad: `npm audit` + OWASP ZAP baseline (Docker) | `npm run seguridad` |
| `colecciones/` | Insomnia/Postman (`f0-collection.json`) y REST Client (`f0.http`) | `npm run coleccion` la regenera |
| `mcp/` | Servidor MCP `f0-api`: Claude Code corre la colección (registrado en `/.mcp.json`) | — |

CI (`.github/workflows/quant-ci.yml`) corre `npm test` y `npm run motor` en cada push.
