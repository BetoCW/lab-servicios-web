# Estudio: estrategias de opciones y el motor Quant Core (F0)

Documento de estudio del equipo F0. Objetivo: que **todos** puedan explicar cualquier estrategia,
las Griegas, Black-Scholes y el código Rust del motor (`engine/src/`) en la exposición.

Índice:

1. [Fundamentos de opciones](#1-fundamentos-de-opciones)
2. [Black-Scholes](#2-black-scholes)
3. [Las Griegas](#3-las-griegas)
4. [Volatilidad implícita, histórica y skew](#4-volatilidad-implícita-histórica-y-skew)
5. [Cómo se manda una estrategia en este proyecto](#5-cómo-se-manda-una-estrategia-en-este-proyecto)
6. [Estrategias (una por una)](#6-estrategias)
7. [Gestión de riesgo: Reg T, SPAN, Monte Carlo, matriz P&L](#7-gestión-de-riesgo)
8. [Recorrido del código Rust](#8-recorrido-del-código-rust)
9. [Reparto para la exposición](#9-reparto-para-la-exposición)
10. [Banco de preguntas de autoevaluación](#10-banco-de-preguntas)
11. [Glosario](#11-glosario)

---

## Escenario común de todos los ejemplos

Para que los números se puedan comparar, **todos los ejemplos** usan el mismo mercado, y las primas
salen de Black-Scholes (`bs::price`) con estos datos:

| Dato | Valor |
|---|---|
| Subyacente | SPY a **$500** |
| Vencimiento cercano | 2026-12-18 (≈ **45 días**, T = 45/365 = 0.1233 años) |
| Vencimiento lejano (calendar/diagonal) | 2027-01-15 (≈ 73 días) |
| Volatilidad | 20% para todos los strikes (sin skew, para simplificar) |
| Tasa libre de riesgo | 4% (la misma que usa `RISK_FREE_RATE` por defecto) |
| Dividendo | 0 |

Primas por acción (multiplica por 100 para un contrato):

| Strike | Call | Δ call | Put | Δ put |
|---|---|---|---|---|
| 470 | 35.41 | 0.838 | 3.10 | −0.162 |
| 480 | 27.68 | 0.754 | 5.32 | −0.246 |
| 490 | 20.91 | 0.653 | 8.50 | −0.347 |
| 495 | 17.93 | 0.598 | 10.50 | −0.402 |
| **500** | **15.23** | 0.542 | **12.78** | −0.458 |
| 505 | 12.82 | 0.485 | 15.33 | −0.515 |
| 510 | 10.68 | 0.430 | 18.17 | −0.570 |
| 520 | 7.19 | 0.325 | 24.63 | −0.675 |
| 530 | 4.65 | 0.234 | 32.04 | −0.766 |

Theta y vega por acción de las que usaremos: C500 Θ −0.183 V 0.697 · P500 Θ −0.128 V 0.697 ·
C510 Θ −0.176 V 0.690 · P490 Θ −0.124 V 0.648 · C520 Θ −0.157 V 0.632 · P480 Θ −0.109 V 0.553.
Call 500 a 73 días: 19.83 (Δ 0.553, Θ −0.149, V 0.884).

> SPY real no cotiza en 500 en noviembre de 2026; los símbolos OCC de ejemplo
> (`SPY261218C00500000`) solo funcionan contra Alpaca si ese contrato existe. Para la demo en vivo
> cambien los strikes por unos cercanos al precio real.

---

## 1. Fundamentos de opciones

### 1.1 Qué es una opción
Un **contrato** que da al comprador el **derecho, no la obligación**, de comprar o vender un activo
(el **subyacente**) a un precio fijo (**strike**) hasta o en una fecha (**vencimiento**). El vendedor
(*writer*) recibe un pago (**prima**) y asume la **obligación** si el comprador ejerce.

| Concepto | Definición | Ejemplo |
|---|---|---|
| **Call** | Derecho a **comprar** al strike | Call 500: compras SPY a 500 aunque valga 530 |
| **Put** | Derecho a **vender** al strike | Put 500: vendes SPY a 500 aunque valga 470 |
| **Prima** | Precio de la opción, por acción | C500 = 15.23 → un contrato cuesta $1,523 |
| **Strike (K)** | Precio pactado | 500 |
| **Vencimiento** | Último día de vida | 2026-12-18 |
| **Multiplicador** | Acciones por contrato: **100** en opciones de acciones/ETF de EE.UU. | 1 contrato = 100 SPY |

### 1.2 Moneyness: ITM / ATM / OTM

| | Call | Put |
|---|---|---|
| **ITM** (in the money) | S > K | S < K |
| **ATM** (at the money) | S ≈ K | S ≈ K |
| **OTM** (out of the money) | S < K | S > K |

Con SPY = 500: C480 está ITM, C520 OTM; P520 está ITM, P480 OTM.

### 1.3 Valor intrínseco y extrínseco

```
Intrínseco call = max(S − K, 0)        Intrínseco put = max(K − S, 0)
Extrínseco (valor tiempo) = Prima − Intrínseco
```

Ejemplo: C480 = 27.68 → intrínseco 500 − 480 = 20, extrínseco 7.68.
C520 = 7.19 → intrínseco 0, todo es extrínseco. Al vencimiento el extrínseco vale 0: la opción
solo vale su intrínseco. Eso es lo que hace `bs::price` cuando `t <= 0` (bs.rs:53-60).

### 1.4 Payoff y P&L al vencimiento (posición larga, por acción)

```
Call larga:  P&L = max(S_T − K, 0) − prima
Put larga:   P&L = max(K − S_T, 0) − prima
Corta: el mismo número con signo contrario.
```

### 1.5 Americana vs europea
- **Europea**: solo se ejerce **al vencimiento** (índices como SPX). Black-Scholes la valúa exacta.
- **Americana**: se ejerce **cualquier día** hasta el vencimiento (acciones y ETF como SPY).
  Vale ≥ que la europea; la diferencia es la **prima por ejercicio anticipado**. El motor la calcula
  con el árbol binomial (`binomial::price_tree`, campo `early_exercise_premium`).
- Regla: una **call americana sin dividendos nunca se ejerce antes** (vale lo mismo que la europea;
  lo prueba `american_call_without_dividends_equals_european`). Una **put americana** sí puede
  convenir ejercerla antes (cobrar K hoy y ganar intereses).

### 1.6 Ejercicio y asignación
- **Ejercicio**: el comprador usa su derecho. Las opciones ITM por ≥ $0.01 al vencimiento se ejercen
  automáticamente (regla OCC).
- **Asignación**: la OCC elige al azar a un vendedor que debe cumplir. Si vendiste una put 490 y te
  asignan, **compras 100 SPY a 490**. Si vendiste una call 510 y te asignan, **vendes 100 SPY a 510**.
- Riesgo de **asignación anticipada** (solo americanas): calls cortas ITM justo antes de un
  ex-dividendo, y puts cortas muy ITM.

### 1.7 Símbolo OCC (el formato que valida la API)

```
SPY   26 12 18   C   00500000
raíz  AA MM DD  C/P  strike × 1000 en 8 dígitos  → 500.000
```

`api/src/lib/occ.js` lo valida con `^([A-Z][A-Z0-9.]{0,5})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$`.

### 1.8 Paridad put-call (europeas)

```
C − P = S·e^(−qT) − K·e^(−rT)
```
Check con nuestro escenario: 15.23 − 12.78 = 2.45 y 500 − 500·e^(−0.04·0.1233) = 2.46 ✓
(diferencia de redondeo). El motor lo prueba en `put_call_parity` (bs.rs:189).

---

## 2. Black-Scholes

### 2.1 Fórmula (con dividendo continuo q; así está en `bs::price`, bs.rs:50)

```
d1 = [ ln(S/K) + (r − q + σ²/2)·T ] / (σ·√T)
d2 = d1 − σ·√T

Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
```

S = spot, K = strike, T = años al vencimiento, r = tasa libre de riesgo, q = dividendo continuo,
σ = volatilidad anual, N = acumulada normal estándar.

### 2.2 Intuición
- **N(d2)** ≈ probabilidad (en mundo neutral al riesgo) de que la call termine ITM.
- **K·e^(−rT)·N(d2)**: valor presente de lo que *pagarías* (K) si ejerces.
- **S·e^(−qT)·N(d1)**: valor presente de la acción que *recibirías* si ejerces.
- Call = lo que recibes − lo que pagas, ambos ponderados por probabilidad y descontados.
- **N(d1)** es además la **delta** de la call (sin dividendos).

### 2.3 Supuestos (y dónde fallan)

| Supuesto | Realidad |
|---|---|
| El precio sigue un movimiento browniano geométrico (log-normal) | Hay saltos y colas gruesas |
| Volatilidad constante | Cambia en el tiempo y por strike (*skew*) |
| Tasa r constante y conocida | Varía poco; impacto menor (rho) |
| Sin costos de transacción, se puede cubrir continuamente | Hay spreads y comisiones |
| Opción europea | SPY es americana → árbol binomial |
| Sin arbitraje | Supuesto razonable |

### 2.4 Ejemplo numérico (paso a paso)

Ejemplo de Hull (el que prueba `hull_example`, bs.rs:181): S = 42, K = 40, T = 0.5, r = 10%, σ = 20%.

```
d1 = [ln(42/40) + (0.10 + 0.02)·0.5] / (0.20·√0.5) = (0.04879 + 0.06) / 0.14142 = 0.7693
d2 = 0.7693 − 0.1414 = 0.6278
N(d1) = 0.7791   N(d2) = 0.7349
Call = 42·0.7791 − 40·e^(−0.05)·0.7349 = 32.72 − 27.96 = 4.76
Put  = 40·e^(−0.05)·N(−0.6278) − 42·N(−0.7693) = 0.81
```

Nuestro escenario (C500): d1 = 0.1053, d2 = 0.0351 → Call = 15.23, Put = 12.78.

---

## 3. Las Griegas

Sensibilidades del precio de la opción. **Convenciones del motor** (bs.rs:1-6 y bs.rs:120):
vega por **1 punto** de volatilidad (0.01), theta por **1 día calendario** (año = 365), rho por
**1%** de tasa.

### 3.1 Qué mide cada una (fórmulas que implementa `bs::greeks`, bs.rs:71)

| Griega | Mide | Fórmula (call / put) |
|---|---|---|
| **Delta Δ** | Cambio de la prima por +$1 en S. También ≈ prob. de terminar ITM y "acciones equivalentes" | e^(−qT)N(d1) / −e^(−qT)N(−d1) |
| **Gamma Γ** | Cambio de **delta** por +$1 en S (curvatura). Máxima ATM y cerca del vencimiento | e^(−qT)·n(d1)/(S·σ·√T) (igual call y put) |
| **Theta Θ** | Cambio de la prima por **1 día** que pasa (decaimiento temporal) | −S e^(−qT) n(d1) σ/(2√T) ∓ r K e^(−rT) N(±d2) ± q S e^(−qT) N(±d1), /365 |
| **Vega** | Cambio de la prima por +1 punto de volatilidad | S e^(−qT) n(d1) √T, /100 (igual call y put) |
| **Rho ρ** | Cambio de la prima por +1% de tasa | K T e^(−rT) N(d2) / −K T e^(−rT) N(−d2), /100 |

(n = densidad normal, `norm_pdf`.)

### 3.2 Signos por posición (memorízalo)

| Posición | Δ | Γ | Θ | Vega | ρ |
|---|---|---|---|---|---|
| Call larga | + | + | − | + | + |
| Call corta | − | − | + | − | − |
| Put larga | − | + | − | + | − |
| Put corta | + | − | + | − | + |
| Acción larga | +1 (por acción) | 0 | 0 | 0 | 0 |

Regla de oro: **comprar opciones = gamma +, theta −, vega +** (pagas tiempo para ganar con
movimiento/volatilidad). **Vender opciones = gamma −, theta +, vega −** (cobras tiempo a cambio de
riesgo de movimiento).

### 3.3 Ejemplo numérico (C500 del escenario, precio 15.23)

| Griega | Valor | Lectura |
|---|---|---|
| Δ | 0.542 | Si SPY sube a 501, la call sube ≈ $0.54 (≈ $54 por contrato) |
| Γ | 0.0113 | Tras subir $1, la delta pasa a ≈ 0.553 |
| Θ | −0.183 | Mañana, todo igual, vale ≈ 15.05 (−$18.30 por contrato) |
| Vega | 0.697 | Si la IV pasa de 20% a 21%, vale ≈ 15.93 |
| ρ | 0.315 | Si la tasa pasa de 4% a 5%, vale ≈ 15.55 |

Aproximación de Taylor para +$1: ΔP ≈ Δ·1 + ½Γ·1² = 0.542 + 0.0057 = 0.548 → 15.78.

Griegas de un **portafolio** = suma de (griega × qty con signo × 100). Así lo hace
`risk.service.js` (`portfolio[k] += g[k] * l.qty * l.multiplier`).

---

## 4. Volatilidad implícita, histórica y skew

| | Volatilidad histórica (HV) | Volatilidad implícita (IV) |
|---|---|---|
| De dónde sale | Desviación estándar anualizada de los rendimientos pasados: `std(ln(S_t/S_{t−1}))·√252` | Se **despeja** de Black-Scholes: la σ que hace que el precio del modelo = precio de mercado |
| Mira | Hacia atrás | Hacia adelante (expectativa del mercado) |
| En el proyecto | No se calcula | Viene en el snapshot de Alpaca (`impliedVolatility`); si falta, el motor la calcula del *mid* con `impliedVol` |

- **IV alta → primas caras** → favorece **vender** (iron condor, short strangle, covered call).
- **IV baja → primas baratas** → favorece **comprar** (long straddle, calendar, debit spreads).
- **Skew (sonrisa/sesgo)**: en acciones/índices las **puts OTM tienen más IV** que las calls OTM
  (el mercado paga por protección contra caídas). Black-Scholes supone una sola σ; el skew es la
  evidencia de que no es así.
- Consecuencia en el proyecto (README): el Monte Carlo usa **una sola** vol (la IV promedio de las
  piernas), así que el P&L esperado del modelo puede salir negativo aunque cada pierna esté bien
  valuada: esa diferencia es lo que el skew está cobrando.

---

## 5. Cómo se manda una estrategia en este proyecto

### 5.1 Reglas reales de `POST /api/v1/strategies` (`strategies.service.js`, `validate`)

| Campo | Regla |
|---|---|
| `name` | obligatorio, string |
| `underlying` | obligatorio, string; se pasa a mayúsculas. **Cada pierna debe pertenecer a ese subyacente** (se consulta el contrato en Alpaca) |
| `qty` | número > 0, default 1 (multiplica a todas las piernas) |
| `order_type` | `market` o `limit` (default `market`) |
| `limit_price` | número; **obligatorio si `order_type = limit`** |
| `legs` | arreglo de **1 a 4** piernas (`MAX_LEGS = 4`, límite de Alpaca para `mleg`) |
| `legs[].symbol` | obligatorio; **símbolo OCC válido** y existente en Alpaca |
| `legs[].side` | obligatorio: `buy` o `sell` |
| `legs[].ratio_qty` | número > 0, default 1 (se trunca a entero) |
| `legs[].position_intent` | `buy_to_open`, `buy_to_close`, `sell_to_open`, `sell_to_close`; default `buy_to_open` si `side=buy`, `sell_to_open` si `side=sell` |

Flujo: `POST /strategies` (queda en `draft`) → `GET /strategies/{id}` (precio vivo:
`pricing.netPerUnit` > 0 = **débito**, < 0 = **crédito**) → `GET /strategies/{id}/risk` (motor) →
`POST /strategies/{id}/submit` (orden `order_class: "mleg"`, `time_in_force: "day"`).

### 5.2 Lo que NO se puede mandar como estrategia
- **Piernas de acciones**: la API exige símbolos OCC y Alpaca no acepta piernas de acciones en
  órdenes `mleg` ("MLeg orders that include an equity leg are not supported"). Para **covered call,
  collar, protective put y wheel**, las 100 acciones se compran aparte con `POST /api/v1/orders`:

  ```json
  { "symbol": "SPY", "qty": 100, "side": "buy", "type": "market", "time_in_force": "day" }
  ```
  y solo la parte de opciones va en `/strategies`. Consecuencia: `GET /strategies/{id}/risk` analiza
  **solo las opciones** (el motor sí soporta piernas de acción, `tipo = 0`, pero `risk.service.js`
  arma todas las piernas desde OCC).
- Más de 4 piernas.

### 5.3 Precio límite en créditos
El ejemplo del repo (`pruebas/colecciones/f0.http`) usa `limit_price: 1.5` en un spread de **débito**. Para
estrategias de **crédito** la documentación de Alpaca muestra precios positivos (iron condor
`"1.80"`) sin definir el signo; en los ejemplos de crédito de abajo usamos `market` para no depender
de eso. Si quieren `limit` en un crédito, pruébenlo antes en paper.

---

## 6. Estrategias

Convención: precios **por acción**; entre paréntesis, dólares **por 1 contrato** (×100).
"Débito" = pagas; "crédito" = cobras. Todas las cifras usan el escenario común (SPY 500, 45 días,
IV 20%). Los payoff ASCII son **al vencimiento**.

Mapa rápido:

| Estrategia | Visión | Débito/crédito | Ganancia máx | Pérdida máx |
|---|---|---|---|---|
| Covered Call | Neutral-alcista | Crédito (+acciones) | Limitada | Grande (acción a 0) |
| Cash-Secured Put | Neutral-alcista | Crédito | Prima | K − prima |
| Wheel | Neutral-alcista, ingreso | Créditos | Limitada por ciclo | Como tener la acción |
| Bull Call | Alcista | Débito | Ancho − débito | Débito |
| Bear Put | Bajista | Débito | Ancho − débito | Débito |
| Bull Put | Alcista/neutral | Crédito | Crédito | Ancho − crédito |
| Bear Call | Bajista/neutral | Crédito | Crédito | Ancho − crédito |
| Iron Condor | Rango | Crédito | Crédito | Ancho − crédito |
| Iron Butterfly | Precio fijo en K | Crédito | Crédito | Ancho − crédito |
| Long Straddle | Gran movimiento | Débito | Ilimitada | Débito |
| Short Straddle | Quieto | Crédito | Crédito | Ilimitada |
| Long Strangle | Gran movimiento | Débito | Ilimitada | Débito |
| Short Strangle | Rango amplio | Crédito | Crédito | Ilimitada |
| Calendar | Quieto en K, IV ↑ | Débito | Variable | ≈ Débito |
| Diagonal | Ligeramente direccional | Débito | Variable | ≈ Débito |
| Collar | Proteger acción | ≈ 0 | Limitada | Limitada |
| Protective Put | Alcista asegurado | Débito (+acciones) | Ilimitada | (S − K) + prima |

---

### 6.1 Covered Call (call cubierta)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra (o ya tienes) | 100 SPY | 500.00 |
| 2 | Venta | Call 510 (`SPY261218C00510000`) | 10.68 crédito |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Neutral a ligeramente alcista; quieres ingreso | — |
| Costo | S − prima | 500 − 10.68 = 489.32 ($48,932) |
| Ganancia máx | (K − S) + prima | (510 − 500) + 10.68 = 20.68 ($2,068) si S_T ≥ 510 |
| Pérdida máx | S − prima (si la acción va a 0) | 489.32 ($48,932) |
| Breakeven | S − prima | 500 − 10.68 = **489.32** |
| Griegas netas | Δ + (1 − Δcall), Γ −, Θ +, Vega − | Δ = 1 − 0.43 = +0.57; Θ = +0.176 ($17.6/día) |

- **Cuándo**: ya tienes la acción, esperas que suba poco o nada, IV relativamente alta.
- **Riesgos**: pierdes todo el alza arriba de 510 (te asignan); la prima protege solo 10.68 de
  caída; asignación anticipada antes de ex-dividendo.

```
P&L
+20.68 |               ________
       |             /
     0 |-----------/----------- S_T
       |         /
       |       /
         489.32   510
```

Envío: 1) acciones con `POST /api/v1/orders` (ver 5.2). 2) la call:
```json
{
  "name": "Covered call SPY 510", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 10.68,
  "legs": [
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.2 Cash-Secured Put (put asegurada con efectivo)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Venta | Put 490 (`SPY261218P00490000`) | 8.50 crédito |
| (efectivo) | Reservar | K × 100 = $49,000 | — |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Neutral-alcista; quieres comprar la acción más barata | — |
| Crédito | prima | 8.50 ($850) |
| Ganancia máx | prima | $850 si S_T ≥ 490 |
| Pérdida máx | K − prima | 490 − 8.50 = 481.50 ($48,150) si SPY va a 0 |
| Breakeven | K − prima | **481.50** |
| Griegas netas | Δ +, Γ −, Θ +, Vega − | Δ = +0.347; Θ = +0.124 ($12.4/día) |

- **Cuándo**: te gustaría tener SPY a 490 (precio efectivo 481.50) y cobras mientras esperas.
- **Riesgos**: caída fuerte (compras a 490 algo que vale menos); costo de oportunidad del efectivo.
- Si no reservas el efectivo es una **put descubierta** (naked): Reg T del motor =
  prima + max(20%·S − (S − K), 10%·K) = 8.50 + max(100 − 10, 49) = 98.50 ($9,850).

```
P&L
 +8.50 |        ___________
       |       /
     0 |------/-------------- S_T
       |     /
       |    /
        481.50 490
```

```json
{
  "name": "CSP SPY 490", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00490000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.3 Wheel (la rueda)

Ciclo de **CSP → asignación → Covered Call → asignación → repetir**.

| Paso | Qué haces | Ejemplo |
|---|---|---|
| 1 | Vendes CSP | Put 490 por 8.50 |
| 2a | Si S_T ≥ 490: vence sin valor, te quedas $850 | Vuelves al paso 1 |
| 2b | Si S_T < 490: te asignan, compras 100 SPY a 490 | Costo base = 490 − 8.50 = **481.50** |
| 3 | Vendes covered call con K ≥ costo base | Call 495 a 30 días, prima supuesta 6.00 |
| 4a | Si te asignan la call: vendes a 495 | P&L ciclo = (495 − 481.50) + 6.00 = **19.50 ($1,950)** |
| 4b | Si no: te quedas la prima y repites el paso 3 | Costo base baja a 475.50 |

| Concepto | Fórmula |
|---|---|
| Costo base tras asignación | K_put − primas cobradas |
| Ganancia máx por ciclo | (K_call − K_put) + suma de primas |
| Pérdida máx | Costo base (acción a 0), menos primas futuras |
| Breakeven | K_put − suma de primas cobradas |
| Griegas | Fase put: como CSP. Fase acción: como covered call (Δ +, Γ −, Θ +, Vega −) |

- **Cuándo**: subyacente que no te molesta tener a largo plazo, mercado lateral/alcista.
- **Riesgos**: caída fuerte y prolongada (quedas "atorado" con la acción y calls de primas bajas);
  vender la call debajo del costo base fija una pérdida si te asignan.
- **En el proyecto**: no es una sola orden. Cada fase es una estrategia de 1 pierna (6.2 y 6.1);
  la acción entra o sale por asignación (o con `POST /api/v1/orders`).

```
Ciclo:   [Vender PUT] --asignan--> [Tener 100 acciones] --vender CALL--> [asignan] --> [Vender PUT]
              |  no asignan                       |  no asignan
              +------> repetir                    +------> repetir
```

---

### 6.4 Bull Call Spread (vertical alcista de débito)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Call 500 (`SPY261218C00500000`) | 15.23 |
| 2 | Venta | Call 510 (`SPY261218C00510000`) | 10.68 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Alcista moderada | — |
| Débito | C_baja − C_alta | 15.23 − 10.68 = 4.55 ($455) |
| Ganancia máx | (K_alta − K_baja) − débito | 10 − 4.55 = 5.45 ($545) si S_T ≥ 510 |
| Pérdida máx | débito | 4.55 ($455) si S_T ≤ 500 |
| Breakeven | K_baja + débito | 500 + 4.55 = **504.55** |
| Griegas netas | Δ +; Γ, Θ, Vega pequeños: cerca de K_baja se comporta como call larga (Γ +, Θ −, V +), cerca de K_alta al revés | Δ = 0.542 − 0.430 = +0.112 |

- **Cuándo**: esperas subida moderada; abarata la call larga vendiendo el alza extra.
- **Riesgos**: si SPY no sube de 504.55 pierdes; ganancia topada.
- Reg T del motor = débito = pérdida máx ($455) (prueba `reg_t_recognizes_vertical_spreads`).

```
P&L
 +5.45 |             _______
       |            /
     0 |-----------/--------- S_T
 -4.55 |__________/
            500  504.55 510
```

```json
{
  "name": "Bull call SPY 500/510", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 4.55,
  "legs": [
    { "symbol": "SPY261218C00500000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.5 Bear Put Spread (vertical bajista de débito)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Put 500 (`SPY261218P00500000`) | 12.78 |
| 2 | Venta | Put 490 (`SPY261218P00490000`) | 8.50 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Bajista moderada | — |
| Débito | P_alta − P_baja | 12.78 − 8.50 = 4.28 ($428) |
| Ganancia máx | (K_alta − K_baja) − débito | 10 − 4.28 = 5.72 ($572) si S_T ≤ 490 |
| Pérdida máx | débito | 4.28 ($428) si S_T ≥ 500 |
| Breakeven | K_alta − débito | 500 − 4.28 = **495.72** |
| Griegas netas | Δ −; Γ/Θ/Vega pequeños (largo cerca de K_alta, corto cerca de K_baja) | Δ = −0.458 + 0.347 = −0.111 |

- **Cuándo**: esperas baja moderada; más barato que una put sola.
- **Riesgos**: ganancia topada abajo de 490; pierdes el débito si no baja.

```
P&L
 +5.72 |_______
       |       \
     0 |--------\------------ S_T
 -4.28 |         \__________
          490  495.72  500
```

```json
{
  "name": "Bear put SPY 500/490", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 4.28,
  "legs": [
    { "symbol": "SPY261218P00500000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218P00490000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.6 Bull Put Spread (vertical alcista de crédito)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Venta | Put 490 (`SPY261218P00490000`) | 8.50 |
| 2 | Compra | Put 480 (`SPY261218P00480000`) | 5.32 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Alcista o neutral (que no baje de 490) | — |
| Crédito | P_alta − P_baja | 8.50 − 5.32 = 3.18 ($318) |
| Ganancia máx | crédito | $318 si S_T ≥ 490 |
| Pérdida máx | (K_alta − K_baja) − crédito | 10 − 3.18 = 6.82 ($682) si S_T ≤ 480 |
| Breakeven | K_alta − crédito | 490 − 3.18 = **486.82** |
| Griegas netas | Δ +, Γ −, Θ +, Vega − (alrededor de la corta) | Δ = +0.347 − 0.246 = +0.101 |

- **Cuándo**: IV alta, crees que el precio se mantiene arriba de 490.
- **Riesgos**: pérdida mayor que la ganancia; caída rápida.
- Reg T del motor: put larga 5.32 + (ancho 10 − prima corta 8.50) = 6.82 → $682 = pérdida máx.

```
P&L
 +3.18 |          __________
       |         /
     0 |--------/------------ S_T
 -6.82 |_______/
         480  486.82 490
```

```json
{
  "name": "Bull put SPY 490/480", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00490000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218P00480000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

### 6.7 Bear Call Spread (vertical bajista de crédito)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Venta | Call 510 (`SPY261218C00510000`) | 10.68 |
| 2 | Compra | Call 520 (`SPY261218C00520000`) | 7.19 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Bajista o neutral (que no suba de 510) | — |
| Crédito | C_baja − C_alta | 10.68 − 7.19 = 3.49 ($349) |
| Ganancia máx | crédito | $349 si S_T ≤ 510 |
| Pérdida máx | (K_alta − K_baja) − crédito | 10 − 3.49 = 6.51 ($651) si S_T ≥ 520 |
| Breakeven | K_baja + crédito | 510 + 3.49 = **513.49** |
| Griegas netas | Δ −, Γ −, Θ +, Vega − | Δ = −0.430 + 0.325 = −0.105 |

- **Cuándo**: IV alta y techo técnico; esperas que no suba.
- **Riesgos**: rally fuerte; asignación anticipada de la call corta si queda ITM antes de dividendo.

```
P&L
 +3.49 |__________
       |          \
     0 |-----------\--------- S_T
 -6.51 |            \_______
            510 513.49 520
```

```json
{
  "name": "Bear call SPY 510/520", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00520000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

**Resumen de verticales** (memorizar):

| Spread | Breakeven | Ganancia máx | Pérdida máx |
|---|---|---|---|
| Bull call (débito) | K_baja + débito | ancho − débito | débito |
| Bear put (débito) | K_alta − débito | ancho − débito | débito |
| Bull put (crédito) | K_alta − crédito | crédito | ancho − crédito |
| Bear call (crédito) | K_baja + crédito | crédito | ancho − crédito |

Truco: en **todos** los verticales, ganancia máx + pérdida máx = ancho entre strikes
(5.45 + 4.55 = 10; 3.18 + 6.82 = 10).

---

### 6.8 Iron Condor

= Bull put spread + Bear call spread (mismo vencimiento). 4 piernas: justo el máximo de la API.

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Put 480 (`SPY261218P00480000`) | 5.32 |
| 2 | Venta | Put 490 (`SPY261218P00490000`) | 8.50 |
| 3 | Venta | Call 510 (`SPY261218C00510000`) | 10.68 |
| 4 | Compra | Call 520 (`SPY261218C00520000`) | 7.19 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Neutral: SPY se queda entre 490 y 510 | — |
| Crédito | crédito puts + crédito calls | 3.18 + 3.49 = 6.67 ($667) |
| Ganancia máx | crédito total | $667 si 490 ≤ S_T ≤ 510 |
| Pérdida máx | ancho del lado − crédito total (alas iguales) | 10 − 6.67 = 3.33 ($333) |
| Breakeven bajo | K_put_corta − crédito | 490 − 6.67 = **483.33** |
| Breakeven alto | K_call_corta + crédito | 510 + 6.67 = **516.67** |
| Griegas netas | Δ ≈ 0, Γ −, Θ +, Vega − | Δ −0.004; Θ +0.034 ($3.4/día); Vega −0.153 (−$15.3/pt) |

- Por qué la pérdida usa el crédito **total**: al vencimiento solo un lado puede perder; el crédito
  del otro lado se queda contigo.
- Si las alas son distintas: pérdida máx = **ala más ancha** − crédito total.
- **Cuándo**: IV alta que esperas que baje, mercado en rango.
- **Riesgos**: movimiento fuerte a cualquier lado; gamma negativa crece cerca del vencimiento.
- Reg T del motor: margina **cada lado por separado** (682 + 651 = $1,333), más conservador que un
  bróker (≈ $333). Lo dice la spec: "Conservador en iron condors".

```
P&L
 +6.67 |        __________
       |       /          \
     0 |------/------------\------ S_T
 -3.33 |_____/              \_____
        480 483.33 490  510 516.67 520
```

```json
{
  "name": "Iron condor SPY 480/490/510/520", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00480000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218P00490000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00520000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

### 6.9 Iron Butterfly

Short straddle ATM + alas compradas. Igual que el condor pero las cortas en el **mismo** strike.

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Put 480 (`SPY261218P00480000`) | 5.32 |
| 2 | Venta | Put 500 (`SPY261218P00500000`) | 12.78 |
| 3 | Venta | Call 500 (`SPY261218C00500000`) | 15.23 |
| 4 | Compra | Call 520 (`SPY261218C00520000`) | 7.19 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Muy neutral: SPY termina en 500 | — |
| Crédito | (C_K + P_K) − (C_ala + P_ala) | 28.01 − 12.51 = 15.50 ($1,550) |
| Ganancia máx | crédito (solo si S_T = K exacto) | $1,550 |
| Pérdida máx | ancho del ala − crédito | 20 − 15.50 = 4.50 ($450) |
| Breakevens | K ± crédito | 500 ± 15.50 = **484.50** y **515.50** |
| Griegas netas | Δ ≈ 0, Γ − (fuerte), Θ +, Vega − | Δ −0.005; Θ +0.045 ($4.5/día); Vega −0.209 |

- **vs Iron Condor**: más crédito y mejor relación ganancia/pérdida, pero la zona de ganancia
  máxima es un punto, no un rango. Casi nunca se cobra el máximo.
- **Riesgos**: cualquier movimiento te aleja del máximo; gamma negativa muy alta al vencer.

```
P&L
+15.50 |            /\
       |           /  \
     0 |----------/----\--------- S_T
 -4.50 |_________/      \________
         480 484.50 500 515.50 520
```

```json
{
  "name": "Iron butterfly SPY 480/500/520", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00480000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218P00500000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00500000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00520000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

### 6.10 Long Straddle

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Call 500 (`SPY261218C00500000`) | 15.23 |
| 2 | Compra | Put 500 (`SPY261218P00500000`) | 12.78 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Movimiento grande, sin saber la dirección (earnings, Fed) | — |
| Débito | C + P | 28.01 ($2,801) |
| Ganancia máx | Ilimitada arriba; abajo K − débito | abajo: 500 − 28.01 = 471.99 ($47,199) |
| Pérdida máx | débito (si S_T = K) | $2,801 |
| Breakevens | K ± débito | **471.99** y **528.01** |
| Griegas netas | Δ ≈ 0, Γ +, Θ −, Vega + | Δ +0.084; Θ −0.311 (−$31.1/día); Vega +1.394 (+$139/pt) |

- **Cuándo**: IV baja antes de un evento; esperas que el movimiento supere ±5.6%.
- **Riesgos**: theta te come cada día; "IV crush" tras el evento puede hacerte perder aunque se mueva.

```
P&L
       |\                  /
       | \                /
     0 |--\--------------/---- S_T
       |   \            /
-28.01 |    \__________/   (punto en 500)
        471.99   500   528.01
```

```json
{
  "name": "Long straddle SPY 500", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 28.01,
  "legs": [
    { "symbol": "SPY261218C00500000", "side": "buy", "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218P00500000", "side": "buy", "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

### 6.11 Short Straddle

Mismas piernas con `side: "sell"` (`sell_to_open`).

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Quieto en 500, IV alta que va a bajar | — |
| Crédito | C + P | 28.01 ($2,801) |
| Ganancia máx | crédito (si S_T = K) | $2,801 |
| Pérdida máx | **Ilimitada** arriba; abajo K − crédito | abajo 471.99 ($47,199) |
| Breakevens | K ± crédito | **471.99** y **528.01** |
| Griegas netas | Δ ≈ 0, Γ −, Θ +, Vega − | Θ +$31.1/día; Vega −$139/pt |

- **Riesgos**: pérdida ilimitada, margen alto. Reg T del motor (cada pierna como descubierta):
  call 15.23 + max(100 − 0, 50) = 115.23, put 12.78 + 100 = 112.78 → $22,801. (Muchos brókers piden
  solo el lado mayor + la prima del otro: 115.23 + 12.78 = 128.01 → $12,801.)

```
P&L
+28.01 |        /\
     0 |-------/--\-------- S_T
       |      /    \
       |     /      \     (ilimitada arriba)
        471.99 500 528.01
```

```json
{
  "name": "Short straddle SPY 500", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218C00500000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218P00500000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.12 Long Strangle

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra | Call 510 (`SPY261218C00510000`) | 10.68 |
| 2 | Compra | Put 490 (`SPY261218P00490000`) | 8.50 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Movimiento muy grande, dirección desconocida | — |
| Débito | C_alta + P_baja | 19.18 ($1,918) |
| Ganancia máx | Ilimitada arriba; abajo K_put − débito | abajo 470.82 ($47,082) |
| Pérdida máx | débito (si K_put ≤ S_T ≤ K_call) | $1,918 |
| Breakevens | K_put − débito y K_call + débito | **470.82** y **529.18** |
| Griegas netas | Δ ≈ 0, Γ +, Θ −, Vega + | Δ +0.083; Θ −0.300 (−$30/día); Vega +1.338 |

- **vs Long Straddle**: más barato, pero necesita un movimiento mayor (breakevens más lejos).

```
P&L
       |\                    /
     0 |-\------------------/---- S_T
-19.18 |  \_______________/
        470.82 490    510 529.18
```

```json
{
  "name": "Long strangle SPY 490/510", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 19.18,
  "legs": [
    { "symbol": "SPY261218P00490000", "side": "buy", "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218C00510000", "side": "buy", "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

### 6.13 Short Strangle

Mismas piernas vendidas.

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Rango amplio (490–510), IV alta | — |
| Crédito | C_alta + P_baja | 19.18 ($1,918) |
| Ganancia máx | crédito | $1,918 si 490 ≤ S_T ≤ 510 |
| Pérdida máx | **Ilimitada** arriba; abajo K_put − crédito | abajo 470.82 ($47,082) |
| Breakevens | K_put − crédito y K_call + crédito | **470.82** y **529.18** |
| Griegas netas | Δ ≈ 0, Γ −, Θ +, Vega − | Θ +$30/día; Vega −$134/pt |

- Es el portafolio de prueba de `risk.rs` (`short_strangle`, risk.rs:223): las pruebas verifican que
  pierde en movimientos grandes, que la prob. de ganancia es > 50% y que tiene VaR positivo
  ("media positiva pero cola izquierda gruesa").
- **vs Iron Condor**: el condor es este strangle con alas compradas que **limitan** la pérdida.

```
P&L
+19.18 |      ____________
     0 |-----/------------\------ S_T
       |    /              \     (ilimitada arriba)
        470.82 490    510 529.18
```

```json
{
  "name": "Short strangle SPY 490/510", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00490000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```

---

### 6.14 Calendar Spread (horizontal / time spread)

Mismo strike, **distinto vencimiento**: vendes el cercano, compras el lejano.

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Venta | Call 500 dic-18 (`SPY261218C00500000`), 45 días | 15.23 |
| 2 | Compra | Call 500 ene-15 (`SPY270115C00500000`), 73 días | 19.83 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | SPY se queda cerca de 500 hasta el vencimiento cercano; IV estable o sube | — |
| Débito | C_lejana − C_cercana | 19.83 − 15.23 = 4.60 ($460) |
| Ganancia máx | **No tiene fórmula cerrada**: C_lejana(S=K, T restante) − débito, depende de la IV en ese momento | Con IV 20%: call 500 a 28 días = 11.81 → 11.81 − 4.60 = **7.21 ($721)** en S_T = 500 |
| Pérdida máx | ≈ débito (si SPY se va muy lejos en cualquier dirección) | ≤ $460 |
| Breakevens | Se resuelven numéricamente: C_lejana(S, T_rest) − max(S − K, 0) = débito | Con IV 20%: **≈ 482.24** y **≈ 522.71** |
| Griegas netas | Δ ≈ 0, Γ −, Θ +, Vega + | Δ +0.011; Θ +0.034; Vega +0.187 |

- Gana porque la opción cercana pierde valor tiempo **más rápido** que la lejana (theta crece cerca
  del vencimiento).
- **Vega positiva**: a diferencia del iron condor, se beneficia si la IV sube.
- **Riesgos**: movimiento fuerte; caída de la IV del mes lejano. Los breakevens cambian con la IV.
- Al vencimiento cercano la pierna lejana sigue viva: el motor lo maneja porque cada pierna lleva su
  propia `t` y el horizonte del Monte Carlo es **el primer vencimiento** (`risk.service.js`).
- Reg T del motor: la call larga vence **después** que la corta (`legs[j].t >= l.t`), así que sí
  la cubre (ancho 0 → requerimiento = débito). Si fuera al revés, la corta queda descubierta (prueba
  `reg_t_recognizes_vertical_spreads`, caso calendar).

```
P&L (al vencer la cercana)
 +7.21 |          /\
     0 |---------/--\--------- S_T
 -4.60 |________/    \________
        482.24 500  522.71
```

```json
{
  "name": "Calendar call SPY 500 dic/ene", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 4.60,
  "legs": [
    { "symbol": "SPY261218C00500000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY270115C00500000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

### 6.15 Diagonal Spread

Distinto strike **y** distinto vencimiento. Ejemplo alcista (estilo "poor man's covered call" corto).

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Venta | Call 510 dic-18 (`SPY261218C00510000`), 45 días | 10.68 |
| 2 | Compra | Call 500 ene-15 (`SPY270115C00500000`), 73 días | 19.83 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Ligeramente alcista: SPY sube hacia 510 sin pasarse mucho | — |
| Débito | C_lejana − C_cercana | 19.83 − 10.68 = 9.15 ($915) |
| Ganancia máx | Numérica: en S_T = K_corta, C_lejana(K_corta, T_rest) − débito | Con IV 20%: **≈ 8.69 ($869)** en 510 |
| Pérdida máx | Si K_larga ≤ K_corta: ≈ débito. Si K_larga > K_corta: débito + (K_larga − K_corta) | ≈ $915 (SPY se desploma) |
| Breakeven | Numérico | Con IV 20%: **≈ 494.60**; arriba no hay breakeven: al subir mucho el P&L tiende a (K_corta − K_larga) − débito + intereses ≈ +0.85 + 1.53 > 0 |
| Griegas netas | Δ +, Γ −, Θ +, Vega + | Δ = 0.553 − 0.430 = +0.123 |

- **Cuándo**: quieres el efecto calendar con sesgo direccional, o "rentar" una call larga lejana.
- **Riesgos**: caída fuerte; cambios de IV entre vencimientos.

```
P&L (al vencer la cercana)
 +8.69 |              /\____
     0 |-------------/------- S_T
 -9.15 |____________/
              494.60  510
```

```json
{
  "name": "Diagonal call SPY 500 ene / 510 dic", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 9.15,
  "legs": [
    { "symbol": "SPY261218C00510000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" },
    { "symbol": "SPY270115C00500000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

### 6.16 Collar

Acción + put protectora comprada + call cubierta vendida (la call paga la put).

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra (o ya tienes) | 100 SPY | 500.00 |
| 2 | Compra | Put 480 (`SPY261218P00480000`) | 5.32 |
| 3 | Venta | Call 520 (`SPY261218C00520000`) | 7.19 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Tienes la acción y quieres acotar la pérdida a costo ≈ 0 | — |
| Neto opciones | prima_call − prima_put (crédito si > 0) | 7.19 − 5.32 = **1.87 crédito** |
| Ganancia máx | (K_call − S) + crédito neto | (520 − 500) + 1.87 = 21.87 ($2,187) |
| Pérdida máx | (S − K_put) − crédito neto | (500 − 480) − 1.87 = 18.13 ($1,813) |
| Breakeven | S − crédito neto (S + débito si fuera débito) | 500 − 1.87 = **498.13** |
| Griegas netas | Δ + reducida, Γ/Θ/Vega pequeños (se compensan) | Δ = 1 − 0.246 − 0.325 = +0.429 |

- **Zero-cost collar**: eliges strikes para que neto ≈ 0.
- **Riesgos**: renuncias al alza arriba de 520; asignación de la call.

```
P&L
+21.87 |                ______
     0 |--------/-------------- S_T
-18.13 |_______/
         480  498.13   520
```

Envío: acciones con `POST /api/v1/orders`; las dos opciones:
```json
{
  "name": "Collar SPY 480/520", "underlying": "SPY", "qty": 1, "order_type": "market",
  "legs": [
    { "symbol": "SPY261218P00480000", "side": "buy",  "ratio_qty": 1, "position_intent": "buy_to_open" },
    { "symbol": "SPY261218C00520000", "side": "sell", "ratio_qty": 1, "position_intent": "sell_to_open" }
  ]
}
```
(Ojo: sin las acciones, estas dos piernas solas son un *risk reversal* bajista, no un collar; el
`/risk` de la API las analiza así.)

---

### 6.17 Protective Put (put protectora / married put)

| Pierna | Acción | Instrumento | Precio |
|---|---|---|---|
| 1 | Compra (o ya tienes) | 100 SPY | 500.00 |
| 2 | Compra | Put 490 (`SPY261218P00490000`) | 8.50 |

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Alcista pero quieres seguro contra caída | — |
| Costo | S + prima | 508.50 ($50,850) |
| Ganancia máx | Ilimitada | — |
| Pérdida máx | (S − K) + prima | (500 − 490) + 8.50 = 18.50 ($1,850) |
| Breakeven | S + prima | **508.50** |
| Griegas netas | Δ + (1 + Δput), Γ +, Θ −, Vega + | Δ = 1 − 0.347 = +0.653; Θ −$12.4/día |

- Es exactamente un **seguro**: la prima es el deducible pagado por adelantado.
- Su payoff equivale a una **call larga** strike 490 (paridad put-call).

```
P&L
       |               /
     0 |--------------/------ S_T
-18.50 |_____________/
             490   508.50
```

Envío: acciones con `POST /api/v1/orders`, y:
```json
{
  "name": "Protective put SPY 490", "underlying": "SPY", "qty": 1,
  "order_type": "limit", "limit_price": 8.50,
  "legs": [
    { "symbol": "SPY261218P00490000", "side": "buy", "ratio_qty": 1, "position_intent": "buy_to_open" }
  ]
}
```

---

## 7. Gestión de riesgo

Endpoint: `GET /api/v1/strategies/{id}/risk?paths=50000&seed=42&horizon_days=…`
(`risk.service.js`). Paso a paso de lo que hace:

1. Carga la estrategia y parsea cada OCC. Si alguna pierna ya venció → 400.
2. Pide a Alpaca el **precio del subyacente** (`latestTrade.p` o cierre diario) y el **snapshot** de
   cada opción.
3. Por pierna: `mid = (bid + ask)/2`; `vol` = IV de Alpaca, o si no viene, `impliedVol` del motor
   sobre el mid (`ivSource: 'motor'`). `qty = ±ratio_qty × qty_estrategia` (+ compra, − venta),
   multiplicador 100. `t` = años hasta las 20:00 UTC del vencimiento.
4. Corre el motor: `blackScholes` (griegas por pierna), `monteCarlo`, `pnlMatrix` (2 veces),
   `regTMargin`, `spanMargin`.
5. Regresa griegas del portafolio, costo modelo vs mercado, estadísticas MC, histograma, matriz,
   márgenes y tiempos.

### 7.1 Margen Reg T (`risk::reg_t`, risk.rs:128)

Reglas tipo CBOE, por pierna:

| Pierna | Requerimiento |
|---|---|
| Acción larga | 50% × S × unidades |
| Opción larga | prima completa |
| Opción corta **cubierta** por una larga del mismo tipo que vence igual o después (vertical) | (ancho − prima corta) × unidades; ancho = 0 si el spread es de débito |
| Call corta descubierta | prima + max(20%·S − OTM, 10%·S) |
| Put corta descubierta | prima + max(20%·S − OTM, 10%·K) |

(OTM = cuánto está fuera del dinero: call max(K − S, 0); put max(S − K, 0).)

Resultado: en un vertical, la suma de las piernas = **pérdida máxima** (débito, o ancho − crédito).
Limitación: en iron condor/butterfly suma ambos lados.

### 7.2 Margen SPAN (`risk::span`, risk.rs:199)

Método de cámaras de compensación (CME): revalúa el portafolio en **16 escenarios** y cobra la peor
pérdida.

- Rango de precio `price_scan` = 15% (lo pone `risk.service.js`), rango de vol `vol_scan` = 4 pts.
- Escenarios (`SPAN_SCENARIOS`): precio en 0, ±1/3, ±2/3, ±1 del rango, cada uno con vol arriba y
  abajo (14 escenarios), más 2 **extremos** a ±2× el rango con peso **35%**.
- En todos pasa **1 día** (`one_day = 1/365`).
- `margen = max(scan_risk, short_option_minimum)`; SOM = $25 por contrato corto (en el servicio).

| | Reg T | SPAN |
|---|---|---|
| Base | Reglas fijas por tipo de posición | Escenarios de riesgo del portafolio completo |
| Reconoce coberturas | Solo verticales (en el motor) | Todas, porque revalúa todo junto |
| Uso | Cuentas de bróker en EE.UU. | Cámaras de futuros/opciones, portfolio margin |

### 7.3 Monte Carlo (`risk::monte_carlo`, risk.rs:77)

Simula el subyacente con **movimiento browniano geométrico** en mundo neutral al riesgo:

```
S_H = S_0 · exp( (r − q − σ²/2)·H + σ·√H·Z ),   Z ~ N(0,1)
P&L = valor_portafolio(S_H, tiempo transcurrido H) − valor_portafolio(S_0, hoy)
```

- **Variables antitéticas**: por cada Z usa también −Z. Reduce la varianza del estimador (los errores
  de una trayectoria se compensan con su espejo) y obliga a que `paths` sea par.
- σ = IV promedio de las piernas; H = días al **primer** vencimiento (por defecto).
- Estadísticas (`MC_STATS = 9`): media, desviación estándar, **VaR 95%** (pérdida que solo se supera
  el 5% de las veces = −percentil 5), **CVaR 95%** (pérdida promedio en ese 5% peor), VaR 99%,
  prob. de ganancia, mín, máx, valor base; más un histograma de 40 barras.
- Semilla fija (`seed`, default 42) → resultados **reproducibles**.

### 7.4 Matriz P&L (`risk::pnl_matrix`, risk.rs:61)

Tabla **choque de precio × choque de volatilidad**:

- Filas: −10%, −7.5%, −5%, −2.5%, 0, +2.5%, … +10% del spot.
- Columnas: −10, −5, 0, +5, +10 puntos de vol.
- `pnlMatrix` con `horizonDays: 0` = choque **instantáneo** (cómo te pega un movimiento hoy).
- Una segunda llamada con `horizonDays = H` y una sola columna de vol = **P&L al vencimiento** por
  movimiento (`pnlAtHorizon`).
- La celda central (sin choques, horizonte 0) vale 0 (prueba `pnl_matrix_center_is_theta_only`).

Lectura rápida: un iron condor muestra ganancias en el centro y pérdidas en las esquinas de precio;
columnas de vol más alta = peor (vega −). Un long straddle, al revés.

---

## 8. Recorrido del código Rust

Archivos en `quant-core-engine/engine/src/`. Las líneas son las del archivo actual. Pruebas:
`cargo test --release` (15 pruebas).

### 8.1 Parte de Kevin: `math.rs` + `bs.rs`

#### `math.rs` — base numérica

| Línea | Elemento | Qué hace | Por qué |
|---|---|---|---|
| 3 | `INV_SQRT_2PI` | Constante 1/√(2π) = 0.3989… | Evita recalcularla en cada `norm_pdf` |
| 7 | `norm_pdf(x)` | Densidad normal: `n(x) = e^(−x²/2)/√(2π)` | La usan gamma, vega, theta e IV |
| 13 | `norm_cdf(x)` | Acumulada N(x) con el algoritmo de **Hart (1968)** en la forma de **West (2005)**, error < 1e-14 | Rust no trae `erf` en `core`; se necesita precisión doble para que la IV converja |
| 52 | `struct Rng` | Estado de 64 bits + `spare` (normal guardada) | Generador propio, determinista |
| 58 | `Rng::new(seed)` | Si `seed == 0` usa `0x9E3779B97F4A7C15` | Xorshift con estado 0 se queda en 0 para siempre |
| 63 | `next_u64` | **xorshift64\***: `x ^= x>>12; x ^= x<<25; x ^= x>>27;` y multiplica por `0x2545F4914F6CDD1D` | Rápido, buena calidad, sin dependencias (WASM sin imports) |
| 74 | `uniform()` | Toma los 53 bits altos, suma 0.5 y escala: uniforme en (0,1) **abierto** | Nunca da 0, así `ln(u1)` en Box-Muller no explota |
| 79 | `normal()` | **Box-Muller**: `r = √(−2 ln u1)`, `θ = 2π u2`, regresa `r·cos θ` y guarda `r·sin θ` para la siguiente llamada | Cada par de uniformes da 2 normales; no se desperdicia ninguna |

Cómo explicar `norm_cdf`: trabaja con z = |x|. Si z > 37, la cola es 0. Si z < 7.07 (= 10/√2) usa
un **cociente de polinomios** (numerador grado 6, denominador grado 7, en forma de Horner) por
`e^(−z²/2)`. Si no, una **fracción continua**. Al final usa la simetría
N(x) = 1 − N(−x). Pruebas (math.rs:97): N(0) = 0.5, N(1.96) = 0.975, N(−1) = 0.158655…; y
`rng_moments` (math.rs:104) comprueba media ≈ 0 y varianza ≈ 1 con 200,000 normales.

#### `bs.rs` — Black-Scholes-Merton, griegas e IV

| Línea | Elemento | Qué hace |
|---|---|---|
| 11 | `enum Kind { Call, Put }` | Tipo de opción |
| 18 | `Kind::from_f64(v)` | En la frontera FFI: `v > 0` → Call, si no Put (por eso la API manda 1 / −1) |
| 28 | `struct Contract` | `kind, spot, strike, t (años), rate, div, vol` |
| 40 | `struct Greeks` | `price, delta, gamma, vega, theta, rho` |
| 50 | `price(c)` | Solo precio (camino rápido) |
| 71 | `greeks(c)` | Precio + 5 griegas analíticas |
| 125 | `implied_vol(...)` | Volatilidad implícita |

**`price` (bs.rs:50-68)**:
- Calcula los factores de descuento `df_q = e^(−qT)` y `df_r = e^(−rT)`.
- Caso borde (l.53-60): si `t <= 0` o `vol <= 0`, regresa el **intrínseco del forward descontado**
  `max(S·df_q − K·df_r, 0)` (call). Con T = 0 es exactamente `max(S − K, 0)`.
- l.62-63: `d1` y `d2` (fórmula de la sección 2.1).
- l.64-67: fórmula de call / put.
- Se usa en IV, márgenes y Monte Carlo porque no calcula griegas → más rápido.

**`greeks` (bs.rs:71-121)**:
- Caso borde (l.72-84): vencida → delta 1 (call ITM), −1 (put ITM) o 0; resto 0.
- l.93 `gamma = df_q·n(d1)/(S·σ·√T)`.
- l.94 `vega = S·df_q·n(d1)·√T`.
- l.95 `theta_common = −S·df_q·n(d1)·σ/(2√T)` (parte común call/put).
- l.97-118: por tipo, precio, delta, theta (común ∓ término de tasa ± término de dividendo) y rho.
- l.120: **conversión de unidades**: `vega/100` (por punto), `theta/365` (por día), `rho/100`
  (por 1%).

**`implied_vol` (bs.rs:125-169)** — **Newton-Raphson protegido por bisección**:
1. l.126: valida entradas (precio finito, S, K, T > 0) o regresa NaN.
2. l.131-134: **límites de no-arbitraje**. Call: entre max(S·df_q − K·df_r, 0) y S·df_q. Put: entre
   max(K·df_r − S·df_q, 0) y K·df_r. Fuera → NaN (prueba `implied_vol_rejects_arbitrage`).
3. l.138: si el precio = límite inferior, la IV es 0.
4. l.143: intervalo inicial [1e-6, 5.0] (0% a 500%).
5. l.145: **semilla de Brenner-Subrahmanyam** `σ₀ ≈ √(2π/T)·precio/S`, acotada a [0.05, 2].
6. Loop de hasta 100 iteraciones (l.147): calcula `diff = precio_modelo − objetivo`; si
   |diff| < 1e-10 termina. Ajusta el intervalo: si el modelo está caro, la vol es `hi`; si barato,
   `lo` (el precio crece con la vol).
7. l.161: paso de Newton `σ_nuevo = σ − diff / vega` (vega **sin** dividir entre 100).
8. l.163: si Newton se sale de [lo, hi] o la vega ≈ 0, hace **bisección** `(lo+hi)/2`. Así tiene la
   velocidad de Newton (convergencia cuadrática) con la garantía de la bisección.

Pruebas de `bs.rs`: Hull 4.7594 / 0.8086 (l.181), paridad put-call (l.189), griegas vs **diferencias
finitas** (l.198: deriva numéricamente el precio y compara con cada griega), ida y vuelta de IV con
strikes 20–80 y vols 5%–150% (l.220), y rechazo de precios imposibles (l.237).

### 8.2 Parte de Alfredo: `binomial.rs` + `risk.rs` + `lib.rs`

#### `binomial.rs` — árbol de Cox-Ross-Rubinstein (americanas)

| Línea | Elemento | Qué hace |
|---|---|---|
| 7 | `struct TreeResult` | `price, delta, gamma, theta` (por día), `early_exercise_premium` |
| 18 | `payoff(kind, s, k)` | Intrínseco: call `max(s−k,0)`, put `max(k−s,0)` |
| 27 | `roll_back(c, steps, american, buf)` | Construye y recorre el árbol hacia atrás |
| 63 | `price_tree(c, steps, american, buf)` | Precio + griegas del árbol + prima de ejercicio anticipado |

**`roll_back`** (fórmulas CRR):
```
Δt = T/pasos     u = e^(σ√Δt)     d = 1/u
p = (e^((r−q)Δt) − d)/(u − d)     (probabilidad neutral al riesgo; l.32 la acota a [0,1])
descuento = e^(−rΔt)
```
- l.37-43: nodos finales `S·u^j·d^(n−j) = S·u^(2j−n)`; arranca en `S·d^n` y multiplica por `u²`.
  Guarda el payoff en `buf`.
- l.47-59: hacia atrás: `continuación = desc·(p·V_arriba + (1−p)·V_abajo)`. Si es **americana**,
  `V = max(continuación, intrínseco)` → aquí está el ejercicio anticipado.
- Guarda los valores de los pasos 1 y 2 para las griegas. `buf` se reutiliza entre contratos (no
  pide memoria por contrato).

**`price_tree`**:
- l.64: pasos acotados a [3, 20,000].
- l.76: `delta = (V_u − V_d)/(S·u − S·d)`.
- l.78-80: `gamma` = cambio entre las deltas del paso 2 dividido entre medio rango de precio.
- l.82: `theta = (V_ud − V_0)/(2Δt)/365`: el nodo central del paso 2 tiene el **mismo** precio que
  la raíz pero 2Δt después.
- l.84-89: si es americana, corre el árbol otra vez como europeo y `early_exercise_premium =
  americana − europea`.

Pruebas: el árbol europeo converge a Black-Scholes (l.100); put americana de Hull ≈ 4.28 con prima de
ejercicio > 0 (l.108); call americana sin dividendos = europea (l.118).

#### `risk.rs` — riesgo de portafolio

| Línea | Elemento | Qué hace |
|---|---|---|
| 13 | `struct Leg` | `kind` (1 call, −1 put, 0 acción), `strike`, `t`, `qty` (con signo), `vol`, `multiplier` |
| 23 | `LEG_STRIDE = 6` | f64 por pierna en la FFI |
| 26 | `Leg::from_slice` | Lee 6 f64 → `Leg` |
| 30 | `is_stock` | `kind == 0` |
| 35 | `unit_value(spot, rate, div, vol_shift, dt)` | Valor de 1 unidad bajo escenario: acción = spot; opción = `bs::price` con `t − dt` (mín. 0) y `vol + vol_shift` (mín. 1e-4) |
| 50 | `value` | `qty × multiplicador × unit_value` |
| 55 | `portfolio_value` | Suma de todas las piernas |
| 61 | `pnl_matrix` | Matriz choque precio × choque vol (sección 7.4) |
| 72 | `MC_STATS = 9` | Tamaño del bloque de estadísticas |
| 77 | `monte_carlo` | GBM + antitéticas (sección 7.3) |
| 128 | `reg_t` | Margen Reg T (sección 7.1) |
| 177 | `SPAN_SCENARIOS` | 16 tuplas (fracción de precio, dirección de vol, peso) |
| 197 | `SPAN_HEADER = 4` | `[margen, scan_risk, som, peor]` |
| 199 | `span` | Margen SPAN (sección 7.2) |

Detalle de **`monte_carlo`** (l.77-118):
- l.78: `paths & !1` fuerza número par (antitéticas).
- l.81-82: `drift = (r − q − σ²/2)·H`, `diffusion = σ·√H`.
- l.86-92: por cada Z, simula con Z y −Z, revalúa el portafolio con `dt = H` y guarda el P&L.
- l.94-97: media, varianza muestral (n − 1), prob. de ganancia.
- l.99-105: ordena; VaR95 = −P&L en el índice 5%, CVaR95 = −promedio de los peores 5%, VaR99.
- l.109-117: histograma con `bins` barras entre mín y máx.

Detalle de **`reg_t`** (l.128-174):
- l.130: `free` = unidades largas disponibles para cubrir cortas.
- l.135-137: acción 50%; larga = prima.
- l.144-151: candidatos a cubrir una corta: largas del **mismo tipo** que vencen **igual o
  después**; ordenadas por ancho (primero las que dejan el spread en débito, ancho 0).
- l.152-160: consume cobertura: `req += (ancho − prima) × usadas`.
- l.161-168: lo que quede sin cubrir paga la fórmula de opción descubierta.

Detalle de **`span`** (l.199-217): recorre los 16 escenarios, `pérdida = (base − valor_escenario) ×
peso` con 1 día transcurrido, guarda la peor (`scan_risk`, `worst`), calcula SOM = contratos cortos ×
`som_per_contract` y regresa `max(scan_risk, SOM)`.

Pruebas (l.223-294): strangle corto en la matriz, Monte Carlo (prob. ganancia > 50%, histograma suma
20,000), put descubierta = (prima + 10) × 200, verticales de débito/crédito y calendar invertido, y
SPAN = peor escenario.

#### `lib.rs` — frontera FFI / WebAssembly

Idea central: **todo va en lotes**. JavaScript copia arreglos planos de `f64` a la memoria lineal
del WASM y cruza la frontera **una vez por lote** (por cadena), no una vez por contrato.

Layout (lib.rs:7-11):

| Lote | Campos | Stride |
|---|---|---|
| contrato | `[tipo, spot, strike, t, rate, div, vol (o precio en IV)]` | 7 (`CONTRACT_STRIDE`, l.22) |
| griegas | `[price, delta, gamma, vega, theta, rho]` | 6 (`GREEKS_STRIDE`, l.23) |
| árbol | `[price, delta, gamma, theta, early_exercise]` | 5 (`TREE_STRIDE`, l.24) |
| pierna | `[tipo, strike, t, qty, vol, multiplicador]` | 6 (`LEG_STRIDE`) |

| Línea | Función | Qué hace |
|---|---|---|
| 26 | `contract_from(row)` | 7 f64 → `Contract` |
| 30 | `legs_from(ptr, n)` | n×6 f64 → `Vec<Leg>` |
| 38 | `qc_alloc(n)` | Reserva n f64 (`Vec::with_capacity` + `mem::forget`) y regresa el puntero a JS |
| 50 | `qc_free(ptr, n)` | Reconstruye el `Vec` con ese puntero y lo suelta (libera) |
| 56 | `qc_abi_version()` | Regresa 100; el wrapper JS falla si no coincide |
| 67 | `qc_bs_batch` | n contratos → n×6 griegas (`bs::greeks`) |
| 81 | `qc_binomial_batch` | n contratos → n×5; `american != 0`; un solo `buf` para todo el lote |
| 96 | `qc_iv_batch` | n cotizaciones (columna 6 = precio) → n IVs |
| 109 | `qc_pnl_matrix` | Piernas + choques → matriz n_s × n_v |
| 125 | `qc_monte_carlo` | Piernas → 9 estadísticas + histograma; `seed` llega como f64 y se convierte a u64 |
| 138 | `qc_reg_t` | Regresa el total; `out` por pierna |
| 148 | `qc_span` | Regresa el margen; `out` de 20 posiciones |

`#[no_mangle] extern "C"` = nombre fijo exportado en el `.wasm`. `unsafe` porque se confía en que JS
pasa punteros y tamaños correctos (documentado en cada `# Safety`).

Lado JS (`packages/quant-engine/index.js`): `withBuffers` reserva con `qc_alloc`, copia con
`Float64Array.set`, llama, crea la vista de salida **después** de la llamada (la memoria pudo crecer
y la vista vieja quedaría inválida) y libera todo en `finally`. `KIND = { call: 1, put: -1, stock: 0 }`.
El `.wasm` no tiene imports, así que se instancia de forma síncrona.

---

## 9. Reparto para la exposición

| Expositor | Tema | Archivos / secciones |
|---|---|---|
| **Kevin** | Base numérica, Black-Scholes, Griegas, IV | `math.rs`, `bs.rs` · secciones 2, 3, 4, 8.1 |
| **Alfredo** | Árbol americano, riesgo, frontera WASM | `binomial.rs`, `risk.rs`, `lib.rs` · secciones 7, 8.2 |
| **Integrante 3** | Fundamentos + estrategias con acciones | Secciones 1, 6.1 Covered Call, 6.2 CSP, 6.3 Wheel, 6.16 Collar, 6.17 Protective Put |
| **Integrante 4** | Spreads verticales y de 4 piernas | 6.4–6.7 verticales, 6.8 Iron Condor, 6.9 Iron Butterfly |
| **Integrante 5** | Volatilidad y tiempo + demo en la API | 6.10–6.13 Straddle/Strangle, 6.14 Calendar, 6.15 Diagonal, sección 5 (cómo se manda) |

Regla del profesor: **todos deben conocer todo**. Cada quien expone su parte, pero cualquiera puede
recibir preguntas de cualquier sección. Ensayen con el banco de preguntas (sección 10) cruzado:
cada integrante responde las preguntas de otro.

---

## 10. Banco de preguntas

### A. Relación de columnas

**1.** Relaciona estrategia con visión de mercado.

| Estrategia | | Visión |
|---|---|---|
| a) Iron Condor | | 1) Movimiento grande sin dirección |
| b) Long Straddle | | 2) Alcista moderada con débito |
| c) Bull Call | | 3) Rango, IV alta |
| d) Bear Call | | 4) Proteger acciones a costo ≈ 0 |
| e) Collar | | 5) Bajista/neutral con crédito |

Respuesta: a-3, b-1, c-2, d-5, e-4.

**2.** Relaciona griega con lo que mide.

| Griega | | Mide |
|---|---|---|
| a) Delta | | 1) Sensibilidad a la volatilidad |
| b) Gamma | | 2) Paso del tiempo |
| c) Theta | | 3) Cambio de delta |
| d) Vega | | 4) Sensibilidad a la tasa |
| e) Rho | | 5) Cambio de precio por $1 del subyacente |

