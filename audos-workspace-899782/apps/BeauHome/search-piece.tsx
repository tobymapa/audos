/**
 * Search-to-log (Pass Forty-Five; rebuilt Pass Forty-Six) — the SECOND way
 * into the wardrobe, alongside "Photograph a piece": look a piece up online
 * instead of photographing it.
 *
 * Pass Forty-Six behaviour:
 *  - ONE input, two modes. Anything starting http:// or https:// is a DIRECT
 *    URL FETCH — the results list is skipped and Beau auto-fills the details
 *    straight from the product page (name, brand, category, colour, material,
 *    price) behind a brief "Fetching details…" skeleton. Anything else is a
 *    KEYWORD search across product name and brand.
 *  - Live search: keyword queries fire 300ms after the user stops typing
 *    (never per keystroke), minimum 2 characters. Results for a query are
 *    cached in session memory — retyping the same query returns instantly
 *    with no network call.
 *  - Fuzzy matching: typos and partial names still surface the right results
 *    ("broks borthers blazer" → Brooks Brothers blazer) — the structuring
 *    model corrects spelling, and a local bigram similarity ranks the rows.
 *  - The confirmation card gains a currency selector inline next to the
 *    price field (GBP default), and free-typed text fields auto-uppercase
 *    when focus leaves them and again on save.
 *  - Optimistic save: the new piece appears in the wardrobe immediately on
 *    the Save tap (faint row while the write is in flight); a failed save
 *    removes the row and shows an inline error.
 *
 * Pass Forty-Six B — smart images, naming and source links:
 *  - Best-image sourcing: the retailer's page photo is no longer the default.
 *    Once the piece is identified, an image search on "{brand} {name}" hunts
 *    for the cleanest available shot (editorial / lookbook / clean product
 *    photography); the page's og:image is only the fallback. The upgrade is
 *    non-blocking — the card shows immediately and the image swaps in place.
 *  - Standard names: Beau translates the brand's proprietary product name
 *    ("The Andover Button-Down in Vintage Oxford Cloth") into the standard
 *    menswear term ("OCBD") and pre-fills the name field with it; the
 *    original brand name stays visible as a subtle Lora 12px note below the
 *    field. The suggestion is freely editable — never forced.
 *  - Source links: the product page URL is stored (piece_sources) and shown
 *    in the piece detail view as "View source" / "See on {retailer}" with a
 *    "Change" affordance. Photo-logged pieces carry no link.
 *
 * Warm Editorial rules apply: paper panel, hairline rows, no cards, no
 * shadows; "No results" is a plain inline Lora line — never a modal.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  COLOR_OPTIONS,
  CURRENCY_SELECT_OPTIONS,
  MATERIAL_CHOICES,
  OCCASION_TAGS,
  PATTERN_OPTIONS,
  SEASON_OPTIONS,
  WARDROBE_CATEGORIES,
  categorizeItem,
  categoryById,
  defaultOccasions,
  defaultSeasons,
  extractColors,
  findLikelyDuplicate,
  generatePieceName,
  getCurrency,
  insertPieces,
  matchColorOption,
  matchMaterialChoice,
  matchPatternOption,
  savePrefs,
  setActiveCurrency,
  setPieceValue,
  slotLabel as canonicalSlotLabel,
  type NewPiece,
  type WardrobePiece,
} from './profile-data';
import { enrichPiece } from './beau-enrichment';
import { BrandField, ColorSelector, MaterialSelector, PatternSelector, SizeSelector } from './input-fields';
import { CanonicalGarment } from './canonical-garment';
import { queueWardrobeReassessment } from './reassess-queue';
import {
  attachPreparedProductPhoto,
  prepareProductPhoto,
  type PreparedProductPhoto,
} from './photo-enhance';
import { preferredProductSourceUrl } from './flat-lay-sourcing';
import { fetchFeedPhoto } from './wardrobe-ai';
import { fetchProductImage } from './og-image';
import { SearchResultsSkeleton, ShimmerDefs, Skeleton } from './skeleton';

// ---------------------------------------------------------------------------
// Search — web results structured into products via the OpenAI proxy
// ---------------------------------------------------------------------------

export interface ProductSearchResult {
  name: string;
  /** Beau's standardised menswear term for the piece, e.g. "OCBD", "Chore Coat" — '' when none fits. */
  standardName: string;
  brand: string;
  /** Display price as found, e.g. "\u00a3249" — '' when the results don't show one. */
  price: string;
  category: string;
  slot: string | null;
  colors: string[];
  pattern: string | null;
  material: string | null;
  /** Product page URL from the search results — '' when none. */
  link: string;
  /** Stock-photo phrase for the thumbnail fallback. */
  photoQuery: string;
}

const CATEGORY_IDS = WARDROBE_CATEGORIES.map((c) => c.id);
const SLOT_LINES = WARDROBE_CATEGORIES.map(
  (c) => `${c.id}: ${c.slots.map((s) => s.id).join(', ') || '(no canonical slots)'}`,
).join('\n');

const SEARCH_SYSTEM = `You are Beau, the search-to-log assistant for Ethaion, a classic menswear wardrobe app. The user typed a product search (a brand name, an item name, or both) because they OWN this piece and want to log it. The query may contain TYPOS or partial names — silently correct obvious misspellings of real brands and garments (e.g. "broks borthers blazer" means "Brooks Brothers blazer") and search for what they meant. Using the WEB SEARCH RESULTS provided, identify the most plausible matching menswear products.

Respond ONLY with strict JSON (no markdown): {"results": [...]} — 3 to 6 DISTINCT products, best match first. Each:
{
  "name": string,        // clean product name, e.g. "Bedale Waxed Jacket" — no site chrome, no "| Brand | Menswear" suffixes
  "standardName": string, // the piece translated into the clean STANDARD menswear term a stylist would file it under — e.g. "OCBD", "Merino Rollneck", "Chore Coat", "Chelsea Boot", "Waxed Jacket". Short and generic — NEVER the brand's proprietary marketing name; "" only when no standard term fits
  "brand": string,       // maker, correctly spelled + capitalised; "" if genuinely unknown
  "price": string,       // as shown in the results, e.g. "\u00a3249"; prefix "~" if approximate; "" when the results show none
  "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
  "slot": string|null,   // best canonical slot id from:\n${SLOT_LINES}
  "colors": string[],    // up to 3, ONLY from this palette: ${COLOR_OPTIONS.join(', ')}. [] if unknown
  "pattern": string|null, // ONLY from: ${PATTERN_OPTIONS.map((p) => p.id).join(', ')} — null if unknown
  "material": string|null, // ONLY from: ${MATERIAL_CHOICES.join(', ')} — null if unknown
  "link": string,        // a product-page URL that APPEARS in the search results, else ""
  "photoQuery": string   // stock-photo phrase for a representative product photo, e.g. "olive waxed cotton jacket menswear"
}

Rules: ground names, prices and links in the search results wherever possible; when the results are thin, fall back to well-known REAL menswear products matching the query — with link "" and approximate "~" prices — never invented URLs. One entry per distinct product (not one per retailer). Menswear capitalisation conventions (OCBD, M-65). If the query cannot be a garment or accessory at all, return {"results": []}.`;

