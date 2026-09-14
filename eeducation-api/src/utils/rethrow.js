import boom from '@hapi/boom';

// Los errores "conocidos" (boom, validación de Mongoose o llave duplicada) se relanzan tal cual
// para que errorHandler responda 400/404/409; cualquier otro se envuelve como 500.
export const rethrow = (error) => {
  const known =
    boom.isBoom(error) ||
    error.name === 'ValidationError' ||
    error.name === 'CastError' ||
    error.code === 11000;

  throw known ? error : boom.internal(error);
};
