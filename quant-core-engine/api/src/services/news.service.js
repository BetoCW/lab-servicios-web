import { alpaca } from '../lib/alpaca.js';
import { HttpError } from '../lib/errors.js';
import { clamp } from '../lib/scoring.js';

const DAY = 86400000;
const TTL = 10 * 60 * 1000;
// Reglas sobre titulares en inglés del proveedor; no es comprensión semántica ni predicción.
const POSITIVE = /\b(upgrades?|raises? (?:guidance|outlook|price target)|beats? (?:estimates|expectations)|record (?:revenue|profit)|approval|approved|buybacks?|buy rating|growing demand|surges?|rall(?:y|ies))\b/gi;
const NEGATIVE = /\b(downgrades?|cuts? (?:guidance|outlook|price target)|miss(?:es|ed)? (?:estimates|expectations)|lawsuits?|probes?|investigations?|fraud|bankruptcy|recalls?|plunges?|slashes?|shares decline|shares fall)\b/gi;
const EVENTS = /\b(earnings|results|guidance|outlook|mergers?|acquisitions?|takeovers?|lawsuits?|probes?|investigations?|fda|approvals?|bankruptcy|recalls?)\b/i;

const safeUrl = (raw) => {
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

export function analyzeNews(symbol, items, now = Date.now()) {
  const seen = new Set();
  const articles = [];
  for (const item of items) {
    const headline = String(item.headline ?? '').trim();
    const published = Date.parse(item.created_at);
    if (!headline || !Number.isFinite(published) || published > now || now - published > 7 * DAY) continue;
    const symbols = Array.isArray(item.symbols) ? item.symbols : [];
    if (!symbols.includes(symbol)) continue;
    const key = headline.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const positive = (headline.match(POSITIVE) ?? []).length;
    const negative = (headline.match(NEGATIVE) ?? []).length;
    const sentiment = positive + negative ? (positive - negative) / (positive + negative) : 0;
    const event = EVENTS.test(headline);
    const weight = Math.exp(-(now - published) / (2 * DAY)) / Math.sqrt(symbols.length);
    articles.push({ headline, url: safeUrl(item.url), source: String(item.source ?? 'Alpaca'),
      publishedAt: new Date(published).toISOString(), sentiment, event, weight });
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const total = articles.reduce((sum, a) => sum + a.weight, 0);
  const weighted = (fn) => total ? articles.reduce((sum, a) => sum + fn(a) * a.weight, 0) / total : 0;
  const sentiment = weighted((a) => a.sentiment);
  const eventPressure = weighted((a) => Number(a.event));
  const confidence = clamp(total / 3);
  return { symbol, status: articles.length ? 'ok' : 'no-news', asOf: new Date(now).toISOString(),
    lookbackDays: 7, sentiment, eventPressure, confidence, articleCount: articles.length, articles,
    method: 'Reglas de titulares en inglés; recencia con decaimiento de 2 días y menor peso para noticias de muchas empresas. No es un calendario de eventos ni modifica el Monte Carlo.',
    summary: articles.length
      ? `${articles.length} titulares: sentimiento ${sentiment > 0.15 ? 'positivo' : sentiment < -0.15 ? 'negativo' : 'neutral o mixto'}; ${articles.filter((a) => a.event).length} mencionan eventos. Confianza de cobertura ${Math.round(confidence * 100)} %.`
      : 'Sin titulares relevantes en los últimos 7 días: aporte neutral (50/100), sin evidencia de noticias.' };
}

export function newsFit(news, template) {
  // La mención de eventos penaliza ventas de volatilidad; no se interpreta como ganancia esperada.
  let adjustment = 0;
  if (template.startsWith('short-')) adjustment = -0.4 * news.eventPressure;
  if (template === 'calendar') adjustment = -0.2 * news.eventPressure;
  if (template === 'diagonal') adjustment = 0.3 * news.sentiment - 0.2 * news.eventPressure;
  // Compras de volatilidad quedan neutrales: un evento por sí solo no demuestra prima barata.
  const score = clamp(0.5 + news.confidence * adjustment);
  return { score, reason: `${news.summary} Encaje de noticias: ${(score * 100).toFixed(1)}/100. Las menciones de eventos penalizan ventas de volatilidad y calendars; el sentimiento orienta diagonales de calls. Comprar volatilidad permanece neutral.` };
}

export function createNewsService({ fetchNews = (query) => alpaca.news(query), now = () => Date.now() } = {}) {
  const cache = new Map();
  return {
    async analyze(symbol) {
      const time = now();
      const cached = cache.get(symbol);
      if (cached && cached.until > time) return cached.value;
      let page;
      try {
        page = await fetchNews({ symbols: symbol, start: new Date(time - 7 * DAY).toISOString(),
          limit: 50, sort: 'desc', include_content: false });
        if (!Array.isArray(page?.news)) throw new Error('respuesta sin lista de noticias');
      } catch {
        throw new HttpError(503, 'Core Noticias no disponible: no se pudo consultar Alpaca. Revisa acceso al feed o desmarca Noticias para continuar.');
      }
      const value = analyzeNews(symbol, page.news, time);
      value.truncated = Boolean(page.next_page_token);
      if (value.truncated) value.summary += ' Muestra limitada a los 50 titulares más recientes del proveedor.';
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(symbol, { until: time + TTL, value });
      return value;
    },
  };
}

export const newsService = createNewsService();
