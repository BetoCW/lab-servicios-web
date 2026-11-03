# Guía de estudio · Examen Tema 3: Desarrollo de microservicios

> Laboratorio de Servicios Web, ITTepic · Equipo F0 (Quant Core Engine & Market Data).
> Formato del examen: **10 de relación, 5 de opción múltiple, 5 de verdadero/falso y 5 ejercicios
> prácticos**. La sección 07 es un simulacro con ese formato y sus respuestas.
> Los ejemplos salen de este proyecto: `api/src/microservices/`, `pruebas/`, `pruebas/carga/k6.js`,
> `docker-compose.yml`, `monitoring/`.

---

## 01 Tema 3.1 Tecnologías y ventajas de los microservicios

### 01.1 Definición
Arquitectura donde una aplicación se divide en **servicios pequeños, independientes y
desplegables por separado**, cada uno dueño de una capacidad de negocio y de sus datos, que se
comunican por la red (HTTP, gRPC, mensajes).

### 01.2 Monolito vs. microservicios
| Aspecto | Monolito | Microservicios |
|---|---|---|
| Despliegue | Todo junto | Cada servicio por separado |
| Escalado | Toda la app | Solo el servicio con carga |
| Falla | Puede tumbar todo | Aislada en un servicio |
| Tecnología | Una | Puede variar por servicio (políglota) |
| Datos | Una base compartida | Idealmente una base por servicio |
| Complejidad | En el código | En la red, el despliegue y la observabilidad |

En F0: antes un monolito (las 4 APIs en un proceso en :3060); ahora `npm run dev` levanta 4 procesos + gateway.

### 01.3 Ventajas
Despliegue independiente, escalado selectivo (p. ej. solo `strategies`, que corre Monte Carlo),
aislamiento de fallas, equipos autónomos, libertad tecnológica, código más pequeño por servicio.

### 01.4 Desventajas
Latencia de red, transacciones distribuidas (consistencia eventual), más infraestructura,
depuración y monitoreo más difíciles, versionado de contratos entre servicios.

### 01.5 Tecnologías
| Categoría | Ejemplos |
|---|---|
| Frameworks | Node.js/Express (F0), Spring Boot, .NET, Go, FastAPI |
| Contenedores | **Docker** (imagen por servicio), Docker Compose (F0: `docker-compose.yml`) |
| Orquestación | Kubernetes, Docker Swarm, Nomad |
| Gateway | Kong, NGINX, AWS API Gateway, Express propio (F0: gateway :3060) |
| Mensajería | RabbitMQ, Apache Kafka, AWS SQS/SNS, Redis Streams |
| Service mesh | Istio, Linkerd |
| Observabilidad | Prometheus + Grafana (F0), ELK, Datadog, New Relic, Sentry |
| CI/CD | GitHub Actions (F0: `pages.yml`), GitLab CI, Jenkins |

---

## 02 Tema 3.2 Arquitecturas y modelado

### 02.1 Descomposición
- **Por capacidad de negocio**: un servicio por cosa que el negocio hace (F0: watchlists, orders,
  option-chains, strategies).
- **DDD (Domain-Driven Design)**: *bounded context* = frontera donde un modelo tiene un
  significado único; un microservicio ≈ un bounded context. *Ubiquitous language*, agregados,
  entidades, objetos de valor.
- **Strangler Fig**: migrar un monolito reemplazando rutas poco a poco detrás de un gateway (F0
  hizo esto: el gateway mantiene la misma URL y reenvía a los servicios).

### 02.2 Patrones
| Patrón | Qué resuelve |
|---|---|
| **API Gateway** | Una sola entrada: ruteo, auth, CORS, rate limiting, agregación |
| **BFF** (Backend for Frontend) | Un gateway por tipo de cliente (web, móvil) |
| **Database per service** | Cada servicio es dueño de sus datos; nadie más los toca |
| **Saga** | Transacción distribuida como serie de pasos locales con compensaciones |
| **CQRS** | Separar modelo de escritura y de lectura |
| **Event sourcing** | Guardar eventos en vez del estado final |
| **Circuit breaker** | Dejar de llamar a un servicio que falla y responder rápido |
| **Sidecar** | Proceso acompañante (proxy, logs) junto a cada servicio |

