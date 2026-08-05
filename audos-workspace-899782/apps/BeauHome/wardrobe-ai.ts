/**
 * Ethaion wardrobe AI helpers.
 *
 * Three jobs, all through platform integration endpoints (no SDKs, no keys
 * in the browser):
 *  1. parseBulkText — turn a free-form, unformatted string like
 *     "ocbd blue white pink Joh Partridge wax jacket navy chinos" into clean,
 *     correctly capitalised, categorised wardrobe pieces (LLM via
 *     /proxy/openai/v1/chat/completions, with a local fallback).
 *  2. analyzeGarmentPhoto — upload a garment photo (/api/upload/image) and
 *     identify/categorise it (/api/analyze-document, GPT-4 vision).
 *  3. generateProportionBullets — concise what-suits-your-frame bullets
 *     (works / look for / avoid), cached per profile in localStorage, with a
 *     deterministic fallback so the card never renders empty.
 */

import {
  COLOR_OPTIONS,
  MATERIAL_CHOICES,
  PATTERN_OPTIONS,
  WARDROBE_CATEGORIES,
  categorizeItem,
  composeProportionBullets,
  defaultOccasions,
  defaultSeasons,
  extractColors,
  formatItemName,
  label,
  matchColorOption,
  matchMaterialChoice,
  matchPatternOption,
  reconcilePatternedName,
  type NewPiece,
  type ProportionBullets,
  type StyleProfile,
} from './profile-data';
import { compressImage, uploadGarmentPhotoFast, uploadImageData } from './photo-enhance';

// ---------------------------------------------------------------------------
// Shared: constrained vocab the model must map into
// ---------------------------------------------------------------------------

const CATEGORY_IDS = WARDROBE_CATEGORIES.map((c) => c.id);
const SLOT_LINES = WARDROBE_CATEGORIES.map(
  (c) => `${c.id}: ${c.slots.map((s) => s.id).join(', ') || '(no canonical slots)'}`,
).join('\n');
// Pass Fourteen: the model must map into the app's structured vocabularies —
// no free-text colours, patterns or materials anywhere.
const COLOR_VOCAB = COLOR_OPTIONS.join(', ');
const PATTERN_VOCAB = PATTERN_OPTIONS.map((p) => p.id).join(', ');
const MATERIAL_VOCAB = MATERIAL_CHOICES.join(', ');

const PARSE_SYSTEM_PROMPT = `You are the wardrobe-logging parser for Ethaion, a classic menswear app. The user types a free-form, unpunctuated list of garments they own — no commas, no structure, lowercase, possibly misspelled brand names.

Your job: split the text into individual garments and return STRICT JSON: {"items": [...]}. Each item:
{
  "name": string,        // clean, properly capitalised display name INCLUDING colour when known, e.g. "Light Blue OCBD"
  "brand": string|null,  // brand/maker if present, correctly spelled + capitalised (e.g. "john partridge" -> "John Partridge", "barbour" -> "Barbour", "levis" -> "Levi's")
  "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
  "slot": string|null,   // the best matching canonical slot id from the list below, or null
  "colors": string[],    // up to 3, ONLY from this palette: ${COLOR_VOCAB}. [] if unknown
  "pattern": string|null, // ONLY from: ${PATTERN_VOCAB} — null if unknown
  "material": string|null, // ONLY from: ${MATERIAL_VOCAB} — null if unknown. NEVER put the material in the name.
  "seasons": string[],   // subset of ["ss","aw","year-round"] — realistic wearability
  "occasions": string[]  // subset of ["casual","smart-casual","business","formal"]
}

Canonical slots per category:
${SLOT_LINES}

Rules:
- Menswear conventions for capitalisation: OCBD (never Ocbd), M-43, MA-1, T-shirt. Proper nouns capitalised.
- The name is [Colour] [Clothing type] — e.g. "White OCBD", "Olive Chinos". Material goes ONLY in the material field, never the name ("White Cotton OCBD" is wrong; name "White OCBD", material "Cotton oxford").
- Seasons follow real wearability: AW-specific outerwear (field jackets like the M-43/M-65, waxed jackets, overcoats, leather jackets, heavy knits) is ["aw"] — NEVER ["year-round"]. Only true all-season pieces (OCBDs, chinos, raincoats, loafers) are year-round.
- Colours listed before/after a garment apply to THAT garment. Multiple colourways of the same garment ("ocbd blue white pink") become SEPARATE entries, one per colour: "Blue OCBD", "White OCBD", "Pink OCBD".
- A suit is ONE unit under formalwear (never split into jacket + trousers).
- "wax jacket"/"waxed jacket" is outerwear slot waxed-jacket. Chinos are bottoms. OCBD is tops.
- If a word looks like a misspelled brand (e.g. "Joh Partridge"), correct it to the real menswear brand ("John Partridge").
- Never invent garments that are not in the text. Never return prose — JSON only.`;

