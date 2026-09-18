// ---------------------------------------------------------------------------
// Traductor CQN -> MongoDB.
//
// Al escribir un manejador propio con srv.on('READ'), CAP entrega la consulta
// ya interpretada (CQN) pero deja de aplicarla: es responsabilidad del
// microservicio. Estas funciones convierten las clausulas de OData
// ($filter, $select, $orderby, $top, $skip) en el equivalente de MongoDB.
// ---------------------------------------------------------------------------

const OPERATORS = {
  '=': '$eq',
  '==': '$eq',
  '!=': '$ne',
  '<>': '$ne',
  '>': '$gt',
  '>=': '$gte',
  '<': '$lt',
  '<=': '$lte',
  in: '$in',
  'not in': '$nin',
};

const valueOf = (token) => {
  if (token === null || token === undefined) return token;
  if ('val' in token) return token.val;
  if ('list' in token) return token.list.map((t) => valueOf(t));
  return token;
};

// Escapa los caracteres especiales de una expresion regular
const escapeRegex = (text) => String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// OData traduce contains(), startswith() y endswith() a un token `func`.
// Cada uno se resuelve con una expresion regular de MongoDB.
const FUNCTIONS = {
  contains: (value) => escapeRegex(value),
  startswith: (value) => `^${escapeRegex(value)}`,
  endswith: (value) => `${escapeRegex(value)}$`,
};

const functionToFilter = (token) => {
  const build = FUNCTIONS[String(token.func).toLowerCase()];
  if (!build) return null;

  const [target, needle] = token.args || [];
  const field = target?.ref?.join('.');
  if (!field) return null;

  return { [field]: { $regex: build(valueOf(needle)), $options: 'i' } };
};

// Convierte una condicion simple: {ref} operador {val}
const condition = (left, operator, right) => {
  const field = left.ref?.join('.');
  if (!field) return null;

  const op = OPERATORS[String(operator).toLowerCase()];
  if (op) return { [field]: { [op]: valueOf(right) } };

  const raw = String(operator).toLowerCase();
  if (raw === 'like') {
    // OData contains/startswith/endswith llegan como LIKE con comodines %
    const pattern = String(valueOf(right) ?? '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*');
    return { [field]: { $regex: `^${pattern}$`, $options: 'i' } };
  }
  return null;
};

/** Convierte el arreglo CQN `where` en un filtro de MongoDB. */
const whereToFilter = (where) => {
  if (!Array.isArray(where) || where.length === 0) return {};

  const orGroups = [];
  let andGroup = [];
  let i = 0;

  while (i < where.length) {
    const token = where[i];
    const keyword = typeof token === 'string' ? token.toLowerCase() : null;

    if (keyword === 'and') {
      i += 1;
      continue;
    }
    if (keyword === 'or') {
      orGroups.push(andGroup);
      andGroup = [];
      i += 1;
      continue;
    }

    // Parentesis: CAP los entrega como sub-arreglos
    if (Array.isArray(token)) {
      const sub = whereToFilter(token);
      if (Object.keys(sub).length) andGroup.push(sub);
      i += 1;
      continue;
    }
    if (token?.xpr) {
      const sub = whereToFilter(token.xpr);
      if (Object.keys(sub).length) andGroup.push(sub);
      i += 1;
      continue;
    }

    // Funciones de texto: contains(), startswith(), endswith()
    if (token?.func) {
      const fn = functionToFilter(token);
      if (fn) andGroup.push(fn);
      // CAP puede enviarlas solas o comparadas contra true: "contains(x,'y') eq true"
      i += where[i + 1] === '=' ? 3 : 1;
      continue;
    }

    // Condicion de tres tokens: izquierda, operador, derecha
    const cond = condition(token, where[i + 1], where[i + 2]);
    if (cond) andGroup.push(cond);
    i += 3;
  }

  orGroups.push(andGroup);

  const branches = orGroups
    .filter((group) => group.length > 0)
    .map((group) => (group.length === 1 ? group[0] : { $and: group }));

  if (branches.length === 0) return {};
  if (branches.length === 1) return branches[0];
  return { $or: branches };
};

/** Convierte `columns` ($select) en una proyeccion de MongoDB. */
const columnsToProjection = (columns) => {
  if (!Array.isArray(columns)) return null;

  const fields = columns
    .filter((c) => c?.ref && c.ref[0] !== '*')
    .map((c) => c.ref.join('.'));

  if (fields.length === 0) return null;
  return Object.fromEntries([...fields.map((f) => [f, 1]), ['_id', 0]]);
};

/** Convierte `orderBy` ($orderby) en un sort de MongoDB. */
const orderByToSort = (orderBy) => {
  if (!Array.isArray(orderBy) || orderBy.length === 0) return { IdInstitutoOK: 1 };

  return Object.fromEntries(
    orderBy
      .filter((o) => o?.ref)
      .map((o) => [o.ref.join('.'), String(o.sort).toLowerCase() === 'desc' ? -1 : 1]),
  );
};

/** Lee $top y $skip de la clausula limit. */
const limitToPaging = (limit) => ({
  skip: limit?.offset?.val ?? 0,
  limit: limit?.rows?.val ?? 0,
});

module.exports = { whereToFilter, columnsToProjection, orderByToSort, limitToPaging };
