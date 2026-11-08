/**
 * ============================================================================
 *  lib/security.js — Cabeceras de seguridad HTTP
 * ============================================================================
 *  QUÉ HACE
 *    Agrega las cabeceras que el escaneo OWASP ZAP marcó como faltantes en la
 *    prueba baseline (T3-Act 2, inciso C):
 *      • X-Content-Type-Options: nosniff   → el navegador no adivina el tipo de archivo
 *      • X-Frame-Options: SAMEORIGIN       → evita clickjacking (la página dentro de un iframe ajeno)
 *      • Content-Security-Policy           → limita desde dónde se pueden cargar scripts y estilos
 *      • Permissions-Policy                → apaga cámara, micrófono y geolocalización
 *      • Referrer-Policy                   → no filtra la URL completa a otros sitios
 *      • Cross-Origin-Opener-Policy        → aísla la ventana de otros orígenes
 *    Además se oculta `X-Powered-By: Express` (pista gratis para un atacante).
 *
 *  NOTA SOBRE LA CSP
 *    El front usa un script en línea y la librería de gráficas desde unpkg, y Swagger UI
 *    también necesita scripts en línea; por eso se permiten explícitamente. Aun así queda
 *    cerrado todo lo demás (objetos, frames, base-uri, formularios hacia otros sitios).
 * ============================================================================
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/**
 * Middleware de Express que fija las cabeceras de seguridad en cada respuesta.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}