interface RawParsedItem {
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  slot?: unknown;
  colors?: unknown;
  pattern?: unknown;
  material?: unknown;
  seasons?: unknown;
  occasions?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').map((x) => (x as string).toLowerCase().trim()).filter(Boolean);
}

const VALID_SEASONS = new Set(['ss', 'aw', 'year-round']);
const VALID_OCCASIONS = new Set(['casual', 'smart-casual', 'business', 'formal']);

function sanitizeItem(raw: RawParsedItem): NewPiece | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  let category = typeof raw.category === 'string' ? raw.category.toLowerCase().trim() : '';
  if (!CATEGORY_IDS.includes(category)) {
    category = categorizeItem(name).category || 'other';
  }
  let slot = typeof raw.slot === 'string' ? raw.slot.toLowerCase().trim() : null;
  const cat = WARDROBE_CATEGORIES.find((c) => c.id === category);
  if (slot && (!cat || !cat.slots.some((s) => s.id === slot))) {
    const guess = categorizeItem(name);
    slot = guess.category === category ? guess.slot : null;
  }
  const seasons = asStringArray(raw.seasons).filter((s) => VALID_SEASONS.has(s));
  const occasions = asStringArray(raw.occasions).filter((o) => VALID_OCCASIONS.has(o));
  // Structured vocab by construction (Pass Fourteen): colours map onto the
  // palette (unmatched ones are dropped, max 3), pattern and material map
  // onto their controlled lists.
  const colors = Array.from(
    new Set(asStringArray(raw.colors).map((c) => matchColorOption(c)).filter(Boolean) as string[]),
  ).slice(0, 3);
  const rawMaterial = typeof raw.material === 'string' ? raw.material.trim() : '';
  const rawPattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
  const pattern = rawPattern ? matchPatternOption(rawPattern) : null;
  return {
    // The label may only say "Patterned" when the STRUCTURED pattern field is
    // explicitly non-solid (Pass Twenty-One) — the vision model sometimes
    // names a plain garment "Patterned Button-Down" while leaving the
    // pattern field empty.
    name: reconcilePatternedName(name, pattern),
    brand: typeof raw.brand === 'string' && raw.brand.trim() ? raw.brand.trim() : null,
    category,
    slot: slot || null,
    colors,
    pattern,
    material: rawMaterial ? matchMaterialChoice(rawMaterial) || rawMaterial : null,
    seasons: seasons.length > 0 ? seasons : defaultSeasons(slot || null),
    occasions: occasions.length > 0 ? occasions : defaultOccasions(slot || null),
  };
}

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

// ---------------------------------------------------------------------------
// 1. Bulk text parsing
// ---------------------------------------------------------------------------

/** Local, no-network fallback: one piece, best-effort categorised. */
export function parseBulkLocal(text: string): NewPiece[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const { category, slot } = categorizeItem(cleaned);
  return [
    {
      name: formatItemName(cleaned),
      brand: null,
      category: category || 'other',
      slot,
      colors: extractColors(cleaned),
      seasons: defaultSeasons(slot),
      occasions: defaultOccasions(slot),
    },
  ];
}

/**
 * Parse free-form wardrobe text into clean pieces via the platform's OpenAI
 * proxy. Falls back to the local single-item parser when the call fails so
 * the input flow never dead-ends.
 */
