// Plantillas de estrategias: eligen las piernas de una cadena ya ingestada (GET /option-chains/{id}).
// Script clásico: el front lo usa como window.F0Templates y las pruebas lo importan desde Node.
(function (root) {
  const closest = (candidates, metricSelector, targetValue) =>
    candidates.reduce((best, current) =>
      Math.abs(metricSelector(current) - targetValue) < Math.abs(metricSelector(best) - targetValue) ? current : best,
    );

  // Contrato del tipo y vencimiento dados con el strike más cercano a `targetStrike`.
  function atStrike(quotes, type, expiration, targetStrike) {
    const matchingQuotes = quotes.filter((quote) => quote.type === type && quote.expiration === expiration);
    if (!matchingQuotes.length) throw new Error(`La cadena no tiene ${type}s que venzan el ${expiration}`);
    return closest(matchingQuotes, (quote) => quote.strike, targetStrike);
  }

  // OTM por delta (|delta| ≈ objetivo); si Alpaca no trajo griegas, por distancia al spot.
  function byDelta(quotes, type, expiration, targetDelta, spot) {
    const quotesWithDelta = quotes.filter((quote) => quote.type === type && quote.expiration === expiration && quote.delta != null);
    if (quotesWithDelta.length) return closest(quotesWithDelta, (quote) => Math.abs(quote.delta), targetDelta);
    const otmPercentage = (0.5 - targetDelta) / 5; // delta .25 ≈ 5 % fuera del dinero
    const estimatedStrike = spot * (type === 'call' ? 1 + otmPercentage : 1 - otmPercentage);
    return atStrike(quotes, type, expiration, estimatedStrike);
  }

  const createLeg = (quote, side) => ({ symbol: quote.symbol, side, ratio_qty: 1 });

  const TEMPLATES = {
    'long-straddle': 'Long straddle',
    'short-straddle': 'Short straddle',
    'long-strangle': 'Long strangle',
    'short-strangle': 'Short strangle',
    calendar: 'Calendar (calls)',
    diagonal: 'Diagonal (calls)',
  };

  /** Regresa { name, legs } para la plantilla, usando `nearExpiration` como vencimiento cercano. */
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
