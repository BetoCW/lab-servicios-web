const cds = require('@sap/cds');
const openapi = require('@cap-js/openapi');
const swaggerUI = require('swagger-ui-express');
const config = require('../config/config');

// ---------------------------------------------------------------------------
// DOCUMENTACION: SAP CDS genera la especificacion OpenAPI a partir del modelo
// CDS, sin escribir anotaciones a mano como en Express. Aqui solo se compila
// el CSN ya cargado y se monta Swagger UI con la misma libreria que usa
// app_restful_express, para que las dos documentaciones se vean igual.
// ---------------------------------------------------------------------------

// Un documento OpenAPI por protocolo expuesto (odata y rest)
const buildSpecs = () => {
  const specs = {};

  for (const [doc, meta] of openapi.compile(cds.model, { service: 'all' })) {
    // meta.file llega como 'InstitutosService.odata' / 'InstitutosService.rest'
    const [service, protocol = 'odata'] = String(meta.file).split('.');

    doc.info = {
      ...doc.info,
      title: `app_restful_sap_cds - Catalogo de Institutos (${protocol.toUpperCase()})`,
      version: '1.0.0',
      description:
        'API RESTful del proceso DEMO (Catalogo de Institutos) construida con SAP CDS/NodeJS, ' +
        'arquitectura de microservicios y MongoDB. T1-Actividad 3 - Laboratorio de Servicios Web, ' +
        'Instituto Tecnologico de Tepic, Equipo 4.',
    };
    doc.servers = [
      {
        url:
          protocol === 'rest'
            ? `http://${config.HOST}:${config.PORT}/rest${config.API_URL}`
            : `http://${config.HOST}:${config.PORT}${config.API_URL}`,
        description: `Servidor local de desarrollo (${protocol})`,
      },
    ];

    specs[protocol] = { service, doc };
  }

  return specs;
};

/**
 * Monta la documentacion:
 *   /api-docs              indice con los dos protocolos
 *   /api-docs/odata        Swagger UI de OData V4
 *   /api-docs/rest         Swagger UI de REST plano
 *   /api-docs/odata.json   especificacion OpenAPI cruda
 *   /api-docs/rest.json    especificacion OpenAPI cruda
 */
const swaggerDocs = (app) => {
  const specs = buildSpecs();

  // Los JSON se registran primero: si se montaran despues de la UI, el
  // middleware de Swagger atraparia la ruta y devolveria HTML.
  for (const [protocol, { doc }] of Object.entries(specs)) {
    app.get(`/api-docs/${protocol}.json`, (req, res) => res.json(doc));
  }

  // Indice: una sola pagina con el enlace a cada protocolo
  app.get('/api-docs', (req, res) => {
    const links = Object.keys(specs)
      .map(
        (p) =>
          `<li><a href="/api-docs/${p}">${p.toUpperCase()}</a> ` +
          `&middot; <a href="/api-docs/${p}.json">openapi.json</a></li>`,
      )
      .join('');
    res.send(
      `<h1>app_restful_sap_cds - Documentacion</h1>
       <p>Catalogo de Institutos expuesto en dos protocolos:</p>
       <ul>${links}</ul>`,
    );
  });

  for (const [protocol, { doc }] of Object.entries(specs)) {
    const base = `/api-docs/${protocol}`;

    app.use(
      base,
      swaggerUI.serveFiles(doc, {}),
      swaggerUI.setup(doc, {
        explorer: true,
        customSiteTitle: `app_restful_sap_cds - ${protocol.toUpperCase()}`,
      }),
    );

    console.log(`Swagger (${protocol}): http://${config.HOST}:${config.PORT}${base}`);
  }
};

module.exports = { swaggerDocs, buildSpecs };
