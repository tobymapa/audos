/**
 * THE HUNT's brand-intelligence AI layer.
 *
 * Three jobs, all through Claude via the platform's BYOK secrets proxy
 * (`{{secrets.ANTHROPIC_API_KEY}}` → api.anthropic.com — the key never
 * touches the browser), each with the platform OpenAI proxy (gpt-4o-mini)
 * as the never-dead-end fallback:
 *
 *  - UNIFIED FIND (claude-3-5-sonnet-20241022): Find + Match + Judge merged
 *    (Recommendation Engine overhaul). ONE free-text query in; Beau reads
 *    the intent and returns ONE of three structured result types —
 *    recommendations, a brand dossier, or a quality judgement. Profile ON
 *    sends the full user context (measurements, skin tone, budget,
 *    archetypes, owned wardrobe); profile OFF sends the query alone.
 *    A brief that names a PIECE plus hard filters (maker, size, condition,
 *    price ceiling) bypasses the model entirely and goes to the real listing
 *    search in ./listing-search — Beau does the searching, so the answer is
 *    actual listings with prices and direct item URLs rather than a list of
 *    shops. A brief that does both gets the model answer AND the listings.
 *  - MATCH (legacy — superseded by Unified Find): the AI style matchmaker.
 *    Free-text query in, 3–5 structured brand/piece recommendations out.
 *  - BRAND PROFILE GENERATION (claude-3-5-haiku-20241022): non-catalog
 *    brands get a structured BrandProfile generated on demand and cached —
 *    the directory is the seed, never the ceiling.
 *  - COMPARE VERDICT (claude-3-5-sonnet-20241022): one paragraph weighing
 *    2–3 brands against each other — personalised when profile is on.
 */

import { secondhandAllowed, type CategoryBudget, type StylePrefs, type StyleProfile, type WardrobePiece } from './profile-data';
import { buildProfileContext, searchWeb } from './scout-ai';
import { parseFindQuery, runListingSearch, type ListingSearchOutcome } from './listing-search';
import {
  beauRatingFromQuality,
  findCatalogBrand,
  normalizeBeauRating,
  type BeauRating,
  type BrandProfile,
  type PriceBand,
  type Register,
} from './brands';

// ---------------------------------------------------------------------------
// Transport — the SHARED Claude transport (claude.ts): model tiering plus
// Anthropic prompt caching. The verbatim system prompts and the profile
// context block travel with cache_control, so back-to-back hunts skip
// re-processing them; a profile / wardrobe / archetype change rewrites the
// block and invalidates the cache automatically. gpt-4o-mini stays as the
// never-dead-end fallback.
// ---------------------------------------------------------------------------

import { callClaude, CLAUDE_HAIKU, CLAUDE_SONNET, type ClaudeSystemBlock } from './claude';

/** System blocks for a profile-aware call — both stable, both cached. */
function cachedSystem(system: string, profileContext: string | null): ClaudeSystemBlock[] {
  return [
    { text: system, cache: true },
    ...(profileContext ? [{ text: profileContext, cache: true }] : []),
  ];
}

async function callGptFallback(system: string, user: string, maxTokens = 2000, json = true): Promise<string | null> {
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.4,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] fallback model call failed:', e);
    return null;
  }
}

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
      const start = trimmed.indexOf(open);
      const end = trimmed.lastIndexOf(close);
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch { /* try the next shape */ }
      }
    }
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && (x as string).trim()).map((x: string) => x.trim())
    : [];
}

// ---------------------------------------------------------------------------
// THE QUALITY FILTER + LIVE MARKET SEARCH (The Hunt overhaul, Parts 3.2/3.3).
//
// Find is grounded in listings fetched from the web at ask-time (the
// platform /api/search endpoint — SerpAPI, key server-side), so Beau's
// verdicts carry REAL buy links: 2–3 direct product pages per
// recommendation, labelled by retailer, never a brand homepage. And every
// answer passes The Aspirant's thesis first: natural or quality materials,
// considered construction, timeless design — fast fashion never appears,
// whatever the price fit; when a stated budget and the quality bar
// conflict, Beau says so honestly (budgetNote) instead of compromising.
// ---------------------------------------------------------------------------

export interface BuyLink {
  /** Retailer display name, e.g. "END." or "Grailed". */
  retailer: string;
  url: string;
  /** 'view' for secondhand marketplaces ("View on Grailed"), 'buy' otherwise. */
  kind: 'buy' | 'view';
}

interface LiveListing {
  title: string;
  link: string;
  snippet: string;
}

/** Fast-fashion makers that never pass the thesis — excluded from Find
 * results and buy links regardless of price fit. */
const FAST_FASHION_BRANDS = [
  'asos design', 'asos', 'h&m', 'h & m', 'hm', 'zara', 'shein', 'temu', 'primark',
  'boohoo', 'boohooman', 'pretty little thing', 'prettylittlething', 'missguided',
  'fashion nova', 'fashionnova', 'forever 21', 'forever21', 'bershka',
  'pull & bear', 'pull and bear', 'stradivarius', 'romwe', 'cider',
];

const FAST_FASHION_DOMAINS = [
  'asos.com', 'hm.com', 'zara.com', 'shein.com', 'shein.co.uk', 'temu.com',
  'primark.com', 'boohoo.com', 'boohooman.com', 'prettylittlething.com',
  'missguided.co.uk', 'fashionnova.com', 'forever21.com', 'bershka.com',
  'pullandbear.com', 'stradivarius.com', 'romwe.com', 'shopcider.com',
];

/** Hosts that are never a place to buy — search, social, forums, editorial. */
const NON_COMMERCE_HOSTS = [
  'google.com', 'bing.com', 'reddit.com', 'youtube.com', 'pinterest.com',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com',
  'wikipedia.org', 'quora.com', 'medium.com', 'styleforum.net',
  'permanentstyle.com', 'gq.com', 'esquire.com', 'fashionbeans.com',
];

