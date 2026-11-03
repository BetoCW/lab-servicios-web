// Uso: node src/microservices/start.js <watchlists|orders|option-chains|strategies|gateway|all>
// "all" (npm run dev) levanta los 4 microservicios y el gateway como procesos separados.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, missingConfig } from '../config.js';
import { SERVICES, gatewayApp, serviceApp } from './index.js';

const name = process.argv[2] ?? 'all';

if (name === 'all') {
  for (const n of [...Object.keys(SERVICES), 'gateway']) fork(fileURLToPath(import.meta.url), [n]);
} else if (name === 'gateway') {
  gatewayApp().listen(config.port, config.host, () => {
    console.log(`[gateway] http://${config.host}:${config.port}  (REST ${config.apiUrl} · /graphql · /api-docs · /app · /health · /metrics)`);
    const missing = missingConfig();
    if (missing.length) console.warn(`  Falta configurar en .env: ${missing.join(', ')}`);
  });
} else if (SERVICES[name]) {
  const { port, paths } = SERVICES[name];
  serviceApp(name).listen(port, config.host, () => console.log(`[${name}] http://${config.host}:${port}  (${paths.map((p) => config.apiUrl + '/' + p).join(', ')})`));
} else {
  console.error(`Servicio desconocido: ${name}. Usa: ${Object.keys(SERVICES).join(', ')}, gateway o all`);
  process.exitCode = 1;
}