const URL_SYSTEM = `You are Beau, the search-to-log assistant for Ethaion, a classic menswear wardrobe app. The user pasted a PRODUCT PAGE URL because they OWN this piece and want to log it. Using the URL itself (the path/slug usually names the product) and the WEB SEARCH RESULTS for that page, extract the ONE product it sells.

Respond ONLY with strict JSON (no markdown): {"results": [ { ...exactly one entry... } ]} with the entry shaped:
{
  "name": string,        // clean product name from the page, e.g. "Bedale Waxed Jacket"
  "standardName": string, // the piece translated into the clean STANDARD menswear term a stylist would file it under — e.g. "OCBD", "Merino Rollneck", "Chore Coat", "Chelsea Boot", "Waxed Jacket". Short and generic — NEVER the brand's proprietary marketing name; "" only when no standard term fits
  "brand": string,       // maker, correctly spelled + capitalised; "" if genuinely unknown
  "price": string,       // from the results, e.g. "\u00a3249"; prefix "~" if approximate; "" when unknown
  "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
  "slot": string|null,   // best canonical slot id from:\n${SLOT_LINES}
  "colors": string[],    // up to 3, ONLY from this palette: ${COLOR_OPTIONS.join(', ')}. [] if unknown
  "pattern": string|null, // ONLY from: ${PATTERN_OPTIONS.map((p) => p.id).join(', ')} — null if unknown
  "material": string|null, // ONLY from: ${MATERIAL_CHOICES.join(', ')} — null if unknown
  "link": string,        // the pasted URL, exactly as given
  "photoQuery": string   // stock-photo phrase for a representative product photo
}

Rules: never invent a different product than the page names; when the search results are empty, read the product from the URL slug alone. JSON only.`;

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function searchWeb(query: string): Promise<Array<{ title: string; link: string; snippet: string }>> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, searchType: 'web', num: 8 }),
    });
    const data = await res.json();
    if (!data.success) return [];
    return (data.results || []) as Array<{ title: string; link: string; snippet: string }>;
  } catch {
    return [];
  }
}

function sanitizeResult(raw: any, query: string): ProductSearchResult | null {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  let category = typeof raw?.category === 'string' ? raw.category.toLowerCase().trim() : '';
  if (!CATEGORY_IDS.includes(category)) category = categorizeItem(name).category || 'other';
  let slot = typeof raw?.slot === 'string' ? raw.slot.toLowerCase().trim() : null;
  const cat = WARDROBE_CATEGORIES.find((c) => c.id === category);
  if (slot && (!cat || !cat.slots.some((s) => s.id === slot))) {
    const guess = categorizeItem(name);
    slot = guess.category === category ? guess.slot : null;
  }
  const colors = Array.from(
    new Set(
      (Array.isArray(raw?.colors) ? raw.colors : [])
        .filter((c: unknown) => typeof c === 'string')
        .map((c: string) => matchColorOption(c))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 3);
  const rawPattern = typeof raw?.pattern === 'string' ? raw.pattern.trim() : '';
  const rawMaterial = typeof raw?.material === 'string' ? raw.material.trim() : '';
  const link = typeof raw?.link === 'string' && /^https?:\/\//i.test(raw.link.trim()) ? raw.link.trim() : '';
  return {
    name,
    standardName: typeof raw?.standardName === 'string' ? raw.standardName.trim() : '',
    brand: typeof raw?.brand === 'string' ? raw.brand.trim() : '',
    price: typeof raw?.price === 'string' ? raw.price.trim() : '',
    category,
    slot: slot || null,
    colors,
    pattern: rawPattern ? matchPatternOption(rawPattern) : null,
    material: rawMaterial ? matchMaterialChoice(rawMaterial) || rawMaterial : null,
    link,
    photoQuery: typeof raw?.photoQuery === 'string' && raw.photoQuery.trim() ? raw.photoQuery.trim() : `${query} menswear product`,
  };
}

/** No-LLM fallback: shape the raw search hits into plausible result rows. */
function resultsFromHits(
  hits: Array<{ title: string; link: string; snippet: string }>,
  query: string,
): ProductSearchResult[] {
  const out: ProductSearchResult[] = [];
  for (const hit of hits.slice(0, 5)) {
    const name = (hit.title || '').split(/\s*[|\u2013\u2014\u00b7]\s*/)[0].trim();
    if (!name) continue;
    const { category, slot } = categorizeItem(name);
    const priceMatch = `${hit.title} ${hit.snippet}`.match(/[\u00a3$\u20ac\u00a5]\s?\d[\d,.]*/);
    out.push({
      name,
      standardName: '',
      brand: '',
      price: priceMatch ? priceMatch[0].replace(/\s+/g, '') : '',
      category: category || 'other',
      slot,
      colors: extractColors(name),
      pattern: null,
      material: null,
      link: hit.link || '',
      photoQuery: `${query} menswear product`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fuzzy matching (Pass Forty-Six) — a dependency-free bigram Dice similarity
// (the same principle Fuse.js scores by). Used to RANK result rows against
// the typed query across product name + brand, so typos and partial names
// still float the right products to the top.
// ---------------------------------------------------------------------------

function bigrams(s: string): Set<string> {
  const clean = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const out = new Set<string>();
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (w.length === 1) out.add(w);
    for (let i = 0; i < w.length - 1; i += 1) out.add(w.slice(i, i + 2));
  }
  return out;
}

/** 0..1 similarity between the query and a candidate string — typo-tolerant. */
export function fuzzyScore(query: string, candidate: string): number {
  const a = bigrams(query);
  const b = bigrams(candidate);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const g of a) if (b.has(g)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function rankResults(query: string, results: ProductSearchResult[]): ProductSearchResult[] {
  return results
    .map((r, i) => ({ r, i, score: fuzzyScore(query, `${r.brand} ${r.name}`) }))
    .sort((x, y) => (y.score - x.score) || (x.i - y.i))
    .map((x) => x.r);
}

// ---------------------------------------------------------------------------
// Persistent cache (Pass Fifty — was session-only in Pass Forty-Six):
// memory + localStorage per normalised query, with a TTL envelope so stale
// product data ages out. Retyping the same search returns instantly with no
// network call — across page loads and sessions, not just within one.
// ---------------------------------------------------------------------------

/** {v: value, t: writtenAt} envelope in localStorage; expired keys are
 * removed on read. ANY storage failure degrades to the in-memory map. */
function readPersistentCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== 'number' || Date.now() - parsed.t > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.v as T;
  } catch {
    return null;
  }
}

function writePersistentCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now() }));
  } catch { /* storage unavailable/full — the memory cache still holds it */ }
}

