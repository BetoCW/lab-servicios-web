# Una sola imagen para los 4 microservicios y el gateway; el comando elige cuál corre.
# Se construye desde quant-core-engine/ (docker compose) porque depende de packages/ y web/.
FROM node:22-alpine
WORKDIR /app
COPY packages/quant-engine packages/quant-engine
COPY web web
COPY api/package.json api/package-lock.json api/
RUN cd api && npm ci --omit=dev
COPY api/src api/src
WORKDIR /app/api
ENV HOST=0.0.0.0
CMD ["node", "src/microservices/start.js", "gateway"]
