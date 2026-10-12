import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller';
import { requireSession } from '../middlewares/session.handler';

const router = Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Sesion]
 *     summary: Inicia sesion y elige la base de datos (mongodb | supabase)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginInput' }
 *     responses:
 *       200:
 *         description: Token de sesion con la base de datos seleccionada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Sesion' }
 *       400: { $ref: '#/components/responses/SolicitudInvalida' }
 */
router.post('/login', AuthController.login);

/**
 * @openapi
 * /auth/session:
 *   get:
 *     tags: [Sesion]
 *     summary: Devuelve el usuario y la base de datos de la sesion actual
 *     responses:
 *       200: { description: Sesion vigente }
 *       401: { $ref: '#/components/responses/NoAutorizado' }
 */
router.get('/session', requireSession, AuthController.getSession);

export default router;