### 02.3 Caso F0
- Cada servicio es dueño de sus tablas (watchlists → `watchlists`; option-chains →
  `option_chains`, `option_quotes`; …) pero comparten **un proyecto Supabase**: es "esquema por
  servicio", no "base por servicio".
- Acoplamiento conocido: `strategies` importa `mirrorOrders` de `orders.service.js` y escribe la
  tabla `orders`. En un diseño estricto, strategies llamaría a orders por HTTP o publicaría un
  evento `OrderSubmitted`.
- El *Saga* aparece en pequeño: `strategies.create` inserta la estrategia y, si fallan las
  piernas, **compensa** borrándola.

---

## 03 Tema 3.3 REST y GraphQL

### 03.1 REST
- Recursos con URL (`/api/v1/strategies/{id}`), verbos HTTP, representaciones JSON, **sin
  estado** (cada petición trae todo lo necesario), cacheable, interfaz uniforme, HATEOAS (enlaces;
  nivel 3 de Richardson).
- **Idempotencia**: repetir la petición deja el mismo estado. GET, PUT, DELETE: sí. POST: no.
  PATCH: no garantizado.

| Verbo | F0 | Código |
|---|---|---|
| GET | `GET /option-chains/{id}` | 200 |
| POST | `POST /strategies` | 201 |
| PUT | `PUT /watchlists/{id}` (reemplaza todo) | 200 |
| PATCH | `PATCH /orders/{id}` (cambia campos; Alpaca crea orden nueva) | 200 |
| DELETE | `DELETE /option-chains/{id}` | 204 |
| — | `DELETE /orders` (cancelar todas, resultados mixtos) | 207 |

Códigos de error en F0: 400 validación, 404 no existe, 409 estado inválido (editar estrategia
enviada), 503 falta configuración o microservicio caído.

### 03.2 GraphQL
- **Un endpoint** (`/graphql`), **esquema tipado** (SDL), el cliente pide exactamente los campos.
- Operaciones: `query` (leer), `mutation` (escribir), `subscription` (tiempo real).
- Resuelve **over-fetching** (traer campos de más) y **under-fetching** (varias llamadas para
  armar una vista).
- Problema **N+1**: un resolver por elemento de una lista dispara N consultas; se resuelve con
  **DataLoader** (lotes + caché por petición).
- Errores: HTTP 200 con arreglo `errors` (F0 agrega `extensions.status` con el código HTTP).

### 03.3 Comparación
| | REST | GraphQL |
|---|---|---|
| Endpoints | Muchos | Uno |
| Forma de la respuesta | La define el servidor | La define el cliente |
| Caché HTTP | Natural (GET + URL) | Más difícil (POST) |
| Versionado | `/v1`, `/v2` | Evolución del esquema (`@deprecated`) |
| Documentación | OpenAPI/Swagger (F0: `/api-docs`) | Introspección (F0: GraphiQL) |

F0 tiene **paridad**: cada operación REST tiene su query/mutation, y ambas llaman al mismo servicio.

---

## 04 Tema 3.4 Comunicación entre servicios

### 04.1 Síncrona vs. asíncrona
| | Síncrona | Asíncrona |
|---|---|---|
| Ejemplos | HTTP/REST, gRPC, GraphQL | Colas y eventos: RabbitMQ, Kafka, SQS |
| El que llama | Espera la respuesta | Publica y sigue |
| Acoplamiento temporal | Alto (ambos deben estar arriba) | Bajo |
| Uso típico | Consultas, respuestas inmediatas | Procesos largos, notificaciones, integración |

F0: gateway → servicio es **síncrono** (`fetch` con `AbortSignal.timeout(30_000)`).
Candidato a asíncrono: `GET /strategies/{id}/risk` con 500,000 trayectorias, o refrescar cadenas
cada minuto.

### 04.2 Colas y mensajería
- **Cola (point-to-point)**: un mensaje lo consume **un** consumidor (trabajo repartido).
- **Pub/Sub (tópico)**: un evento lo reciben **todos** los suscriptores.
- **RabbitMQ**: broker de mensajes con exchanges y colas (AMQP); ack por mensaje.
- **Kafka**: log distribuido particionado; los consumidores leen por *offset*; retiene y permite
  re-leer.
