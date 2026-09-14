import boom from '@hapi/boom';
import ProdServ from '../models/ProdServ';
import Institutos from '../models/Institutos';
import { rethrow } from '../../../utils/rethrow';
import {
  NOT_DELETED,
  isDeleted,
  newDetailRow,
  registerChange,
  markDeleted,
  pick,
} from '../../../utils/detailRow';
import { assertCatalogValue } from '../../../utils/catalogosClient';

const FIELDS = ['IdProdServBK', 'CodigoBarras', 'DesProdServ', 'IdTipoProdServOK', 'Indice'];
const PRESENTA_FIELDS = ['IdPresentaBK', 'CodigoBarras', 'DesPresenta', 'Precio', 'Principal', 'Indice'];
const ESTATUS_INICIAL = 'PS_ACTIVO';

const findOrFail = async (id) => {
  const prodServ = await ProdServ.findOne({ IdProdServOK: id, ...NOT_DELETED });
  if (!prodServ) throw boom.notFound(`Producto/servicio '${id}' no encontrado.`);
  return prodServ;
};

const findPresentaOrFail = (prodServ, idPresenta) => {
  const presenta = prodServ.cat_prod_serv_presenta.find(
    (p) => p.IdPresentaOK === idPresenta && !isDeleted(p),
  );
  if (!presenta) throw boom.notFound(`Presentación '${idPresenta}' no encontrada.`);
  return presenta;
};

// Oculta subdocumentos con borrado lógico en la respuesta
const withoutDeleted = (prodServ) => {
  const json = prodServ.toJSON();
  return {
    ...json,
    cat_prod_serv_info_ad: json.cat_prod_serv_info_ad.filter((i) => !isDeleted(i)),
    cat_prod_serv_presenta: json.cat_prod_serv_presenta
      .filter((p) => !isDeleted(p))
      .map((p) => ({ ...p, cat_prod_serv_archivos: p.cat_prod_serv_archivos.filter((a) => !isDeleted(a)) })),
  };
};

// Si una presentación se marca como principal, las demás dejan de serlo
const keepSinglePrincipal = (prodServ, idPresenta) => {
  prodServ.cat_prod_serv_presenta
    .filter((p) => p.IdPresentaOK !== idPresenta)
    .forEach((p) => {
      p.Principal = 'N';
    });
};

const buildPresenta = (data, actor) => ({
  IdPresentaOK: data.IdPresentaOK,
  ...pick(data, PRESENTA_FIELDS),
  cat_prod_serv_archivos: (data.cat_prod_serv_archivos || []).map((a) => ({
    ...a,
    detail_row: newDetailRow(actor),
  })),
  detail_row: newDetailRow(actor),
});

const assertArchivos = async (archivos = []) => {
  for (const archivo of archivos) await assertCatalogValue('file_type', archivo.IdTipoArchivoOK);
};

// GET - Lista (filtro opcional ?IdInstitutoOK=)
export const getProdServList = async ({ IdInstitutoOK, includeDeleted = false } = {}) => {
  try {
    const filter = { ...(includeDeleted ? {} : NOT_DELETED), ...(IdInstitutoOK ? { IdInstitutoOK } : {}) };
    const list = await ProdServ.find(filter).sort({ IdInstitutoOK: 1, IdProdServOK: 1 });
    return includeDeleted ? list : list.map(withoutDeleted);
  } catch (error) {
    return rethrow(error);
  }
};