export async function parseBulkText(text: string): Promise<{ pieces: NewPiece[]; usedAI: boolean }> {
  const cleaned = text.trim();
  if (!cleaned) return { pieces: [], usedAI: false };
  try {
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: cleaned },
        ],
        max_tokens: 1200,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`parse call failed: ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    const rawItems: RawParsedItem[] = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    const pieces = rawItems.map(sanitizeItem).filter(Boolean) as NewPiece[];
    if (pieces.length === 0) throw new Error('parser returned no items');
    return { pieces, usedAI: true };
  } catch (e) {
    console.warn('[Ethaion] AI bulk parse failed, using local fallback:', e);
    return { pieces: parseBulkLocal(cleaned), usedAI: false };
  }
}

// ---------------------------------------------------------------------------
// 2. Photo upload + identification
// ---------------------------------------------------------------------------

const PHOTO_PROMPT = `Identify the single main garment or accessory in this photo for a classic menswear wardrobe log. IMPORTANT — if SEVERAL garments are visible (one shirt laid on another, a pile, something in the background), describe ONLY the PRIMARY garment: the one on top / most prominent / most in focus. Ignore every other garment entirely — never merge details (colour, pattern, material) from a second garment into your answer. Reply with ONLY strict JSON (no markdown):
{
  "name": string,        // [Colour] [Clothing type], e.g. "Navy Harrington Jacket" (menswear conventions: OCBD, M-43). NO material in the name.
  "brand": string|null,  // brand ONLY if a label/logo is clearly VISIBLE in the photo, else null — never guess
  "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
  "slot": string|null,   // best canonical slot id from:\n${SLOT_LINES}
  "colors": string[],    // up to 3 garment colours, ONLY from this palette: ${COLOR_VOCAB}
  "pattern": string|null, // ONLY from: ${PATTERN_VOCAB} — read stripes/checks/weave carefully; "solid" when plainly unpatterned; null if unclear
  "material": string|null, // ONLY from: ${MATERIAL_VOCAB} — judge from visible weave texture / knit structure; null if unclear
  "seasons": string[],   // subset of ["ss","aw","year-round"] — AW-specific outerwear (field/waxed/leather jackets, overcoats) is ["aw"], never year-round
  "occasions": string[]  // subset of ["casual","smart-casual","business","formal"]
}
If no garment is visible, return {"name": null}.`;

export interface PhotoAnalysis {
  piece: NewPiece | null;
  photoUrl: string;
  /**
   * Resolves with the white-background enhanced URL when the ~20–40s clean-up
   * lands in the background (or null when it fails). The photo is USABLE
   * immediately via photoUrl — callers swap this in when it arrives.
   */
  enhanced: Promise<string | null>;
}

/**
 * Identify the garment in an ALREADY-UPLOADED photo (Pass Forty-Eight split:
 * the confirmation card shows immediately after the pick, so the upload and
 * this AI read both run behind it). Returns null when the model can't read
 * a garment — the caller keeps its blank form, never an error screen.
 */
export async function identifyGarmentFromUrl(imageUrl: string): Promise<NewPiece | null> {
  let piece: NewPiece | null = null;
  try {
    const analyzeRes = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentUrl: imageUrl, analysisPrompt: PHOTO_PROMPT, documentType: 'image' }),
    });
    if (analyzeRes.ok) {
      const { analysis } = await analyzeRes.json();
      const parsed = typeof analysis === 'string' ? extractJson(analysis) : analysis;
      if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
        piece = sanitizeItem(parsed);
      }
    }
  } catch (e) {
    console.warn('[Ethaion] photo analysis failed, logging photo without AI tags:', e);
  }
  if (piece) piece.photo_url = imageUrl;
  return piece;
}

/**
 * Store the photo FAST (compressed client-side, then a plain upload —
 * sub-second, not the 20–40s clean-up), identify the garment from it, and
 * run the white-background enhancement in the background (Pass Fourteen
 * upload-speed pass). Nothing blocks on the clean-up any more; the enhanced
 * URL is swapped in when it lands.
 */
export async function analyzeGarmentPhoto(file: File): Promise<PhotoAnalysis> {
  const { url: imageUrl, enhanced } = await uploadGarmentPhotoFast(file);
  const piece = await identifyGarmentFromUrl(imageUrl);
  return { piece, photoUrl: imageUrl, enhanced };
}

// ---------------------------------------------------------------------------
// 2b. Wardrobe scan — multi-garment photo identification (the virtual store)
// ---------------------------------------------------------------------------

const SCAN_PROMPT = `You are cataloguing a photograph of a man's REAL clothes laid out for a wardrobe inventory. The photo may contain several garments at once, possibly partially overlapping or adjacent. Identify EVERY distinct garment or accessory you can see — each as its own entry. Read collars, cuffs, hems, and textures to separate overlapping pieces.

