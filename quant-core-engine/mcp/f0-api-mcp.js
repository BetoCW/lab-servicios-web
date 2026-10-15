#!/usr/bin/env node
// Servidor MCP (stdio, sin dependencias) para que Claude Code pruebe las 4 APIs F0.
// Ejecuta las peticiones de la colección insomnia/f0-collection.json con el mismo
// environment y los mismos after-response scripts que usaría Insomnia, así que lo que
// Claude prueba es exactamente lo que se muestra en la colección.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import vm from 'node:vm';

const COLLECTION = new URL('../api/insomnia/f0-collection.json', import.meta.url);
const ORIGIN = process.env.F0_ORIGIN ?? 'http://localhost:3060';

function loadCollection() {
  const { resources } = JSON.parse(readFileSync(COLLECTION, 'utf8'));
  const folders = Object.fromEntries(resources.filter((r) => r._type === 'request_group').map((r) => [r._id, r.name]));
  const env = { ...resources.find((r) => r._type === 'environment').data };
  const requests = resources
    .filter((r) => r._type === 'request')
    .map((r) => ({ ...r, folder: folders[r.parentId], fullName: `${folders[r.parentId]} / ${r.name}` }));
  return { env, requests };
}

let { env, requests } = loadCollection();
env.base_url = `${ORIGIN}/api/v1`;
env.graphql_url = `${ORIGIN}/graphql`;

const render = (text) => String(text ?? '').replace(/\{\{\s*_\.(\w+)\s*\}\}/g, (_, k) => env[k] ?? '');

async function http(method, url, body, contentType = 'application/json') {
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': contentType === 'application/graphql' ? 'application/json' : contentType } : {},
    body: body || undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = undefined;
  }
  return { status: res.status, ms: Date.now() - started, json, text };
}

function runScript(script, response) {
  if (!script) return [];
  const changes = [];
  const insomnia = {
    response: { json: () => response.json, code: response.status },
    environment: {
      get: (k) => env[k],
      set: (k, v) => {
        env[k] = v;
        changes.push(`${k}=${v}`);
      },
    },
  };
  vm.runInNewContext(script, { insomnia }, { timeout: 1000 });
  return changes;
}

function findRequest(name) {
  const needle = name.toLowerCase();
  return (
    requests.find((r) => r.fullName.toLowerCase() === needle) ??
    requests.find((r) => r.fullName.toLowerCase().includes(needle))
  );
}

const summarize = (r, extra = {}) =>
  JSON.stringify({ status: r.status, ms: r.ms, ...extra, body: r.json ?? r.text.slice(0, 2000) }, null, 2);

// ---------------------------------------------------------------- herramientas
const tools = {
  f0_status: {
    description: 'Estado del servidor F0: si está arriba y qué variables del .env faltan (missingConfig).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => summarize(await http('GET', `${ORIGIN}/`)),
  },
  f0_list_requests: {
    description: 'Lista las peticiones de la colección (carpeta / nombre, método y URL) y el environment actual con los ids encadenados.',
    inputSchema: { type: 'object', properties: {} },
    run: async () =>
      JSON.stringify(
        { environment: env, requests: requests.map((r) => `${r.method.padEnd(6)} ${r.fullName}  ->  ${r.url}`) },
        null,
        2,
      ),
  },
  f0_run_request: {
    description:
      'Ejecuta una petición de la colección por nombre (coincidencia parcial, p. ej. "Watchlists / POST crear"). Aplica su after-response script, que guarda ids en el environment para las siguientes.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Carpeta / nombre de la petición' },
        body: { type: 'object', description: 'Opcional: reemplaza el body JSON de la colección' },
      },
      required: ['name'],
    },
    run: async ({ name, body }) => {
      const r = findRequest(name);
      if (!r) throw new Error(`No hay una petición que coincida con "${name}". Usa f0_list_requests.`);
      const payload = body ? JSON.stringify(body) : r.body?.text ? render(r.body.text) : undefined;
      const res = await http(r.method, render(r.url), payload, r.body?.mimeType);
      const envChanges = res.status < 400 ? runScript(r.afterResponseScript, res) : [];
      return `${r.method} ${render(r.url)}\n` + summarize(res, envChanges.length ? { envChanges } : {});
    },
  },
  f0_run_all: {
    description:
      'Ejecuta toda la colección en orden (cuenta, watchlists, option chains, strategies, orders, GraphQL) y regresa una tabla de resultados. Crea y borra recursos reales en Alpaca paper y Supabase.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const rows = [];
      for (const r of requests) {
        const payload = r.body?.text ? render(r.body.text) : undefined;
        try {
          const res = await http(r.method, render(r.url), payload, r.body?.mimeType);
          if (res.status < 400) runScript(r.afterResponseScript, res);
          const gqlError = res.json?.errors?.[0]?.message;
          const ok = res.status < 400 && !gqlError;
          rows.push(`${ok ? 'OK  ' : 'FAIL'} ${String(res.status).padEnd(4)} ${r.method.padEnd(6)} ${r.fullName}${ok ? '' : `  — ${gqlError ?? res.json?.message ?? ''}`}`);
        } catch (err) {
          rows.push(`FAIL ---  ${r.method.padEnd(6)} ${r.fullName}  — ${err.message}`);
        }
      }
      const failed = rows.filter((l) => l.startsWith('FAIL')).length;
      return `${rows.join('\n')}\n\n${rows.length - failed}/${rows.length} OK`;
    },
  },
  f0_call: {
    description: 'Llamada libre a la API REST F0: método + ruta relativa a /api/v1 + body opcional.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: 'p. ej. /watchlists o /orders?status=open' },
        body: { type: 'object' },
      },
      required: ['method', 'path'],
    },
    run: async ({ method, path, body }) => summarize(await http(method, `${ORIGIN}/api/v1${path}`, body ? JSON.stringify(body) : undefined)),
  },
  f0_graphql: {
    description: 'Ejecuta una query o mutation en /graphql.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, variables: { type: 'object' } },
      required: ['query'],
    },
    run: async ({ query, variables }) => summarize(await http('POST', `${ORIGIN}/graphql`, JSON.stringify({ query, variables }))),
  },
  f0_reload_collection: {
    description: 'Vuelve a leer insomnia/f0-collection.json (después de regenerarla) y reinicia el environment.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      ({ env, requests } = loadCollection());
      env.base_url = `${ORIGIN}/api/v1`;
      env.graphql_url = `${ORIGIN}/graphql`;
      return `${requests.length} peticiones cargadas`;
    },
  },
};

// ---------------------------------------------------------------- JSON-RPC sobre stdio
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notificaciones (notifications/initialized, etc.)
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'f0-api', version: '1.0.0' },
        },
      });
    case 'ping':
      return send({ id, result: {} });
    case 'tools/list':
      return send({
        id,
        result: { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) },
      });
    case 'tools/call': {
      const tool = tools[params?.name];
      if (!tool) return send({ id, error: { code: -32602, message: `Herramienta desconocida: ${params?.name}` } });
      try {
        const text = await tool.run(params.arguments ?? {});
        return send({ id, result: { content: [{ type: 'text', text }] } });
      } catch (err) {
        const hint = err.cause?.code === 'ECONNREFUSED' ? ` (¿está corriendo \`npm run dev\` en ${ORIGIN}?)` : '';
        return send({ id, result: { content: [{ type: 'text', text: `Error: ${err.message}${hint}` }], isError: true } });
      }
    }
    default:
      return send({ id, error: { code: -32601, message: `Método no soportado: ${method}` } });
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: 'JSON inválido' } });
  }
  handle(msg);
});
