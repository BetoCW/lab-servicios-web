# Propuesta: pantalla única rápida y barata en peticiones

## Por qué
Toda la app vive en una sola vista con la gráfica como protagonista. Medido con la pantalla real: una carga
disparaba 32 peticiones (20 de ellas `GET /strategies/:id` una por una, y `bars` repetido 5 veces) y cada
cambio de ticker pedía cotización, velas, indicadores y vencimientos por separado. Alpaca limita a 200/min.

## Qué cambia
- `GET /market/overview?symbol=` devuelve cotización, indicadores resumidos y vencimientos en una llamada,
  con carga parcial (`errors` por bloque) y caché corto.
- `lib/cache.js` (`memo`): TTL + deduplicación de peticiones en vuelo; lo usan snapshot (2 s), historial
  diario (5 min, SPY compartido entre tickers), vencimientos (10 min) y `GET /strategies/recommend` (20 s).
- `GET /strategies?priced=true`: precios en vivo de todas las estrategias con UNA consulta a Alpaca.
- `POST /strategies/auto`: una ejecución a la vez y bloqueo de 60 s por ticker tras enviar una orden (429).
- `lib/symbol.js`: validación única de tickers.

## Impacto
- Specs: nueva capacidad `pantalla-unica`. Código: `api/src/{lib,services,routes,docs}`, `pruebas/unitarias/pantallaUnica.test.js`.
- Documento: `docs/arquitectura/UI-UNA-VISTA.md`.
- Riesgo: cachés en memoria por proceso (si se escala a réplicas, pasar a Redis).
