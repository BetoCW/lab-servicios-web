const Institutos = require('../models/Institutos');

// ---------------------------------------------------------------------------
// SERVICIO (logica de negocio / base de datos).
// Unica capa que habla con MongoDB. Los manejadores de eventos de CAP
// (el "controlador") solo la invocan.
// ---------------------------------------------------------------------------

const FIELDS = [
  'IdInstitutoBK',
  'DesInstituto',
  'Alias',
  'Matriz',
  'Giro',
  'IdInstitutoSupOK',
  'informacion_adicional',
];

// OData envia la entidad completa en un PUT y rellena con null lo que el
// cliente omitio. Esos null se descartan para que el PUT actualice solo lo
// que realmente viene en el body.
const pick = (source = {}, fields = FIELDS) =>
  Object.fromEntries(
    fields
      .filter((f) => source[f] !== undefined && source[f] !== null)
      .map((f) => [f, source[f]]),
  );

// Un instituto no puede ser su propio superior ni apuntar a uno inexistente
const assertSuperior = async (id, supId) => {
  if (!supId) return;
  if (supId === id) {
    const error = new Error('Un instituto no puede ser su propio instituto superior.');
    error.code = 400;
    throw error;
  }
  if (!(await Institutos.exists({ IdInstitutoOK: supId }))) {
    const error = new Error(`IdInstitutoSupOK '${supId}' no existe.`);
    error.code = 400;
    throw error;
  }
};

// --- GET: lista completa (aplica filtro, proyeccion, orden y paginacion) ---
const getInstitutosList = async (
  filter = {},
  { projection = null, sort = { IdInstitutoOK: 1 }, skip = 0, limit = 0 } = {},
) => {
  const query = Institutos.find(filter, projection).sort(sort).skip(skip);
  if (limit) query.limit(limit);
  return query.lean();
};

// --- GET: un instituto por su llave de negocio -----------------------------
const getInstitutoItem = async (id) =>
  Institutos.findOne({ IdInstitutoOK: id }).lean();

// --- POST: alta ------------------------------------------------------------
const postInstitutoItem = async (data = {}, actor = 'system') => {
  const { IdInstitutoOK } = data;
  if (!IdInstitutoOK) {
    const error = new Error('IdInstitutoOK es obligatorio.');
    error.code = 400;
    throw error;
  }
  if (await Institutos.exists({ IdInstitutoOK })) {
    const error = new Error(`Ya existe un instituto con IdInstitutoOK '${IdInstitutoOK}'.`);
    error.code = 409;
    throw error;
  }
  await assertSuperior(IdInstitutoOK, data.IdInstitutoSupOK);

  const created = await Institutos.create({
    IdInstitutoOK,
    ...pick(data),
    detail_row: { UsuarioReg: actor, UsuarioMod: actor },
  });
  return created.toObject();
};

// --- PUT: actualizacion ----------------------------------------------------
const putInstitutoItem = async (id, data = {}, actor = 'system') => {
  // Si el instituto no existe se devuelve null para que el controlador
  // responda 404 en lugar de intentar validar el documento.
  if (!(await Institutos.exists({ IdInstitutoOK: id }))) return null;

  if (data.IdInstitutoSupOK) await assertSuperior(id, data.IdInstitutoSupOK);

  return Institutos.findOneAndUpdate(
    { IdInstitutoOK: id },
    {
      $set: {
        ...pick(data),
        'detail_row.FechaUltMod': new Date(),
        'detail_row.UsuarioMod': actor,
      },
    },
    { new: true, runValidators: true },
  ).lean();
};

// --- DELETE: baja fisica ---------------------------------------------------
const deleteInstitutoItem = async (id) =>
  Institutos.findOneAndDelete({ IdInstitutoOK: id }).lean();

// --- DELETE: baja logica (accion bajaLogica) -------------------------------
const bajaLogicaInstituto = async (id, actor = 'system') =>
  Institutos.findOneAndUpdate(
    { IdInstitutoOK: id },
    {
      $set: {
        'detail_row.Activo': 'N',
        'detail_row.Borrado': 'S',
        'detail_row.FechaUltMod': new Date(),
        'detail_row.UsuarioMod': actor,
      },
    },
    { new: true },
  ).lean();

const countInstitutos = async (filter = {}) => Institutos.countDocuments(filter);

module.exports = {
  getInstitutosList,
  getInstitutoItem,
  postInstitutoItem,
  putInstitutoItem,
  deleteInstitutoItem,
  bajaLogicaInstituto,
  countInstitutos,
};