Respuesta: a-5, b-3, c-2, d-1, e-4.

**3.** Relaciona función del motor con archivo.

| Función | | Archivo |
|---|---|---|
| a) `norm_cdf` | | 1) `lib.rs` |
| b) `implied_vol` | | 2) `binomial.rs` |
| c) `roll_back` | | 3) `math.rs` |
| d) `reg_t` | | 4) `bs.rs` |
| e) `qc_alloc` | | 5) `risk.rs` |

Respuesta: a-3, b-4, c-2, d-5, e-1.

### B. Opción múltiple

**4.** El breakeven de un bull put spread 490/480 con crédito 3.18 es:
a) 483.18 b) **486.82** c) 493.18 d) 476.82. → **b** (K_alta − crédito).

**5.** ¿Qué griegas tiene un short strangle?
a) Γ+, Θ−, V+ b) **Γ−, Θ+, V−** c) Γ+, Θ+, V− d) Γ−, Θ−, V+. → **b**.

**6.** ¿Qué método usa `implied_vol`?
a) Solo bisección b) Solo Newton c) **Newton-Raphson protegido por bisección** d) Secante. → **c**.

**7.** ¿Por qué el Monte Carlo del motor usa variables antitéticas?
a) Para simular saltos b) **Para reducir la varianza del estimador** c) Para calcular la IV d) Para
el SPAN. → **b**.