/** Known retailers → clean labels ('view' = secondhand marketplace). */
const RETAILER_LABELS: Array<{ match: string; label: string; kind: 'buy' | 'view' }> = [
  { match: 'grailed.com', label: 'Grailed', kind: 'view' },
  { match: 'vestiairecollective.com', label: 'Vestiaire Collective', kind: 'view' },
  { match: 'vinted.com', label: 'Vinted', kind: 'view' },
  { match: 'vinted.co.uk', label: 'Vinted', kind: 'view' },
  { match: 'depop.com', label: 'Depop', kind: 'view' },
  { match: 'therealreal.com', label: 'The RealReal', kind: 'view' },
  { match: 'endclothing.com', label: 'END.', kind: 'buy' },
  { match: 'mrporter.com', label: 'MR PORTER', kind: 'buy' },
  { match: 'matchesfashion.com', label: 'MATCHES', kind: 'buy' },
  { match: 'matches.com', label: 'MATCHES', kind: 'buy' },
  { match: 'farfetch.com', label: 'Farfetch', kind: 'buy' },
  { match: 'ssense.com', label: 'SSENSE', kind: 'buy' },
  { match: 'yoox.com', label: 'YOOX', kind: 'buy' },
  { match: 'huckberry.com', label: 'Huckberry', kind: 'buy' },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isFastFashionBrand(name: string | null | undefined): boolean {
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return false;
  return FAST_FASHION_BRANDS.some((b) => n === b || n.startsWith(`${b} `));
}

function isFastFashionUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  return FAST_FASHION_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** A url worth putting under "Buy at …" — a product page or a tightly
 * filtered retailer search, never a homepage, never fast fashion. */
function looksLikeProductPage(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const host = hostOf(url);
  if (!host || isFastFashionUrl(url)) return false;
  if (NON_COMMERCE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    if (path.length > 1) return true;
    // A bare domain only passes when it carries a real query (a filtered
    // search) — the brief forbids plain brand homepages.
    return u.search.length > 1;
  } catch {
    return false;
  }
}

function retailerFor(url: string): { retailer: string; kind: 'buy' | 'view' } {
  const host = hostOf(url);
  if (host.startsWith('ebay.') || host.includes('.ebay.')) return { retailer: 'eBay', kind: 'view' };
  for (const r of RETAILER_LABELS) {
    if (host === r.match || host.endsWith(`.${r.match}`)) return { retailer: r.label, kind: r.kind };
  }
  // Maker-direct: the domain's own name, tidied.
  const core = host.split('.')[0] || 'the maker';
  return { retailer: core.charAt(0).toUpperCase() + core.slice(1), kind: 'buy' };
}

/** Parse and harden the model's buyLinks — real urls only, deduped, max 3. */
function sanitizeBuyLinks(v: unknown): BuyLink[] {
  if (!Array.isArray(v)) return [];
  const links: BuyLink[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const url = str((item as any)?.url) || (typeof item === 'string' ? item.trim() : '');
    if (!looksLikeProductPage(url) || seen.has(url)) continue;
    seen.add(url);
    const derived = retailerFor(url);
    links.push({ retailer: str((item as any)?.retailer) || derived.retailer, url, kind: derived.kind });
    if (links.length >= 3) break;
  }
  return links;
}

function buyLinksFromListings(listings: LiveListing[], max = 3): BuyLink[] {
  const links: BuyLink[] = [];
  const hosts = new Set<string>();
  for (const l of listings) {
    if (links.length >= max) break;
    if (!l?.link || !looksLikeProductPage(l.link)) continue;
    const host = hostOf(l.link);
    if (hosts.has(host)) continue; // one link per retailer
    hosts.add(host);
    const { retailer, kind } = retailerFor(l.link);
    links.push({ retailer, url: l.link, kind });
  }
  return links;
}

function mergeBuyLinks(a: BuyLink[], b: BuyLink[]): BuyLink[] {
  const seen = new Set<string>();
  const out: BuyLink[] = [];
  for (const link of [...a, ...b]) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= 3) break;
  }
  return out;
}

/** ONE live sweep of the market for this hunt — product-page results only. */
async function searchLiveListings(query: string): Promise<LiveListing[]> {
  try {
    const results = await searchWeb(`${query} menswear buy`, 10);
    return (results || []).filter((r) => r?.link && looksLikeProductPage(r.link)).slice(0, 12);
  } catch {
    return [];
  }
}

/**
 * Top thin buy-link sets up: first from the listings already fetched, then
 * with AT MOST three targeted follow-up searches for the whole result set.
 */
async function enrichBuyLinks(recs: UnifiedRecommendation[], query: string, listings: LiveListing[]): Promise<void> {
  let searchesLeft = 3;
  for (const rec of recs) {
    let links = mergeBuyLinks(rec.buyLinks || [], []);
    if (links.length < 2) {
      const brandLower = rec.brandName.toLowerCase();
      const mentioning = listings.filter((l) => `${l.title} ${l.snippet} ${l.link}`.toLowerCase().includes(brandLower));
      links = mergeBuyLinks(links, buyLinksFromListings(mentioning));
    }
    if (links.length < 2 && searchesLeft > 0) {
      searchesLeft -= 1;
      try {
        const followUp = await searchWeb(`${rec.brandName} ${rec.whatTheyMake || query} buy`, 8);
        links = mergeBuyLinks(links, buyLinksFromListings((followUp || []) as LiveListing[]));
      } catch { /* one failed search never blocks the result */ }
    }
    rec.buyLinks = links;
  }
}

