# 02 Inversión con opciones

Nota de la guía del equipo F0. Cada sección `02.xx` se puede copiar sola como nota de Evernote:
repite lo mínimo que necesita para entenderse. El detalle completo (payoffs, JSON de cada
estrategia, código Rust línea por línea y banco de preguntas) está en
[ESTUDIO-ESTRATEGIAS.md](../ESTUDIO-ESTRATEGIAS.md).

**Escenario de todos los ejemplos**: SPY = 500, 45 días al vencimiento (2026-12-18), IV 20%,
tasa 4%, sin dividendos. Primas por acción (× 100 = un contrato):
C500 15.23 · P500 12.78 · C510 10.68 · P490 8.50 · C520 7.19 · P480 5.32.

---

## 02.00 Fundamentos

- **Opción**: derecho (no obligación) de comprar (**call**) o vender (**put**) el subyacente a un
  precio fijo (**strike K**) hasta el **vencimiento**. El comprador paga la **prima**; el vendedor
  cobra y asume la obligación.
- **Multiplicador**: 1 contrato = **100** acciones. Prima 15.23 → $1,523.
- **Moneyness**: call ITM si S > K, put ITM si S < K; ATM si S ≈ K; OTM el resto.
- **Intrínseco**: call max(S − K, 0); put max(K − S, 0). **Extrínseco** = prima − intrínseco
  (valor tiempo; al vencimiento es 0).
- **Americana** (SPY, acciones): se ejerce cualquier día. **Europea** (SPX): solo al vencimiento.
- **Asignación**: si vendiste y el comprador ejerce, la OCC te asigna: put corta → compras 100
  acciones a K; call corta → vendes 100 acciones a K.
- **Símbolo OCC**: `SPY261218C00500000` = SPY, 2026-12-18, Call, strike 500.000.

---

## 02.01 Black-Scholes

### 02.01.1 Fórmula

```
d1 = [ ln(S/K) + (r − q + σ²/2)·T ] / (σ·√T)
d2 = d1 − σ·√T
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
```
S spot, K strike, T años, r tasa, q dividendo, σ volatilidad, N normal acumulada.
En el motor: `bs::price` (engine/src/bs.rs:50).

### 02.01.2 Intuición
- N(d2) ≈ probabilidad neutral al riesgo de terminar ITM.
- Call = valor presente de recibir la acción − valor presente de pagar K, ponderados por probabilidad.
- N(d1) = delta de la call.
- Ejemplo Hull (prueba del motor): S 42, K 40, T 0.5, r 10%, σ 20% → d1 0.7693, d2 0.6278,
  call 4.76, put 0.81.

### 02.01.3 Supuestos
Precio log-normal (GBM), volatilidad y tasa constantes, sin costos, cobertura continua, ejercicio
europeo, sin arbitraje. Para americanas el motor usa el árbol binomial CRR (`binomial.rs`).

### 02.01.4 Paridad put-call
`C − P = S·e^(−qT) − K·e^(−rT)`. Ejemplo: 15.23 − 12.78 = 2.45 ≈ 500 − 500·e^(−0.04·0.1233) = 2.46.

### 02.01.5 Volatilidad implícita, histórica y skew
- **HV**: desviación estándar anualizada de rendimientos pasados (mira atrás).
- **IV**: la σ que hace que Black-Scholes = precio de mercado (mira adelante). El motor la despeja
  con **Newton-Raphson protegido por bisección** (`bs::implied_vol`), semilla de
  Brenner-Subrahmanyam; NaN si el precio viola no-arbitraje.
- **IV alta → vender opciones; IV baja → comprar.**
- **Skew**: las puts OTM tienen más IV que las calls OTM (el mercado paga por protección).

---

## 02.02 Griegas

Convenciones del motor: vega por 1 punto de vol, theta por día (365), rho por 1% de tasa.

| Griega | Mide | C500 del ejemplo |
|---|---|---|
| **Delta Δ** | Cambio de prima por +$1 en S | 0.542 |
| **Gamma Γ** | Cambio de delta por +$1 en S | 0.0113 |
| **Theta Θ** | Cambio de prima por 1 día | −0.183 (−$18.30/contrato) |
| **Vega** | Cambio por +1 punto de IV | 0.697 |
| **Rho ρ** | Cambio por +1% de tasa | 0.315 |

Signos por posición:

| Posición | Δ | Γ | Θ | Vega |
|---|---|---|---|---|
| Call larga | + | + | − | + |
| Call corta | − | − | + | − |
| Put larga | − | + | − | + |
| Put corta | + | − | + | − |

Regla: **comprar opciones = Γ+, Θ−, Vega+; venderlas = Γ−, Θ+, Vega−.**
Griega del portafolio = Σ griega × qty con signo × 100 (así lo suma `risk.service.js`).

---

## 02.03 Wheel (Cash-Secured Put + Covered Call)

Escenario: SPY 500, 45 días, IV 20%.

