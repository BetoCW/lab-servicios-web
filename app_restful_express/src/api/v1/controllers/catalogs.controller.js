import * as CatalogsServices from '../services/catalogs.service';
import { OK, FAIL } from '../middlewares/resp.handler';

// ---------------------------------------------------------------------------
// CONTROLADOR: recibe req, arma el contexto de la sesion, llama al servicio y
// responde con el codigo HTTP correcto. No conoce MongoDB ni Supabase.
// ---------------------------------------------------------------------------

const ctxOf = (req) => ({ dbServer: req.session.dbServer, usuario: req.session.usuario });
const isHard = (req) => req.query.hard === 'true';

// Respuesta de operaciones masivas: 201/200 si todo salio, 207 si hubo de todo,
// y el codigo del primer error si no salio ninguno.
const sendMany = (res, { ok, failed }, successCode, label) => {
  const body = { ok: ok.length, failed: failed.length, data: ok, errors: failed };
  if (failed.length === 0) return res.status(successCode).json(OK(`${label}: ${ok.length}`, body));
  if (ok.length === 0) {
    return res.status(failed[0].statusCode).json(FAIL(`${label}: ninguno`, body));
  }
  return res.status(207).json(FAIL(`${label}: ${ok.length} de ${ok.length + failed.length}`, body));
};

// Envuelve cada controlador en try/catch y manda los errores al middleware
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

// =========================== CATALOGOS =====================================

export const getCatalogs = handle(async (req, res) => {
  res.status(200).json(await CatalogsServices.getCatalogs(ctxOf(req), req.query));
});

export const getCatalog = handle(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  res.status(200).json(await CatalogsServices.getCatalog(ctxOf(req), req.params.key, { includeDeleted }));
});

export const postCatalog = handle(async (req, res) => {
  res.status(201).json(await CatalogsServices.createCatalog(ctxOf(req), req.body));
});

export const postManyCatalogs = handle(async (req, res) => {
  sendMany(res, await CatalogsServices.createManyCatalogs(ctxOf(req), req.body), 201, 'Catalogos creados');
});

export const putCatalog = handle(async (req, res) => {
  res.status(200).json(await CatalogsServices.updateCatalog(ctxOf(req), req.params.key, req.body));
});

export const putManyCatalogs = handle(async (req, res) => {
  sendMany(res, await CatalogsServices.updateManyCatalogs(ctxOf(req), req.body), 200, 'Catalogos modificados');
});

export const deleteCatalog = handle(async (req, res) => {
  const result = await CatalogsServices.deleteCatalog(ctxOf(req), req.params.key, { hard: isHard(req) });
  res.status(200).json(result);
});

export const deleteManyCatalogs = handle(async (req, res) => {
  const result = await CatalogsServices.deleteManyCatalogs(ctxOf(req), req.body?.keys, { hard: isHard(req) });
  sendMany(res, result, 200, 'Catalogos eliminados');
});

// ====================== VALORES (subdocumento) =============================

export const getValues = handle(async (req, res) => {
  res.status(200).json(await CatalogsServices.getValues(ctxOf(req), req.params.key, req.query));
});

export const getValue = handle(async (req, res) => {
  res.status(200).json(await CatalogsServices.getValue(ctxOf(req), req.params.key, req.params.valueId));
});

export const getTree = handle(async (req, res) => {
  res.status(200).json(await CatalogsServices.getTree(ctxOf(req), req.params.key));
});

export const postValue = handle(async (req, res) => {
  const [created] = await CatalogsServices.addValues(ctxOf(req), req.params.key, [req.body]);
  res.status(201).json(created);
});

export const postManyValues = handle(async (req, res) => {
  const created = await CatalogsServices.addValues(ctxOf(req), req.params.key, req.body);
  res.status(201).json(OK(`Valores agregados: ${created.length}`, created));
});

export const putValue = handle(async (req, res) => {
  const change = { ...req.body, id: req.params.valueId };
  const [updated] = await CatalogsServices.updateValues(ctxOf(req), req.params.key, [change]);
  res.status(200).json(updated);
});

export const putManyValues = handle(async (req, res) => {
  const updated = await CatalogsServices.updateValues(ctxOf(req), req.params.key, req.body);
  res.status(200).json(OK(`Valores modificados: ${updated.length}`, updated));
});

export const deleteValue = handle(async (req, res) => {
  const result = await CatalogsServices.deleteValues(ctxOf(req), req.params.key, [req.params.valueId], {
    hard: isHard(req),
  });
  res.status(200).json(result);
});

export const deleteManyValues = handle(async (req, res) => {
  const result = await CatalogsServices.deleteValues(ctxOf(req), req.params.key, req.body?.ids, {
    hard: isHard(req),
  });
  res.status(200).json(result);
});
