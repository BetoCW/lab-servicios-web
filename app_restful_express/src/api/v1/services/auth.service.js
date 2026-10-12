import boom from '@hapi/boom';
import jwt from 'jsonwebtoken';
import config from '../../../config/config';
import { isSupabaseOn } from '../../../config/supabase.config';

// ---------------------------------------------------------------------------
// SERVICIO de sesion: al iniciar sesion el usuario elige con que base de datos
// va a trabajar (MongoDB o Supabase). La eleccion viaja firmada dentro del
// token, de modo que todas las APIs siguientes operan sobre esa base.
// La validacion de credenciales pertenece al submodulo de seguridad; aqui
// solo se identifica al usuario para la auditoria (createdBy / updatedBy).
// ---------------------------------------------------------------------------

const secret = () => {
  if (!config.JWT_SECRET) throw new Error('Falta JWT_SECRET en el archivo .env.');
  return config.JWT_SECRET;
};

export const login = ({ usuario, dbServer } = {}) => {
  if (!usuario || !/^[A-Za-z0-9_.-]{3,30}$/.test(usuario)) {
    throw boom.badRequest('usuario es obligatorio (3 a 30 caracteres, sin espacios).');
  }
  const db = String(dbServer || '').toLowerCase();
  if (!config.DB_SERVERS.includes(db)) {
    throw boom.badRequest(`dbServer debe ser uno de: ${config.DB_SERVERS.join(', ')}.`);
  }
  if (db === 'supabase' && !isSupabaseOn()) {
    throw boom.serverUnavailable('Supabase no esta configurado en el servidor.');
  }

  const session = { usuario: usuario.toUpperCase(), dbServer: db };
  const token = jwt.sign(session, secret(), { expiresIn: config.JWT_EXPIRES_IN });
  return { token, tokenType: 'Bearer', expiresIn: config.JWT_EXPIRES_IN, ...session };
};

export const verify = (token) => {
  try {
    const { usuario, dbServer, exp } = jwt.verify(token, secret());
    return { usuario, dbServer, expiresAt: new Date(exp * 1000) };
  } catch (error) {
    throw boom.unauthorized('Token invalido o expirado. Inicia sesion de nuevo.');
  }
};