- Garantías: *at-most-once*, *at-least-once* (requiere consumidores **idempotentes**),
  *exactly-once*. Mensajes que fallan van a una **dead-letter queue**.

### 04.3 API Gateway
Punto único de entrada: ruteo por prefijo, autenticación, CORS, rate limiting, agregación,
terminación TLS. En F0 (`gatewayApp` en `api/src/microservices/index.js`): reenvía por prefijo
(`/orders` y `/account` → orders), sirve `/graphql`, `/api-docs`, `/app`, `/health` agregado y
`/metrics`; si el servicio no responde, `503 El microservicio <x> no responde`.

### 04.4 Service discovery
Cómo un servicio encuentra la dirección de otro.
- **Client-side**: el cliente consulta un registro (Netflix **Eureka**, Consul) y elige instancia.
- **Server-side**: el cliente llama a un balanceador/DNS que resuelve (Kubernetes Services + DNS,
  AWS ELB).
- **Registro**: *self-registration* (el servicio se anuncia) o por terceros (el orquestador lo
  registra), con *health checks* para sacar instancias caídas.
- F0: discovery **estático**: el gateway lee `WATCHLISTS_URL`, `ORDERS_URL`, … y en Docker
  Compose el DNS interno resuelve `http://orders:3062`.

### 04.5 Resiliencia
Timeouts (F0: 30 s en el gateway, 3 s en el health), reintentos con *backoff* exponencial,
circuit breaker, bulkhead (aislar recursos), fallback.

---

## 05 Tema 3.5 Pruebas

### 05.1 Pirámide de pruebas
Muchas unitarias (rápidas) → menos de integración → pocas E2E (lentas, frágiles). En
microservicios se agregan las de **contrato** entre la integración y la E2E.

### 05.2 Tipos
| Tipo | Qué verifica | Herramientas | En F0 |
|---|---|---|---|
| **Unitaria** | Una función aislada, sin red | Jest, Mocha, `node:test`, JUnit | `pruebas/unitarias/api.test.js`: `parseOcc`, `check`, `assertUuid`, formato de métricas |
| **Integración** | Varias piezas juntas (HTTP real entre ellas) | Supertest, `node:test` + `fetch`, Testcontainers | `pruebas/integracion/gateway.test.js`: gateway reenvía, 503 si el servicio cae, health agregado |
| **Contrato** | Proveedor y consumidor coinciden en el contrato | **Pact** (consumer-driven), Spring Cloud Contract, validación OpenAPI | `pruebas/contrato/openapi.test.js`: rutas implementadas = rutas en OpenAPI; `/health` de cada servicio |
| **E2E** | Flujo completo como usuario | **Postman + Newman** (CLI), Cypress, Playwright | Colección `pruebas/colecciones/f0-collection.json` (importable en Postman) y `npm run smoke` |
| **Carga / rendimiento** | Tiempo de respuesta y errores bajo usuarios concurrentes | **JMeter**, **k6**, **Gatling**, Locust | `pruebas/carga/k6.js` (`npm run carga`) |
| **Seguridad** | Vulnerabilidades (OWASP Top 10) | **OWASP ZAP**, **Burp Suite**, `npm audit`, Snyk | `npm run seguridad` (npm audit + ZAP baseline sobre `/api-docs`) |
| **Smoke** | Que lo crítico arranque y responda tras un despliegue | Script corto, Newman | `npm run smoke`, `GET /health` |
| **Regresión** | Que lo que ya funcionaba siga funcionando tras un cambio | Re-ejecutar la suite en CI | `npm test` en cada cambio |

### 05.3 Pact (contrato dirigido por el consumidor)
1. El **consumidor** escribe una prueba contra un *mock* de Pact: "si pido `GET /orders/1`, espero
   `{ id, status }`". Se genera un **pact file** (JSON).
2. El pact se publica en un **Pact Broker**.
3. El **proveedor** ejecuta la *verificación*: reproduce las peticiones del pact contra su API real.
4. `can-i-deploy` dice si una versión es compatible antes de desplegar.

