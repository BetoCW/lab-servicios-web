import { connectDB, disconnectDB } from '../src/config/database.config';
import { connectSupabase, disconnectSupabase } from '../src/config/supabase.config';
import Catalogs from '../src/api/v1/models/mongodb/Catalogs';
import * as CatalogsServices from '../src/api/v1/services/catalogs.service';
import { getCatalogsRepository } from '../src/api/v1/repositories/catalogs';
import catalogs from '../seed/catalogs.json';

// Carga el mismo juego de catalogos en MongoDB y en Supabase pasando por el
// servicio, asi los datos de prueba cumplen las mismas reglas que la API.
// Uso: npm run seed:catalogs            (las dos bases)
//      npm run seed:catalogs -- mongodb (solo una)
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['mongodb', 'supabase'];

const seed = async (dbServer) => {
  const ctx = { dbServer, usuario: 'SEED' };
  console.log(`\n[${dbServer}]`);
  for (const catalog of catalogs) {
    // Si ya existe (aunque tenga baja logica) se borra fisicamente y se vuelve a crear
    const repository = getCatalogsRepository(dbServer);
    const existing = await repository.findByKey(catalog.key);
    if (existing) await repository.deleteCatalog(existing.id);
    const created = await CatalogsServices.createCatalog(ctx, catalog);
    console.log(`+ ${created.key.padEnd(12)} ${String(created.values.length).padStart(2)} valores`);
  }
};

const run = async () => {
  await connectDB();
  await connectSupabase();
  await Catalogs.syncIndexes(); // crea los indices mon-1 ... mon-4
  for (const target of targets) await seed(target);
  await disconnectDB();
  await disconnectSupabase();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