const SEARCH_CACHE_PREFIX = 'brummell_piece_search_';
/** Search results age out after a week — prices and stock move. */
const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const searchMemory = new Map<string, ProductSearchResult[]>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readSearchCache(query: string): ProductSearchResult[] | null {
  const key = cacheKey(query);
  if (searchMemory.has(key)) return searchMemory.get(key) as ProductSearchResult[];
  const stored = readPersistentCache<ProductSearchResult[]>(SEARCH_CACHE_PREFIX + key, SEARCH_CACHE_TTL_MS);
  if (!Array.isArray(stored)) return null;
  searchMemory.set(key, stored);
  return stored;
}

function writeSearchCache(query: string, results: ProductSearchResult[]): void {
  const key = cacheKey(query);
  searchMemory.set(key, results);
  writePersistentCache(SEARCH_CACHE_PREFIX + key, results);
}

/** True when the input should be treated as a direct product-page fetch. */
export function isUrlQuery(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

/**
 * Run one product search end-to-end: web search → LLM structuring, with the
 * raw-hits fallback so a model hiccup never dead-ends the flow. Returns []
 * when nothing plausible was found — the caller shows the inline no-results
 * line. Results are fuzzy-ranked against the query and session-cached.
 */
export async function searchForPiece(query: string): Promise<ProductSearchResult[]> {
  const cached = readSearchCache(query);
  if (cached) return cached;
  const cur = getCurrency();
  const hits = await searchWeb(`${query} menswear buy price`);
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SEARCH_SYSTEM },
          {
            role: 'user',
            content: [
              `SEARCH QUERY: ${query}`,
              `Quote prices in ${cur.id} (${cur.symbol.trim()}) where the results allow.`,
              hits.length > 0
                ? `WEB SEARCH RESULTS:\n${hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.link}`).join('\n\n')}`
                : 'WEB SEARCH RESULTS: none available — fall back to well-known real menswear products matching the query (link "", approximate prices).',
            ].join('\n\n'),
          },
        ],
        max_tokens: 1400,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`search structuring failed: ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    const rawResults: any[] = Array.isArray(parsed?.results) ? parsed.results : [];
    const results = rawResults.map((r) => sanitizeResult(r, query)).filter(Boolean) as ProductSearchResult[];
    if (results.length > 0) {
      const ranked = rankResults(query, results.slice(0, 6));
      writeSearchCache(query, ranked);
      return ranked;
    }
    // The model came back empty — trust it only when the web was empty too.
    const fallback = hits.length > 0 ? rankResults(query, resultsFromHits(hits, query)) : [];
    writeSearchCache(query, fallback);
    return fallback;
  } catch (e) {
    console.warn('[Ethaion] search-to-log structuring failed — using raw hits:', e);
    return rankResults(query, resultsFromHits(hits, query));
  }
}

/** Derive a readable product guess from a URL slug — the no-LLM fallback. */
function resultFromUrlSlug(url: string): ProductSearchResult | null {
  try {
    const path = new URL(url).pathname;
    const segment = path.split('/').filter(Boolean).pop() || '';
    const words = segment
      .replace(/\.(html?|php|aspx?)$/i, '')
      .split(/[-_+]/)
      .filter((w) => w && !/^\d+$/.test(w))
      .join(' ')
      .trim();
    if (!words) return null;
    const name = words.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const { category, slot } = categorizeItem(name);
    return {
      name,
      standardName: '',
      brand: '',
      price: '',
      category: category || 'other',
      slot,
      colors: extractColors(name),
      pattern: null,
      material: null,
      link: url,
      photoQuery: `${name} menswear product`,
    };
  } catch {
    return null;
  }
}

/**
 * Direct URL fetch (Pass Forty-Six): the user pasted a product link — skip
 * the results list and auto-fill the confirmation card from the page itself
 * (search snippets for the URL + the slug), with the page's own og:image as
 * the photo. Returns null only when nothing at all can be read.
 */
export async function fetchPieceFromUrl(
  url: string,
): Promise<{ result: ProductSearchResult; imageUrl: string } | null> {
  const clean = url.trim();
  // Phase 1 is one fast text extraction from the URL/domain/slug. Do not
  // serialize a separate web lookup in front of it, and never make the form
  // wait for og:image or image search; phase 2 starts after these fields land.
  const hits: Array<{ title: string; link: string; snippet: string }> = [];
  const cur = getCurrency();
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: URL_SYSTEM },
          {
            role: 'user',
            content: [
              `PRODUCT PAGE URL: ${clean}`,
              `Use the domain as a brand/retailer clue and the path slug as the product-name clue.`,
              `Quote the price in ${cur.id} (${cur.symbol.trim()}) where the URL allows.`, 
              hits.length > 0
                ? `WEB SEARCH RESULTS FOR THIS PAGE:\n${hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.link}`).join('\n\n')}`
                : 'WEB SEARCH RESULTS: none available — read the product from the URL slug alone.',
            ].join('\n\n'),
          },
        ],
        max_tokens: 700,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`url structuring failed: ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    const raw = Array.isArray(parsed?.results) ? parsed.results[0] : parsed;
    const result = raw ? sanitizeResult(raw, clean) : null;
    if (result) return { result: { ...result, link: clean }, imageUrl: '' };
  } catch (e) {
    console.warn('[Ethaion] URL auto-fill structuring failed — using the slug:', e);
  }
  const slugResult = resultFromUrlSlug(clean);
  return slugResult ? { result: slugResult, imageUrl: '' } : null;
}