F0 usa validación contra OpenAPI (marcado `shortcut:` en `contrato/openapi.test.js`): migrar a Pact cuando
otro equipo consuma la API desde su propio repositorio.

### 05.4 Carga: JMeter vs. k6 vs. Gatling
| | JMeter | k6 | Gatling |
|---|---|---|---|
| Script | GUI / XML (`.jmx`) | JavaScript | DSL Scala/Java/Kotlin |
| Motor | Java (hilos) | Go | Scala/Akka (asíncrono) |
| Fuerte en | Protocolos variados, GUI | CI, umbrales como código | Reportes HTML, alto volumen |

Términos: **VUs** (usuarios virtuales), *ramp-up*, **throughput** (req/s), **percentil 95**
(p95: el 95 % respondió en menos de X), tasa de error. Tipos: carga, **estrés** (hasta romper),
**pico** (spike), **resistencia** (soak).

k6 de F0:
```js
export const options = {
  stages: [{ duration: '15s', target: 10 }, { duration: '30s', target: 25 }, { duration: '15s', target: 0 }],
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};
```

### 05.5 Seguridad
- **OWASP ZAP**: DAST open source; *baseline scan* pasivo (encabezados, cookies, info expuesta) y
  *active scan* (ataca: inyección, XSS).
- **Burp Suite**: proxy que intercepta y modifica peticiones; Repeater, Intruder, Scanner (Pro).
- OWASP API Top 10: autorización rota a nivel de objeto (BOLA), autenticación rota, consumo de
  recursos sin límite (→ rate limiting), exposición excesiva de datos.
- F0: las llaves de Alpaca y Supabase solo viven en el servidor (`.env`), las tablas tienen RLS y
  los ids se validan como UUID (`assertUuid`).

---

## 06 Tema 3.6 Monitoreo

### 06.1 Los tres pilares de la observabilidad
**Métricas** (números en el tiempo), **logs** (eventos con texto) y **trazas** (el recorrido de
una petición entre servicios).

### 06.2 Health checks y UptimeRobot
- **Liveness**: ¿el proceso vive? **Readiness**: ¿puede atender (tiene dependencias)?
- F0: cada servicio `GET /health` → `200 { status: "ok", service, uptimeSeconds }` o
  `503 degraded` si falta configuración; el gateway agrega los 4. Docker Compose usa
  `healthcheck` con `wget` a `/health`.
- **UptimeRobot**: servicio externo que consulta una URL cada pocos minutos y alerta (correo,
  Telegram, Slack) si falla o tarda.

### 06.3 APM: New Relic y Datadog
*Application Performance Monitoring*: agente en el proceso que mide transacciones, tiempos por
endpoint, consultas lentas, **trazas distribuidas** y errores. Datadog integra además
infraestructura y logs; New Relic tiene un plan gratuito por volumen de datos.

### 06.4 ELK
**Elasticsearch** (almacena e indexa), **Logstash** (recolecta y transforma; o **Beats**/Filebeat
como agentes ligeros) y **Kibana** (busca y grafica). Logs centralizados de todos los servicios,
idealmente en JSON con un *correlation id* por petición.

### 06.5 Sentry
Rastreo de **errores**: captura excepciones con *stack trace*, contexto (usuario, request,
release), agrupa repetidos y alerta. Complementa al APM (que mide rendimiento).

### 06.6 Prometheus + Grafana
- **Prometheus**: base de series de tiempo con modelo **pull**: cada N segundos *scrapea*
  `/metrics` de cada objetivo. Consultas con **PromQL**. Alertas con Alertmanager.
- Tipos de métrica: **counter** (solo sube), **gauge** (sube y baja), **histogram**, **summary**.
- **Grafana**: dashboards y alertas sobre Prometheus (y otras fuentes).
- F0: `monitoring/prometheus.yml` scrapea gateway y los 4 servicios cada 10 s; Grafana en :3000
  con el dashboard "F0 microservicios". Métricas: `http_requests_total` (counter con `service`,
  `method`, `route`, `status`), `http_request_duration_seconds` (summary), memoria y uptime.
  La ruta se registra como patrón (`/:id`) para no crear una serie por cada id (cardinalidad).

