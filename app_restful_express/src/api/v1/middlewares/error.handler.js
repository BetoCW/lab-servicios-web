import boom from '@hapi/boom';

// Cualquier URL que no exista termina aqui y se convierte en un 404 con formato JSON
export const notFound = (req, res, next) => {
  next(boom.notFound(`La ruta ${req.method} ${req.originalUrl} no existe.`));
};

// Traduce los errores internos a respuestas HTTP claras. Debe recibir 4 parametros.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Llave duplicada en MongoDB (indice unico violado)
  if (err.code === 11000) {
    return res.status(409).json({
      statusCode: 409,
      error: 'Conflict',
      message: 'Ya existe un instituto con esos valores unicos.',
      keyValue: err.keyValue,
    });
  }

  // Validaciones del esquema de Mongoose (requerido, tipo, enum...)
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res
      .status(400)
      .json({ statusCode: 400, error: 'Bad Request', message: err.message });
  }

  // Body con JSON mal formado
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'El body no es un JSON valido.',
    });
  }

  // Errores lanzados con @hapi/boom desde services y controllers
  if (boom.isBoom(err)) {
    const { statusCode, payload } = err.output;
    if (statusCode >= 500) console.error(err);
    return res.status(statusCode).json(payload);
  }

  console.error(err);
  return res.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'Error interno del servidor.',
  });
};
