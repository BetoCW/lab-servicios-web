import boom from '@hapi/boom';
import Institutos from '../models/Institutos';
import { OK, FAIL } from '../middlewares/resp.handler';

// ---------------------------------------------------------------------------
// SERVICIO: logica de negocio y acceso a la base de datos.
// Es la unica capa que habla con Mongoose. Los controladores nunca lo hacen.
// ---------------------------------------------------------------------------

// Campos que el cliente puede capturar o modificar
const FIELDS = [
  'IdInstitutoBK',
  'DesInstituto',
  'Alias',
  'Matriz',
  'Giro',
  'IdInstitutoSupOK',
];

const pick = (source = {}, fields = FIELDS) =>
  Object.fromEntries(
    fields.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]),
  );

// Filtro por llave: ?keyType=OK (interna, por defecto) o ?keyType=BK (externa)
const keyFilter = (id, keyType = 'OK') =>
  keyType === 'BK' ? { IdInstitutoBK: id } : { IdInstitutoOK: id };

// Un instituto no puede ser su propio superior ni apuntar a uno inexistente
const assertSuperior = async (id, supId) => {
  if (!supId) return;
  if (supId === id) {
    throw boom.badRequest('Un instituto no puede ser su propio instituto superior.');
  }
  const existe = await Institutos.exists({ IdInstitutoOK: supId });
  if (!existe) throw boom.badRequest(`IdInstitutoSupOK '${supId}' no existe.`);
};

// --- GET: lista completa del catalogo ------------------------------------
export const getInstitutosList = async () => {
  try {
    return await Institutos.find().sort({ IdInstitutoOK: 1 });
  } catch (error) {
    throw boom.internal(error);
  }
};

// --- GET: un instituto por su llave --------------------------------------
export const getInstitutoItem = async (id, keyType = 'OK') => {
  try {
    return await Institutos.findOne(keyFilter(id, keyType));
  } catch (error) {
    throw boom.internal(error);
  }
};

// --- POST: alta de un instituto ------------------------------------------
export const postInstitutoItem = async (paInstitutoItem = {}, actor = 'system') => {
  try {
    const { IdInstitutoOK } = paInstitutoItem;
    if (!IdInstitutoOK) throw boom.badRequest('IdInstitutoOK es obligatorio.');

    if (await Institutos.exists({ IdInstitutoOK })) {
      throw boom.conflict(`Ya existe un instituto con IdInstitutoOK '${IdInstitutoOK}'.`);
    }
    await assertSuperior(IdInstitutoOK, paInstitutoItem.IdInstitutoSupOK);

    const newInstitutoItem = new Institutos({
      IdInstitutoOK,
      ...pick(paInstitutoItem),
      detail_row: { UsuarioReg: actor, UsuarioMod: actor },
    });
    return await newInstitutoItem.save();
  } catch (error) {
    throw boom.isBoom(error) ? error : error;
  }
};

// --- POST: alta masiva enviando un arreglo JSON en el body ----------------
export const addManyInstitutos = async (institutos = [], actor = 'system') => {
  try {
    if (!Array.isArray(institutos) || institutos.length === 0) {
      return FAIL('El body debe ser un arreglo con al menos un instituto.', null);
    }

    const docs = institutos.map((item) => ({
      IdInstitutoOK: item.IdInstitutoOK,
      ...pick(item),
      detail_row: { UsuarioReg: actor, UsuarioMod: actor },
    }));

    const institutosAdded = await Institutos.insertMany(docs, { ordered: true });
    return OK('Instituto(s) agregado(s) correctamente al catalogo.', institutosAdded);
  } catch (error) {
    if (error.code === 11000) {
      return FAIL(
        'Alguno(s) de los institutos enviados ya estan registrados en el catalogo. Verifica la informacion e intenta de nuevo.',
        error.keyValue,
      );
    }
    return FAIL('No se pudo agregar el instituto al catalogo. Error en el servidor.', null);
  }
};

// --- PUT: actualizacion de un instituto ----------------------------------
export const putInstitutoItem = async (id, paInstitutoItem = {}, actor = 'system') => {
  try {
    if (paInstitutoItem.IdInstitutoSupOK !== undefined) {
      await assertSuperior(id, paInstitutoItem.IdInstitutoSupOK);
    }

    return await Institutos.findOneAndUpdate(
      { IdInstitutoOK: id },
      {
        $set: {
          ...pick(paInstitutoItem),
          'detail_row.FechaUltMod': new Date(),
          'detail_row.UsuarioMod': actor,
        },
      },
      { new: true, runValidators: true },
    );
  } catch (error) {
    throw boom.isBoom(error) ? error : error;
  }
};

// --- PUT/POST sobre el subdocumento informacion_adicional -----------------
// Agrega un objeto nuevo al arreglo
export const pushObjInfoAdInstituto = async (id, objInfoAd) =>
  Institutos.findOneAndUpdate(
    { IdInstitutoOK: id },
    { $push: { informacion_adicional: objInfoAd } },
    { new: true },
  );

// Reemplaza el objeto que coincide con IdEtiqueta
export const setObjInfoAdInstituto = async (id, objInfoAd) =>
  Institutos.findOneAndUpdate(
    {
      IdInstitutoOK: id,
      informacion_adicional: { $elemMatch: { IdEtiqueta: objInfoAd.IdEtiqueta } },
    },
    { $set: { 'informacion_adicional.$': objInfoAd } },
    { new: true },
  );

// Recibe un arreglo y decide, por cada etiqueta, si agrega o actualiza
export const getPushSetArrInfoAdInstituto = async (id, arrInfoAd = []) => {
  try {
    const instituto = await Institutos.findOne({ IdInstitutoOK: id });
    if (!instituto) throw boom.notFound(`No se encontro el instituto '${id}'.`);

    for (const objInfoAd of arrInfoAd) {
      const existe = await Institutos.findOne({
        IdInstitutoOK: id,
        informacion_adicional: { $elemMatch: { IdEtiqueta: objInfoAd.IdEtiqueta } },
      });
      if (existe) await setObjInfoAdInstituto(id, objInfoAd);
      else await pushObjInfoAdInstituto(id, objInfoAd);
    }

    const institutoUpdated = await Institutos.findOne({ IdInstitutoOK: id });
    return OK('Informacion adicional sincronizada.', institutoUpdated);
  } catch (error) {
    if (boom.isBoom(error)) throw error;
    return FAIL('No se pudo sincronizar la informacion adicional.', null);
  }
};

// --- DELETE: baja fisica (?modo=fisico) o baja logica (por defecto) -------
export const deleteInstitutoItem = async (id, keyType = 'OK', actor = 'system') => {
  try {
    return await Institutos.findOneAndUpdate(
      keyFilter(id, keyType),
      {
        $set: {
          'detail_row.Activo': 'N',
          'detail_row.Borrado': 'S',
          'detail_row.FechaUltMod': new Date(),
          'detail_row.UsuarioMod': actor,
        },
      },
      { new: true },
    );
  } catch (error) {
    throw boom.internal(error);
  }
};

export const destroyInstitutoItem = async (id, keyType = 'OK') => {
  try {
    return await Institutos.findOneAndDelete(keyFilter(id, keyType));
  } catch (error) {
    throw boom.internal(error);
  }
};