### 06.7 Monitoreo sintético
Scripts que **simulan a un usuario** (login, consulta, compra) desde ubicaciones externas en
intervalos fijos, aunque no haya tráfico real. Detecta caídas antes que los usuarios. Ejemplos:
Datadog Synthetics, New Relic Synthetics, Checkly; en pequeño, UptimeRobot con palabra clave.

### 06.8 Rate limiting
Limitar peticiones por cliente/IP/llave en una ventana. Algoritmos: ventana fija, ventana
deslizante, **token bucket**, leaky bucket. Respuesta: **`429 Too Many Requests`** con
`Retry-After`. Protege de abuso y de agotar cuotas de terceros (Alpaca también limita peticiones
por minuto). Va en el gateway (p. ej. `express-rate-limit`) o en el proveedor del gateway.

---

## 07 Simulacro del examen (con respuestas)

### 07.1 Relación de columnas (10)
Relaciona cada concepto con su descripción.

| # | Concepto | | Letra | Descripción |
|---|---|---|---|---|
| 1 | API Gateway | | A | Ejecuta colecciones de Postman desde la línea de comandos |
| 2 | Pact | | B | Base de series de tiempo que hace *scrape* de `/metrics` |
| 3 | Newman | | C | Punto único de entrada que enruta a cada microservicio |
| 4 | k6 | | D | Captura excepciones con stack trace y las agrupa |
| 5 | OWASP ZAP | | E | Prueba de contrato dirigida por el consumidor |
| 6 | Prometheus | | F | Prueba de carga con scripts en JavaScript y umbrales |
| 7 | Sentry | | G | Escáner de seguridad dinámico (DAST) de código abierto |
| 8 | Service discovery | | H | Elasticsearch + Logstash + Kibana |
| 9 | ELK | | I | Mecanismo para encontrar la dirección de otro servicio |
| 10 | Bounded context | | J | Frontera de DDD donde un modelo tiene significado único |

**Respuestas**: 1-C, 2-E, 3-A, 4-F, 5-G, 6-B, 7-D, 8-I, 9-H, 10-J.

### 07.2 Opción múltiple (5)
1. En F0, si el microservicio `orders` (:3062) está caído y llamas `GET /api/v1/orders` al gateway,
   responde:
   a) 404 · b) 500 · **c) 503** · d) 200 con lista vacía
2. ¿Qué método HTTP **no** es idempotente?
   a) GET · b) PUT · c) DELETE · **d) POST**
3. El problema N+1 de GraphQL se mitiga con:
   a) HATEOAS · **b) DataLoader** · c) Circuit breaker · d) Pub/Sub
4. Prometheus obtiene las métricas de los servicios mediante:
   **a) Pull (scrape de `/metrics`)** · b) Push a una cola · c) Logs en Kibana · d) Webhooks
5. Un umbral `p(95)<800` en k6 significa:
   a) El promedio es menor a 800 ms · **b) El 95 % de las peticiones tarda menos de 800 ms** ·
   c) Hay menos de 95 errores · d) 800 usuarios al 95 % de CPU

### 07.3 Verdadero / Falso (5)
1. En comunicación asíncrona el emisor debe esperar la respuesta del receptor. **F** (publica y
   sigue).
2. Una prueba de humo (smoke) verifica rápido que lo crítico funcione tras un despliegue. **V**
3. En F0 los 4 microservicios tienen cada uno su propia base de datos independiente. **F**
   (comparten un proyecto Supabase; cada uno es dueño de sus tablas).
4. Un counter de Prometheus puede bajar de valor. **F** (solo sube o se reinicia).
5. `429 Too Many Requests` es la respuesta típica de un rate limiter. **V**

### 07.4 Ejercicios prácticos (5)

**Ejercicio 1 — Health agregado.** El gateway de F0 consulta `/health` de los 4 servicios. Si
`strategies` no responde y los demás están `ok`, escribe el status y el body que regresa.

