import boom from '@hapi/boom';
import * as mongodb from './mongodb.repository';
import * as supabase from './supabase.repository';
import { isSupabaseOn } from '../../../../config/supabase.config';

// Elige el repositorio segun la base de datos seleccionada al iniciar sesion.
// Ambos exponen las mismas funciones, asi que el servicio no sabe (ni le
// importa) si los datos viven en MongoDB o en Supabase.
const repositories = { mongodb, supabase };

export const getCatalogsRepository = (dbServer) => {
  const repository = repositories[dbServer];
  if (!repository) throw boom.badRequest(`Base de datos '${dbServer}' no soportada.`);
  if (dbServer === 'supabase' && !isSupabaseOn()) {
    throw boom.serverUnavailable('Supabase no esta configurado en el servidor.');
  }
  return repository;
};

export default getCatalogsRepository;
