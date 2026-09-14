import * as InstitutosServServices from '../services/institutosServ.service';
import * as ProdServServices from '../services/prodServ.service';

// El usuario que hace el cambio viaja en el header x-user (si no viene, se guarda 'system')
const actorOf = (req) => req.headers['x-user'] || 'system';

// GET /institutos   (?includeDeleted=true incluye borrados lógicos)
export const getInstitutosServList = async (req, res, next) => {
  try {
    const list = await InstitutosServServices.getInstitutosList({
      includeDeleted: req.query.includeDeleted === 'true',
    });
    res.status(200).json(list);
  } catch (error) {
    next(error);
  }
};

// GET /institutos/:id
export const getInstitutoItem = async (req, res, next) => {
  try {
    res.status(200).json(await InstitutosServServices.getInstitutoItem(req.params.id));
  } catch (error) {
    next(error);
  }
};

// GET /institutos/:id/prod-serv   (productos y servicios de un instituto)
export const getInstitutoProdServ = async (req, res, next) => {
  try {
    await InstitutosServServices.getInstitutoItem(req.params.id); // 404 si no existe
    res.status(200).json(await ProdServServices.getProdServList({ IdInstitutoOK: req.params.id }));
  } catch (error) {
    next(error);
  }
};

// POST /institutos
export const createInstituto = async (req, res, next) => {
  try {
    res.status(201).json(await InstitutosServServices.createInstituto(req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// PUT /institutos/:id
export const updateInstituto = async (req, res, next) => {
  try {
    res.status(200).json(await InstitutosServServices.updateInstituto(req.params.id, req.body, actorOf(req)));
  } catch (error) {
    next(error);
  }
};

// DELETE /institutos/:id   (?fisico=true para borrado físico)
export const deleteInstituto = async (req, res, next) => {
  try {
    const result = await InstitutosServServices.deleteInstituto(req.params.id, actorOf(req), {
      fisico: req.query.fisico === 'true',
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