**8.** En el motor, la vega está expresada:
a) Por 100% de vol b) **Por 1 punto de vol (0.01)** c) Por día d) Por 1% de tasa. → **b**.

**9.** ¿Cuántas piernas acepta como máximo `POST /api/v1/strategies`?
a) 2 b) 3 c) **4** d) ilimitadas. → **c** (`MAX_LEGS = 4`, límite `mleg` de Alpaca).

**10.** ¿Cuál estrategia tiene **vega positiva**?
a) Iron condor b) Short straddle c) **Calendar** d) Covered call. → **c**.

**11.** ¿Cuántos escenarios evalúa `span`?
a) 9 b) 14 c) **16** d) 20. → **c** (14 normales + 2 extremos al 35%).

**12.** Una call americana sobre una acción **sin dividendos**:
a) Vale más que la europea b) **Vale lo mismo que la europea** c) Vale menos d) No se puede valuar.
→ **b**.

### C. Verdadero / Falso

**13.** El vendedor de una opción tiene el derecho de ejercerla. → **F** (tiene la obligación).

**14.** En cualquier spread vertical, ganancia máx + pérdida máx = ancho entre strikes. → **V**.

**15.** El margen Reg T del motor para un iron condor es igual al de un bróker. → **F** (el motor
suma ambos lados; es más conservador).