const UNIFIED_FIND_QUALITY_BLOCK = `THE HOUSE THESIS — a NON-NEGOTIABLE quality filter on every answer:
- Only pieces with natural or genuinely high-quality materials, considered construction and timeless design pass.
- NEVER recommend or link to fast fashion (ASOS Design, H&M, Zara, Shein, Primark, Boohoo and their like) — not even when it is the only thing that fits the stated budget.
- When a budget is stated and nothing clears the quality bar new at that price, say so HONESTLY: recommend stretching slightly or going secondhand (eBay, Vestiaire Collective, Grailed) — never compromise the thesis to fit the number. Put that honest word in the optional top-level "budgetNote" string of a recommendations response (omit it when there is nothing to flag).

LIVE LISTINGS AND BUY LINKS: the user message may carry LIVE MARKET LISTINGS fetched from the web moments ago. For a recommendations response, ground your picks in those listings where they genuinely fit, and give EACH recommendation a "buyLinks" array of 1–3 objects: { "retailer": string, "url": string }. Every url MUST be copied EXACTLY from the LIVE MARKET LISTINGS — never invented, never shortened, never a brand homepage. Secondhand-marketplace listings (eBay, Grailed, Vestiaire Collective, Vinted) are welcome when the user's secondhand preference allows them. When no listing fits a pick, return "buyLinks": [] for it. Keep the full verdict depth regardless: maker, price, quality reasoning, style alignment and the fills-a-gap rationale.`;

// ---------------------------------------------------------------------------
// MATCH — the AI style matchmaker (Part 4)
// ---------------------------------------------------------------------------

export interface MatchRecommendation {
  brandName: string;
  whatTheyMake: string;
  whyItFits: string;
  /** Present only when profile was on. */
  profileNote?: string;
  /** Present only when profile was on. */
  gapFilled?: boolean;
  priceRange: string;
}

const MATCH_MODEL = CLAUDE_SONNET;

const MATCH_SYSTEM_PROFILE_ON = `You are Beau — a personal wardrobe advisor. The user is searching for something specific. You have their full profile: measurements, skin tone (light brown / Southeast Asian — warm tones work well, cool greys and icy pastels less so), budget (mid-range), style archetypes, and existing wardrobe.

Return 3–5 brand or piece recommendations. For each:
- Brand name and what they make
- Why this brand/piece answers the user's specific hunt
- One sentence on why it works for their profile specifically (skin tone, height, budget, archetypes)
- Whether this fills a gap in their existing wardrobe

Be specific. Never recommend something that directly conflicts with their existing pieces unless you flag the reason. Never recommend luxury houses unless the user explicitly asks.

Return structured JSON with an array of recommendations. Each recommendation has: brandName, whatTheyMake, whyItFits, profileNote, gapFilled (boolean), priceRange.

Respond ONLY with strict JSON (no markdown): {"recommendations": [{"brandName": string, "whatTheyMake": string, "whyItFits": string, "profileNote": string, "gapFilled": boolean, "priceRange": string}]}`;

const MATCH_SYSTEM_PROFILE_OFF = `You are Beau — a knowledgeable menswear advisor. The user is searching for something. Return 3–5 brand or piece recommendations from general knowledge. Be specific about construction quality, materials, and why each brand is worth considering. No personalisation — just honest, expert recommendations.

Return structured JSON: brandName, whatTheyMake, whyItFits, priceRange.

Respond ONLY with strict JSON (no markdown): {"recommendations": [{"brandName": string, "whatTheyMake": string, "whyItFits": string, "priceRange": string}]}`;

export interface MatchInput {
  query: string;
  profileOn: boolean;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
}

export async function runMatchSearch(input: MatchInput): Promise<MatchRecommendation[]> {
  const { query, profileOn, profile, budgets, pieces, prefs } = input;
  const system = profileOn ? MATCH_SYSTEM_PROFILE_ON : MATCH_SYSTEM_PROFILE_OFF;
  const profileContext = profileOn ? `HIS PROFILE:\n${buildProfileContext(profile, budgets, pieces, prefs)}` : null;
  const user = `THE HUNT: ${query}`;

  let text = await callClaude({ model: MATCH_MODEL, system: cachedSystem(system, profileContext), user, maxTokens: 2000 });
  if (!text) text = await callGptFallback(system, profileContext ? `${profileContext}\n\n${user}` : user, 2000);
  if (!text) throw new Error('Beau is unreachable right now — try again in a moment.');

  const parsed = extractJson(text);
  const rawList: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
  const recs: MatchRecommendation[] = rawList
    .map((r) => ({
      brandName: str(r?.brandName) || str(r?.brand_name) || str(r?.brand),
      whatTheyMake: str(r?.whatTheyMake) || str(r?.what_they_make),
      whyItFits: str(r?.whyItFits) || str(r?.why_it_fits),
      profileNote: profileOn ? str(r?.profileNote) || str(r?.profile_note) || undefined : undefined,
      gapFilled: profileOn ? r?.gapFilled === true || r?.gap_filled === true : undefined,
      priceRange: str(r?.priceRange) || str(r?.price_range),
    }))
    .filter((r) => r.brandName)
    .slice(0, 5);
  if (recs.length === 0) throw new Error('Beau couldn\u2019t match that brief — try rephrasing it.');
  return recs;
}

// ---------------------------------------------------------------------------
// BRAND PROFILE GENERATION — non-catalog brands (Part 7)
// ---------------------------------------------------------------------------

const BRAND_GEN_MODEL = CLAUDE_HAIKU;

