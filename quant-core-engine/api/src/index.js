import { app } from './app.js';
import { config, missingConfig } from './config.js';

app.listen(config.port, config.host, () => {
  const base = `http://${config.host}:${config.port}`;
  console.log(`Quant Core F0 API en ${base}`);
  console.log(`  REST     ${base}${config.apiUrl}`);
  console.log(`  GraphQL  ${base}/graphql`);
  console.log(`  Swagger  ${base}/api-docs`);
  console.log(`  Front    ${base}/app`);
  const missing = missingConfig();
  if (missing.length) console.warn(`  Falta configurar en .env: ${missing.join(', ')}`);
});
