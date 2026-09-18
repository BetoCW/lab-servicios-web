import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../src/docs/swagger';

// Genera docs/openapi.json para entregarlo o importarlo en Postman/SwaggerHub
const out = path.join(__dirname, '..', 'docs');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'openapi.json'), JSON.stringify(swaggerSpec, null, 2));
console.log('Especificacion OpenAPI escrita en docs/openapi.json');
