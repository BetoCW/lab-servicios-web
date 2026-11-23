# Explorar oportunidades: scan multi-empresa y top 10 por estrategia

## Por qué
El recomendador solo responde para el ticker que la persona escribe. La revisión del profesor pide dos preguntas
que hoy no se pueden contestar sin teclear empresa por empresa:
1. "En los próximos 90 días, ¿qué operaciones hay con varias estrategias y empresas, sin que yo las elija?"
2. "Te doy una estrategia: ¿cuáles son las 10 mejores empresas para ella?"

## Qué cambia
- **`GET /strategies/scan?horizonDays=90&universe=watchlists|liquid&limit=20&cores=...`**
  Recorre un universo de empresas, corre el recomendador existente (`recommendService.recommend`) en cada una,
  con vencimientos dentro de `horizonDays`, y devuelve **un ranking único empresa + estrategia** ordenado por puntaje.
- **`GET /strategies/screen?template=short-strangle&horizonDays=90&universe=...&limit=10`**
  Mismo recorrido, pero se queda solo con la plantilla pedida y ordena las empresas por su puntaje en ella.
- **Universo**: `watchlists` = símbolos únicos de las watchlists guardadas; `liquid` (por defecto) = lista fija
  de ~30 tickers con opciones líquidas (SPY, QQQ, IWM, AAPL, MSFT, NVDA, AMD, AMZN, META, GOOGL, TSLA, …)
  definida en `api/src/config`.
- **Horizonte**: `horizonDays` (30–120, por defecto 90) acota la ventana de vencimientos que hoy está fija
  (cercano 14–45 días, lejano 46–100) en `loadMarket`.
- **Costo controlado**: máximo 4 empresas en paralelo, `paths` reducido (5 000) en el recorrido, caché de 10 min por
  `(universo, horizonte, cores)`; las empresas que fallen (sin opciones, error de Alpaca) se listan en `skipped`
  y no tumban la respuesta.
- **GraphQL**: queries `strategyScan(...)` y `strategyScreen(...)` con los mismos argumentos.
- **Front**: panel "Explorar" (paso 3 del flujo) con dos pestañas — *Oportunidades* (scan) y *Top 10 por estrategia*
  (screen) —; clic en una fila carga ese ticker en la gráfica y el recomendador.

## Impacto
- **Endpoints nuevos** en el microservicio `strategies` (vía gateway 3060); sin cambios en los existentes.
- **Sin tablas nuevas**; lee `watchlists` de Supabase cuando `universe=watchlists`.
- **Alpaca**: ~3 llamadas por empresa (contratos, snapshots, velas) → ~90 llamadas por scan en frío; el límite de
  concurrencia y la caché lo mantienen bajo el límite de 200 req/min.
- **Latencia**: scan en frío estimado 15–40 s; se devuelve `generatedAt` y el front muestra progreso/estado.
- **Consumidores**: solo el front propio; el contrato público crece pero no rompe nada.