Reply with ONLY strict JSON (no markdown):
{
  "items": [
    {
      "name": string,        // [Colour] [Clothing type], e.g. "Navy Wax Jacket", "White OCBD", "Tan Chinos" (menswear conventions: OCBD, M-43). NO material in the name.
      "brand": string|null,  // ONLY if a label or logo is clearly readable — never guess
      "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
      "slot": string|null,   // best canonical slot id from:\n${SLOT_LINES}
      "colors": string[],    // up to 3, ONLY from this palette: ${COLOR_VOCAB}
      "pattern": string|null, // ONLY from: ${PATTERN_VOCAB} — null if unclear
      "material": string|null, // ONLY from: ${MATERIAL_VOCAB} — null if unclear
      "seasons": string[],   // subset of ["ss","aw","year-round"] — AW-specific outerwear (field/waxed/leather jackets, overcoats) is ["aw"], never year-round
      "occasions": string[], // subset of ["casual","smart-casual","business","formal"]
      "confident": boolean   // false when you can SEE a garment but cannot confidently tell what it is (too folded, too obscured)
    }
  ],
  "obscured": number  // count of additional garments visible but too overlapped/obscured to describe at all
}

Rules: one entry per physical garment — never merge two pieces into one entry, never split one piece into two. Include low-confidence garments as entries with "confident": false and your best-guess name (e.g. "Dark Knit — unidentified"). Do not invent garments that are not visible. If no clothes are visible return {"items": [], "obscured": 0}.`;

export interface ScannedPiece extends NewPiece {
  /** False when the model saw a garment but could not confidently identify it. */
  confident: boolean;
}

export interface WardrobeScan {
  pieces: ScannedPiece[];
  /** Garments visible in the photo but too obscured to describe at all. */
  obscuredCount: number;
  photoUrl: string;
}

/**
 * Scan one wardrobe photo (a pile or spread of several garments) and identify
 * each garment individually via GPT-4 vision. Low-confidence garments come
 * back flagged rather than silently skipped.
 */
export async function scanWardrobePhoto(file: File): Promise<WardrobeScan> {
  // Compress client-side before anything touches the network (Pass
  // Forty-Eight) — a 10MB phone photo becomes a few hundred KB.
  const compressed = await compressImage(file);
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(compressed);
  });

  // The shared versioned upload (photo-enhance): content-hashed filename —
  // a re-scan can never collide with, or be cached as, an earlier file.
  const imageUrl = await uploadImageData(base64Data, compressed.name || 'wardrobe-scan.jpg');

  const analyzeRes = await fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentUrl: imageUrl, analysisPrompt: SCAN_PROMPT, documentType: 'image' }),
  });
  if (!analyzeRes.ok) throw new Error('Ethaion couldn\u2019t read that photo \u2014 try again, or add the pieces by text.');
  const { analysis } = await analyzeRes.json();
  const parsed = typeof analysis === 'string' ? extractJson(analysis) : analysis;
  const rawItems: Array<RawParsedItem & { confident?: unknown }> = Array.isArray(parsed?.items) ? parsed.items : [];

  const pieces: ScannedPiece[] = [];
  for (const raw of rawItems) {
    const clean = sanitizeItem(raw);
    if (!clean) continue;
    pieces.push({
      ...clean,
      photo_url: null, // group shots aren't per-item photos — items render as slot drawings
      confident: raw.confident !== false,
    });
  }
  const obscuredCount = typeof parsed?.obscured === 'number' && parsed.obscured > 0 ? Math.floor(parsed.obscured) : 0;
  return { pieces, obscuredCount, photoUrl: imageUrl };
}

// ---------------------------------------------------------------------------
// 3. Proportions — concise bullets: works / look for / avoid
// ---------------------------------------------------------------------------

const BULLETS_CACHE_PREFIX = 'brummell_prop_bullets_';

function sanitizeBullets(raw: any): ProportionBullets | null {
  if (!raw || typeof raw !== 'object') return null;
  const clean = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean).slice(0, 4)
      : [];
  const bullets: ProportionBullets = {
    works: clean(raw.works),
    lookFor: clean(raw.look_for ?? raw.lookFor),
    avoid: clean(raw.avoid),
  };
  if (bullets.works.length + bullets.lookFor.length + bullets.avoid.length === 0) return null;
  return bullets;
}

export async function generateProportionBullets(profile: StyleProfile): Promise<ProportionBullets> {
  const fallback = composeProportionBullets(profile);
  if (!profile.height_range && !profile.build) return fallback;

  const cacheKey = `${BULLETS_CACHE_PREFIX}${profile.height_range || ''}|${profile.build || ''}|${profile.fit_notes || ''}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = sanitizeBullets(JSON.parse(cached));
      if (parsed) return parsed;
    }
  } catch { /* storage unavailable */ }

  try {
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are Beau, a warm, direct menswear advisor for classic/timeless style. Given a man\u2019s frame, return STRICT JSON — no prose, no markdown: {"works": string[], "look_for": string[], "avoid": string[]}. 2-3 bullets per list, each a punchy fragment of AT MOST 8 words (e.g. "Higher-rise trousers — longer leg line"). works = what flatters his frame; look_for = what to check when buying (rise, jacket length, shoulders); avoid = what to skip. Specific and personal, never generic filler.',
          },
          {
            role: 'user',
            content: `Height: ${label.height(profile.height_range) || 'unknown'}. Build: ${label.build(profile.build) || 'unknown'}. Fit notes from him: ${profile.fit_notes || 'none'}.`,
          },
        ],
        max_tokens: 260,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`bullets call failed: ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const bullets = sanitizeBullets(typeof content === 'string' ? extractJson(content) : null);
    if (!bullets) throw new Error('empty bullets');
    try {
      localStorage.setItem(cacheKey, JSON.stringify(bullets));
    } catch { /* storage unavailable */ }
    return bullets;
  } catch (e) {
    console.warn('[Ethaion] AI proportion bullets failed, using composed fallback:', e);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Fit notes — Beau drafts them from the measurements; the user edits
// ---------------------------------------------------------------------------

/**
 * Generate a short, specific fit-notes line from the profile's height/build
 * (e.g. "Size 40S in jackets — hem to mid-seat; trousers 17.5cm opening, no
 * break"). Returns '' when the model fails so the caller can keep the field
 * empty rather than filling it with something generic.
 */
export async function generateFitNotes(profile: StyleProfile): Promise<string> {
  if (!profile.height_range && !profile.build) return '';
  try {
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are Beau, a menswear fit advisor. Write ONE fit-notes line (max 25 words) a man can repeat to any tailor or use when ordering — SPECIFIC numbers only: likely jacket length code (S/R/L), trouser break, leg-opening cm, rise. No generic advice that applies to everyone. Return STRICT JSON: {"notes": string}.',
          },
          {
            role: 'user',
            content: `Height: ${label.height(profile.height_range) || 'unknown'}. Build: ${label.build(profile.build) || 'unknown'}. His own past notes/garment feedback: ${profile.fit_notes || 'none'}.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return '';
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? extractJson(content) : null;
    return typeof parsed?.notes === 'string' ? parsed.notes.trim() : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Curated-feed photography — real product photos via the stock photo API
