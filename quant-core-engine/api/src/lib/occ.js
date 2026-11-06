// Formato estándar de la Options Clearing Corporation (OCC):
// [1] Símbolo subyacente (1-6 caracteres alfanuméricos)
// [2] Año (2 dígitos)
// [3] Mes (2 dígitos)
// [4] Día (2 dígitos)
// [5] Tipo de opción ('C' = Call, 'P' = Put)
// [6] Strike precio multiplicado por 1000 (8 dígitos)
// Ejemplo: AAPL251219C00200000 -> AAPL, 2025-12-19, call, $200.00
const OCC_REGEX = /^([A-Z][A-Z0-9.]{0,5})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

/**
 * Descompone un símbolo OCC en sus componentes estructurales.
 * @param {string} symbol - Símbolo OCC completo
 * @returns {{ root: string, expiration: string, type: 'call'|'put', strike: number } | null}
 */
export function parseOcc(symbol) {
  const match = OCC_REGEX.exec(String(symbol).toUpperCase());
  if (!match) return null;

  const [, root, yearTwoDigits, month, day, callOrPut, rawStrike] = match;
  return {
    root,
    expiration: `20${yearTwoDigits}-${month}-${day}`,
    type: callOrPut === 'C' ? 'call' : 'put',
    strike: Number(rawStrike) / 1000,
  };
}
