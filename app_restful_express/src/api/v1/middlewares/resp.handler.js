// Respuestas JSON homogeneas para los servicios que devuelven varios registros

export const OK = (message, data) => ({
  message: message || 'OK',
  data,
  success: true,
  fail: false,
});

export const FAIL = (message, data) => ({
  message: message || 'FAIL',
  data,
  success: false,
  fail: true,
});
