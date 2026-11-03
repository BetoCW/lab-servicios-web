# 01 Introducción a las inversiones

> Guía F0 · Quant Core Engine & Market Data · Laboratorio de Servicios Web, ITTepic.
> Cada encabezado numerado (`01.02`, `01.02.1`) es una nota independiente en Evernote.

Objetivo: entender lo mínimo del mercado de Estados Unidos para leer los datos que entregan
nuestras APIs (precios, bid/ask, órdenes, cadenas de opciones) y saber qué significa cada campo.

---

## 01.01 El mercado de valores de EU

### 01.01.1 Bolsas y horarios
- **Bolsas**: NYSE y NASDAQ concentran la mayoría de las acciones; las opciones se negocian en
  bolsas como CBOE y sus cotizaciones se consolidan en **OPRA** (Options Price Reporting Authority).
- **Horario regular**: 9:30 a 16:00, hora de Nueva York (ET), lunes a viernes, sin festivos.
  Hay *pre-market* (desde 4:00) y *after-hours* (hasta 20:00) con menos liquidez.
- Por eso el motor de riesgo calcula el tiempo al vencimiento hasta las **16:00 ET ≈ 20:00 UTC**
  (`yearsTo()` en `api/src/services/risk.service.js`).

### 01.01.2 Participantes
| Participante | Qué hace |
|---|---|
| Inversionista minorista | Compra/vende por medio de un broker (Alpaca, IBKR, Webull) |
| Broker | Recibe tus órdenes y las enruta al mercado; custodia tu cuenta |
| Market maker | Publica precios de compra y venta continuamente; gana el spread |
| Regulador | SEC (valores) y FINRA (brokers); la OCC liquida las opciones |

### 01.01.3 Datos de mercado
- **Tiempo real vs. retrasado**: el feed `opra` de Alpaca es tiempo real (de pago); `indicative`
  es gratuito y retrasado. Para acciones, `iex` es gratuito (solo la bolsa IEX).
- En el proyecto: `ALPACA_OPTIONS_FEED=indicative` y `ALPACA_STOCKS_FEED=iex` en `api/.env`.

---

## 01.02 Instrumentos

### 01.02.1 Acciones
Una acción es una fracción de la propiedad de una empresa. Se identifica con un **ticker**
(`AAPL`, `MSFT`). Ganas por **plusvalía** (sube el precio) y **dividendos**.

### 01.02.2 ETFs
Un **ETF** (Exchange Traded Fund) es un fondo que cotiza como acción y replica un índice o una
canasta. Ejemplos: `SPY` (S&P 500), `QQQ` (Nasdaq 100), `IWM` (Russell 2000). Ventajas:
diversificación inmediata, bajo costo, alta liquidez y cadenas de opciones muy líquidas — por eso
`SPY` es el subyacente favorito para probar estrategias en el proyecto.

### 01.02.3 Opciones (adelanto)
Una opción es un **contrato** que da el derecho (no la obligación) de comprar (**call**) o vender
(**put**) 100 acciones de un subyacente a un precio fijo (**strike**) hasta una fecha
(**vencimiento**). Se detalla en la nota `02` (inversión con opciones).

---

## 01.03 Cotización: bid, ask y spread

### 01.03.1 Definiciones
| Concepto | Qué es |
|---|---|
| **Bid** | El precio más alto que alguien está dispuesto a pagar ahora |
| **Ask** | El precio más bajo al que alguien está dispuesto a vender ahora |
| **Spread** | `ask − bid`: el costo implícito de entrar y salir de inmediato |
| **Mid** | `(bid + ask) / 2`: estimación del "precio justo" |
| **Last** | Precio del último trade ejecutado (puede ser viejo en opciones poco líquidas) |

### 01.03.2 Cómo lo usa el proyecto
La API de cadenas (`option-chains`) guarda `bid`, `ask` y calcula `mid` por contrato. La API de
estrategias valora cada pierna con el mid vivo de Alpaca:

```js
// api/src/services/strategies.service.js
const mid = (qt.bp + qt.ap) / 2;                       // bp = bid price, ap = ask price
net += (l.side === 'buy' ? 1 : -1) * mid * l.ratio_qty; // débito > 0, crédito < 0
```

---

## 01.04 Liquidez

