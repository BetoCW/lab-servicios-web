// Símbolos OCC de opciones: RAIZ + AAMMDD + C|P + strike*1000 a 8 dígitos.
// Ejemplo: AAPL251219C00200000 -> AAPL, 2025-12-19, call, 200
const OCC = /^([A-Z][A-Z0-9.]{0,5})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function parseOcc(symbol) {
  const m = OCC.exec(String(symbol).toUpperCase());
  if (!m) return null;
  const [, root, yy, mm, dd, cp, strike] = m;
  return {
    root,
    expiration: `20${yy}-${mm}-${dd}`,
    type: cp === 'C' ? 'call' : 'put',
    strike: Number(strike) / 1000,
  };
}
