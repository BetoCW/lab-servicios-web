import boom from '@hapi/boom';
import { verify } from '../services/auth.service';

// Lee el token "Authorization: Bearer <token>" y deja la sesion en req.session.
// Sin sesion no se sabe contra que base de datos operar, por eso es obligatoria.
export const requireSession = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(boom.unauthorized('Falta el token. Inicia sesion en POST /auth/login.'));
  }
  try {
    req.session = verify(token);
    // Encabezado informativo: en que base de datos se resolvio la peticion
    res.setHeader('X-Db-Server', req.session.dbServer);
    return next();
  } catch (error) {
    return next(error);
  }
};

export default requireSession;
