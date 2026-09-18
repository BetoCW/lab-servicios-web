import { Router } from 'express';
import * as InstitutosController from '../controllers/institutos.controller';

const router = Router();

/**
 * @openapi
 * /institutos:
 *   get:
 *     tags: [Institutos]
 *     summary: Lista completa del Catalogo de Institutos
 *     responses:
 *       200:
 *         description: Arreglo de institutos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Instituto' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   post:
 *     tags: [Institutos]
 *     summary: Da de alta un instituto
 *     parameters:
 *       - $ref: '#/components/parameters/XUser'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/InstitutoInput' }
 *     responses:
 *       201:
 *         description: Instituto creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Instituto' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *       409: { $ref: '#/components/responses/Conflicto' }
 */
router.get('/', InstitutosController.getInstitutosList);
router.post('/', InstitutosController.postInstitutosItem);

/**
 * @openapi
 * /institutos/manyInstitutos:
 *   post:
 *     tags: [Institutos]
 *     summary: Alta masiva enviando un arreglo JSON en el body
 *     parameters:
 *       - $ref: '#/components/parameters/XUser'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items: { $ref: '#/components/schemas/InstitutoInput' }
 *     responses:
 *       201:
 *         description: Institutos agregados
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaMasiva' }
 *       409:
 *         description: Alguno de los institutos ya existe
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaMasiva' }
 */
router.post('/manyInstitutos', InstitutosController.addManyInstitutos);

/**
 * @openapi
 * /institutos/{id}:
 *   get:
 *     tags: [Institutos]
 *     summary: Obtiene un instituto por su llave de negocio
 *     parameters:
 *       - $ref: '#/components/parameters/IdInstituto'
 *       - $ref: '#/components/parameters/KeyType'
 *     responses:
 *       200:
 *         description: Instituto encontrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Instituto' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   put:
 *     tags: [Institutos]
 *     summary: Actualiza un instituto existente
 *     parameters:
 *       - $ref: '#/components/parameters/IdInstituto'
 *       - $ref: '#/components/parameters/XUser'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/InstitutoInput' }
 *     responses:
 *       200:
 *         description: Instituto actualizado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Instituto' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 *   delete:
 *     tags: [Institutos]
 *     summary: Baja logica (por defecto) o fisica (?modo=fisico) de un instituto
 *     parameters:
 *       - $ref: '#/components/parameters/IdInstituto'
 *       - $ref: '#/components/parameters/KeyType'
 *       - $ref: '#/components/parameters/XUser'
 *       - in: query
 *         name: modo
 *         schema: { type: string, enum: [logico, fisico], default: logico }
 *         description: logico marca detail_row.Borrado = 'S'; fisico borra el documento.
 *     responses:
 *       200:
 *         description: Instituto eliminado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Instituto' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 */
router.get('/:id', InstitutosController.getInstitutoItem);
router.put('/:id', InstitutosController.putInstitutoItem);
router.delete('/:id', InstitutosController.deleteInstitutoItem);

/**
 * @openapi
 * /institutos/{id}/infoAdicional:
 *   put:
 *     tags: [Institutos]
 *     summary: Agrega o actualiza el arreglo informacion_adicional del instituto
 *     parameters:
 *       - $ref: '#/components/parameters/IdInstituto'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items: { $ref: '#/components/schemas/InfoAdicional' }
 *     responses:
 *       200:
 *         description: Informacion adicional sincronizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespuestaMasiva' }
 *       404: { $ref: '#/components/responses/NoEncontrado' }
 */
router.put('/:id/infoAdicional', InstitutosController.setArrInfoAdInstituto);

export default router;
