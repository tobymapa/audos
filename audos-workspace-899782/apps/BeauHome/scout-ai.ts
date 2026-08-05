/**
 * Ethaion Scout AI (v3) — the engine behind the Scout tab.
 *
 * Two jobs, both through platform integration endpoints (no SDKs, no keys in
 * the browser):
 *  - FIND ("Looking for something specific?"): the user types what they want,
 *    drops a link, or uploads a photo — Beau runs live web search + curation
 *    and returns 2–4 real recommendations with reasoning tied to the profile.
 *  - REVIEW ("Need me to review something?"): same input mechanic — Beau
 *    evaluates the piece against the profile: fit, quality signals,
 *    consistency with the wardrobe, and value.
 *
 * Results persist per visitor in the WorkspaceDB `scout_hunts` table so the
 * user can return to previous hunts and reviews.
 */

import {
  WARDROBE_CATEGORIES,
  formatBudget,
  getCurrency,
  label,
  secondhandAllowed,
  type CategoryBudget,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { compressImage } from './photo-enhance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScoutMode = 'find' | 'review';

export interface ScoutHuntRow {
  id: number;
  mode: ScoutMode;
  query: string | null;
  link_url: string | null;
  photo_url: string | null;
  title: string | null;
  category: string | null;
  status: 'pending' | 'complete' | 'error';
  result_json: string | null;
  error_message: string | null;
  created_at?: string;
}

export interface FindRecommendation {
  name: string;
  brand: string;
  price: string;
  whyForYou: string;
  link: string;
  photoQuery: string;
  /** Set on pre-owned listings, e.g. "Secondhand \u00b7 eBay" or "Vintage \u00b7 Vestiaire" — always shown as a label. */
  secondhand?: string;
  /** Condition note for pre-owned listings, e.g. "Very good — light wear to cuffs". */
  condition?: string;
}

export interface FindResult {
  kind: 'find';
  intro: string;
  recommendations: FindRecommendation[];
}

export interface ReviewResult {
  kind: 'review';
  verdict: 'buy' | 'skip' | 'conditional';
  headline: string;
  fit: string;
  quality: string;
  wardrobe: string;
  value: string;
}

export type ScoutResult = FindResult | ReviewResult;

export interface ScoutOutcome {
  title: string;
  category: string;
  result: ScoutResult;
}

export function parseScoutResult(row: ScoutHuntRow): ScoutResult | null {
  if (!row.result_json) return null;
  try {
    const parsed = JSON.parse(row.result_json);
    if (parsed && (parsed.kind === 'find' || parsed.kind === 'review')) return parsed as ScoutResult;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

/** Pull the first URL out of free text; returns the link and the remaining text. */
export function extractLink(text: string): { link: string | null; rest: string } {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return { link: null, rest: text.trim() };
  return { link: match[0], rest: text.replace(match[0], ' ').replace(/\s+/g, ' ').trim() };
}

/** Upload a photo to permanent storage; returns its public URL. Compressed
 * client-side first (Pass Forty-Eight: max 1200px, JPEG 0.85) so the upload
 * is sub-second even for a full phone photo. */
export async function uploadScoutPhoto(file: File): Promise<string> {
  const compressed = await compressImage(file);
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(compressed);
  });
  const res = await fetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: base64Data, fileName: compressed.name || 'scout.jpg' }),
  });
  if (!res.ok) throw new Error(`photo upload failed: ${res.status}`);
  const { imageUrl } = await res.json();
  if (!imageUrl) throw new Error('photo upload returned no URL');
  return imageUrl;
}

/** Describe the garment in a photo so the scout can search and reason about it. */
async function describePhoto(photoUrl: string): Promise<string> {
  try {
    const res = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentUrl: photoUrl,
        documentType: 'image',
        analysisPrompt:
          'Describe the main garment or accessory in this photo for a menswear scout in ONE plain sentence: item type, colour, visible materials/construction details, and brand if clearly identifiable (do not guess). If no garment is visible, reply exactly: no garment visible.',
      }),
    });
    if (!res.ok) return '';
    const { analysis } = await res.json();
    return typeof analysis === 'string' ? analysis.trim() : '';
  } catch {
    return '';
  }
}

export async function searchWeb(query: string, num = 8): Promise<Array<{ title: string; link: string; snippet: string }>> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, searchType: 'web', num }),
    });
    const data = await res.json();
    if (!data.success) return [];
    return (data.results || []) as Array<{ title: string; link: string; snippet: string }>;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Profile context — what makes the reasoning personal
// ---------------------------------------------------------------------------