### 01.04.1 Qué es
Facilidad de comprar o vender sin mover el precio. Indicadores:
- **Volumen**: cuántas acciones/contratos se negociaron hoy.
- **Open interest** (opciones): contratos abiertos que aún existen.
- **Spread estrecho**: `SPY` tiene spreads de centavos; una opción lejana de una empresa pequeña
  puede tener un spread del 20 % del precio.

### 01.04.2 Regla práctica
Prefiere subyacentes y strikes con open interest alto y spread pequeño; en estrategias multi-pierna
el spread se paga **en cada pierna**.

---

## 01.05 Tipos de orden

### 01.05.1 Market (a mercado)
Se ejecuta de inmediato al mejor precio disponible. Garantiza ejecución, **no** precio.

### 01.05.2 Limit (límite)
Solo se ejecuta a tu precio o mejor (`limit_price`). Garantiza precio, **no** ejecución.
Es la recomendada para opciones por sus spreads amplios.

### 01.05.3 Stop y stop-limit
- **Stop**: queda dormida hasta que el precio toca `stop_price`; entonces se vuelve market.
  Se usa como *stop-loss*.
- **Stop-limit**: al tocar `stop_price` se vuelve limit a `limit_price`.
- **Trailing stop**: el stop sigue al precio a una distancia fija o porcentual.

### 01.05.4 Vigencia (time in force)
| Valor | Significado |
|---|---|
| `day` | Válida solo hoy (única aceptada por Alpaca en opciones) |
| `gtc` | Hasta que se cancele |
| `ioc` | Ejecuta lo que se pueda ya y cancela el resto |
| `fok` | Todo o nada, de inmediato |
| `opg` / `cls` | En la subasta de apertura / cierre |

### 01.05.5 Validación en la API de órdenes
```js
// api/src/services/orders.service.js
const TYPES = ['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'];
const TIFS  = ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'];
if (['limit', 'stop_limit'].includes(body.type) && body.limit_price == null) {
  throw badRequest('limit_price es obligatorio para órdenes limit / stop_limit');
}
```

---

## 01.06 Riesgo y rendimiento

### 01.06.1 Conceptos
- **Rendimiento**: ganancia relativa, `(precio final − inicial) / inicial`.
- **Riesgo**: incertidumbre del rendimiento; se mide con la **volatilidad** (desviación estándar
  anualizada de los rendimientos).
- **Relación**: a mayor rendimiento esperado, mayor riesgo aceptado. No hay rendimiento alto
  "seguro".

### 01.06.2 Medidas usadas en el proyecto
| Medida | Dónde aparece |
|---|---|
| Volatilidad implícita (IV) | Cadena de opciones (`impliedVolatility`) |
| P&L esperado y distribución | Monte Carlo en `GET /strategies/{id}/risk` |
| Pérdida máxima / margen | Márgenes Reg T y SPAN del motor |
| Sensibilidades | Griegas del portafolio (delta, gamma, theta, vega, rho) |

---

## 01.07 Diversificación

### 01.07.1 Idea
No poner todo en un solo activo: combinar activos poco correlacionados reduce la volatilidad del
portafolio sin reducir igual el rendimiento esperado.

### 01.07.2 Cómo se aplica
- Por número de activos (ETFs de índice).
- Por sector (tecnología, salud, energía).
- Por clase de activo (acciones, bonos, efectivo).
- Por estrategia: posiciones con delta opuesto o de distinto vencimiento.
- En el proyecto, una **watchlist** (`/api/v1/watchlists`) agrupa los símbolos a vigilar.

---

## 01.08 Papel de las opciones

### 01.08.1 Para qué sirven
| Uso | Ejemplo |
|---|---|
| **Cobertura** | Comprar una put protege una posición en acciones (seguro) |
| **Ingreso** | Vender calls cubiertas cobra prima |
| **Apalancamiento** | Una call controla 100 acciones por una fracción del costo |
| **Apostar a volatilidad** | Straddle: gana si el precio se mueve mucho a cualquier lado |
| **Riesgo definido** | Spreads verticales: pérdida y ganancia máximas conocidas |

### 01.08.2 Relación con F0
F0 entrega a los demás equipos las **cadenas de opciones con IV y griegas**, permite armar
**estrategias de hasta 4 piernas**, enviarlas como orden multi-leg y medir su **riesgo** con el
motor Rust/WASM. Detalle en las notas `02`, `03` y `04`.