const BRAND_GEN_SYSTEM = `You are a menswear brand analyst. Given a brand name, return a factual structured profile of that brand for a quality-focused menswear app. Be honest about construction quality — most mass-market brands are "Adequate". If you genuinely do not recognise the brand, set "known" to false and leave other fields as best-effort or empty.

Respond ONLY with strict JSON (no markdown):
{
  "known": boolean,
  "brand": string,                 // canonical brand name
  "description": string,           // ONE line: what they make, who they're for
  "country": string,               // country of origin
  "founded": number | null,        // founding year if known
  "priceBand": "accessible" | "mid" | "upper-mid" | "luxury",
  "priceRangeLabel": string,       // e.g. "Mid (£150–400)"
  "materials": string[],           // primary materials, most signature first
  "construction": string,          // construction method as a short spec phrase, e.g. "Goodyear welt"
  "constructionQuality": "Excellent" | "Good" | "Adequate",
  "constructionNote": string,      // ONE line saying why THIS brand earned that rating — name the specific signals (welt or seam type, cloth or leather grade, factory, repair service). Never a generic definition of the tier.
  "registers": string[],           // subset of ["Casual", "Smart-Casual", "Formal"]
  "resoleable": boolean,
  "mendable": boolean,
  "expectedYears": number,         // realistic expected lifespan of their core pieces
  "longevityNote": string,         // ONE line on how their pieces age
  "costPerYearNote": string,       // approx cost per year of wear, e.g. "~£20 per year over a 10-year life"
  "signaturePieces": string[],     // 1–3 pieces they're known for
  "archetypes": string[],          // subset of ["ivy","country","continental","sportsman","workwear","relaxed","military","nautical","riviera"] — ivy=Classic Ivy, country=British Country, continental=Continental, sportsman=American Outdoors, workwear=Workwear, relaxed=Smart Casual, military=Military/Utility, nautical=Coastal/Nautical, riviera=Mediterranean/Riviera
  "sizingNote": string,            // ONE sentence on sizing characteristics — especially whether they run short/long/narrow (useful for a shorter build)
  "qualityScore": number,          // 1–10 construction/quality score
  "naturalMaterials": boolean      // do they lead with natural materials?
}`;

const BRAND_GEN_CACHE_KEY = 'ethaion_brand_gen_v1';
const BRAND_GEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface GeneratedCacheEntry {
  at: number;
  profile: BrandProfile;
}

