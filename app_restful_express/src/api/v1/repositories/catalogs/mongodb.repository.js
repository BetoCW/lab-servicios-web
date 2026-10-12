import Catalogs from '../../models/mongodb/Catalogs';

// ---------------------------------------------------------------------------
// REPOSITORIO MongoDB: unico lugar que habla con la coleccion catalogs.
// Devuelve siempre el contrato canonico (camelCase, _id -> id). El documento
// ya trae values[] embebido, asi que no hace falta ningun $lookup.
// ---------------------------------------------------------------------------

const toContract = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
};

const buildFilter = ({ collection, section, active, includeDeleted } = {}) => {
  const filter = {};
  if (!includeDeleted) filter.deletedAt = null;
  if (collection) filter.collection = collection;
  if (section) filter.section = section;
  if (active !== undefined) filter.active = active;
  return filter;
};

export const list = async (options) => {
  const docs = await Catalogs.find(buildFilter(options)).sort({ sequence: 1, key: 1 }).lean();
  return docs.map(toContract);
};

export const findByKey = async (key) => toContract(await Catalogs.findOne({ key }).lean());

export const insertCatalog = async ({ id, values = [], ...catalog }) => {
  const doc = await Catalogs.create({ _id: id, ...catalog, values });
  return toContract(doc.toObject());
};

export const updateCatalog = async (id, fields) => {
  const doc = await Catalogs.findByIdAndUpdate(
    id,
    { $set: fields },
    { new: true, runValidators: true },
  ).lean();
  return toContract(doc);
};

export const deleteCatalog = async (id) => {
  const { deletedCount } = await Catalogs.deleteOne({ _id: id });
  return deletedCount;
};

// --- Subdocumento values[] ------------------------------------------------

export const insertValues = async (catalogId, values) => {
  await Catalogs.updateOne(
    { _id: catalogId },
    { $push: { values: { $each: values } } },
    { runValidators: true },
  );
};

// changes: [{ id, fields }] -> un $set posicional por valor, en un solo viaje
export const updateValues = async (catalogId, changes) => {
  if (changes.length === 0) return;
  await Catalogs.bulkWrite(
    changes.map(({ id, fields }) => ({
      updateOne: {
        filter: { _id: catalogId, 'values.id': id },
        update: {
          $set: Object.fromEntries(
            Object.entries(fields).map(([prop, value]) => [`values.$.${prop}`, value]),
          ),
        },
      },
    })),
  );
};

export const deleteValues = async (catalogId, ids) => {
  await Catalogs.updateOne({ _id: catalogId }, { $pull: { values: { id: { $in: ids } } } });
};
