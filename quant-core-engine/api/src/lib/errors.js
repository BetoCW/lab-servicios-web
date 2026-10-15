export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Validación mínima del body: lanza 400 con la lista de errores. */
export function check(body, rules) {
  const errors = [];
  for (const [field, rule] of Object.entries(rules)) {
    const v = body?.[field];
    const present = v !== undefined && v !== null && v !== '';
    if (!present) {
      if (rule.required) errors.push(`${field} es obligatorio`);
      continue;
    }
    if (rule.type === 'string' && typeof v !== 'string') errors.push(`${field} debe ser texto`);
    if (rule.type === 'number' && !Number.isFinite(Number(v))) errors.push(`${field} debe ser numérico`);
    if (rule.type === 'array' && !Array.isArray(v)) errors.push(`${field} debe ser un arreglo`);
    if (rule.oneOf && !rule.oneOf.includes(v)) errors.push(`${field} debe ser uno de: ${rule.oneOf.join(', ')}`);
    if (rule.positive && !(Number(v) > 0)) errors.push(`${field} debe ser mayor que 0`);
    if (rule.date && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`${field} debe tener formato YYYY-MM-DD`);
  }
  if (errors.length) throw badRequest('Datos inválidos', errors);
}

export function assertUuid(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw badRequest('El id debe ser un UUID');
}