// ---------------------------------------------------------------------------
// Best-image sourcing (Pass Forty-Six B; ranked tiers in Pass Forty-Eight) —
// the source URL tells us WHAT the piece is; the cleanest VISUAL of it is
// hunted separately. Two parallel image searches on the product identity
// (one flat-lay-focused, one general product photography) feed a scoring
// pass that ranks every candidate by the sourcing priority:
//   1. official flat-lay / packshot product shot (item laid flat, no person)
//   2. product shot on a mannequin / ghost mannequin
//   3. editorial or lookbook shot (clean composition)
//   4. model shot (last resort — heavily penalised)
// The retailer page's og:image is only the final fallback. The goal is the
// version of the image where NO person is present — whatever survives still
// runs through Photoroom + the #fbf8f1 canonical paper card on save, so the
// stored record is the garment alone. Results are cached per piece (memory
// + sessionStorage).
// ---------------------------------------------------------------------------

const BEST_IMAGE_CACHE_PREFIX = 'brummell_best_img_';
/** Resolved product-image URLs are stable — cached for 30 days (Pass
 * Fifty: persistent localStorage, was session-only). */
const BEST_IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const bestImageMemory = new Map<string, string>();

function bestImageKey(name: string, brand: string): string {
  return `${brand} ${name}`.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Hosts whose images are typically cluttered, watermarked or hotlink-blocked. */
const IMAGE_HOST_BLOCKLIST = /pinterest\.|pinimg\.|instagram\.|cdninstagram\.|facebook\.|fbcdn\.|tiktok\.|twitter\.|twimg\.|x\.com|reddit\.|redd\.it|ebayimg\.|etsystatic\.|ytimg\.|wikimedia\./i;

/** Pull a usable image URL out of one image-search hit, whatever its shape. */
function imageCandidateFrom(hit: any): string {
  for (const field of ['original', 'imageUrl', 'image', 'thumbnail', 'link']) {
    const value = hit?.[field];
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) continue;
    // A bare page link only counts when it is itself an image file.
    if (field === 'link' && !/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(value)) continue;
    return value.trim();
  }
  return '';
}

/**
 * Rank one image-search hit by the Pass Forty-Eight sourcing priority,
 * reading the signals available without loading the image: title, snippet,
 * source page and the image URL itself. Higher = cleaner representation of
 * the garment (flat-lay → mannequin → editorial → model shot last).
 */
function scoreImageHit(hit: any, candidateUrl: string): number {
  const text = `${hit?.title || ''} ${hit?.snippet || ''} ${hit?.source || ''} ${hit?.link || ''} ${candidateUrl}`.toLowerCase();
  let score = 0;
  // Tier 1 — flat-lay / packshot / cut-out product photography: no person.
  if (/flat[\s_-]?lay|laydown|lay[\s_-]?down|packshot|pack[\s_-]?shot|cut[\s_-]?out|cutout|still[\s_-]?life|product[\s_-]?shot|off[\s_-]?figure|off[\s_-]?model/.test(text)) score += 40;
  // Tier 2 — mannequin / ghost-mannequin product shots: no person either.
  if (/ghost[\s_-]?mannequin|invisible[\s_-]?mannequin|mannequin|dress[\s_-]?form|bust[\s_-]?form/.test(text)) score += 24;
  // Clean-background and catalogue hints.
  if (/white[\s_-]?background|plain[\s_-]?background|studio[\s_-]?shot|\bstudio\b/.test(text)) score += 10;
  if (/\bproduct\b|\bcatalog(?:ue)?\b/.test(text)) score += 8;
  // Retailer product-image CDNs carry the official catalogue assets.
  if (/scene7|demandware|shopify|cloudfront|bigcommerce|cdn\.|\/cdn\//.test(candidateUrl.toLowerCase())) score += 6;
  // Tier 3 — editorial / lookbook reads as neutral (no bonus, no penalty).
  // Tier 4 — a person in the shot: heavy penalty, used only as last resort.
  if (/\bmodel\b|\bwearing\b|worn[\s_-]?by|on[\s_-]?model|on[\s_-]?body|street[\s_-]?style|outfit[\s_-]?ideas|how[\s_-]?to[\s_-]?wear|man[\s_-]?wearing|men[\s_-]?wearing|\bcampaign\b/.test(text)) score -= 30;
  return score;
}

/**
 * Find the cleanest available image for an identified piece: image search on
 * the product identity first, the source page's og:image as the fallback.
 * Returns '' when nothing usable exists — the caller keeps its placeholder.
 * Non-blocking by design: callers show the card immediately and swap the
 * image in place when this resolves.
 */
export async function findBestProductImage(name: string, brand: string, sourceUrl?: string | null): Promise<string> {
  const key = bestImageKey(name, brand);
  if (!key) return sourceUrl ? fetchProductImage(sourceUrl) : '';
  if (bestImageMemory.has(key)) return bestImageMemory.get(key) as string;
  const stored = readPersistentCache<string>(BEST_IMAGE_CACHE_PREFIX + key, BEST_IMAGE_CACHE_TTL_MS);
  if (typeof stored === 'string') {
    bestImageMemory.set(key, stored);
    if (stored) return stored;
  }
  let best = '';
  try {
    // Two parallel hunts (Pass Forty-Eight): a flat-lay-focused search and a
    // general product-photography search — every candidate from both is
    // scored by the sourcing tiers and the best one wins.
    const searchImages = async (query: string): Promise<any[]> => {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.replace(/\s+/g, ' ').trim(), searchType: 'images', num: 10 }),
      });
      const data = await res.json().catch(() => null);
      return data?.success ? data.results || [] : [];
    };
    const [flatLayHits, productHits] = await Promise.all([
      searchImages(`${brand} ${name} flat lay product shot white background`),
      searchImages(`${brand} ${name} menswear product photo clean background`),
    ]);
    const seen = new Set<string>();
    const scored: Array<{ url: string; score: number }> = [];
    for (const hit of [...flatLayHits, ...productHits]) {
      const candidate = imageCandidateFrom(hit);
      if (!candidate || seen.has(candidate) || IMAGE_HOST_BLOCKLIST.test(candidate)) continue;
      seen.add(candidate);
      scored.push({ url: candidate, score: scoreImageHit(hit, candidate) });
    }
    // THE SHARED PREFERENCE (flat-lay-sourcing): the wording above ranks the
    // framings, but whether a shot actually has a PERSON in it is decided by
    // the one person-detection pass every surface uses — the same call The
    // Fitting's shelves and The Rail's cards make, cached alongside them, so
    // "isolated product shot over on-body photo" is not re-invented here. It
    // reads the top of our own ranking; a shot with nobody in it wins, and if
    // nothing can be read the wording's own winner stands.
    const ranked = scored.sort((a, b) => b.score - a.score).map((entry) => entry.url);
    best = await preferredProductSourceUrl(ranked.slice(0, 3)).catch(() => ranked[0] || '');
    if (!best) best = ranked[0] || '';
  } catch (e) {
    console.warn('[Ethaion] best-image search failed — falling back to the page image:', e);
  }
  // Fallback: the source site's own product image (og:image), per the spec —
  // "if no cleaner image is available, fall back to the source site's image".
  if (!best && sourceUrl) best = await fetchProductImage(sourceUrl);
  bestImageMemory.set(key, best);
  writePersistentCache(BEST_IMAGE_CACHE_PREFIX + key, best);
  return best;
}