function readGenCache(): Record<string, GeneratedCacheEntry> {
  try {
    const raw = localStorage.getItem(BRAND_GEN_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeGenCache(key: string, profile: BrandProfile): void {
  try {
    const cache = readGenCache();
    cache[key] = { at: Date.now(), profile };
    localStorage.setItem(BRAND_GEN_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage unavailable — regeneration is the cost */ }
}

const VALID_BANDS: PriceBand[] = ['accessible', 'mid', 'upper-mid', 'luxury'];
const VALID_REGISTERS: Register[] = ['Casual', 'Smart-Casual', 'Formal'];
const VALID_ARCHETYPES = ['ivy', 'country', 'continental', 'sportsman', 'workwear', 'relaxed', 'military', 'nautical', 'riviera'];

function sanitizeGenerated(raw: any, fallbackName: string): BrandProfile | null {
  const brand = str(raw?.brand) || fallbackName;
  if (!brand) return null;
  const band = VALID_BANDS.includes(raw?.priceBand) ? (raw.priceBand as PriceBand) : 'mid';
  const quality = ['Excellent', 'Good', 'Adequate'].includes(raw?.constructionQuality)
    ? (raw.constructionQuality as BrandProfile['constructionQuality'])
    : 'Adequate';
  const registers = Array.isArray(raw?.registers)
    ? (raw.registers.filter((r: unknown) => VALID_REGISTERS.includes(r as Register)) as Register[])
    : [];
  const archetypes = Array.isArray(raw?.archetypes)
    ? raw.archetypes.filter((a: unknown) => typeof a === 'string' && VALID_ARCHETYPES.includes((a as string).toLowerCase())).map((a: string) => a.toLowerCase())
    : [];
  const years = Number(raw?.expectedYears);
  const score = Number(raw?.qualityScore);
  return {
    brand,
    description: str(raw?.description) || 'A menswear maker.',
    country: str(raw?.country) || 'Unknown',
    founded: Number.isFinite(Number(raw?.founded)) && Number(raw?.founded) > 1500 ? Number(raw.founded) : null,
    priceBand: band,
    priceRangeLabel: str(raw?.priceRangeLabel) || band,
    materials: Array.isArray(raw?.materials) ? raw.materials.map(str).filter(Boolean).slice(0, 5) : [],
    construction: str(raw?.construction) || '—',
    constructionQuality: quality,
    constructionNote: str(raw?.constructionNote),
    registers: registers.length > 0 ? registers : ['Casual'],
    longevity: {
      resoleable: raw?.resoleable === true,
      mendable: raw?.mendable === true,
      expectedYears: Number.isFinite(years) && years > 0 ? Math.round(years) : 5,
      note: str(raw?.longevityNote),
    },
    costPerYearNote: str(raw?.costPerYearNote),
    signaturePieces: Array.isArray(raw?.signaturePieces) ? raw.signaturePieces.map(str).filter(Boolean).slice(0, 3) : [],
    archetypes,
    sizingNote: str(raw?.sizingNote),
    qualityScore: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : 5,
    naturalMaterials: raw?.naturalMaterials === true,
    generated: true,
  };
}

/**
 * Generate a structured profile for a brand OUTSIDE the seed catalog.
 * Cached in localStorage (30-day TTL) so each brand costs one call.
 */
export async function generateBrandProfile(brandName: string): Promise<BrandProfile> {
  const name = (brandName || '').trim();
  if (!name) throw new Error('Name the maker first.');
  const key = name.toLowerCase();
  const cached = readGenCache()[key];
  if (cached && Date.now() - cached.at < BRAND_GEN_TTL_MS && cached.profile?.brand) {
    return cached.profile;
  }

  const user = `Brand: ${name}`;
  let text = await callClaude({ model: BRAND_GEN_MODEL, system: cachedSystem(BRAND_GEN_SYSTEM, null), user, maxTokens: 1400 });
  if (!text) text = await callGptFallback(BRAND_GEN_SYSTEM, user, 1400);
  if (!text) throw new Error('Beau couldn\u2019t reach his references just now — try again in a moment.');

  const parsed = extractJson(text);
  const profile = sanitizeGenerated(parsed, name);
  if (!profile) throw new Error(`Beau couldn\u2019t build a profile for \u201c${name}\u201d — check the spelling and try again.`);
  writeGenCache(key, profile);
  return profile;
}

/**
 * The ONE brand-profile resolver every Hunt surface uses: the seed catalog
 * first (instant, verified), the AI layer for everything else.
 */
export async function getBrandProfile(brandName: string): Promise<BrandProfile> {
  const catalog = findCatalogBrand(brandName);
  if (catalog) return catalog;
  // Persisted directory additions (user-added / Beau-recommended) already
  // carry their generated dossier — reuse it before spending a new call.
  let stubRowId: number | null = null;
  try {
    const db = (window as any).__workspaceDb;
    if (db) {
      const { data } = await db.from('hunt_directory_brands').eq('brand', (brandName || '').trim()).limit(1).get();
      const row = data?.[0];
      if (row?.profile_json) {
        const parsed = JSON.parse(row.profile_json);
        if (parsed && typeof parsed.brand === 'string') return parsed as BrandProfile;
      }
      if (row) stubRowId = row.id;
    }
  } catch { /* fall through to generation */ }
  const generated = await generateBrandProfile(brandName);
  // A STUB row (bulk file import, or an earlier generation that failed)
  // gets the fresh dossier written back, so its table columns and rating
  // fill in for good instead of regenerating on every open.
  if (stubRowId != null) {
    try {
      await (window as any).__workspaceDb.from('hunt_directory_brands').update(stubRowId, {
        profile_json: JSON.stringify(generated),
        rating: beauRatingFromQuality(generated.constructionQuality, generated.qualityScore),
        rating_note: generated.constructionNote || null,
      });
      window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
    } catch { /* the cached profile still serves this session */ }
  }
  return generated;
}

// ---------------------------------------------------------------------------
// COMPARE VERDICT — Beau's paragraph under the comparison table (Part 5)
// ---------------------------------------------------------------------------

const VERDICT_MODEL = CLAUDE_SONNET;

const VERDICT_SYSTEM_ON = `You are Beau — a personal wardrobe advisor. The user is comparing 2–3 menswear brands side by side. You have their full profile and structured data on each brand. Write ONE paragraph (3–5 sentences): your recommendation given the comparison, personalised to their build, skin tone, budget and archetypes — e.g. "For your build and archetypes, Brand A edges Brand B because…". Take a clear stance. Plain prose only — no JSON, no markdown, no lists.`;

const VERDICT_SYSTEM_OFF = `You are Beau — a knowledgeable menswear advisor. The user is comparing 2–3 menswear brands side by side, with structured data on each. Write ONE paragraph (3–5 sentences): your honest recommendation given the comparison — construction, materials, value over time. Take a clear stance. No personalisation. Plain prose only — no JSON, no markdown, no lists.`;

export interface VerdictInput {
  brands: BrandProfile[];
  profileOn: boolean;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
}

const VERDICT_CACHE_PREFIX = 'ethaion_compare_verdict_';

function verdictCacheKey(brands: BrandProfile[], profileOn: boolean): string {
  return brands.map((b) => b.brand.toLowerCase()).sort().join('|') + (profileOn ? '|on' : '|off');
}

export async function runCompareVerdict(input: VerdictInput): Promise<string> {
  const { brands, profileOn, profile, budgets, pieces, prefs } = input;
  const cacheKey = verdictCacheKey(brands, profileOn);
  try {
    const cached = sessionStorage.getItem(VERDICT_CACHE_PREFIX + cacheKey);
    if (cached) return cached;
  } catch { /* storage unavailable */ }

  const brandLines = brands.map((b) =>
    JSON.stringify({
      brand: b.brand,
      country: b.country,
      priceRange: b.priceRangeLabel,
      materials: b.materials,
      construction: b.construction,
      constructionQuality: `${b.constructionQuality} — ${b.constructionNote}`,
      expectedYears: b.longevity.expectedYears,
      resoleable: b.longevity.resoleable,
      mendable: b.longevity.mendable,
      costPerYear: b.costPerYearNote,
      signaturePieces: b.signaturePieces,
    }),
  );
  const profileContext = profileOn ? `HIS PROFILE:\n${buildProfileContext(profile, budgets, pieces, prefs)}` : null;
  const user = `THE BRANDS UNDER COMPARISON:\n${brandLines.join('\n')}`;

  const system = profileOn ? VERDICT_SYSTEM_ON : VERDICT_SYSTEM_OFF;
  let text = await callClaude({ model: VERDICT_MODEL, system: cachedSystem(system, profileContext), user, maxTokens: 700 });
  if (!text) text = await callGptFallback(system, profileContext ? `${profileContext}\n\n${user}` : user, 700, false);
  if (!text) throw new Error('Beau couldn\u2019t weigh these up just now — try again in a moment.');

  const verdict = text.trim();
  try {
    sessionStorage.setItem(VERDICT_CACHE_PREFIX + cacheKey, verdict);
  } catch { /* storage unavailable */ }
  return verdict;
}

// ---------------------------------------------------------------------------
// UNIFIED FIND — Find + Match + Judge merged (Recommendation Engine
// overhaul, Part 3). ONE text input; Beau reads the intent from the query
// and returns ONE of three structured result types. The system prompts are
// the specified engine — do not edit casually.
// ---------------------------------------------------------------------------

const UNIFIED_FIND_MODEL = CLAUDE_SONNET;

const UNIFIED_FIND_SYSTEM_PROFILE_ON = `You are Beau — a personal wardrobe advisor. The user is asking for something specific. You have their full profile: measurements (use to flag sizing considerations), skin tone (light brown / Southeast Asian — warm tones: olive, camel, tan, burgundy, rust work well; cool greys and icy pastels less so), budget (mid-range — quality independent brands, not luxury houses), style archetypes, and existing wardrobe.

Read the user's intent. If they're looking for a piece or brand recommendation, return 3–5 structured options. If they're asking for a brand assessment, return a structured dossier. If they're asking a quality question, return a quality judgement with rationale.

For recommendations, return structured JSON:
{ "type": "recommendations", "results": [{ "brandName", "whatTheyMake", "whyItFits", "profileNote", "gapFilled": boolean, "priceRange", "archetypeFit": [] }] }

For brand assessment:
{ "type": "brandDossier", "brand": { "name", "overview", "heritage", "construction", "materials", "origin", "priceRange", "archetypeFit": [], "sizingNote", "colourwayTendency", "longevitySignal", "beausRating": "Excellent|Reliable|Inconsistent|Avoid", "beausVerdict" } }

For quality judgement:
{ "type": "qualityJudgement", "verdict": "Worth it|Consider alternatives|Pass", "rationale", "alternatives": [] }

"beausVerdict" must say why THIS brand earned THAT rating, in one or two sentences, naming the specific quality signals behind it — construction method, material grade, where it is made, whether it can be repaired or resoled, and what that means for the money. Never restate what the rating tier means in general.

Be specific. Personalise every recommendation to the user's profile.

Respond ONLY with strict JSON (no markdown fences, no prose before or after).`;

const UNIFIED_FIND_SYSTEM_PROFILE_OFF = `You are Beau — a knowledgeable menswear advisor. The user is asking for something. Read the intent and respond with honest, expert recommendations or assessments. No personalisation — general knowledge only.

Return the same JSON structure as profile-on but omit profileNote and gapFilled.

The JSON structures:
For recommendations: { "type": "recommendations", "results": [{ "brandName", "whatTheyMake", "whyItFits", "priceRange", "archetypeFit": [] }] }
For brand assessment: { "type": "brandDossier", "brand": { "name", "overview", "heritage", "construction", "materials", "origin", "priceRange", "archetypeFit": [], "sizingNote", "colourwayTendency", "longevitySignal", "beausRating": "Excellent|Reliable|Inconsistent|Avoid", "beausVerdict" } }
For quality judgement: { "type": "qualityJudgement", "verdict": "Worth it|Consider alternatives|Pass", "rationale", "alternatives": [] }

"beausVerdict" must say why THIS brand earned THAT rating, naming the specific quality signals — construction method, material grade, where it is made, whether it can be repaired or resoled. Never restate what the rating tier means in general.

Respond ONLY with strict JSON (no markdown fences, no prose before or after).`;

export type UnifiedFindMode = 'auto' | 'recommendations' | 'brandDossier' | 'qualityJudgement';

export interface UnifiedRecommendation {
  brandName: string;
  whatTheyMake: string;
  whyItFits: string;
  /** Present only when profile was on. */
  profileNote?: string;
  /** Present only when profile was on. */
  gapFilled?: boolean;
  priceRange: string;
  archetypeFit: string[];
  /** Live buy links for THIS pick — real product pages, never homepages. */
  buyLinks?: BuyLink[];
}

export interface UnifiedBrandDossier {
  name: string;
  overview: string;
  heritage: string;
  construction: string;
  materials: string;
  origin: string;
  priceRange: string;
  archetypeFit: string[];
  sizingNote: string;
  colourwayTendency: string;
  longevitySignal: string;
  beausRating: BeauRating;
  beausVerdict: string;
}

export type UnifiedFindResult =
  | {
      /** A structured piece hunt answered with REAL listings — see the
       * “structured Find” note on runUnifiedFind. */
      type: 'listings';
      search: ListingSearchOutcome;
    }
  | {
      type: 'recommendations';
      results: UnifiedRecommendation[];
      /** Beau's honest word when the stated budget and the quality bar
       * conflict — stretch slightly or go secondhand, never compromise. */
      budgetNote?: string;
      /** Real listings appended beneath a hybrid answer. */
      search?: ListingSearchOutcome;
    }
  | { type: 'brandDossier'; brand: UnifiedBrandDossier; search?: ListingSearchOutcome }
  | {
      type: 'qualityJudgement';
      verdict: 'Worth it' | 'Consider alternatives' | 'Pass';
      rationale: string;
      alternatives: string[];
      search?: ListingSearchOutcome;
    };

export interface UnifiedFindInput {
  query: string;
  profileOn: boolean;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  /** Optional forced mode from the light chip bar — 'auto' infers. */
  forceMode?: UnifiedFindMode;
  /** Progress copy for the waiting state — the sweep takes a few seconds. */
  onPhase?: (phase: string) => void;
}

function normaliseBeauRating(v: string): BeauRating {
  // The shared normaliser also migrates the legacy labels ('Considered',
  // 'Proceed with caution') onto the current four tiers.
  return normalizeBeauRating(v) ?? 'Inconsistent';
}

function sanitizeUnified(raw: any, profileOn: boolean): UnifiedFindResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = str(raw.type);

  if (type === 'recommendations' || Array.isArray(raw.results) || Array.isArray(raw.recommendations)) {
    const list: any[] = Array.isArray(raw.results) ? raw.results : Array.isArray(raw.recommendations) ? raw.recommendations : [];
    const results: UnifiedRecommendation[] = list
      .map((r) => ({
        brandName: str(r?.brandName) || str(r?.brand_name) || str(r?.brand) || str(r?.name),
        whatTheyMake: str(r?.whatTheyMake) || str(r?.what_they_make),
        whyItFits: str(r?.whyItFits) || str(r?.why_it_fits),
        profileNote: profileOn ? str(r?.profileNote) || str(r?.profile_note) || undefined : undefined,
        gapFilled: profileOn && (r?.gapFilled === true || r?.gap_filled === true) ? true : undefined,
        priceRange: str(r?.priceRange) || str(r?.price_range),
        archetypeFit: strList(r?.archetypeFit ?? r?.archetype_fit),
        buyLinks: sanitizeBuyLinks(r?.buyLinks ?? r?.buy_links),
      }))
      // The thesis is enforced in code too — a fast-fashion maker never
      // reaches the screen even if the model slips (Part 3.3).
      .filter((r) => r.brandName && !isFastFashionBrand(r.brandName))
      .slice(0, 5);
    if (results.length > 0) {
      const budgetNote = str(raw.budgetNote) || str(raw.budget_note);
      return { type: 'recommendations', results, ...(budgetNote ? { budgetNote } : {}) };
    }
  }

  if (type === 'brandDossier' || (raw.brand && typeof raw.brand === 'object')) {
    const b = raw.brand && typeof raw.brand === 'object' ? raw.brand : raw;
    const name = str(b?.name) || str(b?.brand);
    if (name) {
      const materials = Array.isArray(b?.materials)
        ? b.materials.map(str).filter(Boolean).join(' / ')
        : str(b?.materials);
      return {
        type: 'brandDossier',
        brand: {
          name,
          overview: str(b?.overview) || str(b?.description),
          heritage: str(b?.heritage),
          construction: str(b?.construction),
          materials,
          origin: str(b?.origin) || str(b?.country),
          priceRange: str(b?.priceRange) || str(b?.price_range),
          archetypeFit: strList(b?.archetypeFit ?? b?.archetype_fit),
          sizingNote: str(b?.sizingNote) || str(b?.sizing_note),
          colourwayTendency: str(b?.colourwayTendency) || str(b?.colourway_tendency),
          longevitySignal: str(b?.longevitySignal) || str(b?.longevity_signal),
          beausRating: normaliseBeauRating(str(b?.beausRating) || str(b?.beaus_rating)),
          beausVerdict: str(b?.beausVerdict) || str(b?.beaus_verdict),
        },
      };
    }
  }

  if (type === 'qualityJudgement' || typeof raw.verdict === 'string') {
    const v = str(raw.verdict);
    const verdict = /worth/i.test(v) ? 'Worth it' : /pass/i.test(v) ? 'Pass' : 'Consider alternatives';
    const rationale = str(raw.rationale);
    if (rationale || v) {
      return { type: 'qualityJudgement', verdict, rationale, alternatives: strList(raw.alternatives) };
    }
  }

  return null;
}

/**
 * Run ONE unified Find query: Beau infers the intent (piece hunt, brand
 * assessment, quality question or style matchmaking) and returns the
 * matching structured result. Logging to Your Hunt History is the caller's
 * job (hunt-find.tsx), so failures still leave a history row.
 */
export async function runUnifiedFind(input: UnifiedFindInput): Promise<UnifiedFindResult> {
  const { query, profileOn, profile, budgets, pieces, prefs, forceMode = 'auto', onPhase } = input;

  // STRUCTURED FIND (listing-search.ts): when the brief names a PIECE and at
  // least one hard filter — maker, size, condition, a price ceiling — it is a
  // search, not a conversation. Beau runs the marketplaces and comes back
  // with actual listings: title, price, condition, direct item URL. A brief
  // that ALSO asks an open-ended question is a hybrid: Beau answers the
  // question below and the listings sit under it. Open-ended briefs
  // (“something for rain”) never touch this path — they want taste.
  const params = parseFindQuery(query);
  const search = forceMode === 'auto' && params.structured
    ? await runListingSearch(params, { allowSecondhand: secondhandAllowed(prefs), onPhase })
    : null;
  if (search && !params.hasAdviceAsk) return { type: 'listings', search };

  const system = profileOn ? UNIFIED_FIND_SYSTEM_PROFILE_ON : UNIFIED_FIND_SYSTEM_PROFILE_OFF;
  const profileContext = profileOn ? `THE USER'S PROFILE:\n${buildProfileContext(profile, budgets, pieces, prefs)}` : null;
  // LIVE MARKET SEARCH (Part 3.2): piece hunts are grounded in listings
  // fetched from the web right now, so every recommendation can carry real
  // buy links. Forced dossier / judgement modes skip the sweep — and so does
  // a hybrid brief, which already has the real listing set above.
  const wantListings = !search && (forceMode === 'auto' || forceMode === 'recommendations');
  onPhase?.(search ? 'Beau is answering the rest of the brief\u2026' : 'Beau is reading the brief and sweeping the live market\u2026');
  const listings = wantListings ? await searchLiveListings(query) : [];

  const parts: string[] = [`THE USER'S QUERY: ${query}`];
  if (forceMode !== 'auto') {
    parts.push(`FORCED MODE: respond with the "${forceMode}" JSON structure regardless of how the query reads.`);
  }
  if (listings.length > 0) {
    parts.push(
      `LIVE MARKET LISTINGS (fetched just now — every buyLinks url MUST be copied exactly from these):\n${listings
        .map((l, i) => `${i + 1}. ${l.title}\n   ${l.snippet}\n   ${l.link}`)
        .join('\n\n')}`,
    );
  } else if (wantListings) {
    parts.push('LIVE MARKET LISTINGS: none reachable right now — if you return recommendations, set "buyLinks": [] on each.');
  }
  const user = parts.join('\n\n');

  // The verbatim system prompt and the house thesis are stable — both
  // travel with cache_control; the listings block changes per hunt and
  // rides in the user message instead.
  const systemBlocks: ClaudeSystemBlock[] = [
    { text: system, cache: true },
    { text: UNIFIED_FIND_QUALITY_BLOCK, cache: true },
    ...(profileContext ? [{ text: profileContext, cache: true }] : []),
  ];
  let text = await callClaude({ model: UNIFIED_FIND_MODEL, system: systemBlocks, user, maxTokens: 2600 });
  if (!text) text = await callGptFallback(`${system}\n\n${UNIFIED_FIND_QUALITY_BLOCK}`, profileContext ? `${profileContext}\n\n${user}` : user, 2600);
  if (!text) throw new Error('Beau is unreachable right now — try again in a moment.');

  const result = sanitizeUnified(extractJson(text), profileOn);
  if (!result) throw new Error('Beau couldn\u2019t read that one — try rephrasing it.');

  // Buy links (Part 3.2): top thin sets up from the fetched listings, plus
  // at most a few targeted follow-up searches — links are an enrichment,
  // the verdicts stand without them.
  if (result.type === 'recommendations') {
    try {
      await enrichBuyLinks(result.results, query, listings);
    } catch { /* never block the answer on link enrichment */ }
  }
  return search ? { ...result, search } : result;
}

// ---------------------------------------------------------------------------
// DIRECTORY ADDITIONS — makers beyond the catalog seed, persisted in the
// WorkspaceDB `hunt_directory_brands` table so Discover's table can tag
// them "You added this" / "Beau recommended".
// ---------------------------------------------------------------------------

/** Fired after directory rows change so live Discover tables refresh. */
export const DISCOVER_BRANDS_EVENT = 'ethaion:discover-brands-changed';

function db(): any {
  return (window as any).__workspaceDb;
}

/**
 * "Don't see a maker?": the user supplies ONLY the name — Beau generates
 * the full dossier (haiku, cached) and the row persists with source 'user'
 * and a rating minted at creation time. Returns the resolved profile.
 */
export async function addUserDirectoryBrand(brandName: string): Promise<BrandProfile> {
  const name = (brandName || '').trim();
  if (!name) throw new Error('Name the maker first.');
  const catalog = findCatalogBrand(name);
  if (catalog) return catalog; // already a Catalog row — nothing to add
  const profile = await generateBrandProfile(name);
  try {
    const { data: existing } = await db().from('hunt_directory_brands').eq('brand', profile.brand).limit(1).get();
    if (!existing || existing.length === 0) {
      await db().from('hunt_directory_brands').insert({
        brand: profile.brand,
        source: 'user',
        profile_json: JSON.stringify(profile),
        rating: beauRatingFromQuality(profile.constructionQuality, profile.qualityScore),
        rating_note: profile.constructionNote || null,
        context: null,
      });
    }
    window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
  } catch (e) {
    console.warn('[Ethaion] could not persist the added maker (non-fatal):', e);
  }
  return profile;
}

/**
 * Fold makers Beau surfaced in a Find result into Discover (source 'beau').
 * Fire-and-forget: each new maker costs one cached haiku dossier so its
 * table row carries real columns; failures never block the Find result.
 */
export async function recordBeauRecommendedBrands(brandNames: string[], context: string): Promise<void> {
  let changed = false;
  for (const raw of brandNames.slice(0, 5)) {
    const name = (raw || '').trim();
    if (!name || findCatalogBrand(name)) continue;
    try {
      const { data: existing } = await db().from('hunt_directory_brands').eq('brand', name).limit(1).get();
      if (existing && existing.length > 0) continue;
      let profile: BrandProfile | null = null;
      try {
        profile = await generateBrandProfile(name);
      } catch { /* the stub row still lists the maker */ }
      if (profile) {
        const { data: dupe } = await db().from('hunt_directory_brands').eq('brand', profile.brand).limit(1).get();
        if (dupe && dupe.length > 0) continue;
      }
      await db().from('hunt_directory_brands').insert({
        brand: profile?.brand || name,
        source: 'beau',
        profile_json: profile ? JSON.stringify(profile) : null,
        rating: profile ? beauRatingFromQuality(profile.constructionQuality, profile.qualityScore) : null,
        rating_note: profile?.constructionNote || null,
        context: context || null,
      });
      changed = true;
    } catch { /* one failed maker never blocks the rest */ }
  }
  if (changed) window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
}

/**
 * BULK IMPORT (Discover's “Upload a file” entry mode): file each name into
 * the directory immediately as a STUB row — no model call per brand, so a
 * forty-line list lands in one pass. Beau builds each full dossier the
 * first time its brand file is opened (getBrandProfile writes it back onto
 * the row). Catalog makers and existing rows are skipped, never duplicated.
 */
export async function addDirectoryBrandStubs(names: string[]): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    if (findCatalogBrand(name)) {
      skipped.push(name);
      continue;
    }
    try {
      const { data: existing } = await db().from('hunt_directory_brands').eq('brand', name).limit(1).get();
      if (existing && existing.length > 0) {
        skipped.push(name);
        continue;
      }
      await db().from('hunt_directory_brands').insert({
        brand: name,
        source: 'user',
        profile_json: null,
        rating: null,
        rating_note: null,
        context: 'Imported from a brand list file',
      });
      added.push(name);
    } catch {
      skipped.push(name);
    }
  }
  if (added.length > 0) window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
  return { added, skipped };
}
