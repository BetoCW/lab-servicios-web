const cds = require('@sap/cds');
const { connectDB } = require('./config/database.config');
const InstitutosServices = require('./services/institutos.service');
const cqn = require('./services/cqn');

// ---------------------------------------------------------------------------
// CONTROLADOR: en SAP CDS el "controlador" son los manejadores de eventos
// (srv.on) del servicio. Reciben la peticion ya interpretada por CAP, llaman
// al servicio de negocio y devuelven el resultado. No hablan con Mongoose.
// ---------------------------------------------------------------------------

// El usuario que hace el cambio viaja en el header x-user (si no viene, 'system')
const actorOf = (req) => req.headers?.['x-user'] || req.user?.id || 'system';

// El resultado de MongoDB se limpia para que encaje con la entidad CDS
const toEntity = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
};

// Traduce los errores a codigos HTTP de CAP, igual que el errorHandler de
// app_restful_express: validacion -> 400, llave duplicada -> 409, resto -> 500.
const fail = (req, error) => {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return req.reject(400, error.message);
  }
  if (error.code === 11000) {
    return req.reject(409, 'Ya existe un instituto con esos valores unicos.');
  }
  return req.reject(Number(error.code) || 500, error.message);
};

module.exports = cds.service.impl(async function () {
  const { Institutos } = this.entities;

  // La conexion NoSQL se abre una sola vez, al arrancar el microservicio
  await connectDB();

  // --- READ: GET /api/v1/Institutos  y  GET /api/v1/Institutos('1') --------
  this.on('READ', Institutos, async (req) => {
    try {
      const [key] = req.params;
      const id = typeof key === 'object' ? key?.IdInstitutoOK : key;

      if (id) {
        const item = await InstitutosServices.getInstitutoItem(id);
        if (!item) return req.reject(404, `No se encontro el instituto '${id}'.`);
        return toEntity(item);
      }

      // Las clausulas de OData ($filter, $select, $orderby, $top, $skip)
      // llegan como CQN y se traducen al lenguaje de consulta de MongoDB.
      const select = req.query.SELECT || {};
      if (process.env.DEBUG_CQN) console.log("CQN where:", JSON.stringify(select.where));
      const filter = cqn.whereToFilter(select.where);
      const projection = cqn.columnsToProjection(select.columns);
      const sort = cqn.orderByToSort(select.orderBy);
      const { skip, limit } = cqn.limitToPaging(select.limit);

      const list = await InstitutosServices.getInstitutosList(filter, {
        projection,
        sort,
        skip,
        limit,
      });

      const result = list.map(toEntity);
      // $count=true devuelve el total SIN paginar, como exige OData
      if (select.count) result.$count = await InstitutosServices.countInstitutos(filter);
      return result;
    } catch (error) {
      return fail(req, error);
    }
  });

  // --- CREATE: POST /api/v1/Institutos ------------------------------------
  this.on('CREATE', Institutos, async (req) => {
    try {
      return toEntity(await InstitutosServices.postInstitutoItem(req.data, actorOf(req)));
    } catch (error) {
      return fail(req, error);
    }
  });

  // --- UPDATE: PUT/PATCH /api/v1/Institutos('1') --------------------------
  this.on('UPDATE', Institutos, async (req) => {
    try {
      const [key] = req.params;
      const id = (typeof key === 'object' ? key?.IdInstitutoOK : key) || req.data.IdInstitutoOK;

      const updated = await InstitutosServices.putInstitutoItem(id, req.data, actorOf(req));
      if (!updated) {
        return req.reject(404, `No se encontro el instituto '${id}' que se desea actualizar.`);
      }
      return toEntity(updated);
    } catch (error) {
      return fail(req, error);
    }
  });

  // --- DELETE: DELETE /api/v1/Institutos('1') -----------------------------
  this.on('DELETE', Institutos, async (req) => {
    try {
      const [key] = req.params;
      const id = typeof key === 'object' ? key?.IdInstitutoOK : key;

      const deleted = await InstitutosServices.deleteInstitutoItem(id);
      if (!deleted) {
        return req.reject(404, 'No se encontro el instituto que se desea eliminar.');
      }
      return toEntity(deleted);
    } catch (error) {
      return fail(req, error);
    }
  });

  // --- ACTION bajaLogica: marca detail_row.Borrado = 'S' ------------------
  this.on('bajaLogica', async (req) => {
    try {
      const { IdInstitutoOK, usuario } = req.data;
      const item = await InstitutosServices.bajaLogicaInstituto(
        IdInstitutoOK,
        usuario || actorOf(req),
      );
      if (!item) return req.reject(404, `No se encontro el instituto '${IdInstitutoOK}'.`);
      return toEntity(item);
    } catch (error) {
      return fail(req, error);
    }
  });
});