// ---------------------------------------------------------------------------
// Result thumbnail — the cleanest searched image first (Pass Forty-Six B),
// then the product's own og:image, then a stock photo — always shown
// object-contain on a neutral --paper matte with a hairline border (never
// busy retail-page chrome, never a broken-image icon).
// ---------------------------------------------------------------------------

function ResultThumb({
  cacheId,
  result,
  onResolved,
}: {
  cacheId: string;
  result: ProductSearchResult;
  onResolved: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void (async () => {
      // Cleanest searched image first (editorial / lookbook / clean product
      // shot); findBestProductImage falls back to the page's og:image itself.
      const best = await findBestProductImage(result.name, result.brand, result.link || null);
      if (cancelled) return;
      if (best) {
        setUrl(best);
        onResolved(best);
        return;
      }
      const u = await fetchFeedPhoto(cacheId, result.photoQuery);
      if (cancelled) return;
      if (u) {
        setUrl(u);
        onResolved(u);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheId, result.link, result.photoQuery]);

  return (
    <span
      className="block flex-shrink-0 overflow-hidden"
      style={{
        width: '56px',
        height: '70px',
        background: '#fbf8f1',
        border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
        padding: '3px',
      }}
      aria-hidden="true"
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          width={50}
          height={64}
          className="w-full h-full object-contain"
          style={{ background: '#fbf8f1' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="w-full h-full flex items-center justify-center">
          {failed ? (
            <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '13px', color: 'var(--color-neutral-500,#a68e70)' }}>—</span>
          ) : (
            /* Shimmer while the image resolves — never a generic spinner */
            <>
              <ShimmerDefs />
              <Skeleton className="w-full h-full" />
            </>
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The flow — search input → hairline result rows (or direct URL auto-fill)
// → the SAME editable confirmation card as the photo flow → save
// ---------------------------------------------------------------------------

interface SearchDraft {
  category: string;
  slot: string | null;
  colors: string[];
  pattern: string;
  material: string;
  size: string;
  brand: string;
  seasons: string[];
  occasions: string[];
  name: string;
  nameIsCustom: boolean;
  /** The brand's own product name (Pass Forty-Six B) — shown as the subtle
   * "Brand name: …" note under the field when Beau pre-fills the standard
   * menswear term instead. */
  brandProductName: string;
  /** The product page URL this piece came from — stored in piece_sources on
   * save so the detail view can link back. '' when none. */
  link: string;
  /** Display price string, editable — parsed into piece_value on save. */
  price: string;
  /** Resolved product image — becomes the piece's photo when present. */
  imageUrl: string;
}

function parsePrice(raw: string): number | null {
  const m = (raw || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Uppercase a free-typed field value — applied on blur and again on save. */
function upper(raw: string): string {
  return raw.toUpperCase();
}

export function SearchPieceFlow({
  pieces,
  onAdded,
  focusToken = 0,
  initialQuery = '',
}: {
  pieces: WardrobePiece[];
  onAdded: () => void;
  /** Bumped by the header's [ Search ] button — the input focuses at once,
   * ready to type into. No sub-box, no second click. */
  focusToken?: number;
  /** Seeds the search box — the Index's "Log one I own" carries the type
   * name here. Only lands when it changes; it never overwrites what the
   * user is typing mid-flow. */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);
  useEffect(() => {
    searchInputRef.current?.focus();
  }, [focusToken]);
  const [searching, setSearching] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  /** null = not searched yet; [] = searched, nothing found. */
  const [results, setResults] = useState<ProductSearchResult[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState<SearchDraft | null>(null);
  const [imagePending, setImagePending] = useState(false);
  const imagePipelineRef = useRef<Promise<PreparedProductPhoto> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  // Currency for the price field — GBP default; selecting persists the
  // app-wide display currency (style_prefs.currency).
  const [currencyId, setCurrencyId] = useState<string>(() => getCurrency().id);
  // Stale-response guards for the debounced live search.
  const searchSeq = useRef(0);
  const lastFetchedUrl = useRef('');

  const runSearch = async (raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    if (isUrlQuery(q)) {
      await runUrlFetch(q);
      return;
    }
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    // Cached queries return instantly — no network, no skeleton.
    const cached = readSearchCache(q);
    if (cached) {
      setResults(cached);
      setThumbs({});
      setSavedFlash(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setResults(null);
    setThumbs({});
    setSavedFlash(null);
    try {
      const found = await searchForPiece(q);
      if (seq !== searchSeq.current) return; // a newer query superseded this
      setResults(found);
    } catch (e) {
      console.warn('[Ethaion] search-to-log failed:', e);
      if (seq === searchSeq.current) setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  // URL paste → direct fetch: skip the results list, auto-fill the card.
  const runUrlFetch = async (url: string) => {
    if (fetchingUrl || lastFetchedUrl.current === url) return;
    lastFetchedUrl.current = url;
    const seq = ++searchSeq.current;
    setFetchingUrl(true);
    setSearching(false);
    setResults(null);
    setThumbs({});
    setDraft(null);
    setImagePending(false);
    imagePipelineRef.current = null;
    setSavedFlash(null);
    try {
      const fetched = await fetchPieceFromUrl(url);
      if (seq !== searchSeq.current) return;
      if (!fetched) {
        setResults([]);
        return;
      }
      setDupeDismissed(false);
      setSaveError(null);
      // Standard-name suggestion (Pass Forty-Six B): the name field pre-fills
      // with Beau's standard menswear term; the brand's own product name
      // stays visible as the note under the field. Freely editable.
      const suggested = (fetched.result.standardName || '').trim();
      setDraft({
        category: fetched.result.category,
        slot: fetched.result.slot,
        colors: fetched.result.colors,
        pattern: fetched.result.pattern || '',
        material: fetched.result.material || '',
        size: '',
        brand: upper(fetched.result.brand),
        seasons: defaultSeasons(fetched.result.slot),
        occasions: defaultOccasions(fetched.result.slot),
        name: suggested || fetched.result.name,
        nameIsCustom: true,
        brandProductName: fetched.result.name,
        link: url,
        price: fetched.result.price,
        imageUrl: '',
      });
      // Phase 2 starts only after the interactive text form is mounted. The
      // promise is retained so Save can finish attaching the image even when
      // the user saves before this background work completes.
      setImagePending(true);
      const imagePipeline = findBestProductImage(fetched.result.name, fetched.result.brand, url)
        .then((best) => prepareProductPhoto(best));
      imagePipelineRef.current = imagePipeline;
      void imagePipeline
        .then((prepared) => {
          if (!prepared.cleanedUrl || seq !== searchSeq.current) return;
          setDraft((cur) => (cur && cur.link === url && cur.imageUrl !== prepared.cleanedUrl ? { ...cur, imageUrl: prepared.cleanedUrl } : cur));
        })
        .catch((imageError) => console.warn('[Ethaion] background image search failed:', imageError))
        .finally(() => {
          if (seq === searchSeq.current) setImagePending(false);
        });
    } catch (e) {
      console.warn('[Ethaion] URL auto-fill failed:', e);
      if (seq === searchSeq.current) setResults([]);
    } finally {
      if (seq === searchSeq.current) setFetchingUrl(false);
    }
  };

  // Live search (Pass Forty-Six; URL timing fixed Pass Forty-Seven):
  // keyword queries fire 300ms after typing stops — never per keystroke —
  // with a 2-character minimum. A pasted URL is IMMEDIATE: no debounce, the
  // direct fetch starts the moment it lands in the field. Cached queries
  // skip the network inside runSearch.
  useEffect(() => {
    const q = query.trim();
    if (draft) return; // the confirmation card is open — don't search under it
    if (!q) return;
    if (isUrlQuery(q)) {
      void runSearch(q); // runUrlFetch guards against repeat fetches itself
      return;
    }
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pick = (result: ProductSearchResult, idx: number) => {
    setDupeDismissed(false);
    setSaveError(null);
    // Standard-name suggestion (Pass Forty-Six B): pre-fill with Beau's
    // standard menswear term; the brand's own product name stays visible
    // as the note under the field. Freely editable — never forced.
    const suggested = (result.standardName || '').trim();
    setDraft({
      category: result.category,
      slot: result.slot,
      colors: result.colors,
      pattern: result.pattern || '',
      material: result.material || '',
      size: '',
      brand: upper(result.brand),
      seasons: defaultSeasons(result.slot),
      occasions: defaultOccasions(result.slot),
      name: suggested || result.name,
      nameIsCustom: true,
      brandProductName: result.name,
      link: result.link,
      price: result.price,
      imageUrl: thumbs[idx] || '',
    });
    // The row's thumbnail may still be resolving — finish the best-image
    // hunt in the background and swap it in place when it lands.
    setImagePending(true);
    const sourcePipeline = thumbs[idx]
      ? Promise.resolve(thumbs[idx])
      : findBestProductImage(result.name, result.brand, result.link || null);
    const imagePipeline = sourcePipeline.then((best) => prepareProductPhoto(best));
    imagePipelineRef.current = imagePipeline;
    void imagePipeline
      .then((prepared) => {
        if (!prepared.cleanedUrl) return;
        setDraft((cur) => (cur && cur.brandProductName === result.name ? { ...cur, imageUrl: prepared.cleanedUrl } : cur));
      })
      .catch((imageError) => console.warn('[Ethaion] background image search failed:', imageError))
      .finally(() => setImagePending(false));
  };

  // The machine-generated [Colour] [Material] [Item Type] name — offered as
  // a one-tap alternative, exactly like the photo flow.
  const autoName = useMemo(
    () =>
      draft
        ? generatePieceName({ colors: draft.colors, material: draft.material, slot: draft.slot, category: draft.category })
        : '',
    [draft?.colors, draft?.material, draft?.slot, draft?.category],
  );
  useEffect(() => {
    if (draft && !draft.nameIsCustom && autoName && draft.name !== autoName) {
      setDraft({ ...draft, name: autoName });
    }
  }, [autoName]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<SearchDraft>) => setDraft((cur) => (cur ? { ...cur, ...p } : cur));

  const changeCurrency = (id: string) => {
    setCurrencyId(id);
    setActiveCurrency(id);
    // Persist as the app-wide display currency — non-blocking.
    void savePrefs({ currency: id }).catch(() => undefined);
  };

  const duplicateOf = useMemo(
    () =>
      draft && draft.name.trim()
        ? findLikelyDuplicate({ name: draft.name, category: draft.category, slot: draft.slot, colors: draft.colors }, pieces)
        : null,
    [draft?.name, draft?.category, draft?.slot, draft?.colors, pieces],
  );

  const reset = () => {
    setDraft(null);
    setImagePending(false);
    imagePipelineRef.current = null;
    setDupeDismissed(false);
    setSaveError(null);
    lastFetchedUrl.current = '';
  };

  const save = async () => {
    if (!draft || !draft.name.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    // Auto-uppercase on save (Pass Forty-Six) — free-typed fields only;
    // price and currency stay exactly as entered.
    const finalName = upper(draft.name.trim());
    const finalBrand = upper(draft.brand.trim());
    const imageUrl = draft.imageUrl.trim();
    const pendingImage = imagePipelineRef.current;
    // Optimistic UI (Pass Forty-Six): the new piece appears in the wardrobe
    // immediately, faint, while the write is in flight.
    const tempId = -Math.floor(Date.now() % 2147480000);
    window.dispatchEvent(
      new CustomEvent('ethaion:piece-add-optimistic', {
        detail: {
          piece: {
            id: tempId,
            name: finalName,
            brand: finalBrand || null,
            category: draft.category,
            slot: draft.slot,
            colors: draft.colors,
            seasons: draft.seasons,
            occasions: draft.occasions,
            photo_url: imageUrl || null,
            created_at: new Date().toISOString(),
          },
        },
      }),
    );
    try {
      const piece: NewPiece = {
        name: finalName,
        brand: finalBrand || null,
        category: draft.category,
        slot: draft.slot,
        colors: draft.colors,
        pattern: draft.pattern || null,
        material: draft.material.trim() || null,
        size: draft.size.trim() || null,
        seasons: draft.seasons,
        occasions: draft.occasions,
        photo_url: imageUrl || null,
        photo_source: imageUrl ? 'product' : null,
        name_is_custom: draft.nameIsCustom,
        // Source link preservation (Pass Forty-Six B): the product page this
        // piece was logged from — shown in the detail view as "View source".
        source_url: draft.link.trim() || null,
      };
      await insertPieces([piece]);
      // Resolve the inserted row once for price and the asynchronous image
      // phase. The text save never waits for image sourcing or Photoroom.
      const { data: insertedRows } = await (window as any).__workspaceDb
        .from('wardrobe_pieces')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      const insertedId = Number(insertedRows?.[0]?.id || 0);
      if (insertedId) {
        // Beau reads up on the piece online — fire-and-forget; the result
        // lands on the piece card in The Ledger (beau-enrichment.ts).
        void enrichPiece({
          pieceId: insertedId,
          name: finalName,
          brand: finalBrand || null,
          typeLabel: canonicalSlotLabel(draft.slot) || categoryById(draft.category)?.label || '',
          material: draft.material.trim() || null,
        });
      }
      const priceNum = parsePrice(draft.price);
      if (priceNum != null && insertedId) {
        try {
          await setPieceValue(insertedId, { price_paid: priceNum });
        } catch (e) {
          console.warn('[Ethaion] price save failed (non-fatal):', e);
        }
      }
      const preparedPromise = pendingImage || (imageUrl ? prepareProductPhoto(imageUrl) : Promise.resolve({ originalUrl: '', cleanedUrl: '', cleaned: false }));
      if (insertedId) {
        void preparedPromise
          .then((prepared) => prepared.cleanedUrl ? attachPreparedProductPhoto(insertedId, prepared) : null)
          .catch((photoError) => console.warn('[Ethaion] search image cleanup skipped:', photoError));
      }
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-settled', { detail: { tempId } }));
      // The write is done — all the user waited on. Beau's re-read is queued
      // as a separate background operation, never awaited (reassess-queue.ts).
      queueWardrobeReassessment('piece logged from search');
      setSavedFlash(finalName);
      reset();
      onAdded();
      window.setTimeout(() => setSavedFlash(null), 3000);
    } catch (e) {
      // Failed save: remove the optimistic row and surface an inline error —
      // the draft stays so one more tap retries.
      console.error('[Ethaion] search-to-log save failed:', e);
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-failed', { detail: { tempId } }));
      setSaveError('That didn\u2019t save — check your connection and tap Save again.');
    } finally {
      setSaving(false);
    }
  };

  const labelCls = `${typography.size.xs} ${typography.color.muted}`;
  const slots = draft ? categoryById(draft.category)?.slots || [] : [];
  const chip = (active: boolean) =>
    `px-2 py-1 rounded-full border transition-colors ${typography.size.xs} ${
      active
        ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
    }`;

  return (
    // The "Search" PANEL — same paper ground and geometry as the
    // "Photograph" panel: square corners, heading + one-line brief.
    <div className="bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))]" style={{ padding: '30px 32px 32px' }}>
      {/* No "Search for a piece" header — the Search pill the user just
          tapped already communicates the context. */}
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch' }}>
        Type the brand or the item — or paste a product link — and Beau pulls the details automatically for you
        to check before saving.
      </p>

      {savedFlash && (
        <p className={`${typography.size.xs} text-[var(--space-semantic-success)] mt-2`}>
          “{savedFlash}” logged — in The Rail, under Your pieces.
        </p>
      )}

      {/* Search input — Lora 15px, hairline border, no radius, paper ground.
          Live: keyword searches fire 300ms after typing stops; pasted links
          go straight to auto-fill. */}
      <form
        className="mt-4 flex items-stretch gap-2 flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, brand, or paste a link…"
          className="flex-1 min-w-[14rem] focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--space-text-primary)] placeholder:text-[var(--color-neutral-500,#a68e70)]"
          style={{
            fontFamily: 'var(--space-font-family)',
            fontSize: '15px',
            border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
            borderRadius: 0,
            background: '#fbf8f1',
            padding: '10px 14px',
          }}
          aria-label="Search by name, brand, or paste a product link"
        />
        <button
          type="submit"
          disabled={searching || fetchingUrl || query.trim().length < 2}
          className="px-4 min-h-[44px] rounded text-[15px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-50"
        >
          {(searching || fetchingUrl) && <Loader2 className="w-4 h-4 animate-spin" />}
          {fetchingUrl ? 'Fetching details\u2026' : searching ? 'Beau is looking it up\u2026' : 'Search'}
        </button>
      </form>

      {/* Keyword search running — skeleton result rows, never a blank area */}
      {!draft && searching && (
        <div className="mt-4">
          <p className={`${labelCls} mb-1`}>Beau is looking it up…</p>
          <SearchResultsSkeleton rows={3} />
        </div>
      )}

      {/* URL fetch running — the brief "Fetching details…" skeleton */}
      {!draft && fetchingUrl && (
        <div className="mt-4">
          <p className={`${labelCls} mb-1`}>Fetching details from the page…</p>
          <SearchResultsSkeleton rows={1} />
        </div>
      )}

      {/* Results — hairline-separated rows: thumbnail · name · brand · price */}
      {!draft && !searching && !fetchingUrl && results && results.length > 0 && (
        <div className="mt-4">
          <p className={`${labelCls} mb-1`}>Tap the one you own — Beau fills in the details for you to check.</p>
          <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
            {results.map((result, idx) => (
              <button
                key={`${result.name}-${idx}`}
                type="button"
                onClick={() => pick(result, idx)}
                className="w-full grid items-center text-left group"
                style={{ gridTemplateColumns: '56px minmax(0,1fr) 18px', gap: '16px', padding: '12px 0' }}
              >
                <ResultThumb
                  cacheId={`piece-search-${query.trim().toLowerCase()}-${idx}`}
                  result={result}
                  onResolved={(url) => setThumbs((cur) => (cur[idx] ? cur : { ...cur, [idx]: url }))}
                />
                <span className="min-w-0">
                  {/* Product name — Lora 14px */}
                  <span
                    className={`block truncate ${typography.color.primary}`}
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.35 }}
                  >
                    {result.name}
                  </span>
                  {/* Brand · price — Lora 12px neutral-600 */}
                  <span className="block truncate text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', marginTop: '2px' }}>
                    {[result.brand || null, result.price || null].filter(Boolean).join(' \u00b7 ') || '\u2014'}
                  </span>
                </span>
                <span
                  className="justify-self-end text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results — plain inline Lora line, never a modal or banner */}
      {!draft && !searching && !fetchingUrl && results && results.length === 0 && (
        <p className="mt-3 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px' }}>
          No results — try different keywords or paste a product link.
        </p>
      )}

      {/* The pre-filled confirmation card — the SAME editable screen as the
          photo flow: every field correctable before the one Save tap. */}
      {draft && (
        <div className="mt-4">
          <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3">
            <div className="flex items-start gap-3">
              <div className="relative w-20 aspect-[3/4] rounded-xl border border-[var(--space-border-default)] flex-shrink-0 overflow-hidden">
                <CanonicalGarment
                  fields={{ name: draft.name, category: draft.category, slot: draft.slot, colors: draft.colors, pattern: draft.pattern, brand: draft.brand }}
                  photoUrl={draft.imageUrl || null}
                  title={draft.name || 'Garment preview'}
                  showConfirmation
                  className="absolute inset-0"
                />
                {imagePending && !draft.imageUrl && (
                  <span className="absolute inset-0 bg-[var(--color-paper,#fbf8f1)]" aria-label="Finding and cleaning the product image">
                    <ShimmerDefs />
                    <Skeleton className="w-full h-full" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                  <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
                  Here’s what Beau found — tap anything to correct it.
                </p>
                <input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value, nameIsCustom: e.target.value.trim().toUpperCase() !== autoName.trim().toUpperCase() })}
                  onBlur={() => patch({ name: upper(draft.name) })}
                  placeholder="Name"
                  className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} ${typography.weight.semibold} mt-1.5`}
                  aria-label="Piece name"
                />
                {/* The brand's own product name — subtle Lora 12px note
                    (Pass Forty-Six B), kept visible under Beau's suggested
                    standard name so the user always sees both. */}
                {draft.brandProductName.trim() &&
                  draft.brandProductName.trim().toUpperCase() !== draft.name.trim().toUpperCase() && (
                    <span
                      className="block text-[var(--color-neutral-600,#856c51)]"
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', marginTop: '4px' }}
                    >
                      Brand name: {draft.brandProductName}
                    </span>
                  )}
                <span className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={labelCls} style={{ fontSize: '10px' }}>
                    {draft.nameIsCustom ? 'Beau\u2019s suggested name — edit it freely.' : 'Auto-named from the confirmed fields.'}
                  </span>
                  {draft.nameIsCustom && autoName && (
                    <button
                      type="button"
                      onClick={() => patch({ name: autoName, nameIsCustom: false })}
                      className={`inline-flex items-center gap-1 ${typography.color.brand} hover:underline`}
                      style={{ fontSize: '10px' }}
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Use “{autoName}”
                    </button>
                  )}
                </span>
              </div>
            </div>

            {/* Fields run in the order the piece's NAME reads them —
                colour → material → type → maker — then pattern, size,
                season and occasion (add-piece refinements pass). */}
            <div className="mt-3 space-y-2.5">
              <div>
                <p className={`${labelCls} mb-1`}>Colour(s) — up to 3, first is primary</p>
                <ColorSelector value={draft.colors} onChange={(c) => patch({ colors: c })} ariaLabel="Colours" />
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                <label className={labelCls}>Material
                  <div className="mt-1">
                    <MaterialSelector value={draft.material} onChange={(m) => patch({ material: m })} ariaLabel="Material" />
                  </div>
                </label>
                <label className={labelCls}>Item type
                  <select
                    value={draft.slot || ''}
                    onChange={(e) => patch({ slot: e.target.value || null })}
                    className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
                  >
                    <option value="">Other / not specified</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Category</p>
                <div className="flex flex-wrap gap-1">
                  {WARDROBE_CATEGORIES.map((c) => (
                    <button key={c.id} type="button" onClick={() => patch({ category: c.id, slot: null })} className={chip(draft.category === c.id)} style={{ fontSize: '10px' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={labelCls}>Brand — from the search result, correct it if wrong
                <div className="mt-1">
                  <BrandField value={draft.brand} onChange={(b) => patch({ brand: b })} ariaLabel="Brand" />
                </div>
              </label>

              <div>
                <p className={`${labelCls} mb-1`}>Pattern</p>
                <PatternSelector value={draft.pattern} onChange={(p) => patch({ pattern: p })} ariaLabel="Pattern" />
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                <label className={labelCls}>Size (optional)
                  <div className="mt-1">
                    <SizeSelector value={draft.size} onChange={(s) => patch({ size: s })} ariaLabel="Size" />
                  </div>
                </label>
                <label className={labelCls}>Price (optional — for cost-per-wear)
                  {/* Price + inline currency selector (Pass Forty-Six).
                      Neither is uppercased — they stay exactly as entered. */}
                  <span className="flex items-stretch gap-1.5 mt-1">
                    <select
                      value={currencyId}
                      onChange={(e) => changeCurrency(e.target.value)}
                      aria-label="Currency"
                      className="focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--space-text-primary)]"
                      style={{
                        fontFamily: 'var(--space-font-family)',
                        fontSize: '14px',
                        border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
                        borderRadius: 0,
                        background: '#fbf8f1',
                        padding: '6px 8px',
                      }}
                    >
                      {CURRENCY_SELECT_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      value={draft.price}
                      onChange={(e) => patch({ price: e.target.value })}
                      placeholder="e.g. 120"
                      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 min-w-0`}
                      aria-label="Price paid"
                    />
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <p className={`${labelCls} mb-1`}>Season</p>
                  <div className="flex flex-wrap gap-1">
                    {SEASON_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => patch({ seasons: draft.seasons.includes(o.id) ? draft.seasons.filter((s) => s !== o.id) : [...draft.seasons, o.id] })}
                        className={chip(draft.seasons.includes(o.id))}
                        style={{ fontSize: '10px' }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`${labelCls} mb-1`}>Occasion</p>
                  <div className="flex flex-wrap gap-1">
                    {OCCASION_TAGS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => patch({ occasions: draft.occasions.includes(o.id) ? draft.occasions.filter((s) => s !== o.id) : [...draft.occasions, o.id] })}
                        className={chip(draft.occasions.includes(o.id))}
                        style={{ fontSize: '10px' }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {duplicateOf && !dupeDismissed && (
                <div className="rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-2">
                  <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                    This looks like “{duplicateOf.name}”, already logged — same piece?
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button type="button" onClick={reset} className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}>
                      Yes — keep the existing one
                    </button>
                    <button type="button" onClick={() => setDupeDismissed(true)} className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}>
                      No — it’s different
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-danger)] mt-2`} role="alert">
              {saveError}
            </p>
          )}

          {/* One final Save tap */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!draft.name.trim() || saving}
              className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save to my wardrobe
            </button>
            <button
              type="button"
              onClick={reset}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] inline-flex items-center gap-1`}
            >
              <X className="w-3.5 h-3.5" /> Back to results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
