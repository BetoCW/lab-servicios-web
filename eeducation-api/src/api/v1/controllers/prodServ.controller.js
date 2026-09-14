import * as ProdServServices from '../services/prodServ.service';

// El usuario que hace el cambio viaja en el header x-user (si no viene, se guarda 'system')
const actorOf = (req) => req.headers['x-user'] || 'system';

// GET /prod-serv   (?IdInstitutoOK=1  ?includeDeleted=true)
export const getProdServList = async (req, res, next) => {
  try {
    const list = await ProdServServices.getProdServList({
      IdInstitutoOK: req.query.IdInstitutoOK,
      includeDeleted: req.query.includeDeleted === 'true',
    });
    res.status(200).json(list);
  } catch (error) {
    next(error);
  }
};

// GET /prod-serv/:id
export const getProdServItem = async (req, res, next) => {
  try {
    res.status(200).json(await ProdServServices.getProdServItem(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /prod-serv
export const createProdServ = async (req, res, next) => {
  try {
    res.status(201).json(await ProdServServices.createProdServ(req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// PUT /prod-serv/:id
export const updateProdServ = async (req, res, next) => {
  try {
    res.status(200).json(await ProdServServices.updateProdServ(req.params.id, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// DELETE /prod-serv/:id   (?fisico=true para borrado físico)
export const deleteProdServ = async (req, res, next) => {
  try {
    const result = await ProdServServices.deleteProdServ(req.params.id, actorOf(req), {
      fisico: req.query.fisico === 'true',
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// POST /prod-serv/:id/estatus
export const changeEstatus = async (req, res, next) => {
  try {
    res.status(201).json(await ProdServServices.changeEstatus(req.params.id, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// POST /prod-serv/:id/presentaciones
export const addPresentacion = async (req, res, next) => {
  try {
    res.status(201).json(await ProdServServices.addPresentacion(req.params.id, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// PUT /prod-serv/:id/presentaciones/:idPresenta
export const updatePresentacion = async (req, res, next) => {
  try {
    const { id, idPresenta } = req.params;
    res.status(200).json(await ProdServServices.updatePresentacion(id, idPresenta, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// DELETE /prod-serv/:id/presentaciones/:idPresenta
export const deletePresentacion = async (req, res, next) => {
  try {
    const { id, idPresenta } = req.params;
    res.status(200).json(await ProdServServices.deletePresentacion(id, idPresenta, actorOf(req)));
  } catch (error) {
    next(error);
  }
};