> **Respuesta**
> ```http
> HTTP/1.1 503 Service Unavailable
> { "status": "degraded", "service": "gateway",
>   "services": { "watchlists": "ok", "orders": "ok", "option-chains": "ok", "strategies": "down" } }
> ```
> Regla: `200 ok` solo si **todos** están `ok` (`checks.every(...)`).

**Ejercicio 2 — PromQL.** Con las métricas de F0, escribe consultas para: (a) peticiones por
segundo por servicio, (b) tasa de errores 5xx por servicio, (c) latencia promedio por ruta.

> **Respuesta**
> ```promql
> sum by (service) (rate(http_requests_total[5m]))
> sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
> sum by (service, route) (rate(http_request_duration_seconds_sum[5m]))
>   / sum by (service, route) (rate(http_request_duration_seconds_count[5m]))
> ```

**Ejercicio 3 — Prueba unitaria.** Escribe con `node:test` una prueba para `parseOcc` que
cubra un símbolo válido y uno inválido.

> **Respuesta**
> ```js
> import { test } from 'node:test';
> import assert from 'node:assert/strict';
> import { parseOcc } from '../src/lib/occ.js';
>
> test('parseOcc descompone y rechaza', () => {
>   assert.deepEqual(parseOcc('AAPL251219C00200000'),
>     { root: 'AAPL', expiration: '2025-12-19', type: 'call', strike: 200 });
>   assert.equal(parseOcc('AAPL-200-CALL'), null);
> });
> ```
> Se corre con `npm test` (`node --test` dentro de `pruebas/`).

**Ejercicio 4 — Prueba de carga.** Escribe un script k6 que suba a 50 VUs en 1 min, se mantenga
2 min y falle si más del 1 % de peticiones fallan o si p95 ≥ 500 ms, consultando
`GET /api/v1/strategies`. ¿Por qué no se debe incluir `POST /strategies/{id}/submit`?

> **Respuesta**
> ```js
> import http from 'k6/http';
> import { check, sleep } from 'k6';
> export const options = {
>   stages: [{ duration: '1m', target: 50 }, { duration: '2m', target: 50 }, { duration: '30s', target: 0 }],
>   thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] },
> };
> export default function () {
>   check(http.get('http://localhost:3060/api/v1/strategies'), { '200': (r) => r.status === 200 });
>   sleep(1);
> }
> ```
> `submit` envía órdenes reales a la cuenta paper de Alpaca (no es idempotente, cambia estado y
> consume el límite de peticiones del broker); la carga se hace sobre lecturas.

**Ejercicio 5 — REST vs. GraphQL.** Un core de indicadores necesita, de todas las cadenas de
`AAPL`, solo `symbol`, `strike`, `impliedVolatility` y `delta` de las puts. (a) ¿Cuántas
peticiones REST necesita si hay 3 cadenas? (b) Escribe la query GraphQL equivalente.

> **Respuesta**
> (a) 1 + 3 = **4**: `GET /api/v1/option-chains?underlying=AAPL` y luego
> `GET /api/v1/option-chains/{id}?type=put` por cada cadena (under-fetching), y cada una trae
> todos los campos (over-fetching).
> (b) **1** petición:
> ```graphql
> query {
>   optionChains(underlying: "AAPL") {
>     id
>     quotes(type: "put") { symbol strike impliedVolatility delta }
>   }
> }
> ```

---

## 08 Repaso rápido (tarjetas)
| Pregunta | Respuesta |
|---|---|
| ¿Qué código devuelve un POST que crea? | 201 |
| ¿Qué guarda un pact file? | Las interacciones esperadas por el consumidor |
| ¿Qué herramienta corre Postman en CI? | Newman |
| ¿Liveness vs readiness? | Vive el proceso / puede atender tráfico |
| ¿Qué evita la cardinalidad alta en métricas? | Etiquetar con el patrón de ruta, no la URL con ids |
| ¿Qué es un dead-letter queue? | Cola donde van los mensajes que no se pudieron procesar |
| ¿Saga orquestada vs coreografiada? | Un orquestador central manda vs. cada servicio reacciona a eventos |
| ¿Puertos de F0? | gateway 3060, watchlists 3061, orders 3062, option-chains 3063, strategies 3064, Prometheus 9090, Grafana 3000 |
