/**
 * Representa un error HTTP estructurado con código de estado y detalles opcionales.
 */
export class HttpError extends Error {
  /**
   * Crea una instancia de HttpError.
   * @param {number} status - Código de estado HTTP (400, 404, 409, 500, etc.).
   * @param {string} message - Mensaje descriptivo del error.
   * @param {Array<string>|object} [details] - Detalles adicionales de validación.
   */
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Crea un error 400 Bad Request.
 * @param {string} msg - Mensaje de error.
 * @param {*} [details] - Detalles de validación.
 * @returns {HttpError}
 */
export const badRequest = (msg, details) => new HttpError(400, msg, details);

/**
 * Crea un error 404 Not Found.
 * @param {string} [msg='Recurso no encontrado'] - Mensaje descriptivo.
 * @returns {HttpError}
 */
export const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);

/**
 * Crea un error 409 Conflict.
 * @param {string} msg - Mensaje del conflicto.
 * @returns {HttpError}
 */
export const conflict = (msg) => new HttpError(409, msg);

/**
 * Validación mínima del cuerpo de una petición; lanza 400 con la lista de errores si alguna regla falla.
 *
 * @param {object} body - Objeto de datos a validar.
 * @param {object} rules - Reglas declarativas por campo.
 * @throws {HttpError} Si algún campo no cumple las reglas especificadas.
 */
export function check(body, rules) {
  const errors = [];
  for (const [field, rule] of Object.entries(rules)) {
    const fieldValue = body?.[field];
    const isPresent = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
    if (!isPresent) {
      if (rule.required) errors.push(`${field} es obligatorio`);
      continue;
    }
    if (rule.type === 'string' && typeof fieldValue !== 'string') errors.push(`${field} debe ser texto`);
    if (rule.type === 'number' && !Number.isFinite(Number(fieldValue))) errors.push(`${field} debe ser numérico`);
    if (rule.type === 'array' && !Array.isArray(fieldValue)) errors.push(`${field} debe ser un arreglo`);
    if (rule.oneOf && !rule.oneOf.includes(fieldValue)) errors.push(`${field} debe ser uno de: ${rule.oneOf.join(', ')}`);
    if (rule.positive && !(Number(fieldValue) > 0)) errors.push(`${field} debe ser mayor que 0`);
    if (rule.date && !/^\d{4}-\d{2}-\d{2}$/.test(fieldValue)) errors.push(`${field} debe tener formato YYYY-MM-DD`);
  }
  if (errors.length) throw badRequest('Datos inválidos', errors);
}

/**
 * Valida que un identificador recibido tenga formato canónico de UUID v4.
 *
 * @param {string} id - Cadena a evaluar.
 * @throws {HttpError} Si el formato no coincide con un UUID.
 */
export function assertUuid(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw badRequest('El id debe ser un UUID');
}

/**
 * Middleware final para rutas no encontradas (404).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const notFoundHandler = (req, res) => res.status(404).json({ status: 404, message: `No existe ${req.method} ${req.path}` });

/**
 * Middleware centralizado de manejo de errores en Express.
 * @param {Error|HttpError} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export const errorHandler = (err, _req, res, _next) => {
  const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ status, message: err.message, ...(err.details ? { details: err.details } : {}) });
};
