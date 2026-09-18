const { connectDB, disconnectDB } = require('../srv/config/database.config');
const Institutos = require('../srv/models/Institutos');
const institutos = require('../seed/institutos.json');

// Carga los datos de prueba del Catalogo de Institutos en MongoDB.
// Es el mismo juego de datos que usa app_restful_express.
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
