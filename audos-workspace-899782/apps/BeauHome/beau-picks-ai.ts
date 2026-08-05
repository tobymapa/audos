/**
 * BEAU'S PICKS — the recommendation engine, rebuilt from the ground up.
 *
 * The old engine tried to encode Beau's judgement as static TypeScript rules
 * (catalogue scoring + a hardcoded hierarchy gate). Every pass at that
 * approach eventually mis-fired — belts and Donegal caps recommended to a
 * man with no trousers logged — because the logic is too nuanced for
 * if/else. So the decision-making now happens in a LIVE model call:
 *
 *   · The user's complete wardrobe (every logged piece with category, name,
 *     brand, fabric and metadata), his selected style archetypes, the
 *     archetype essential lists (hardcoded reference data below), and his
 *     profile (height, weight, skin tone, body type) are sent to Claude
 *     (claude-3-5-haiku-20241022 — fast and cheap) with Beau's full
 *     decision logic as the system prompt, passed VERBATIM.
 *   · The call returns a strict JSON array of recommendations —
 *     pieceName / category / subType / whyNow / archetypesServed /
 *     qualitySignals / exampleBrand — which the Curated tab renders as
 *     Beau's picks.
 *   · Results are CACHED (memory + localStorage) keyed by a fingerprint of
 *     the wardrobe + archetypes + profile, so the model is NOT re-called on
 *     every render — only when the wardrobe or the profile actually
 *     changes (or after 24h, or on an explicit refresh).
 *
 * Transport: Claude is reached through the platform's BYOK secrets proxy
 * (`{{secrets.ANTHROPIC_API_KEY}}` → api.anthropic.com — the key never
 * touches the browser). If the workspace has no Anthropic key configured
 * the call falls back to the platform's OpenAI proxy (gpt-4o-mini) with the
 * IDENTICAL system prompt and payload, so Beau's picks never dead-end.
 */