**16.** `Rng::new(0)` produce una secuencia de puros ceros. → **F** (sustituye la semilla 0 por
`0x9E3779B97F4A7C15`).

**17.** Un covered call se puede mandar completo (acciones + call) en una sola orden `mleg` por la API.
→ **F** (Alpaca no acepta piernas de acciones en `mleg`; la API exige OCC).

**18.** La gamma es máxima en opciones ATM cercanas al vencimiento. → **V**.

**19.** El skew significa que las puts OTM suelen tener menos IV que las calls OTM. → **F** (más IV).

**20.** En `binomial.rs` el theta se obtiene comparando el nodo central del paso 2 con la raíz. → **V**.

### D. Ejercicios prácticos

**21.** Bear call 510/520 con crédito 3.49. Calcula ganancia máx, pérdida máx y breakeven por
contrato.
→ Ganancia $349; pérdida (10 − 3.49)×100 = $651; BE = 510 + 3.49 = 513.49.

**22.** Iron condor 480/490/510/520 con créditos 3.18 (puts) y 3.49 (calls). Breakevens y pérdida máx.
→ Crédito 6.67. BE 483.33 y 516.67. Pérdida (10 − 6.67)×100 = $333.

**23.** Long straddle 500 con C = 15.23 y P = 12.78. Breakevens y cuánto pierdes por theta en 1 día
(Θ call −0.183, Θ put −0.128).
→ BE 471.99 y 528.01. Theta −0.311 × 100 = −$31.10/día.

