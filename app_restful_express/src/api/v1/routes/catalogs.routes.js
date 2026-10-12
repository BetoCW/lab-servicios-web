import { Router } from 'express';
import * as CatalogsController from '../controllers/catalogs.controller';
import { requireSession } from '../middlewares/session.handler';

const router = Router();

// Todas las rutas del catalogo necesitan sesion: el token dice en que base
// de datos (MongoDB o Supabase) se ejecuta cada operacion.
router.use(requireSession);

// Las rutas fijas (/many) van ANTES que las rutas con parametro (/:key),
// si no, Express interpretaria "many" como una key.

/**
 * @openapi
 * /catalogs:
 *   get:
 *     tags: [Catalogos]
 *     summary: Lista los catalogos con sus valores activos
 *     parameters:
 *       - { in: query, name: collection, schema: { type: string }, example: trading }
 *       - { in: query, name: section, schema: { type: string } }
 *       - { in: query, name: active, schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Arreglo de catalogos (contrato canonico)
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Catalog' } }
 *       401: { $ref: '#/components/responses/NoAutorizado' }
 *   post:
 *     tags: [Catalogos]
 *     summary: Crea un catalogo (puede traer sus valores iniciales)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CatalogInput' }
 *     responses:
 *       201:
 *         description: Catalogo creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Catalog' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *       409: { $ref: '#/components/responses/Conflicto' }
 */
router.get('/', CatalogsController.getCatalogs);
router.post('/', CatalogsController.postCatalog);

/**
 * @openapi
 * /catalogs/many:
 *   post:
 *     tags: [Catalogos]
 *     summary: Crea varios catalogos (arreglo de objetos)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: array, items: { $ref: '#/components/schemas/CatalogInput' } }
 *     responses:
 *       201: { $ref: '#/components/responses/Masiva' }
 *       207: { $ref: '#/components/responses/Masiva' }
 *   put:
 *     tags: [Catalogos]
 *     summary: Modifica varios catalogos ([{ key, ...campos }])
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: array, items: { $ref: '#/components/schemas/CatalogUpdateMany' } }
 *     responses:
 *       200: { $ref: '#/components/responses/Masiva' }
 *       207: { $ref: '#/components/responses/Masiva' }
 *   delete:
 *     tags: [Catalogos]
 *     summary: Elimina varios catalogos ({ keys })
 *     parameters:
 *       - $ref: '#/components/parameters/Hard'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { keys: { type: array, items: { type: string } } }
 *     responses:
 *       200: { $ref: '#/components/responses/Masiva' }
 */
router.post('/many', CatalogsController.postManyCatalogs);
router.put('/many', CatalogsController.putManyCatalogs);
router.delete('/many', CatalogsController.deleteManyCatalogs);

/**
 * @openapi
 * /catalogs/{key}:
 *   get:
 *     tags: [Catalogos]
 *     summary: Obtiene un catalogo por su key con su arreglo values
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - { in: query, name: includeDeleted, schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Catalogo
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Catalog' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   put:
 *     tags: [Catalogos]
 *     summary: Modifica los datos generales del catalogo (la key no cambia)
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CatalogUpdate' }
 *     responses:
 *       200: { description: Catalogo modificado }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   delete:
 *     tags: [Catalogos]
 *     summary: Baja logica del catalogo (fisica con hard=true)
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - $ref: '#/components/parameters/Hard'
 *     responses:
 *       200: { description: Catalogo eliminado }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 */
router.get('/:key', CatalogsController.getCatalog);
router.put('/:key', CatalogsController.putCatalog);
router.delete('/:key', CatalogsController.deleteCatalog);

/**
 * @openapi
 * /catalogs/{key}/tree:
 *   get:
 *     tags: [Valores]
 *     summary: Arbol de valores (maestro-detalle-detalle) con children anidados
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *     responses:
 *       200: { description: Catalogo con values en forma de arbol }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 */
router.get('/:key/tree', CatalogsController.getTree);

/**
 * @openapi
 * /catalogs/{key}/values:
 *   get:
 *     tags: [Valores]
 *     summary: Lista los valores del catalogo, filtrando por padre o por nivel
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - { in: query, name: parentId, schema: { type: string }, description: "uuid del padre o 'null' para nivel 1" }
 *       - { in: query, name: level, schema: { type: integer }, example: 2 }
 *     responses:
 *       200:
 *         description: Arreglo de valores con su nivel calculado
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/Value' } }
 *   post:
 *     tags: [Valores]
 *     summary: Agrega un valor al catalogo
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ValueInput' }
 *     responses:
 *       201:
 *         description: Valor creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Value' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *       409: { $ref: '#/components/responses/Conflicto' }
 */
router.get('/:key/values', CatalogsController.getValues);
router.post('/:key/values', CatalogsController.postValue);

/**
 * @openapi
 * /catalogs/{key}/values/many:
 *   post:
 *     tags: [Valores]
 *     summary: Agrega varios valores (todos o ninguno)
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: array, items: { $ref: '#/components/schemas/ValueInput' } }
 *     responses:
 *       201: { $ref: '#/components/responses/Masiva' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *   put:
 *     tags: [Valores]
 *     summary: Modifica varios valores ([{ id, ...campos }])
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: array, items: { $ref: '#/components/schemas/ValueUpdateMany' } }
 *     responses:
 *       200: { $ref: '#/components/responses/Masiva' }
 *   delete:
 *     tags: [Valores]
 *     summary: Elimina varios valores y sus descendientes ({ ids })
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - $ref: '#/components/parameters/Hard'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { ids: { type: array, items: { type: string, format: uuid } } }
 *     responses:
 *       200: { description: Valores eliminados }
 */
router.post('/:key/values/many', CatalogsController.postManyValues);
router.put('/:key/values/many', CatalogsController.putManyValues);
router.delete('/:key/values/many', CatalogsController.deleteManyValues);

/**
 * @openapi
 * /catalogs/{key}/values/{valueId}:
 *   get:
 *     tags: [Valores]
 *     summary: Obtiene un valor con su nivel y sus hijos directos
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - $ref: '#/components/parameters/ValueId'
 *     responses:
 *       200: { description: Valor }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   put:
 *     tags: [Valores]
 *     summary: Modifica un valor (code y parentId no cambian)
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - $ref: '#/components/parameters/ValueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ValueUpdate' }
 *     responses:
 *       200: { description: Valor modificado }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *       409: { $ref: '#/components/responses/Conflicto' }
 *   delete:
 *     tags: [Valores]
 *     summary: Elimina un valor y sus descendientes (logico; fisico con hard=true)
 *     parameters:
 *       - $ref: '#/components/parameters/Key'
 *       - $ref: '#/components/parameters/ValueId'
 *       - $ref: '#/components/parameters/Hard'
 *     responses:
 *       200: { description: Valor eliminado }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 */
router.get('/:key/values/:valueId', CatalogsController.getValue);
router.put('/:key/values/:valueId', CatalogsController.putValue);
router.delete('/:key/values/:valueId', CatalogsController.deleteValue);

export default router;
