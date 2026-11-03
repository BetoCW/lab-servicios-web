# 03 Operativa en brokers

> Guía F0 · Quant Core Engine & Market Data. Requisito: notas `01` y `02`.

Objetivo: saber elegir un broker, abrir una cuenta **paper** (dinero simulado), entender los
niveles de opciones y enviar órdenes de una y varias piernas, primero a mano y luego con la API
de Alpaca tal como lo hace este proyecto.

---

## 03.01 Comparación de brokers

### 03.01.1 Tabla comparativa
| Criterio | Interactive Brokers (IBKR) | Alpaca | Webull |
|---|---|---|---|
| Perfil | Profesional, global (150+ mercados) | *API-first*, pensado para desarrolladores | App móvil para minoristas |
| API | TWS API (socket, requiere TWS/IB Gateway abierto) y Client Portal Web API (REST) | REST + WebSocket, llaves en el dashboard, SDKs oficiales | OpenAPI (requiere solicitar acceso) |
| Cuenta paper | Sí, ligada a la cuenta real | Sí, se crea solo con correo (sin fondear) | Sí, dentro de la app |
| Comisiones acciones | Bajas (planes Lite / Pro) | Sin comisión | Sin comisión |
| Opciones multi-pierna | Sí (órdenes *combo* / BAG) | Sí (`order_class: mleg`, máx. 4 piernas) | Sí (desde la app; por API más limitado) |
| Datos de opciones | Suscripciones de mercado | `indicative` gratis, `opra` de pago | Incluidos en la app |
| Ideal para | Operar en serio, muchos mercados | Prototipos y servicios web como este proyecto | Operar desde el teléfono |

> Las condiciones (comisiones, acceso a API, requisitos) cambian; verifícalas en el sitio de cada
> broker antes de citarlas en un reporte.

### 03.01.2 Por qué el proyecto usa Alpaca
- Cuenta paper inmediata, sin depósito ni papeleo para el equipo.
- API REST pura (encaja con Express y `fetch` nativo, sin SDK).
- Market Data de opciones con **IV y griegas** ya calculadas en los *snapshots*.
- Soporta órdenes multi-leg por API, que es lo que necesita la API de estrategias.

---

## 03.02 Cuentas paper

### 03.02.1 Qué es
Una cuenta simulada que usa precios reales pero dinero ficticio (Alpaca da 100,000 USD por
defecto). Las ejecuciones son simuladas: no hay *slippage* real ni impacto en el mercado, así que
los resultados son optimistas.

### 03.02.2 Buenas prácticas
- Nunca mezclar llaves paper y live; en el proyecto la URL por defecto es paper:
  ```js
  // api/src/config.js
  // Paper trading por defecto: nunca se mueve dinero real.
  tradingUrl: baseUrl(env.ALPACA_TRADING_URL || 'https://paper-api.alpaca.markets'),
  ```
- Reiniciar la cuenta paper cuando se llene de órdenes de prueba (dashboard → *Reset*).
- Las órdenes con el mercado cerrado quedan en `accepted` hasta la apertura.

---

## 03.03 Niveles de opciones

### 03.03.1 Qué son
Los brokers aprueban operar opciones por niveles según experiencia y capital. El esquema de
Alpaca:

| Nivel | Permite |
|---|---|
| 0 | Sin opciones |
| 1 | Covered calls y cash-secured puts (venta cubierta) |
| 2 | Nivel 1 + comprar calls y puts |
| 3 | Nivel 2 + spreads y estrategias multi-pierna (`mleg`) |

IBKR y Webull usan esquemas parecidos (los nombres y el número de niveles varían).

### 03.03.2 Cómo ver tu nivel en el proyecto
```bash
curl http://localhost:3060/api/v1/account
# { "id": "...", "status": "ACTIVE", "cash": "100000", "buyingPower": "...", "optionsLevel": 3 }
```
Si `optionsLevel` es menor a 3, `POST /strategies/{id}/submit` falla con 403 de Alpaca.

---

## 03.04 Órdenes multi-pierna (mleg)

### 03.04.1 Qué son
Una sola orden que contiene varias piernas (2 a 4) que se ejecutan **juntas o no se ejecutan**.
Ventajas sobre mandar cada pierna por separado: no quedas "a medias" (riesgo de pierna) y pagas
un precio neto (débito o crédito) en vez de cruzar el spread de cada pierna.