### 02.03.1 Cash-Secured Put
Vender put 490 a 8.50 con $49,000 reservados.

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Ganancia máx | prima | $850 |
| Pérdida máx | K − prima | 481.50 ($48,150) |
| Breakeven | K − prima | **481.50** |
| Griegas | Δ+, Γ−, Θ+, Vega− | Δ +0.347 |

### 02.03.2 Covered Call
100 SPY a 500 + vender call 510 a 10.68.

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Ganancia máx | (K − S) + prima | 20.68 ($2,068) |
| Pérdida máx | S − prima | 489.32 ($48,932) |
| Breakeven | S − prima | **489.32** |
| Griegas | Δ+ (1 − Δcall), Γ−, Θ+, Vega− | Δ +0.57 |

### 02.03.3 El ciclo
1. Vendes la put 490 (8.50). Si no te asignan, repites.
2. Si te asignan: compras a 490, costo base 490 − 8.50 = **481.50**.
3. Vendes calls con K ≥ costo base (ej. 495 por 6.00). Si te asignan, P&L del ciclo =
   (495 − 481.50) + 6.00 = **19.50 ($1,950)**.

Breakeven del ciclo = K_put − todas las primas cobradas. Riesgo: caída fuerte y larga.
En el proyecto las acciones van por `POST /api/v1/orders` (Alpaca no acepta acciones en `mleg`);
cada put/call es una estrategia de 1 pierna.

---

## 02.04 Iron Condor / Iron Butterfly

Escenario: SPY 500, 45 días, IV 20%. Ambos son de **crédito**, 4 piernas (el máximo de la API).

### 02.04.1 Iron Condor 480/490/510/520
+P480 (5.32), −P490 (8.50), −C510 (10.68), +C520 (7.19).

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Crédito | crédito puts + crédito calls | 3.18 + 3.49 = 6.67 ($667) |
| Ganancia máx | crédito total | $667 entre 490 y 510 |
| Pérdida máx | ala más ancha − crédito total | 10 − 6.67 = 3.33 ($333) |
| Breakevens | K_put_corta − crédito; K_call_corta + crédito | **483.33** y **516.67** |
| Griegas | Δ≈0, Γ−, Θ+, Vega− | Θ +$3.4/día, Vega −$15.3/pt |

### 02.04.2 Iron Butterfly 480/500/520
+P480 (5.32), −P500 (12.78), −C500 (15.23), +C520 (7.19).

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Crédito | (C_K + P_K) − (alas) | 28.01 − 12.51 = 15.50 ($1,550) |
| Ganancia máx | crédito (solo en S_T = K) | $1,550 |
| Pérdida máx | ancho del ala − crédito | 20 − 15.50 = 4.50 ($450) |
| Breakevens | K ± crédito | **484.50** y **515.50** |
| Griegas | Δ≈0, Γ− fuerte, Θ+, Vega− | — |

Condor: rango de ganancia. Butterfly: más crédito pero la ganancia máx es un punto.
Margen Reg T del motor: suma los dos lados (conservador): condor $1,333 vs ≈ $333 de un bróker.

---

## 02.05 Straddle / Strangle

Escenario: SPY 500, 45 días, IV 20%.

| Estrategia | Piernas | Débito/crédito | Breakevens | Máx ganancia | Máx pérdida | Griegas |
|---|---|---|---|---|---|---|
| Long Straddle | +C500 +P500 | débito 28.01 | 500 ± 28.01 = **471.99 / 528.01** | Ilimitada (abajo 471.99) | $2,801 | Γ+ Θ− V+ |
| Short Straddle | −C500 −P500 | crédito 28.01 | **471.99 / 528.01** | $2,801 | **Ilimitada** | Γ− Θ+ V− |
| Long Strangle | +C510 +P490 | débito 19.18 | 490 − 19.18 / 510 + 19.18 = **470.82 / 529.18** | Ilimitada | $1,918 | Γ+ Θ− V+ |
| Short Strangle | −C510 −P490 | crédito 19.18 | **470.82 / 529.18** | $1,918 | **Ilimitada** | Γ− Θ+ V− |

Fórmulas: straddle BE = K ± prima total; strangle BE = K_put − prima total y K_call + prima total.
- Largos: esperas gran movimiento (evento) con IV baja; cuidado con el theta (−$31/día el straddle)
  y el *IV crush*.
- Cortos: esperas quietud con IV alta; pérdida ilimitada. El short strangle es el portafolio de
  prueba de `risk.rs`.

---

## 02.06 Calendar (y Diagonal)

Escenario: SPY 500, IV 20%. Vencimiento cercano 45 días, lejano 73 días (C500 lejana 19.83).