// GET - Uno por IdProdServOK
export const getProdServItem = async (id) => {
  try {
    return withoutDeleted(await findOrFail(id));
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Crear producto/servicio con presentaciones e información adicional opcionales
export const createProdServ = async (payload = {}, actor = 'system') => {
  try {
    const { IdInstitutoOK, IdProdServOK } = payload;

    if (IdInstitutoOK && !(await Institutos.exists({ IdInstitutoOK, ...NOT_DELETED }))) {
      throw boom.badRequest(`El instituto '${IdInstitutoOK}' no existe.`);
    }
    if (IdProdServOK && (await ProdServ.exists({ IdProdServOK }))) {
      throw boom.conflict(`Ya existe un producto/servicio con IdProdServOK '${IdProdServOK}'.`);
    }

    const presentaciones = payload.cat_prod_serv_presenta || [];
    const ids = presentaciones.map((p) => p.IdPresentaOK);
    if (new Set(ids).size !== ids.length) {
      throw boom.badRequest('Hay presentaciones con IdPresentaOK repetido.');
    }

    const estatus = String(payload.IdTipoEstatusOK || ESTATUS_INICIAL).toUpperCase();
    await assertCatalogValue('prod_serv_type', payload.IdTipoProdServOK);
    await assertCatalogValue('prod_serv_status', estatus);
    for (const p of presentaciones) await assertArchivos(p.cat_prod_serv_archivos);

    return await ProdServ.create({
      IdInstitutoOK,
      IdProdServOK,
      ...pick(payload, FIELDS),
      cat_prod_serv_estatus: [{ IdTipoEstatusOK: estatus, Actual: 'S', detail_row: newDetailRow(actor) }],
      cat_prod_serv_info_ad: (payload.cat_prod_serv_info_ad || []).map((info, i) => ({
        ...info,
        Secuencia: info.Secuencia ?? i + 1,
        detail_row: newDetailRow(actor),
      })),
      cat_prod_serv_presenta: presentaciones.map((p) => buildPresenta(p, actor)),
      detail_row: newDetailRow(actor),
    });
  } catch (error) {
    return rethrow(error);
  }
};

// PUT - Actualizar datos generales (e información adicional si se envía completa)
export const updateProdServ = async (id, payload = {}, actor = 'system') => {
  try {
    const prodServ = await findOrFail(id);
    if (payload.IdTipoProdServOK !== undefined) {
      await assertCatalogValue('prod_serv_type', payload.IdTipoProdServOK);
    }

    Object.assign(prodServ, pick(payload, FIELDS));

    if (Array.isArray(payload.cat_prod_serv_info_ad)) {
      prodServ.cat_prod_serv_info_ad = payload.cat_prod_serv_info_ad.map((info, i) => ({
        ...info,
        Secuencia: info.Secuencia ?? i + 1,
        detail_row: newDetailRow(actor),
      }));
    }

    registerChange(prodServ.detail_row, actor);
    await prodServ.save();
    return withoutDeleted(prodServ);
  } catch (error) {
    return rethrow(error);
  }
};

// DELETE - Borrado lógico (por defecto) o físico (?fisico=true)
export const deleteProdServ = async (id, actor = 'system', { fisico = false } = {}) => {
  try {
    if (fisico) {
      const result = await ProdServ.deleteOne({ IdProdServOK: id });
      if (!result.deletedCount) throw boom.notFound(`Producto/servicio '${id}' no encontrado.`);
      return { message: `Producto/servicio '${id}' eliminado físicamente.`, IdProdServOK: id };
    }

    const prodServ = await findOrFail(id);
    markDeleted(prodServ.detail_row, actor);
    await prodServ.save();
    return prodServ;
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Cambiar estatus: el anterior deja de ser Actual y se agrega el nuevo al historial
export const changeEstatus = async (id, { IdTipoEstatusOK, Observacion = '' } = {}, actor = 'system') => {
  try {
    if (!IdTipoEstatusOK) throw boom.badRequest('El campo IdTipoEstatusOK es obligatorio.');
    const code = String(IdTipoEstatusOK).toUpperCase();
    await assertCatalogValue('prod_serv_status', code);

    const prodServ = await findOrFail(id);
    const actual = prodServ.cat_prod_serv_estatus.find((e) => e.Actual === 'S');
    if (actual?.IdTipoEstatusOK === code) {
      throw boom.conflict(`El producto/servicio ya tiene el estatus '${code}'.`);
    }

    prodServ.cat_prod_serv_estatus.forEach((e) => {
      e.Actual = 'N';
    });
    prodServ.cat_prod_serv_estatus.push({ IdTipoEstatusOK: code, Actual: 'S', Observacion, detail_row: newDetailRow(actor) });
    registerChange(prodServ.detail_row, actor);
    await prodServ.save();
    return prodServ.cat_prod_serv_estatus;
  } catch (error) {
    return rethrow(error);
  }
};

// POST - Agregar presentación
export const addPresentacion = async (id, data = {}, actor = 'system') => {
  try {
    if (!data.IdPresentaOK) throw boom.badRequest('El campo IdPresentaOK es obligatorio.');
    const prodServ = await findOrFail(id);

    if (prodServ.cat_prod_serv_presenta.some((p) => p.IdPresentaOK === data.IdPresentaOK && !isDeleted(p))) {
      throw boom.conflict(`Ya existe la presentación '${data.IdPresentaOK}' en '${id}'.`);
    }
    await assertArchivos(data.cat_prod_serv_archivos);

    if (data.Principal === 'S') keepSinglePrincipal(prodServ, data.IdPresentaOK);
    prodServ.cat_prod_serv_presenta.push(buildPresenta(data, actor));
    registerChange(prodServ.detail_row, actor);
    await prodServ.save();
    return prodServ.cat_prod_serv_presenta.at(-1);
  } catch (error) {
    return rethrow(error);
  }
};

// PUT - Actualizar presentación
export const updatePresentacion = async (id, idPresenta, data = {}, actor = 'system') => {
  try {
    const prodServ = await findOrFail(id);
    const presenta = findPresentaOrFail(prodServ, idPresenta);

    if (Array.isArray(data.cat_prod_serv_archivos)) {
      await assertArchivos(data.cat_prod_serv_archivos);
      presenta.cat_prod_serv_archivos = data.cat_prod_serv_archivos.map((a) => ({
        ...a,
        detail_row: newDetailRow(actor),
      }));
    }

    Object.assign(presenta, pick(data, PRESENTA_FIELDS));
    if (data.Principal === 'S') keepSinglePrincipal(prodServ, idPresenta);
    registerChange(presenta.detail_row, actor);
    await prodServ.save();
    return presenta;
  } catch (error) {
    return rethrow(error);
  }
};

// DELETE - Borrado lógico de una presentación
export const deletePresentacion = async (id, idPresenta, actor = 'system') => {
  try {
    const prodServ = await findOrFail(id);
    const presenta = findPresentaOrFail(prodServ, idPresenta);
    markDeleted(presenta.detail_row, actor);
    presenta.Principal = 'N';
    await prodServ.save();
    return presenta;
  } catch (error) {
    return rethrow(error);
  }
};
