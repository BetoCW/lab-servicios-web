# market-data-api (delta)

## ADDED Requirements

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