**24.** Collar: tienes 100 SPY a 500, compras P480 a 5.32 y vendes C520 a 7.19. Ganancia máx,
pérdida máx y breakeven.
→ Crédito 1.87. Ganancia 21.87 ($2,187); pérdida 18.13 ($1,813); BE 498.13.

**25.** Delta neta de un bull call 500/510 si Δ C500 = 0.542 y Δ C510 = 0.430. ¿A cuántas acciones
equivale con 3 contratos?
→ 0.112 × 100 × 3 = 33.6 acciones.

**26.** Put corta descubierta K = 90, S = 100, prima 1.20, 2 contratos. Margen Reg T del motor.
→ 1.20 + max(20 − 10, 9) = 11.20 por acción × 200 = $2,240.

**27.** Con C500 = 15.23, Δ = 0.542, Γ = 0.0113, estima el precio si SPY sube a 502.
→ 15.23 + 0.542×2 + ½×0.0113×4 = 15.23 + 1.084 + 0.0226 ≈ 16.34.

**28.** Protective put: 100 SPY a 500 + P490 a 8.50. ¿Pérdida máx y breakeven?
→ Pérdida (500 − 490) + 8.50 = 18.50 ($1,850). BE 508.50.

**29.** Cash-secured put 490 por 8.50: ¿cuánto efectivo reservas y cuál es tu precio efectivo de
compra si te asignan?
→ $49,000 reservados; precio efectivo 481.50.

