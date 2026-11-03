// Plantillas de estrategias: eligen las piernas de una cadena ya ingestada (GET /option-chains/{id}).
// Script clásico: el front lo usa como window.F0Templates y las pruebas lo importan desde Node.
(function (root) {
  const closest = (rows, f, target) => rows.reduce((a, b) => (Math.abs(f(b) - target) < Math.abs(f(a) - target) ? b : a));

  // Contrato del tipo y vencimiento dados con el strike más cercano a `strike`.
  function atStrike(quotes, type, exp, strike) {
    const rows = quotes.filter((q) => q.type === type && q.expiration === exp);
    if (!rows.length) throw new Error(`La cadena no tiene ${type}s que venzan el ${exp}`);
    return closest(rows, (q) => q.strike, strike);
  }

  // OTM por delta (|delta| ≈ objetivo); si Alpaca no trajo griegas, por distancia al spot.
  function byDelta(quotes, type, exp, delta, spot) {
    const rows = quotes.filter((q) => q.type === type && q.expiration === exp && q.delta != null);
    if (rows.length) return closest(rows, (q) => Math.abs(q.delta), delta);
    const pct = (0.5 - delta) / 5; // delta .25 ≈ 5 % fuera del dinero
    return atStrike(quotes, type, exp, spot * (type === 'call' ? 1 + pct : 1 - pct));
  }

  const leg = (q, side) => ({ symbol: q.symbol, side, ratio_qty: 1 });

  const TEMPLATES = {
    'long-straddle': 'Long straddle',
    'short-straddle': 'Short straddle',
    'long-strangle': 'Long strangle',
    'short-strangle': 'Short strangle',
    calendar: 'Calendar (calls)',
    diagonal: 'Diagonal (calls)',
  };

  /** Regresa { name, legs } para la plantilla, usando `exp` como vencimiento cercano. */
  function build(template, quotes, spot, exp) {
    // Vencimiento lejano: el último cuyas calls rodean al spot (el tope de 300 contratos por cadena
    // puede dejar el último vencimiento sin strikes cerca del dinero).
    const covers = (e) => {
      const k = quotes.filter((q) => q.type === 'call' && q.expiration === e).map((q) => q.strike);
      return k.length && Math.min(...k) <= spot && Math.max(...k) >= spot;
    };
    const far = [...new Set(quotes.map((q) => q.expiration))].sort().filter((e) => e > exp && covers(e)).at(-1);
    const side = template.startsWith('short') ? 'sell' : 'buy';
    switch (template) {
      case 'long-straddle':
      case 'short-straddle': {
        const call = atStrike(quotes, 'call', exp, spot);
        return { name: TEMPLATES[template], legs: [leg(call, side), leg(atStrike(quotes, 'put', exp, call.strike), side)] };
      }
      case 'long-strangle':
      case 'short-strangle':
        return { name: TEMPLATES[template], legs: [leg(byDelta(quotes, 'call', exp, 0.25, spot), side), leg(byDelta(quotes, 'put', exp, 0.25, spot), side)] };
      case 'calendar':
      case 'diagonal': {
        if (!far) throw new Error('Calendar y diagonal necesitan un vencimiento posterior con strikes cerca del spot: amplía "Vence hasta" o angosta el rango de strikes e ingesta de nuevo.');
        const longCall = atStrike(quotes, 'call', far, spot);
        const shortCall = template === 'calendar' ? atStrike(quotes, 'call', exp, longCall.strike) : byDelta(quotes, 'call', exp, 0.3, spot);
        return { name: TEMPLATES[template], legs: [leg(shortCall, 'sell'), leg(longCall, 'buy')] };
      }
      default:
        throw new Error(`Plantilla desconocida: ${template}`);
    }
  }

  root.F0Templates = { TEMPLATES, build };
})(globalThis);