export function buildProfileContext(
  profile: StyleProfile | null,
  budgets: Record<string, CategoryBudget>,
  pieces: WardrobePiece[],
  prefs: StylePrefs | null = null,
): string {
  const prefLines: string[] = [];
  if (prefs?.secondhand === 'yes') {
    prefLines.push('Open to vintage and secondhand: include well-priced pre-owned options (eBay, Vestiaire Collective, Grailed) where they fit — ALWAYS labelled as secondhand or vintage.');
  } else if (prefs?.secondhand === 'sometimes') {
    prefLines.push('Sometimes open to vintage/secondhand: include at most one clearly-labelled pre-owned option when it is genuinely the smarter buy.');
  } else if (prefs?.secondhand === 'no') {
    prefLines.push('New pieces only — never recommend secondhand or vintage.');
  }
  const cur = getCurrency();
  prefLines.push(`Quote all prices in ${cur.id} (${cur.symbol.trim()}).`);
  if (prefs?.free_text && prefs.free_text.trim()) prefLines.push(`In his own words: \u201c${prefs.free_text.trim()}\u201d`);

  if (!profile) {
    return ['No style profile captured yet — keep reasoning general but classic/timeless.', ...prefLines].join('\n');
  }
  const lines: string[] = [];
  if (Array.isArray(profile.archetypes) && profile.archetypes.length > 0) {
    lines.push(`Style direction: ${profile.archetypes.map((a) => label.archetype(a)).join(', ')}.`);
  }
  if (Array.isArray(profile.occasions) && profile.occasions.length > 0) {
    lines.push(`Dresses for: ${profile.occasions.map((o) => label.occasion(o)).join(', ')}.`);
  }
  const frame: string[] = [];
  if (profile.height_range) frame.push(label.height(profile.height_range));
  if (profile.build) frame.push(`${label.build(profile.build).toLowerCase()} build`);
  if (profile.fit_notes) frame.push(`fit note: ${profile.fit_notes}`);
  if (frame.length > 0) lines.push(`Frame: ${frame.join(', ')}.`);
  if (profile.skin_tone) lines.push(`Skin tone: ${label.skinTone(profile.skin_tone).toLowerCase()}.`);
  if (profile.materials) lines.push(`Materials rule: ${label.materials(profile.materials)}.`);
  const budgetLines = WARDROBE_CATEGORIES
    .map((c) => ({ c, b: budgets[c.id] }))
    .filter(({ b }) => b && (b.min_price != null || b.max_price != null))
    .map(({ c, b }) => `${c.label} ${formatBudget(b)}`);
  if (budgetLines.length > 0) lines.push(`Per-category budgets: ${budgetLines.join('; ')}.`);
  if (pieces.length > 0) {
    const owned = pieces.slice(0, 25).map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join(', ');
    lines.push(`Already owns: ${owned}.`);
  }
  lines.push(...prefLines);
  lines.push('Long-term test: classic/timeless — must still feel right at 45.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM orchestration
// ---------------------------------------------------------------------------

const CATEGORY_IDS = WARDROBE_CATEGORIES.map((c) => c.id);

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

const FIND_SYSTEM = `You are Beau, Ethaion's menswear scout — warm, direct, allergic to waffle. The user is hunting a specific piece (described in text, a pasted link, or a photo). Recommend 2–4 REAL products from real makers, grounded in the web search results provided.

Respond ONLY with strict JSON (no markdown):
{
  "title": string,       // short label for this hunt, e.g. "Wax jacket under \u00a3200"
  "category": string,    // one of: ${CATEGORY_IDS.join(', ')}
  "intro": string,       // ONE short personal sentence tying the hunt to HIS profile
  "recommendations": [
    {
      "name": string,      // product name
      "brand": string,
      "price": string,     // e.g. "\u00a3189" — from search results; approximate with "~" if unsure
      "whyForYou": string, // 1–2 SHORT sentences tied to HIS profile: skin tone, frame, direction, what he owns, budget. Personal and specific — never generic.
      "link": string,      // a URL that APPEARS in the search results, else ""
      "photoQuery": string, // stock-photo search phrase for a representative product photo, e.g. "olive waxed cotton jacket menswear"
      "secondhand": string | null, // pre-owned listings ONLY: "Secondhand \u00b7 eBay", "Vintage \u00b7 Vestiaire", etc. null for new pieces.
      "condition": string | null // pre-owned listings ONLY: a short condition note from the listing where visible, e.g. "Very good — light wear to cuffs". null when unknown or new.
    }
  ]
}

Rules: never invent URLs; respect his per-category budget where one is set (flag a deliberate stretch in whyForYou); quote prices in the currency his profile specifies; follow his vintage/secondhand preference exactly — when pre-owned is allowed, label every pre-owned pick via the secondhand field so it is always transparent (with a condition note where the listing shows one), and when it is not allowed recommend new pieces only; prefer honest, obtainable pieces over hype; keep every string tight.

BUDGET FALLBACK (important): when a price ceiling applies — from his per-category budget or a ceiling stated in the request — and new pieces at that level are weak or over budget, DO NOT return a hard "can't find it at that price". If his secondhand preference allows it, check the search results for pre-owned/vintage listings (eBay, Vestiaire Collective, Vinted, Grailed) and present the strongest as clearly-labelled secondhand options with condition notes. Only when neither new nor allowed pre-owned clears the bar should you say so — and then suggest what stretching the budget would unlock.`;

const REVIEW_SYSTEM = `You are Beau, Ethaion's menswear advisor — warm, direct, with a clear stance. The user is CONSIDERING a specific piece (described in text, a pasted link, or a photo). Evaluate it against HIS profile.

Respond ONLY with strict JSON (no markdown):
{
  "title": string,      // short label, e.g. "Barbour Bedale — verdict"
  "category": string,   // one of: ${CATEGORY_IDS.join(', ')}
  "verdict": "buy" | "skip" | "conditional",
  "headline": string,   // one-line stance first, e.g. "Buy it — but only in olive."
  "fit": string,        // ONE short sentence: how it works for his height/build
  "quality": string,    // ONE short sentence: quality signals — materials, construction, maker reputation
  "wardrobe": string,   // ONE short sentence: consistency with what he owns and his direction
  "value": string       // ONE short sentence: value against his budget and cost-per-wear
}

Rules: take a stance — never hedge into a non-answer; ground quality claims in the search results where possible; if key facts are missing say so inside the relevant sentence; keep every string tight.`;

async function callScoutModel(system: string, user: string): Promise<any> {
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1400,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error('Beau is unreachable right now — try again in a moment.');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? extractJson(content) : null;
  if (!parsed) throw new Error('Beau lost his train of thought — try again.');
  return parsed;
}

function cleanCategory(raw: unknown): string {
  const c = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return CATEGORY_IDS.includes(c) ? c : 'other';
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

export interface ScoutRequestInput {
  mode: ScoutMode;
  query: string;
  linkUrl: string | null;
  photoUrl: string | null;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs?: StylePrefs | null;
  onPhase?: (phase: string) => void;
}

// ---------------------------------------------------------------------------
// Session cache (Pass Forty-Seven) — the same logic as the search-to-log
// cache: repeating an identical hunt/review in the same session returns the
// cached outcome instantly, no web search, no model call. Keyed by the full
// request identity plus a light profile fingerprint so a profile change
// invalidates it. Memory + sessionStorage.
// ---------------------------------------------------------------------------

const SCOUT_CACHE_PREFIX = 'brummell_scout_hunt_';
const scoutMemory = new Map<string, ScoutOutcome>();

function scoutCacheKey(input: ScoutRequestInput): string {
  const fingerprint = input.profile
    ? [input.profile.archetypes?.join(','), input.profile.occasions?.join(','), input.profile.skin_tone, input.profile.build, input.profile.height_range, input.profile.materials].join('|')
    : 'no-profile';
  return [input.mode, input.query.trim().toLowerCase().replace(/\s+/g, ' '), input.linkUrl || '', input.photoUrl || '', fingerprint].join('\u241f');
}

function readScoutCache(key: string): ScoutOutcome | null {
  if (scoutMemory.has(key)) return scoutMemory.get(key) as ScoutOutcome;
  try {
    const raw = sessionStorage.getItem(SCOUT_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.result) return null;
    scoutMemory.set(key, parsed);
    return parsed as ScoutOutcome;
  } catch {
    return null;
  }
}

function writeScoutCache(key: string, outcome: ScoutOutcome): void {
  scoutMemory.set(key, outcome);
  try {
    sessionStorage.setItem(SCOUT_CACHE_PREFIX + key, JSON.stringify(outcome));
  } catch { /* storage unavailable — memory cache still holds it */ }
}

/**
 * Run one Scout request end-to-end: photo identification → web search →
 * profile-grounded curation. Returns the title/category for the history row
 * plus the structured result. Throws with a human-readable message on failure.
 */
export async function runScoutRequest(input: ScoutRequestInput): Promise<ScoutOutcome> {
  const { mode, query, linkUrl, photoUrl, profile, budgets, pieces, prefs = null, onPhase } = input;

  // Session cache: the identical request again returns instantly.
  const cacheKey = scoutCacheKey(input);
  const cached = readScoutCache(cacheKey);
  if (cached) return cached;

  let photoDescription = '';
  if (photoUrl) {
    onPhase?.('Reading your photo…');
    photoDescription = await describePhoto(photoUrl);
    if (/^no garment visible/i.test(photoDescription)) photoDescription = '';
  }

  const subject = [query, photoDescription].filter(Boolean).join(' — ') || linkUrl || '';
  if (!subject) throw new Error('Tell Beau what the piece is — a few words, a link, or a photo.');

  onPhase?.(mode === 'find' ? 'Hunting the market…' : 'Checking the piece out…');
  const searchQuery = mode === 'find'
    ? `${query || photoDescription} menswear buy${secondhandAllowed(prefs) ? ' new or secondhand vintage ebay vestiaire' : ''}`
    : `${query || photoDescription || linkUrl} menswear review quality`;
  const results = await searchWeb(searchQuery.trim());

  // Price-ceiling fallback: when a budget applies and pre-owned is allowed,
  // run a dedicated secondhand sweep (eBay, Vestiaire, Vinted) so the model
  // can offer labelled pre-owned options before a hard "can't find it".
  if (mode === 'find' && secondhandAllowed(prefs)) {
    const hasCeiling =
      /under|below|less than|max|budget|\u00a3|\u20ac|\$/i.test(query) ||
      Object.values(budgets).some((b) => b && b.max_price != null);
    if (hasCeiling) {
      onPhase?.('Checking secondhand and vintage listings…');
      const preowned = await searchWeb(`${query || photoDescription} secondhand vintage used ebay vestiaire vinted grailed`.trim());
      const seen = new Set(results.map((r) => r.link));
      for (const r of preowned) {
        if (!seen.has(r.link) && results.length < 14) results.push(r);
      }
    }
  }

  onPhase?.(mode === 'find' ? 'Curating against your profile…' : 'Weighing it against your profile…');
  const userPrompt = [
    `HIS PROFILE:\n${buildProfileContext(profile, budgets, pieces, prefs)}`,
    `THE REQUEST (${mode === 'find' ? 'find this for him' : 'he is considering this'}):`,
    query ? `Text: ${query}` : null,
    linkUrl ? `Link he dropped: ${linkUrl}` : null,
    photoDescription ? `Photo shows: ${photoDescription}` : null,
    results.length > 0
      ? `WEB SEARCH RESULTS:\n${results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join('\n\n')}`
      : 'WEB SEARCH RESULTS: none available — reason from menswear knowledge and say when a fact is uncertain.',
  ].filter(Boolean).join('\n\n');

  const raw = await callScoutModel(mode === 'find' ? FIND_SYSTEM : REVIEW_SYSTEM, userPrompt);

  if (mode === 'find') {
    const recsRaw = Array.isArray(raw.recommendations) ? raw.recommendations : [];
    const recommendations: FindRecommendation[] = recsRaw
      .map((r: any) => ({
        name: str(r?.name),
        brand: str(r?.brand),
        price: str(r?.price),
        whyForYou: str(r?.whyForYou),
        link: str(r?.link),
        photoQuery: str(r?.photoQuery, 'classic menswear product'),
        secondhand: secondhandAllowed(prefs) ? str(r?.secondhand) || undefined : undefined,
        condition: secondhandAllowed(prefs) && str(r?.secondhand) ? str(r?.condition) || undefined : undefined,
      }))
      .filter((r: FindRecommendation) => r.name)
      .slice(0, 4);
    if (recommendations.length === 0) throw new Error('Beau couldn\u2019t find anything that clears the bar — try rephrasing the brief.');
    const outcome: ScoutOutcome = {
      title: str(raw.title, query || 'A hunt'),
      category: cleanCategory(raw.category),
      result: { kind: 'find', intro: str(raw.intro), recommendations },
    };
    writeScoutCache(cacheKey, outcome);
    return outcome;
  }

  const verdictRaw = str(raw.verdict).toLowerCase();
  const verdict = verdictRaw === 'buy' || verdictRaw === 'skip' ? verdictRaw : 'conditional';
  const outcome: ScoutOutcome = {
    title: str(raw.title, query ? `${query} — verdict` : 'A verdict'),
    category: cleanCategory(raw.category),
    result: {
      kind: 'review',
      verdict: verdict as ReviewResult['verdict'],
      headline: str(raw.headline, 'Here\u2019s my read.'),
      fit: str(raw.fit),
      quality: str(raw.quality),
      wardrobe: str(raw.wardrobe),
      value: str(raw.value),
    },
  };
  writeScoutCache(cacheKey, outcome);
  return outcome;
}