### 03.04.2 Campos de una orden mleg en Alpaca
| Campo | Valor |
|---|---|
| `order_class` | `"mleg"` |
| `qty` | Número de "paquetes" (cada pierna se multiplica por su `ratio_qty`) |
| `type` | `market` o `limit` |
| `limit_price` | Precio **neto** por paquete (débito > 0, crédito < 0) |
| `time_in_force` | `"day"` (única aceptada en opciones) |
| `legs[]` | Hasta **4**, cada una con `symbol` (OCC), `side`, `ratio_qty`, `position_intent` |

`position_intent` ∈ `buy_to_open`, `buy_to_close`, `sell_to_open`, `sell_to_close`.

### 03.04.3 Símbolo OCC
Formato: `RAÍZ + AAMMDD + C|P + strike×1000 a 8 dígitos`.

```
SPY  261218  C  00680000
 │      │    │      └─ strike 680.000
 │      │    └──────── C = call, P = put
 │      └───────────── vencimiento 2026-12-18
 └──────────────────── subyacente
```

El proyecto lo valida y lo descompone con una expresión regular:
```js
// api/src/lib/occ.js
const OCC = /^([A-Z][A-Z0-9.]{0,5})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
// parseOcc('AAPL251219C00200000') -> { root: 'AAPL', expiration: '2025-12-19', type: 'call', strike: 200 }
```

---

## 03.05 Paso a paso con Alpaca paper (como lo usa el proyecto)

### 03.05.1 Crear la cuenta y las llaves
1. Regístrate en https://app.alpaca.markets con correo.
2. Cambia a la cuenta **Paper** (selector arriba a la izquierda).
3. *API Keys* → **Generate New Keys**. Copia `Key ID` y `Secret Key` (el secreto solo se muestra
   una vez).
4. En *Account → Configuration* revisa el nivel de opciones (por defecto paper tiene nivel 3).

### 03.05.2 Configurar el `.env`
```bash
cd quant-core-engine/api
npm install
cp .env.example .env
```
```ini
# api/.env  (NUNCA se sube a GitHub)
ALPACA_KEY_ID=<tu-key-id>
ALPACA_SECRET_KEY=<tu-secret-key>
ALPACA_TRADING_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_OPTIONS_FEED=indicative   # gratis; opra = tiempo real de pago
ALPACA_STOCKS_FEED=iex
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=<sb_secret_...>
```
```bash
npm run dev                         # http://localhost:3060
curl http://localhost:3060/         # "missingConfig": [] si todo está bien
```

### 03.05.3 Cómo se autentica cada llamada
Alpaca no usa OAuth para cuentas propias: dos encabezados en cada petición.
```js
// api/src/lib/alpaca.js
return {
  'APCA-API-KEY-ID': config.alpaca.keyId,
  'APCA-API-SECRET-KEY': config.alpaca.secretKey,
  accept: 'application/json',
};
```
Sin llaves, la API responde `503` con el nombre de la variable faltante.

### 03.05.4 Endpoints de Alpaca que usa el proyecto
| Uso | Método y ruta de Alpaca | API F0 |
|---|---|---|
| Cuenta | `GET /v2/account` | `GET /api/v1/account` |
| Watchlists | `GET/POST/PUT/DELETE /v2/watchlists[/{id}[/{symbol}]]` | `/api/v1/watchlists` |
| Órdenes | `GET/POST/DELETE /v2/orders`, `GET/PATCH/DELETE /v2/orders/{id}` | `/api/v1/orders` |
| Contratos de opciones | `GET /v2/options/contracts[/{symbol}]` | `/api/v1/option-chains`, validación de piernas |
| Snapshots de opciones (bid/ask, IV, griegas) | `GET /v1beta1/options/snapshots` (Market Data) | cadenas, valuación, riesgo |
| Snapshot de acción | `GET /v2/stocks/{symbol}/snapshot` (Market Data) | riesgo (precio del subyacente) |

### 03.05.5 Orden simple (una pierna)
```http
POST http://localhost:3060/api/v1/orders
Content-Type: application/json

{ "symbol": "AAPL", "qty": 1, "side": "buy", "type": "limit", "time_in_force": "gtc", "limit_price": 1 }
```
La API valida, convierte números a string (Alpaca los pide así) y reenvía a `POST /v2/orders`.
Un `limit_price` de 1 USD nunca se ejecuta: sirve para probar PATCH y DELETE sin comprar nada.

