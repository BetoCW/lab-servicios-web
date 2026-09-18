import boom from '@hapi/boom';
import * as InstitutosServices from '../services/institutos.service';

// ---------------------------------------------------------------------------
// CONTROLADOR: recibe req, llama al servicio y responde con el codigo HTTP
// correcto. No conoce Mongoose ni la base de datos.
// ---------------------------------------------------------------------------

// El usuario que hace el cambio viaja en el header x-user (si no viene, 'system')
const actorOf = (req) => req.headers['x-user'] || 'system';

// --- GET /institutos ------------------------------------------------------
export const getInstitutosList = async (req, res, next) => {
  try {
    const institutosList = await InstitutosServices.getInstitutosList();
    if (!institutosList || institutosList.length === 0) {
      throw boom.notFound('No se encontro ningun instituto registrado.');
    }
    res.status(200).json(institutosList);
  } catch (error) {
    next(error);
  }
};

// --- GET /institutos/:id?keyType=OK|BK -----------------------------------
export const getInstitutoItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const keyType = req.query.keyType || 'OK';
    const institutoItem = await InstitutosServices.getInstitutoItem(id, keyType);
    if (!institutoItem) {
      throw boom.notFound(`No se encontro el instituto '${id}'.`);
    }
    res.status(200).json(institutoItem);
  } catch (error) {
    next(error);
  }
};

// --- POST /institutos -----------------------------------------------------
export const postInstitutosItem = async (req, res, next) => {
  try {
    const paInstitutoItem = req.body;
    const newInstitutoItem = await InstitutosServices.postInstitutoItem(
      paInstitutoItem,
      actorOf(req),
    );
    if (!newInstitutoItem) throw boom.badRequest('No se pudo crear el instituto.');
    res.status(201).json(newInstitutoItem);
  } catch (error) {
    next(error);
  }
};

// --- POST /institutos/manyInstitutos (arreglo JSON en el body) ------------
export const addManyInstitutos = async (req, res, next) => {
  try {
    const institutosAdded = await InstitutosServices.addManyInstitutos(
      req.body,
      actorOf(req),
    );
    if (institutosAdded.fail) return res.status(409).json(institutosAdded);
    return res.status(201).json(institutosAdded);
  } catch (error) {
    return next(error);
  }
};

// --- PUT /institutos/:id --------------------------------------------------
export const putInstitutoItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedInstitutoItem = await InstitutosServices.putInstitutoItem(
      id,
      req.body,
      actorOf(req),
    );
    if (!updatedInstitutoItem) {
      throw boom.notFound(`No se encontro el instituto '${id}' que se desea actualizar.`);
    }
    res.status(200).json(updatedInstitutoItem);
  } catch (error) {
    next(error);
  }
};

// --- PUT /institutos/:id/infoAdicional ------------------------------------
export const setArrInfoAdInstituto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await InstitutosServices.getPushSetArrInfoAdInstituto(id, req.body);
    if (result.fail) return res.status(409).json(result);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

// --- DELETE /institutos/:id?keyType=OK|BK&modo=logico|fisico -------------
export const deleteInstitutoItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const keyType = req.query.keyType || 'OK';
    const fisico = req.query.modo === 'fisico';

    const deletedInstitutoItem = fisico
      ? await InstitutosServices.destroyInstitutoItem(id, keyType)
      : await InstitutosServices.deleteInstitutoItem(id, keyType, actorOf(req));

    if (!deletedInstitutoItem) {
      throw boom.notFound('No se encontro el instituto que se desea eliminar.');
    }
    res.status(200).json(deletedInstitutoItem);
  } catch (error) {
    next(error);
  }
};
