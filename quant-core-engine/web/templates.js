// Plantillas de estrategias: eligen las piernas de una cadena ya ingestada (GET /option-chains/{id}).
// Script clásico: el front lo usa como window.F0Templates y las pruebas lo importan desde Node.
(function (root) {
  /**
   * Encuentra el elemento de una colección cuya métrica calculada esté más próxima al objetivo deseado.
   *
   * @template T
   * @param {T[]} candidates - Elementos candidatos a evaluar.
   * @param {(item: T) => number} metricSelector - Función que extrae la métrica numérica del elemento.
   * @param {number} targetValue - Valor objetivo de referencia.
   * @returns {T} El elemento más cercano al valor objetivo.
   */
  const closest = (candidates, metricSelector, targetValue) =>
    candidates.reduce((best, current) =>
      Math.abs(metricSelector(current) - targetValue) < Math.abs(metricSelector(best) - targetValue) ? current : best,
    );

  /**
   * Obtiene la cotización del tipo y vencimiento dados con el strike más próximo a `targetStrike`.
   *
   * @param {Array<object>} quotes - Lista de cotizaciones disponibles en la cadena.
   * @param {'call'|'put'} type - Tipo de opción deseado.
   * @param {string} expiration - Fecha de expiración (YYYY-MM-DD).
   * @param {number} targetStrike - Strike objetivo buscado.
   * @returns {object} Cotización que mejor se aproxima al strike.
   * @throws {Error} Si no existen contratos para el tipo y vencimiento solicitados.
   */
  function atStrike(quotes, type, expiration, targetStrike) {
    const matchingQuotes = quotes.filter((quote) => quote.type === type && quote.expiration === expiration);
    if (!matchingQuotes.length) throw new Error(`La cadena no tiene ${type}s que venzan el ${expiration}`);
    return closest(matchingQuotes, (quote) => quote.strike, targetStrike);
  }

  /**
   * Encuentra una opción fuera del dinero (OTM) por delta (|delta| ≈ targetDelta);
   * si Alpaca no proveyó griegas, aproxima por distancia porcentual al spot.
   *
   * @param {Array<object>} quotes - Lista de cotizaciones de la cadena.
   * @param {'call'|'put'} type - Tipo de opción ('call' o 'put').
   * @param {string} expiration - Fecha de expiración (YYYY-MM-DD).
   * @param {number} targetDelta - Sensibilidad delta objetivo (valor absoluto).
   * @param {number} spot - Precio spot actual del subyacente.
   * @returns {object} Cotización seleccionada.
   */
  function byDelta(quotes, type, expiration, targetDelta, spot) {
    const quotesWithDelta = quotes.filter((quote) => quote.type === type && quote.expiration === expiration && quote.delta != null);
    if (quotesWithDelta.length) return closest(quotesWithDelta, (quote) => Math.abs(quote.delta), targetDelta);
    const otmPercentage = (0.5 - targetDelta) / 5; // delta .25 ≈ 5 % fuera del dinero
    const estimatedStrike = spot * (type === 'call' ? 1 + otmPercentage : 1 - otmPercentage);
    return atStrike(quotes, type, expiration, estimatedStrike);
  }

  /**
   * Construye el descriptor de una pierna de estrategia a partir de una cotización y su lado.
   *
   * @param {object} quote - Cotización de la opción seleccionada.
   * @param {'buy'|'sell'} side - Lado de la operación ('buy' o 'sell').
   * @returns {{ symbol: string, side: 'buy'|'sell', ratio_qty: number }}
   */
  const createLeg = (quote, side) => ({ symbol: quote.symbol, side, ratio_qty: 1 });

  const TEMPLATES = {
    'long-straddle': 'Long straddle',
    'short-straddle': 'Short straddle',
    'long-strangle': 'Long strangle',
    'short-strangle': 'Short strangle',
    calendar: 'Calendar (calls)',
    diagonal: 'Diagonal (calls)',
  };

  /**
   * Construye una estrategia preconfigurada seleccionando automáticamente los strikes y contratos según la plantilla.
   *
   * @param {string} template - Identificador de la plantilla ('long-straddle', 'long-strangle', 'calendar', etc.).
   * @param {Array<object>} quotes - Lista completa de cotizaciones de la cadena.
   * @param {number} spot - Precio spot del activo subyacente.
   * @param {string} nearExpiration - Fecha del vencimiento cercano (YYYY-MM-DD).
   * @returns {{ name: string, legs: Array<{ symbol: string, side: string, ratio_qty: number }> }} Estructura de la estrategia armada.
   * @throws {Error} Si faltan vencimientos lejanos válidos o la plantilla no es reconocida.
   */
  function build(template, quotes, spot, nearExpiration) {
    // Vencimiento lejano: el último cuyas calls rodean al spot (el tope de 300 contratos por cadena
    // puede dejar el último vencimiento sin strikes cerca del dinero).
    const coversSpot = (expirationDate) => {
      const strikesForExpiration = quotes
        .filter((quote) => quote.type === 'call' && quote.expiration === expirationDate)
        .map((quote) => quote.strike);
      return (
        strikesForExpiration.length > 0 &&
        Math.min(...strikesForExpiration) <= spot &&
        Math.max(...strikesForExpiration) >= spot
      );
    };
    const farExpiration = [...new Set(quotes.map((quote) => quote.expiration))]
      .sort()
      .filter((expirationDate) => expirationDate > nearExpiration && coversSpot(expirationDate))
      .at(-1);

    const side = template.startsWith('short') ? 'sell' : 'buy';
    switch (template) {
      case 'long-straddle':
      case 'short-straddle': {
        const atmCall = atStrike(quotes, 'call', nearExpiration, spot);
        return {
          name: TEMPLATES[template],
          legs: [createLeg(atmCall, side), createLeg(atStrike(quotes, 'put', nearExpiration, atmCall.strike), side)],
        };
      }
      case 'long-strangle':
      case 'short-strangle':
        return {
          name: TEMPLATES[template],
          legs: [
            createLeg(byDelta(quotes, 'call', nearExpiration, 0.25, spot), side),
            createLeg(byDelta(quotes, 'put', nearExpiration, 0.25, spot), side),
          ],
        };
      case 'calendar':
      case 'diagonal': {
        if (!farExpiration) {
          throw new Error(
            'Calendar y diagonal necesitan un vencimiento posterior con strikes cerca del spot: amplía "Vence hasta" o angosta el rango de strikes e ingesta de nuevo.',
          );
        }
        const longCall = atStrike(quotes, 'call', farExpiration, spot);
        const shortCall =
          template === 'calendar'
            ? atStrike(quotes, 'call', nearExpiration, longCall.strike)
            : byDelta(quotes, 'call', nearExpiration, 0.3, spot);
        return { name: TEMPLATES[template], legs: [createLeg(shortCall, 'sell'), createLeg(longCall, 'buy')] };
      }
      default:
        throw new Error(`Plantilla desconocida: ${template}`);
    }
  }

  root.F0Templates = { TEMPLATES, build };
})(globalThis);
