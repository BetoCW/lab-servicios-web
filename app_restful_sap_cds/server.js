const cds = require('@sap/cds');
const config = require('./srv/config/config');
const { swaggerDocs } = require('./srv/docs/swagger');

// server.js es el equivalente de index.js + app.js en Express: personaliza el
// arranque de CAP. El modelo ya esta cargado cuando se emite 'served', asi que
// la documentacion OpenAPI se genera en ese momento.
cds.on('served', () => {
  cds.app.get('/health', (req, res) =>
    res.json({ status: 'ok', service: 'app_restful_sap_cds' }),
  );
  swaggerDocs(cds.app);
});

cds.on('listening', ({ server }) => {
  const port = server.address().port;
  console.log(`Server is running on: http://${config.HOST}:${port}`);
  console.log(`OData V4:  http://${config.HOST}:${port}${config.API_URL}/Institutos`);
  console.log(`REST:      http://${config.HOST}:${port}/rest${config.API_URL}/Institutos`);
});

module.exports = cds.server;