### 03.05.6 Encontrar símbolos OCC reales
```http
POST http://localhost:3060/api/v1/option-chains
Content-Type: application/json

{ "underlying": "SPY", "expiration_from": "2026-12-01", "expiration_to": "2026-12-31", "option_type": "call" }
```
Luego `GET /api/v1/option-chains/{id}?type=call` devuelve cada contrato con `symbol`, `bid`, `ask`,
`mid`, `impliedVolatility` y griegas. Elige dos strikes de un mismo vencimiento.

### 03.05.7 Armar la estrategia (borrador)
```http
POST http://localhost:3060/api/v1/strategies
Content-Type: application/json

{
  "name": "Bull call spread SPY",
  "underlying": "SPY",
  "qty": 1,
  "order_type": "limit",
  "limit_price": 1.5,
  "legs": [
    { "symbol": "SPY261218C00670000", "side": "buy",  "ratio_qty": 1 },
    { "symbol": "SPY261218C00680000", "side": "sell", "ratio_qty": 1 }
  ]
}
```
(Los símbolos son ilustrativos: usa los que regresó tu cadena.) La API:
1. Rechaza 0 o más de 4 piernas (`MAX_LEGS = 4`, límite de Alpaca).
2. Valida el formato OCC de cada pierna.
3. Consulta `GET /v2/options/contracts/{symbol}` y comprueba que el contrato sea del subyacente
   declarado (si no, `400`).
4. Deduce `position_intent` (`buy` → `buy_to_open`, `sell` → `sell_to_open`).
5. Guarda en Supabase (`strategies` + `strategy_legs`) en estado `draft`.

### 03.05.8 Revisar precio y riesgo antes de enviar
- `GET /api/v1/strategies/{id}` → mid vivo por pierna y `pricing.netPerUnit` (débito neto).
- `GET /api/v1/strategies/{id}/risk?paths=100000` → Monte Carlo, márgenes Reg T/SPAN y griegas.

### 03.05.9 Enviar la orden mleg
```http
POST http://localhost:3060/api/v1/strategies/{id}/submit
```
Lo que el servicio manda a Alpaca:
```js
// api/src/services/strategies.service.js
const order = await alpaca.createOrder({
  order_class: 'mleg',
  qty: String(strategy.qty),
  type: strategy.order_type,
  limit_price: strategy.order_type === 'limit' ? String(strategy.limit_price) : undefined,
  time_in_force: 'day', // Alpaca solo acepta 'day' en opciones
  legs: legs.map((l) => ({
    symbol: l.symbol,
    side: l.side,
    ratio_qty: String(l.ratio_qty),
    position_intent: l.position_intent,
  })),
});
```
La estrategia pasa a `submitted`, guarda `alpaca_order_id` y la orden queda en la tabla `orders`.
Desde aquí ya no se puede editar (`PUT` responde `409`); `DELETE` intenta cancelar la orden en
Alpaca antes de borrar.

### 03.05.10 Modificar y cancelar
- `PATCH /api/v1/orders/{id}` con `{ "limit_price": 1.05 }`: Alpaca regresa una orden **nueva**
  (otro id). Si la orden está en `accepted`/`pending_new` (mercado cerrado), Alpaca responde 422
  y la API emula el reemplazo cancelando y reenviando (`replaceMode: "cancel_resubmit"`).
- `DELETE /api/v1/orders/{id}` cancela una; `DELETE /api/v1/orders` cancela todas (`207`).

### 03.05.11 Errores frecuentes
| Error | Causa |
|---|---|
| `503 Faltan ALPACA_KEY_ID...` | `.env` incompleto |
| `401/403` de Alpaca | Llaves live en URL paper (o al revés), o nivel de opciones insuficiente |
| `422` en PATCH | Orden aún no aceptada por el mercado (cerrado) |
| `400 legs[i] pertenece a ...` | Pierna de otro subyacente |
| `400 Piernas vencidas` (riesgo) | El vencimiento ya pasó; arma la estrategia con otra fecha |
| `time_in_force` inválido | En opciones solo `day` |

---

## 03.06 Lo mismo en IBKR y Webull (referencia)

### 03.06.1 IBKR
Las multi-pierna son órdenes *combo*: un contrato `secType = "BAG"` con `comboLegs` (cada una con
`conId`, `ratio`, `action`). Requiere TWS o IB Gateway abiertos para la TWS API, o la sesión de
Client Portal para la Web API.

### 03.06.2 Webull
Desde la app: *Options* → *Strategy* (vertical, straddle, iron condor) → revisar débito/crédito →
enviar. La OpenAPI de Webull requiere solicitar acceso y su soporte de multi-pierna es más
limitado; para el proyecto no se usa.
