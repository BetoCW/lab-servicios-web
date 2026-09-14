import boom from '@hapi/boom';
import config from '../config/config';

// Comunicación entre microservicios: eeducation-api le pregunta a catalogos-api si un código
// existe (ej. 'PS_ACTIVO' en prod_serv_status). Si CATALOGOS_API_URL no está configurada,
// la validación se omite para que este proyecto también funcione solo.
export const assertCatalogValue = async (catalogKey, code) => {
  if (!config.CATALOGOS_API_URL || !code) return;

  let response;
  try {
    response = await fetch(`${config.CATALOGOS_API_URL}/catalogs/${catalogKey}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw boom.serverUnavailable('No se pudo consultar el servicio de catálogos (catalogos-api).');
  }

  if (response.status === 404) {
    throw boom.badRequest(`El catálogo '${catalogKey}' no existe en catalogos-api.`);
  }
  if (!response.ok) {
    throw boom.badGateway(`catalogos-api respondió ${response.status} al consultar '${catalogKey}'.`);
  }

  const catalog = await response.json();
  const wanted = String(code).toUpperCase();
  if (!catalog.values.some((v) => v.code === wanted && v.active)) {
    throw boom.badRequest(`'${code}' no es un valor válido del catálogo '${catalogKey}'.`);
  }
};
