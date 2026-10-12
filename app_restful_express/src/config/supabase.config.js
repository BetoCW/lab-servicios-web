import pg from 'pg';
import config from './config';

// Supabase es PostgreSQL administrado: la conexion se hace con el driver pg
// usando la cadena de conexion del proyecto. Las consultas recursivas (CTE)
// que arman el arbol de valores solo se pueden ejecutar por SQL directo.
let pool = null;

export const connectSupabase = async () => {
  if (!config.SUPABASE_DB_URL) {
    console.warn('Supabase no configurado (SUPABASE_DB_URL): solo estara disponible MongoDB.');
    return null;
  }

  pool = new pg.Pool({
    connectionString: config.SUPABASE_DB_URL,
    ssl: config.SUPABASE_DB_SSL ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  const { rows } = await pool.query('SELECT current_database() AS db');
  console.log('Supabase (PostgreSQL) is connected to:', rows[0].db);
  return pool;
};

// Devuelve el pool o falla con un error claro si nadie configuro Supabase
export const getPool = () => {
  if (!pool) {
    const error = new Error('Supabase no esta configurado en el servidor.');
    error.code = 'SUPABASE_OFF';
    throw error;
  }
  return pool;
};

// Ejecuta varias sentencias dentro de una transaccion (todo o nada)
export const withTransaction = async (work) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const isSupabaseOn = () => pool !== null;

export const disconnectSupabase = () => (pool ? pool.end() : null);