### 02.06.1 Calendar call 500
−C500 dic (15.23) + C500 ene (19.83) = débito 4.60 ($460).

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Visión | Quieto en K, IV estable o al alza | — |
| Pérdida máx | ≈ débito | ≤ $460 |
| Ganancia máx | numérica: C_lejana(S = K, T restante) − débito | 11.81 − 4.60 = 7.21 ($721) |
| Breakevens | numéricos, dependen de la IV futura | ≈ 482.24 y 522.71 |
| Griegas | Δ≈0, Γ−, Θ+, **Vega+** | — |

Gana porque la opción cercana pierde valor tiempo más rápido que la lejana.

### 02.06.2 Diagonal
−C510 dic (10.68) + C500 ene (19.83) = débito 9.15. Sesgo alcista (Δ +0.123), ganancia máx
≈ 8.69 en 510, breakeven ≈ 494.60, pérdida máx ≈ débito (con K_larga ≤ K_corta).

---

## 02.07 Collar (y Protective Put)

Escenario: tienes 100 SPY a 500; 45 días, IV 20%.

### 02.07.1 Protective Put
+P490 (8.50).

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Pérdida máx | (S − K) + prima | 18.50 ($1,850) |
| Ganancia máx | Ilimitada | — |
| Breakeven | S + prima | **508.50** |
| Griegas | Δ+ (0.653), Γ+, Θ−, Vega+ | — |

### 02.07.2 Collar
+P480 (5.32) − C520 (7.19) = **crédito 1.87**.

| Concepto | Fórmula | Ejemplo |
|---|---|---|
| Ganancia máx | (K_call − S) + crédito | 21.87 ($2,187) |
| Pérdida máx | (S − K_put) − crédito | 18.13 ($1,813) |
| Breakeven | S − crédito (S + débito si es débito) | **498.13** |
| Griegas | Δ+ reducida (0.429), resto pequeño | — |

Las acciones se compran con `POST /api/v1/orders`; en `/strategies` solo van las opciones.

---

## 02.08 Spreads verticales

Escenario: SPY 500, 45 días, IV 20%. Mismo vencimiento, distinto strike, ancho 10.

| Spread | Piernas | Débito/crédito | Breakeven | Ganancia máx | Pérdida máx | Δ |
|---|---|---|---|---|---|---|
| Bull Call | +C500 −C510 | débito 4.55 | K_baja + débito = **504.55** | ancho − débito = 5.45 | débito 4.55 | + |
| Bear Put | +P500 −P490 | débito 4.28 | K_alta − débito = **495.72** | ancho − débito = 5.72 | débito 4.28 | − |
| Bull Put | −P490 +P480 | crédito 3.18 | K_alta − crédito = **486.82** | crédito 3.18 | ancho − crédito = 6.82 | + |
| Bear Call | −C510 +C520 | crédito 3.49 | K_baja + crédito = **513.49** | crédito 3.49 | ancho − crédito = 6.51 | − |

(× 100 por contrato.) Regla: ganancia máx + pérdida máx = ancho. Los de crédito son Θ+ / Vega−.
Reg T del motor en un vertical = su pérdida máxima.

---

## 02.09 Gestión de riesgo en el motor

`GET /api/v1/strategies/{id}/risk` toma spot, mid e IV de Alpaca y corre el motor Rust/WASM:

- **Monte Carlo** (`risk::monte_carlo`): GBM neutral al riesgo
  `S_H = S·exp((r − q − σ²/2)H + σ√H·Z)` con **antitéticas** (Z y −Z), σ = IV promedio, H = primer
  vencimiento. Regresa media, desviación, VaR 95/99, CVaR 95, prob. de ganancia, histograma.
- **Matriz P&L** (`risk::pnl_matrix`): choques de precio ±10% × choques de vol ±10 pts.
- **Reg T** (`risk::reg_t`): larga = prima; corta cubierta en vertical = ancho − prima; descubierta =
  prima + max(20%·S − OTM, 10%·S o K).
- **SPAN** (`risk::span`): 16 escenarios (precio en 0, ±1/3, ±2/3, ±1 × 15%, vol ±4 pts, más ±2× al
  35%), margen = max(peor pérdida, $25 × contratos cortos).

---

## 02.10 Cómo se manda una estrategia (API F0)

`POST /api/v1/strategies`: `name` y `underlying` obligatorios; `qty` > 0; `order_type`
`market`/`limit` (con `limit` es obligatorio `limit_price`); `legs` de **1 a 4** con `symbol` OCC
válido del mismo subyacente, `side` `buy`/`sell`, `ratio_qty`, `position_intent` opcional.

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

Después: `GET /strategies/{id}` (`netPerUnit` > 0 débito, < 0 crédito), `GET /strategies/{id}/risk`,
`POST /strategies/{id}/submit` (orden `mleg`, `time_in_force: day`).

---

Detalle completo, payoffs ASCII, JSON de las 17 estrategias, recorrido del código Rust (Kevin y
Alfredo) y 30 preguntas de práctica: [ESTUDIO-ESTRATEGIAS.md](../ESTUDIO-ESTRATEGIAS.md).
