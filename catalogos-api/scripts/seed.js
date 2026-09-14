// Carga los catálogos de prueba de seed/catalogs.json en la base configurada en .env
// Uso:  npm run seed            -> inserta solo los catálogos que no existan
//       npm run seed -- --force -> reemplaza los catálogos del seed si ya existen
import { v4 as uuidv4 } from 'uuid';
import catalogs from '../seed/catalogs.json';
import Catalog from '../src/api/v1/models/Catalog';
import { connectDB, disconnectDB } from '../src/config/database.config';

const ACTOR = 'SEED';
const force = process.argv.includes('--force');

// En el JSON los valores se relacionan con "ref"/"parentRef" (legibles);
// aquí se convierten en los uuid reales de id/parentId.
const resolveValues = (values) => {
  const ids = Object.fromEntries(values.map((v) => [v.ref, uuidv4()]));
  const sequences = {};

  return values.map(({ ref, parentRef, ...value }) => {
    const parentId = parentRef ? ids[parentRef] : null;
    if (parentRef && !parentId) throw new Error(`parentRef '${parentRef}' no existe`);

    const scope = parentId || 'root';
    sequences[scope] = (sequences[scope] || 0) + 1;

    return { ...value, id: ids[ref], parentId, sequence: sequences[scope], createdBy: ACTOR, updatedBy: ACTOR };
  });
};

const run = async () => {
  await connectDB();
  await Catalog.syncIndexes();

  for (const { values = [], ...catalog } of catalogs) {
    const exists = await Catalog.exists({ key: catalog.key });
    if (exists && !force) {
      console.log(`- ${catalog.key}: ya existe (usa --force para reemplazarlo)`);
      continue;
    }

    const doc = { ...catalog, values: resolveValues(values), deletedAt: null, active: true, createdBy: ACTOR, updatedBy: ACTOR };
    if (exists) await Catalog.deleteOne({ key: catalog.key });
    await Catalog.create(doc);
    console.log(`+ ${catalog.key}: ${values.length} valores`);
  }
};

run()
  .catch((error) => {
    console.error('Error en el seed:', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