// ---------------------------------------------------------------------------

const PHOTO_CACHE_PREFIX = 'brummell_feed_photo_';
const photoMemory = new Map<string, string>();

/**
 * Resolve a real photograph for a curated-feed card. Cached per catalog item
 * (memory + localStorage) so the feed doesn't refetch on every render.
 * Returns '' when no photo could be found — the card then shows a neutral
 * fabric block, never an illustration.
 */
export async function fetchFeedPhoto(itemId: string, query: string): Promise<string> {
  if (photoMemory.has(itemId)) return photoMemory.get(itemId) as string;
  try {
    const cached = localStorage.getItem(PHOTO_CACHE_PREFIX + itemId);
    if (cached) {
      photoMemory.set(itemId, cached);
      return cached;
    }
  } catch { /* storage unavailable */ }

  try {
    const params = new URLSearchParams({ query, perPage: '1', orientation: 'squarish' });
    const res = await fetch(`/api/stock-photos?${params.toString()}`);
    if (!res.ok) throw new Error(`stock photo search failed: ${res.status}`);
    const data = await res.json();
    const url: string = data?.results?.[0]?.urls?.small || data?.results?.[0]?.urls?.regular || '';
    photoMemory.set(itemId, url);
    if (url) {
      try {
        localStorage.setItem(PHOTO_CACHE_PREFIX + itemId, url);
      } catch { /* storage unavailable */ }
    }
    return url;
  } catch (e) {
    console.warn('[Ethaion] feed photo fetch failed:', e);
    photoMemory.set(itemId, '');
    return '';
  }
}