import {
  categorizeItem,
  fetchMaterials,
  fetchStyleMeasurements,
  homeCity,
  label,
  type StyleMeasurements,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { fetchAvatarInputs } from '../../lib/tryon/avatar';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';

// ---------------------------------------------------------------------------
// The decision logic — Beau's system prompt, passed VERBATIM to the model.
// Do not edit casually: this IS the recommendation engine.
// ---------------------------------------------------------------------------

export const BEAU_DECISION_SYSTEM_PROMPT = `You are Beau, a personal wardrobe advisor for The Aspirant — a man building a classic, intentional, quality wardrobe. Your job is to recommend the next pieces he should acquire, in strict priority order based on what he actually needs right now.

Follow this decision process in exact order. At each step, if the condition is not met, recommend ONLY pieces from that step. Do not jump ahead.

STEP 1 — JOINT FOUNDATION (tops AND bottoms AND shoes — ALL equally prerequisite, all three required)
A person cannot leave the house without all three: a top, a bottom, AND shoes. Shoes are NOT a later step — they are Step 1, equal weight with tops and bottoms.
Check whether the user has at least one piece logged in ALL THREE of:
- Tops: shirts, t-shirts, polos, base layers, overshirts
- Bottoms: trousers, chinos, jeans, shorts
- Shoes: any wearable pair (smart: Oxford, Derby, brogue, loafer, Chelsea boot, chukka; casual: clean white sneaker, suede casual shoe, casual leather boot)

If ANY of the three is missing, recommend ONLY from the missing category(ies) before proceeding to Step 2. No outerwear, no knitwear, no accessories until all three are covered. No exceptions. Once all three exist, shoe RANGE (one smart pair and one casual pair) is still worth flagging — but as a note within this step, never as a gate on the steps below.

STEP 2 — OUTERWEAR
At least one weather-appropriate outerwear piece. If missing, recommend before proceeding.

STEP 3 — MID-LAYERS / KNITWEAR
At least one knitwear or sweater piece. If missing, recommend before proceeding.

STEP 4 — FORMALWEAR
At least one blazer or suit jacket. If missing, recommend before proceeding.

STEP 5 — ACCESSORIES
ONLY after Steps 1–4 are all satisfied: recommend accessories (belt, watch, bag, tie, hat).
Accessories are last. A hat is never recommended before the user has covered Steps 1–4. A belt is never recommended before the user has tops, trousers, shoes, outerwear, knitwear, and formalwear.

STEP 6 — STYLE ARCHETYPE ESSENTIALS
Once universal foundation (Steps 1–5) is covered, cross-reference the user's wardrobe against the essentials for their selected archetype(s):

Classic Ivy / Preppy: Oxford button-down shirts, chinos (khaki/navy/olive), loafers or suede bucks, crew-neck knitwear, sports jacket or blazer
British Country: flannel or check shirts, moleskin or corduroy trousers, heavy wool knitwear (Shetland, Aran), brogues, wax jacket or tweed, sturdy overshirt or gilet
Continental: unstructured blazer, well-fitted trousers in mid-weight wool or cotton, fine knitwear or turtleneck, Chelsea boots or loafers, dark/neutral palette
Smart Casual: quality chinos or slim trousers, neat shirts or polos, clean white sneakers or loafers, layering knit, unlined jacket or cardigan
American Outdoors: heavy denim or canvas trousers, chambray or flannel shirt, workwear boots or duck boots, insulated or quilted vest or jacket
Workwear: dark denim or canvas trousers, chambray shirt, sturdy leather boots, chore coat or denim jacket
Military/Utility: cargo or utility trousers, OCBD or military-cut shirt, M65 or field jacket, combat or service boots
Coastal/Nautical: Breton stripe shirt, navy chinos or white trousers, deck shoes or white canvas sneakers, Guernsey or fisherman knit
Mediterranean/Riviera: linen or lightweight cotton shirts (open collar), linen trousers or shorts, leather sandals or espadrilles, light unlined blazer

Recommend gaps in archetype essentials before anything else in Step 7+.

STEP 7 — MULTI-ARCHETYPE PRIORITY
If the user has more than one archetype selected:
- Pieces that satisfy essentials for MULTIPLE selected archetypes are recommended FIRST — they are the most efficient investments
- When archetypes have tension (e.g. British Country = heavy/rural vs Continental = refined/urban), find and recommend bridging pieces first — pieces that work authentically across both (e.g. an unstructured mid-weight flannel blazer bridges both)
- Always state which archetype(s) each recommended piece serves

STEP 8 — VARIETY CHECK
Before recommending a piece in a category the user already has pieces in, check sub-type variety:
Outerwear sub-types (all distinct): wax jacket, field jacket, wool overcoat, raincoat/mac, puffer/quilted, leather jacket, peacoat, trench coat
Shoe sub-types (all distinct): Oxford, Derby, brogue, Chelsea boot, chukka/desert boot, loafer, sneaker (white/clean), work boot, sandal
Bottom sub-types (all distinct): formal/dress trouser, chino, dark/raw denim, casual/washed denim, corduroy/moleskin, cargo/utility
Knitwear sub-types (all distinct): crew-neck, V-neck, turtleneck/rollneck, cardigan, zip-neck

If a category already has a piece of the same sub-type, recommend a DIFFERENT sub-type. Note: "You already have a wax jacket — a wool overcoat would extend your range into town."

STEP 9 — COHERENCE CHECK
Once foundation and archetype essentials are covered:
- Palette coherence: are owned pieces tonal/complementary, or do some have no tonal home?
- Formality range: does the wardrobe span smart, business casual, and casual — or is everything the same register?
- Orphaned pieces: flag pieces with nothing logical to pair with, and recommend what's needed to activate them

STEP 10 — ELEVATION
Only after all above: character pieces, investment items, distinctive pieces. Statement accessories, a standout coat, a quality watch.

For each recommendation, return:
- pieceName: what it is
- category: the wardrobe category
- subType: the specific sub-type
- whyNow: which step of the logic this satisfies, in plain language ("You don't have any trousers logged — this is the first thing to build on")
- archetypesServed: which of the user's archetypes this covers
- qualitySignals: what to look for when buying (fabric, construction)
- exampleBrand: one real brand that makes this well (classic, quality, natural materials — no fast fashion)
- constructionMethod: the construction to look for, as a short spec-sheet phrase (e.g. "Goodyear-welted", "unstructured, half-canvassed", "triple-needle stitched")
- material: the cloth or material specification (e.g. "8oz waxed cotton", "loopwheeled 12oz cotton", "full-grain calf leather")
- origin: where the best versions are typically made (e.g. "Northampton, England", "Japan", "Portugal")
- register: exactly one of "Casual", "Smart-Casual", "Formal" — the register this piece serves
- colorwayNote: ONE sentence on why the recommended colourway works for the user's skin tone specifically (e.g. for light brown / Southeast Asian skin — warm tones like olive, camel, tan and rust complement; cool greys and icy pastels less so)

Return 5–8 recommendations maximum. Quality over quantity. These should feel like a smart friend who knows me`;

// ---------------------------------------------------------------------------
// Archetype essentials — hardcoded reference data, passed alongside the
// wardrobe in the user message (the same lists the system prompt reasons
// over, keyed by the app's archetype ids).
// ---------------------------------------------------------------------------

const ARCHETYPE_PROMPT_NAMES: Record<string, string> = {
  ivy: 'Classic Ivy / Preppy',
  country: 'British Country',
  continental: 'Continental',
  relaxed: 'Smart Casual',
  sportsman: 'American Outdoors',
  workwear: 'Workwear',
  military: 'Military/Utility',
  nautical: 'Coastal/Nautical',
  riviera: 'Mediterranean/Riviera',
  moto: 'Rider / Moto',
  formal: 'Formal',
};

export const ARCHETYPE_ESSENTIALS: Record<string, string[]> = {
  'Classic Ivy / Preppy': ['Oxford button-down shirts', 'chinos (khaki/navy/olive)', 'loafers or suede bucks', 'crew-neck knitwear', 'sports jacket or blazer'],
  'British Country': ['flannel or check shirts', 'moleskin or corduroy trousers', 'heavy wool knitwear (Shetland, Aran)', 'brogues', 'wax jacket or tweed', 'sturdy overshirt or gilet'],
  Continental: ['unstructured blazer', 'well-fitted trousers in mid-weight wool or cotton', 'fine knitwear or turtleneck', 'Chelsea boots or loafers', 'dark/neutral palette'],
  'Smart Casual': ['quality chinos or slim trousers', 'neat shirts or polos', 'clean white sneakers or loafers', 'layering knit', 'unlined jacket or cardigan'],
  'American Outdoors': ['heavy denim or canvas trousers', 'chambray or flannel shirt', 'workwear boots or duck boots', 'insulated or quilted vest or jacket'],
  Workwear: ['dark denim or canvas trousers', 'chambray shirt', 'sturdy leather boots', 'chore coat or denim jacket'],
  'Military/Utility': ['cargo or utility trousers', 'OCBD or military-cut shirt', 'M65 or field jacket', 'combat or service boots'],
  'Coastal/Nautical': ['Breton stripe shirt', 'navy chinos or white trousers', 'deck shoes or white canvas sneakers', 'Guernsey or fisherman knit'],
  'Mediterranean/Riviera': ['linen or lightweight cotton shirts (open collar)', 'linen trousers or shorts', 'leather sandals or espadrilles', 'light unlined blazer'],
};

function archetypePromptName(id: string): string {
  return ARCHETYPE_PROMPT_NAMES[(id || '').toLowerCase()] || label.archetype(id) || id;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeauRecommendation {
  pieceName: string;
  /** Wardrobe category as the model phrased it, e.g. "Bottoms". */
  category: string;
  subType: string;
  /** Which step of the decision logic this satisfies, in plain language. */
  whyNow: string;
  archetypesServed: string[];
  /** What to look for when buying — fabric, construction. */
  qualitySignals: string;
  exampleBrand: string;
  /** Spec-sheet fields (The Rail's detail page) — may be empty on picks
   * cached before the spec-sheet pass; the sheet falls back gracefully. */
  constructionMethod: string;
  material: string;
  origin: string;
  /** "Casual" | "Smart-Casual" | "Formal" (free text from the model). */
  register: string;
  /** Honest price guide for the piece, e.g. "£145–£220". */
  typicalPrice: string;
  /** One sentence on why this colourway works for the user's skin tone. */
  colorwayNote: string;
  /** Derived locally (never from the model): canonical slot + category id
   * for the illustration plate and Saved-tab routing. */
  slotId: string | null;
  categoryId: string | null;
}

export interface BeauPicksResult {
  picks: BeauRecommendation[];
  /** Which model produced the picks. */
  engine: 'claude' | 'gpt-fallback';
  /** ms epoch of when the model was actually called. */
  generatedAt: number;
  fromCache: boolean;
}

export interface BeauPicksInput {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs?: StylePrefs | null;
  /** Skip the cache and re-run the model (the tab's explicit refresh). */
  forceRefresh?: boolean;
  onPhase?: (phase: string) => void;
}

// ---------------------------------------------------------------------------
// User payload — the wardrobe + archetypes + essentials + profile, as JSON.
// ---------------------------------------------------------------------------

function buildUserMessage(
  profile: StyleProfile | null,
  pieces: WardrobePiece[],
  materials: Record<number, string>,
  measurements: StyleMeasurements | null,
  avatar: { heightCm: number | null; weightKg: number | null; bodyType: string | null },
  prefs: StylePrefs | null,
  semantics: Record<number, SemanticTags> = {},
): string {
  const archetypeIds = (profile?.archetypes || []).filter(Boolean);
  const archetypeNames = archetypeIds.map(archetypePromptName);
  const essentials: Record<string, string[]> = {};
  for (const name of archetypeNames) {
    if (ARCHETYPE_ESSENTIALS[name]) essentials[name] = ARCHETYPE_ESSENTIALS[name];
  }

  const payload = {
    wardrobe: pieces.map((p) => ({
      name: p.name,
      category: p.category,
      subTypeSlot: p.slot || null,
      brand: p.brand || null,
      fabric: materials[p.id] || (p as any).material || null,
      colors: p.colors || [],
      pattern: (p as any).pattern || null,
      seasons: p.seasons || [],
      occasions: p.occasions || [],
      // Layer 1 semantic tags (the intelligence overhaul) — the classification
      // Beau assigned at logging time. Reasoning data only: `name` above stays
      // exactly as the user entered it and is never rewritten.
      semantics: semantics[p.id]
        ? {
            canonicalCategory: semantics[p.id].canonicalCategory || null,
            subType: semantics[p.id].subType || null,
            archetypesServed: semantics[p.id].archetypesServed,
            formalityLevel: semantics[p.id].formalityLevel || null,
            colourFamily: semantics[p.id].colourFamily || null,
          }
        : null,
    })),
    selectedArchetypes: archetypeNames,
    archetypeEssentials: essentials,
    profile: {
      heightRange: label.height(profile?.height_range) || null,
      heightCm: avatar.heightCm,
      weightKg: avatar.weightKg,
      bodyType: avatar.bodyType || label.build(profile?.build) || null,
      skinTone: label.skinTone(profile?.skin_tone) || null,
      materialsRule: label.materials(profile?.materials) || null,
      homeCity: homeCity(profile),
      dressesFor: (profile?.occasions || []).map((o) => label.occasion(o)).filter(Boolean),
      fitNotes: profile?.fit_notes || null,
      measurements: measurements
        ? {
            clothingSize: measurements.clothing_size,
            chestCm: measurements.chest_cm,
            waistCm: measurements.waist_cm,
            inseamCm: measurements.inseam_cm,
            shoulderCm: measurements.shoulder_cm,
            shoeSize: measurements.shoe_size ? `${measurements.shoe_size} ${measurements.shoe_size_system || ''}`.trim() : null,
          }
        : null,
      secondhandOpenness: prefs?.secondhand || null,
      inHisOwnWords: prefs?.free_text || null,
    },
  };

  return [
    'Here is my complete logged wardrobe, my selected style archetypes, the archetype essential lists, and my profile, as JSON:',
    JSON.stringify(payload, null, 2),
    'Respond with ONLY a strict JSON array of recommendation objects — no markdown fences, no prose before or after. Each object has exactly these keys: "pieceName" (string), "category" (string), "subType" (string), "whyNow" (string), "archetypesServed" (array of strings), "qualitySignals" (string), "exampleBrand" (string), "constructionMethod" (string), "material" (string), "origin" (string), "register" (string — one of "Casual", "Smart-Casual", "Formal"), "typicalPrice" (string), "colorwayNote" (string).',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Model transport — Claude 3.5 Haiku via the BYOK secrets proxy, with the
// platform OpenAI proxy (gpt-4o-mini) as the never-dead-end fallback.
// ---------------------------------------------------------------------------

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

async function callClaudeHaiku(system: string, user: string): Promise<string | null> {
  const runtime = ws();
  if (!runtime?.workspaceId || !runtime?.token) return null;
  try {
    const res = await fetch(`/api/workspaces/${runtime.workspaceId}/secrets/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': runtime.token },
      body: JSON.stringify({
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': '{{secrets.ANTHROPIC_API_KEY}}',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        json: {
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 3000,
          temperature: 0.4,
          system,
          messages: [{ role: 'user', content: user }],
        },
      }),
    });
    if (!res.ok) return null;
    const wrapper = await res.json();
    if (!wrapper || typeof wrapper.status !== 'number' || wrapper.status < 200 || wrapper.status >= 300) return null;
    const body = typeof wrapper.body === 'string' ? JSON.parse(wrapper.body) : wrapper.body;
    const text = Array.isArray(body?.content)
      ? body.content.map((block: any) => (typeof block?.text === 'string' ? block.text : '')).join('')
      : null;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch (e) {
    console.warn('[Ethaion] Claude call failed — falling back:', e);
    return null;
  }
}

async function callGptFallback(system: string, user: string): Promise<string | null> {
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `${user}\n\n(For this transport, wrap the array in a JSON object: {"recommendations": [...]}.)`,
          },
        ],
        max_tokens: 3000,
        temperature: 0.4,
        response_format: { type: 'json_object' },
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

// ---------------------------------------------------------------------------
// Parsing + sanitising the model's JSON
// ---------------------------------------------------------------------------

function extractJsonValue(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Best-effort: the first array or object literal in the text.
    for (const [open, close] of [['[', ']'], ['{', '}']] as const) {
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

function parseRecommendations(text: string): BeauRecommendation[] {
  const parsed = extractJsonValue(text);
  const rawList: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : [];
  const picks: BeauRecommendation[] = [];
  for (const raw of rawList) {
    const pieceName = str(raw?.pieceName) || str(raw?.piece_name);
    if (!pieceName) continue;
    const derived = categorizeItem(`${pieceName} ${str(raw?.subType)}`);
    picks.push({
      pieceName,
      category: str(raw?.category) || 'Wardrobe',
      subType: str(raw?.subType) || str(raw?.sub_type),
      whyNow: str(raw?.whyNow) || str(raw?.why_now),
      archetypesServed: Array.isArray(raw?.archetypesServed)
        ? raw.archetypesServed.filter((a: unknown) => typeof a === 'string' && (a as string).trim()).map((a: string) => a.trim())
        : [],
      qualitySignals: str(raw?.qualitySignals) || str(raw?.quality_signals),
      exampleBrand: str(raw?.exampleBrand) || str(raw?.example_brand),
      constructionMethod: str(raw?.constructionMethod) || str(raw?.construction_method),
      material: str(raw?.material) || str(raw?.fabric),
      origin: str(raw?.origin),
      register: str(raw?.register),
      typicalPrice: str(raw?.typicalPrice) || str(raw?.typical_price) || str(raw?.price),
      colorwayNote: str(raw?.colorwayNote) || str(raw?.colorway_note) || str(raw?.colourwayNote),
      slotId: derived.slot,
      categoryId: derived.category,
    });
    if (picks.length >= 8) break;
  }
  return picks;
}

// ---------------------------------------------------------------------------
// Cache — invalidated when the wardrobe, archetypes or profile change; a
// 24h TTL keeps long-lived sessions honest. Never re-calls on mere renders.
// ---------------------------------------------------------------------------

const CACHE_KEY = 'ethaion_beau_picks_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fingerprint: string;
  generatedAt: number;
  engine: 'claude' | 'gpt-fallback';
  picks: BeauRecommendation[];
}

let memoryCache: CacheEntry | null = null;
let inflight: Promise<BeauPicksResult> | null = null;

export function beauPicksFingerprint(profile: StyleProfile | null, pieces: WardrobePiece[]): string {
  const wardrobe = pieces
    .map((p) => `${p.id}:${p.name}:${p.category}:${p.slot || ''}:${p.brand || ''}`)
    .sort()
    .join('|');
  const prof = profile
    ? [
        (profile.archetypes || []).slice().sort().join(','),
        (profile.occasions || []).slice().sort().join(','),
        profile.height_range,
        profile.build,
        profile.skin_tone,
        profile.materials,
        homeCity(profile),
      ].join('~')
    : 'no-profile';
  return `v3\u241f${wardrobe}\u241f${prof}`; // v3: adds typicalPrice for The Rail's piece cards
}

function readCache(fingerprint: string): CacheEntry | null {
  const fresh = (entry: CacheEntry | null): CacheEntry | null =>
    entry && entry.fingerprint === fingerprint && Date.now() - entry.generatedAt < CACHE_TTL_MS && entry.picks.length > 0
      ? entry
      : null;
  const hit = fresh(memoryCache);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = fresh(JSON.parse(raw));
    if (parsed) memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  memoryCache = entry;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

// ---------------------------------------------------------------------------
// The one public entry point
// ---------------------------------------------------------------------------

/**
 * Get Beau's picks for the current wardrobe + profile. Cached: the model is
 * only called when the wardrobe or profile changed (or forceRefresh).
 * Throws with a human-readable message when no model could be reached.
 */
export async function getBeauPicks(input: BeauPicksInput): Promise<BeauPicksResult> {
  const { profile, pieces, prefs = null, forceRefresh = false, onPhase } = input;

  const fingerprint = beauPicksFingerprint(profile, pieces);
  if (!forceRefresh) {
    const cached = readCache(fingerprint);
    if (cached) {
      return { picks: cached.picks, engine: cached.engine, generatedAt: cached.generatedAt, fromCache: true };
    }
    if (inflight) return inflight;
  }

  const job = (async (): Promise<BeauPicksResult> => {
    onPhase?.('Beau is reading your wardrobe\u2026');
    const [materials, measurements, avatarInputs, semantics] = await Promise.all([
      fetchMaterials().catch(() => ({} as Record<number, string>)),
      fetchStyleMeasurements().catch(() => null),
      fetchAvatarInputs().catch(() => ({ heightCm: null, weightKg: null, bodyType: null } as any)),
      fetchSemanticTags().catch(() => ({} as Record<number, SemanticTags>)),
    ]);

    const user = buildUserMessage(profile, pieces, materials, measurements, {
      heightCm: avatarInputs?.heightCm ?? null,
      weightKg: avatarInputs?.weightKg ?? null,
      bodyType: avatarInputs?.bodyType ?? null,
    }, prefs, semantics);

    onPhase?.('Beau is weighing what you need next\u2026');
    let engine: 'claude' | 'gpt-fallback' = 'claude';
    let text = await callClaudeHaiku(BEAU_DECISION_SYSTEM_PROMPT, user);
    if (!text) {
      engine = 'gpt-fallback';
      text = await callGptFallback(BEAU_DECISION_SYSTEM_PROMPT, user);
    }
    if (!text) throw new Error('Beau couldn\u2019t reach his desk just now \u2014 try again in a moment.');

    const picks = parseRecommendations(text);
    if (picks.length === 0) throw new Error('Beau lost his train of thought \u2014 try again.');

    const entry: CacheEntry = { fingerprint, generatedAt: Date.now(), engine, picks };
    writeCache(entry);
    return { picks, engine, generatedAt: entry.generatedAt, fromCache: false };
  })();

  inflight = job.finally(() => {
    inflight = null;
  });
  return inflight;
}