**30.** Explica con el código por qué `uniform()` nunca regresa 0 y por qué importa.
→ Suma 0.5 a los 53 bits antes de escalar, así el mínimo es 0.5/2^53 > 0; Box-Muller calcula
`ln(u1)` y ln(0) = −∞.

---

## 11. Glosario

| Término | Definición |
|---|---|
| **Antitéticas** | Técnica de Monte Carlo que usa Z y −Z para reducir varianza |
| **Asignación** | Obligación del vendedor de cumplir cuando el comprador ejerce |
| **ATM / ITM / OTM** | En / dentro / fuera del dinero (sección 1.2) |
| **Breakeven** | Precio del subyacente al vencimiento donde el P&L es 0 |
| **Box-Muller** | Transformación de 2 uniformes en 2 normales |
| **Crédito / Débito** | Cobras / pagas al abrir la estrategia |
| **CRR** | Árbol binomial de Cox-Ross-Rubinstein (`u = e^(σ√Δt)`, `d = 1/u`) |
| **CVaR** | Pérdida promedio en el peor α% de los casos (Expected Shortfall) |
| **Ejercicio anticipado** | Ejercer una americana antes del vencimiento |
| **Extrínseco** | Prima − intrínseco; valor tiempo |
| **FFI** | Foreign Function Interface: funciones `extern "C"` que JS llama en el WASM |
| **GBM** | Movimiento browniano geométrico: modelo log-normal del precio |
| **Griegas** | Δ, Γ, Θ, Vega, ρ: sensibilidades del precio de la opción |
| **IV** | Volatilidad implícita: la σ que iguala Black-Scholes al precio de mercado |
| **HV** | Volatilidad histórica: desviación estándar de rendimientos pasados |
| **IV crush** | Caída brusca de la IV tras un evento (earnings) |
| **Intrínseco** | max(S − K, 0) call; max(K − S, 0) put |
| **mleg** | `order_class` de Alpaca para órdenes multi-pierna (máx. 4) |
| **Mid** | (bid + ask) / 2 |
| **Multiplicador** | 100 acciones por contrato |
| **OCC** | Options Clearing Corporation; también el formato del símbolo |
| **Paridad put-call** | C − P = S·e^(−qT) − K·e^(−rT) |
| **P&L** | Profit and Loss: ganancia o pérdida |
| **Prima** | Precio de la opción |
| **Reg T** | Regulación T de la Fed: reglas de margen de cuentas de bróker |
| **Scan risk** | En SPAN, la peor pérdida de los escenarios |
| **Skew** | IV distinta por strike; en índices las puts OTM son más caras |
| **SOM** | Short Option Minimum: margen mínimo por opción corta en SPAN |
| **SPAN** | Standard Portfolio Analysis of Risk (CME): margen por escenarios |
| **Spread vertical** | Mismo vencimiento, distinto strike |
| **Spread horizontal** | Mismo strike, distinto vencimiento (calendar) |
| **Strike** | Precio de ejercicio K |
| **Stride** | Número de f64 por registro en los lotes de la FFI |
| **VaR 95%** | Pérdida que solo se supera el 5% de las veces |
| **WASM** | WebAssembly: binario portable que corre en Node/navegador |
| **Xorshift64\*** | Generador pseudoaleatorio rápido de 64 bits |
