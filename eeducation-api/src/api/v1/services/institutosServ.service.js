import boom from '@hapi/boom';
import Institutos from '../models/Institutos';
import ProdServ from '../models/ProdServ';
import { rethrow } from '../../../utils/rethrow';
import { NOT_DELETED, newDetailRow, registerChange, markDeleted, pick } from '../../../utils/detailRow';
import { assertCatalogValue } from '../../../utils/catalogosClient';

// Campos que se pueden capturar o modificar (IdInstitutoOK es la llave y no cambia)
const FIELDS = ['IdInstitutoBK', 'DesInstituto', 'Alias', 'Matriz', 'Giro', 'IdInstitutoSupOK'];

const findOrFail = async (id) => {
  const instituto = await Institutos.findOne({ IdInstitutoOK: id, ...NOT_DELETED });
  if (!instituto) throw boom.notFound(`Instituto '${id}' no encontrado.`);
  return instituto;
};

const assertSuperior = async (id, supId) => {
  if (!supId) return;
  if (supId === id) throw boom.badRequest('Un instituto no puede ser su propio instituto superior.');
  if (!(await Institutos.exists({ IdInstitutoOK: supId, ...NOT_DELETED }))) {
    throw boom.badRequest(`IdInstitutoSupOK '${supId}' no existe.`);
  }
};

// GET - Lista de institutos
export const getInstitutosList = async ({ includeDeleted = false } = {}) => {
  try {
    return await Institutos.find(includeDeleted ? {} : NOT_DELETED).sort({ IdInstitutoOK: 1 });
  } catch (error) {
    return rethrow(error);
  }
};

// GET - Un instituto por IdInstitutoOK
export const getInstitutoItem = async (id) => {
  try {
    return await findOrFail(id);
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Crear instituto
export const createInstituto = async (payload = {}, actor = 'system') => {
  try {
    const { IdInstitutoOK } = payload;
    if (IdInstitutoOK && (await Institutos.exists({ IdInstitutoOK }))) {
      throw boom.conflict(`Ya existe un instituto con IdInstitutoOK '${IdInstitutoOK}'.`);
    }
    await assertSuperior(IdInstitutoOK, payload.IdInstitutoSupOK);
    await assertCatalogValue('institute_business', payload.Giro);

    return await Institutos.create({
      IdInstitutoOK,
      ...pick(payload, FIELDS),
      detail_row: newDetailRow(actor),
    });
  } catch (error) {
    return rethrow(error);
  }
};

// PUT - Actualizar instituto
export const updateInstituto = async (id, payload = {}, actor = 'system') => {
  try {
    const instituto = await findOrFail(id);
    if (payload.IdInstitutoSupOK !== undefined) await assertSuperior(id, payload.IdInstitutoSupOK);
    if (payload.Giro !== undefined) await assertCatalogValue('institute_business', payload.Giro);

    Object.assign(instituto, pick(payload, FIELDS));
    registerChange(instituto.detail_row, actor);
    await instituto.save();
    return instituto;
  } catch (error) {
    return rethrow(error);
  }
};

// DELETE - Borrado lógico (por defecto) o físico (?fisico=true)
export const deleteInstituto = async (id, actor = 'system', { fisico = false } = {}) => {
  try {
    if (fisico) {
      const instituto = await Institutos.findOne({ IdInstitutoOK: id });
      if (!instituto) throw boom.notFound(`Instituto '${id}' no encontrado.`);

      const [productos, dependientes] = await Promise.all([
        ProdServ.countDocuments({ IdInstitutoOK: id }),
        Institutos.countDocuments({ IdInstitutoSupOK: id }),
      ]);
      if (productos || dependientes) {
        throw boom.conflict(
          `No se puede borrar físicamente: tiene ${productos} productos/servicios y ${dependientes} institutos dependientes.`,
        );
      }

      await instituto.deleteOne();
      return { message: `Instituto '${id}' eliminado físicamente.`, IdInstitutoOK: id };
    }

    const instituto = await findOrFail(id);
    markDeleted(instituto.detail_row, actor);
    await instituto.save();
    return instituto;
  } catch (error) {
    return rethrow(error);
  }
};
