import { connectDB, disconnectDB } from '../src/config/database.config';
import Institutos from '../src/api/v1/models/Institutos';
import institutos from '../seed/institutos.json';

// Carga los datos de prueba del Catalogo de Institutos.
// No borra lo que ya existe: si la llave ya esta, solo la actualiza.
const seed = async () => {
  await connectDB();
  await Institutos.syncIndexes();

  for (const item of institutos) {
    await Institutos.findOneAndUpdate(
      { IdInstitutoOK: item.IdInstitutoOK },
      { $set: { ...item, detail_row: { UsuarioReg: 'seed', UsuarioMod: 'seed' } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`+ Instituto ${item.IdInstitutoOK} - ${item.DesInstituto}`);
  }

  await disconnectDB();
};

seed().catch(async (error) => {
  console.error('Error al cargar los datos de prueba:', error.message);
  await disconnectDB();
  process.exit(1);
});
