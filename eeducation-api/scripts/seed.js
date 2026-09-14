// Carga los institutos y productos/servicios de prueba en la base configurada en .env
// Uso:  npm run seed            -> inserta solo los que no existan
//       npm run seed -- --force -> reemplaza los documentos del seed si ya existen
import institutos from '../seed/institutos.json';
import prodServ from '../seed/prodserv.json';
import Institutos from '../src/api/v1/models/Institutos';
import ProdServ from '../src/api/v1/models/ProdServ';
import { newDetailRow } from '../src/utils/detailRow';
import { connectDB, disconnectDB } from '../src/config/database.config';

const ACTOR = 'SEED';
const force = process.argv.includes('--force');

// En el JSON "estatus" es solo la lista de códigos en orden; el último queda como Actual
const toProdServDoc = ({ estatus = ['PS_ACTIVO'], ...ps }) => ({
  ...ps,
  cat_prod_serv_estatus: estatus.map((code, i) => ({
    IdTipoEstatusOK: code,
    Actual: i === estatus.length - 1 ? 'S' : 'N',
    detail_row: newDetailRow(ACTOR),
  })),
  cat_prod_serv_info_ad: (ps.cat_prod_serv_info_ad || []).map((info, i) => ({
    ...info,
    Secuencia: i + 1,
    detail_row: newDetailRow(ACTOR),
  })),
  cat_prod_serv_presenta: (ps.cat_prod_serv_presenta || []).map((p) => ({
    ...p,
    cat_prod_serv_archivos: (p.cat_prod_serv_archivos || []).map((a, i) => ({
      ...a,
      Secuencia: i + 1,
      detail_row: newDetailRow(ACTOR),
    })),
    detail_row: newDetailRow(ACTOR),
  })),
  detail_row: newDetailRow(ACTOR),
});

const load = async (Model, idField, docs) => {
  for (const doc of docs) {
    const id = doc[idField];
    const exists = await Model.exists({ [idField]: id });
    if (exists && !force) {
      console.log(`- ${Model.modelName} ${id}: ya existe (usa --force para reemplazarlo)`);
      continue;
    }
    if (exists) await Model.deleteOne({ [idField]: id });
    await Model.create(doc);
    console.log(`+ ${Model.modelName} ${id}`);
  }
};

const run = async () => {
  await connectDB();
  await Promise.all([Institutos.syncIndexes(), ProdServ.syncIndexes()]);

  await load(Institutos, 'IdInstitutoOK', institutos.map((i) => ({ ...i, detail_row: newDetailRow(ACTOR) })));
  await load(ProdServ, 'IdProdServOK', prodServ.map(toProdServDoc));
};

run()
  .catch((error) => {
    console.error('Error en el seed:', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
