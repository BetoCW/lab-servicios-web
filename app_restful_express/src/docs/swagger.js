import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUI from 'swagger-ui-express';
import config from '../config/config';

// Definicion base de OpenAPI 3.0. Los endpoints se toman de los comentarios
// @openapi que viven junto a cada ruta (src/api/v1/routes/*.js).
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'app_restful_express - Catalogo de Institutos',
    version: '1.0.0',
    description:
      'API RESTful del proceso DEMO (Catalogo de Institutos) construida con Express/JavaScript, ' +
      'arquitectura de microservicios por capas (modelo, servicio, controlador, ruteo) y MongoDB. ' +
      'T1-Actividad 3 - Laboratorio de Servicios Web, Instituto Tecnologico de Tepic, Equipo 4.',
    contact: { name: 'Equipo 4 - ISC, ITTepic' },
    license: { name: 'MIT' },
  },
  servers: [
    {
      url: `http://${config.HOST}:${config.PORT}${config.API_URL}`,
      description: 'Servidor local de desarrollo',
    },
  ],
  tags: [
    { name: 'Institutos', description: 'Operaciones CRUD del Catalogo de Institutos' },
  ],
  components: {
    parameters: {
      IdInstituto: {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'Llave de negocio del instituto (IdInstitutoOK o IdInstitutoBK).',
        example: '1',
      },
      KeyType: {
        in: 'query',
        name: 'keyType',
        required: false,
        schema: { type: 'string', enum: ['OK', 'BK'], default: 'OK' },
        description: 'OK usa IdInstitutoOK; BK usa la clave externa IdInstitutoBK.',
      },
      XUser: {
        in: 'header',
        name: 'x-user',
        required: false,
        schema: { type: 'string' },
        description: 'Usuario que realiza el cambio; se guarda en detail_row.',
        example: 'KPEREZ',
      },
    },
    schemas: {
      DetailRow: {
        type: 'object',
        properties: {
          FechaReg: { type: 'string', format: 'date-time' },
          UsuarioReg: { type: 'string', example: 'KPEREZ' },
          FechaUltMod: { type: 'string', format: 'date-time' },
          UsuarioMod: { type: 'string', example: 'KPEREZ' },
          Activo: { type: 'string', enum: ['S', 'N'], example: 'S' },
          Borrado: { type: 'string', enum: ['S', 'N'], example: 'N' },
        },
      },
      InfoAdicional: {
        type: 'object',
        required: ['IdEtiqueta', 'Etiqueta'],
        properties: {
          IdEtiqueta: { type: 'string', example: 'IDRECTOR' },
          Etiqueta: { type: 'string', example: 'DIRECTOR' },
          Valor: { type: 'string', example: 'Dr. Juan Perez' },
          Secuencia: { type: 'integer', example: 10 },
          detail_row: { $ref: '#/components/schemas/DetailRow' },
        },
      },
      InstitutoInput: {
        type: 'object',
        required: ['IdInstitutoOK', 'IdInstitutoBK', 'DesInstituto'],
        properties: {
          IdInstitutoOK: { type: 'string', example: '1' },
          IdInstitutoBK: { type: 'string', example: '18DIT0002Z' },
          DesInstituto: { type: 'string', example: 'Instituto Tecnologico de Tepic' },
          Alias: { type: 'string', example: 'ITT' },
          Matriz: { type: 'string', enum: ['S', 'N'], example: 'S' },
          Giro: { type: 'string', example: 'EDUCACION' },
          IdInstitutoSupOK: { type: 'string', example: '' },
        },
      },
      Instituto: {
        allOf: [
          { $ref: '#/components/schemas/InstitutoInput' },
          {
            type: 'object',
            properties: {
              _id: { type: 'string', example: '66f0c1a9d2b4e81c4c9a1234' },
              informacion_adicional: {
                type: 'array',
                items: { $ref: '#/components/schemas/InfoAdicional' },
              },
              detail_row: { $ref: '#/components/schemas/DetailRow' },
            },
          },
        ],
      },
      RespuestaMasiva: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          data: {},
          success: { type: 'boolean' },
          fail: { type: 'boolean' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 404 },
          error: { type: 'string', example: 'Not Found' },
          message: { type: 'string', example: "No se encontro el instituto '9'." },
        },
      },
    },
    responses: {
      SolicitudInvalida: {
        description: 'Datos invalidos en la peticion',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
      NoEncontrado: {
        description: 'El recurso solicitado no existe',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
      Conflicto: {
        description: 'Llave de negocio duplicada',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/Error' } },
        },
      },
    },
  },
};

// glob necesita separadores '/' aunque se ejecute en Windows
const routesGlob = path
  .join(__dirname, '..', 'api', 'v1', 'routes', '*.js')
  .split(path.sep)
  .join('/');

export const swaggerSpec = swaggerJSDoc({ definition, apis: [routesGlob] });

// Monta Swagger UI en /api/v1/api-docs y el JSON crudo en /api/v1/api-docs.json
export const swaggerDocs = (app) => {
  const base = `${config.API_URL}/api-docs`;

  app.use(base, swaggerUI.serve, swaggerUI.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: 'app_restful_express - API Docs',
  }));

  app.get(`${base}.json`, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`Swagger UI en: http://${config.HOST}:${config.PORT}${base}`);
};

export default swaggerDocs;
