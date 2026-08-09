/**
 * LAYER 2 — LIVE CLAUDE REASONING AT ASSESSMENT TIME (the Beau intelligence
 * overhaul — the engine behind The Edit tab).
 *
 * Beau's read of the wardrobe is no longer computed by hardcoded JavaScript
 * rules — it comes from a live model call that receives the COMPLETE user
 * context:
 *   · the profile — height, chest, waist and inseam measurements, skin
 *     tone, body type, budget range and lifestyle
 *   · the selected style archetypes
 *   · the wardrobe as SEMANTICALLY TAGGED pieces — each piece's userLabel
 *     exactly as the user entered it, plus the Layer 1 tags
 *     (canonicalCategory / subType / archetypesServed / formalityLevel /
 *     colourFamily / colourNotes / pairingFlags) stored at logging time
 *     (semantic-tags.ts)
 *   · the taste memory — every recommendation he has dismissed, with his
 *     reason (taste-memory.ts), so a dismissed piece is never resurfaced in
 *     the same form; the gap is acknowledged and an alternative offered
 *   · the brand reference layer — verified quality makers with their
 *     quality signals (brand-reference.ts). It ENRICHES the reasoning and
 *     never limits it: Beau can recommend any brand in the world.
 * …with Beau's personalisation rules and full decision logic as the system
 * prompt, passed VERBATIM.
 *
 * WHEN IT RUNS (and only then — never on mere renders):
 *   · when The Edit tab opens and the cache is stale
 *   · automatically when a piece is added or removed, archetypes are
 *     updated, profile data changes, or a recommendation is dismissed (the
 *     fingerprint moves)
 *   · on demand via The Edit tab's quiet "Re-assess" button (forceRefresh)
 * Results are cached (memory + localStorage) keyed by a fingerprint of the
 * wardrobe + archetypes + profile + tagged-coverage, with a 24h TTL.
 *
 * CRITICAL RULE — the user's piece labels are never renamed: the model is
 * instructed to refer to owned pieces ONLY by their userLabel, exactly as
 * entered. "M43" stays "M43"; it is never substituted with "M65".
 *
 * Transport: Claude via the platform's BYOK secrets proxy
 * (`{{secrets.ANTHROPIC_API_KEY}}` — the key never touches the browser):
 * claude-3-5-sonnet-20241022 first (the specified deep-reasoning layer),
 * then claude-sonnet-4-20250514 (in case the older model id is ever
 * retired), then claude-3-5-haiku-20241022, then the platform OpenAI proxy
 * (gpt-4o-mini) as the never-dead-end fallback — all with the IDENTICAL
 * system prompt.
 */

import { callClaude as callClaudeShared, CLAUDE_HAIKU, CLAUDE_SONNET, CLAUDE_SONNET_4 } from './claude';
import {
  fetchStyleMeasurements,
  homeCity,
  label,
  type CategoryBudget,
  type StyleMeasurements,
  type StyleProfile,
  type StylePrefs,
  type WardrobePiece,
} from './profile-data';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';
import { brandLayerSignature, buildBrandReferenceLayer, type BrandReferenceEntry } from './brand-reference';
import {
  dismissalSignature,
  dismissalsForPrompt,
  fetchDismissedRecommendations,
  type DismissedRecommendation,
} from './taste-memory';

// ---------------------------------------------------------------------------
// The decision logic — Beau's assessment system prompt, passed VERBATIM to
// the model. Do not edit casually: this IS the assessment engine.
// ---------------------------------------------------------------------------

export const BEAU_ASSESSMENT_SYSTEM_PROMPT = `You are Beau — a personal wardrobe advisor for The Aspirant, a man building a classic, intentional, quality-first wardrobe. You receive complete context: his profile (measurements, skin tone, budget, lifestyle), his selected style archetypes, his wardrobe with semantic tags, his past dismissed recommendations, and a reference layer of verified quality brands.

PERSONALISATION RULES (apply throughout all reasoning):
- Measurements: if inseam is short (under 30"), flag brands offering short/petite sizing. For height under 5'9", prefer pieces that do not overwhelm a shorter frame — avoid heavy overcoats, prefer unstructured blazers.
- Skin tone: light brown / Southeast Asian skin — warm tones (olive, camel, tan, burgundy, rust) tend to complement well; cool greys and icy pastels less so. Note when a recommended colour specifically complements the user's complexion.
- Budget: mid-range means quality independent brands, not luxury houses or fast fashion. Example brands should fit the stated range.
- Dismissed recommendations: do NOT resurface a dismissed piece in the same form. If the user dismissed a white OCBD, recommend chambray or linen as alternatives for that gap. Acknowledge the gap remains but offer the alternative.
- Brand reference layer: when recommending, check if there is a verified entry in the reference layer. If yes, use its quality signals in the rationale. If no entry exists, draw on general knowledge. The reference layer enriches reasoning — it never limits what Beau can recommend. Beau can recommend any brand in the world.

DECISION LOGIC — execute in strict order. Never skip a step. At each step, if the condition is not met, your recommendations address only that step before moving on.

STEP 1 — JOINT FOUNDATION (tops AND bottoms AND shoes — ALL equally prerequisite, simultaneous, equal priority):
A person cannot leave the house without all three: a top, a bottom, AND shoes. These are joint prerequisites, not a sequence. Shoes are NOT a later step — they are Step 1, equal weight with tops and bottoms.
Check: does the user have at least one piece in ALL THREE of:
- Tops: any sub-type in Tops or Base layers category (shirts, t-shirts, polos, overshirts)
- Bottoms: any sub-type in Bottoms category (trousers, chinos, jeans, shorts)
- Shoes: any sub-type in Shoes category (smart: Oxford, Derby, brogue, loafer, Chelsea boot, chukka; casual: clean white sneaker, suede casual shoe, casual leather boot)
If ANY of the three is missing, recommend ONLY the missing category(ies) before proceeding to Step 2. No outerwear, no knitwear, no formalwear, no accessories until all three are covered. Tops, bottoms and shoes are equal — none takes priority over the others. (Once all three are present, shoe RANGE — at least one smart pair and one casual pair — is still worth noting within this step's read, but never blocks the steps below on its own once at least one wearable pair exists in each register the user actually needs.)

STEP 2 — OUTERWEAR: at least one weather-appropriate outerwear piece.

STEP 3 — KNITWEAR / MID-LAYERS: at least one knitwear, sweatshirt or mid-layer piece.

STEP 4 — FORMALWEAR: at least one blazer or suit jacket.

STEP 5 — ACCESSORIES: ONLY after Steps 1–4 are all satisfied.
Accessories (belt, watch, bag, tie, hat) are never recommended before the foundation is complete.

STEP 6 — ARCHETYPE ESSENTIALS: once universal foundation is covered, cross-reference against essentials for each selected archetype:
Classic Ivy: OCBD shirts, chinos (khaki/navy/olive), loafers or suede bucks, crew-neck knitwear, sports jacket
British Country: flannel or check shirts, moleskin or corduroy trousers, heavy wool knitwear (Shetland/Aran), brogues, wax jacket or tweed
Continental: unstructured blazer, well-fitted wool or cotton trousers, fine knitwear or turtleneck, Chelsea boots or loafers
Smart Casual: quality chinos or slim trousers, neat shirts or polos, clean white sneakers or loafers, layering knit, unlined jacket
American Outdoors: heavy denim or canvas trousers, chambray or flannel shirt, workwear or duck boots, insulated vest or jacket
Workwear: dark denim or canvas trousers, chambray shirt, sturdy leather boots, chore coat or denim jacket
Military/Utility: cargo or utility trousers, OCBD or military-cut shirt, field jacket, combat or service boots
Coastal/Nautical: Breton stripe shirt, navy chinos or white trousers, deck shoes or white canvas sneakers, Guernsey or fisherman knit
Mediterranean/Riviera: linen or lightweight cotton shirts (open collar), linen trousers or shorts, leather sandals or espadrilles, light unlined blazer

STEP 7 — MULTI-ARCHETYPE PRIORITY: pieces that satisfy essentials for MORE THAN ONE selected archetype are recommended first — highest efficiency investment.
When archetypes have tension (e.g. British Country = heavy/rural vs Continental = refined/urban), find bridging pieces first — pieces that work authentically across both (e.g. an unstructured mid-weight flannel blazer). Always state which archetype(s) each recommended piece serves.

STEP 8 — VARIETY CHECK: before recommending more of a category, check sub-type diversity.
Outerwear: wax jacket, field jacket, wool overcoat, raincoat/mac, puffer/quilted, leather jacket, peacoat, trench coat — all distinct.
Shoes: Oxford, Derby, brogue, Chelsea boot, chukka, loafer, clean sneaker, work boot, sandal — all distinct.
Bottoms: formal/dress trouser, chino, dark/raw denim, casual denim, corduroy/moleskin, cargo/utility — all distinct.
Knitwear: crew-neck, V-neck, turtleneck/rollneck, cardigan, zip-neck — all distinct.
Same sub-type does not advance coverage. Flag it: "You already have a wax jacket — a wool overcoat would extend your range into town" — and recommend a DIFFERENT sub-type instead.

CRITICAL RULE — THE USER'S LABELS ARE SACRED
Refer to owned pieces ONLY by their userLabel, exactly as the user entered it — never rename, correct, expand or substitute a label. If the label says "M43", write "M43" — never "M65", never "M-1943 Field Jacket". Reason from each piece's semantic tags (canonicalCategory, subType, archetypesServed, formalityLevel, colourFamily, colourNotes); display the userLabel. Pieces marked untagged have not been classified yet — infer their meaning from the userLabel, but still quote the label verbatim.

PERSONALISATION IN THE OUTPUT — your rationale must show the personalisation, not just apply it silently: name the measurement, complexion or budget consideration when it drives a choice, and when a recommendation stands in for something the user dismissed, say so plainly and put the dismissed piece's name in replacesDismissed.

OUTPUT — return ONLY valid JSON, no markdown fences, no prose before or after, with exactly this shape:
{
  "verdict": "a short paragraph (2–4 sentences) — your overall read of this wardrobe: where it stands, what it does well, and the single most important thing to fix next. Written in your voice, addressed to the user as 'you'.",
  "foundation": [
    { "step": 1, "name": "Foundation — tops, bottoms & shoes", "status": "complete" | "current" | "upcoming", "read": "1–2 sentences: what covers this step (quoting userLabels) or exactly what's missing" },
    { "step": 2, "name": "Outerwear", "status": "...", "read": "..." },
    { "step": 3, "name": "Knitwear / mid-layers", "status": "...", "read": "..." },
    { "step": 4, "name": "Formalwear", "status": "...", "read": "..." },
    { "step": 5, "name": "Accessories", "status": "...", "read": "..." }
  ],
  "currentPriority": { "step": <the step number your recommendations address>, "headline": "one short line naming the priority", "why": "1–2 sentences on why this comes first" },
  "recommendations": [
    { "pieceName": "what to acquire", "category": "the wardrobe category", "subType": "the specific sub-type", "whyNow": "which step of the logic this satisfies, in plain language", "archetypesServed": ["..."], "qualitySignals": "what to look for when buying (fabric, construction)", "exampleBrand": "one real brand that makes this well — classic, quality, natural materials, no fast fashion, priced inside his stated range", "fitNote": "one short line on why this suits HIS frame, complexion or life — omit if you have nothing specific to say", "replacesDismissed": "the dismissed piece this is the alternative to, named exactly as it appears in dismissedRecommendations — omit when it replaces nothing" }
  ],
  "archetypeCoverage": [
    { "archetype": "one of the user's selected archetypes", "covered": ["essential — covered by <userLabel>", ...], "missing": ["essential still open", ...] }
  ]
}

foundation status rules: "complete" when the step is genuinely satisfied; "current" for the FIRST unmet step (the one your recommendations address); "upcoming" for every step after the current one. 3–6 recommendations, quality over quantity. Include archetypeCoverage only for the user's selected archetypes (empty array if none selected).`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FoundationStepRead {
  step: number;
  name: string;
  status: 'complete' | 'current' | 'upcoming';
  read: string;
}

export interface AssessmentRecommendation {
  pieceName: string;
  category: string;
  subType: string;
  whyNow: string;
  archetypesServed: string[];
  qualitySignals: string;
  exampleBrand: string;
  /** Why this suits HIS frame, complexion or life. */
  fitNote: string;
  /** Set when this is the alternative to something he dismissed. */
  replacesDismissed: string;
}

export interface ArchetypeCoverage {
  archetype: string;
  covered: string[];
  missing: string[];
}

export interface BeauAssessment {
  verdict: string;
  foundation: FoundationStepRead[];
  currentPriority: { step: number; headline: string; why: string } | null;
  recommendations: AssessmentRecommendation[];
  archetypeCoverage: ArchetypeCoverage[];
}

export interface BeauAssessmentResult {
  assessment: BeauAssessment;
  engine: 'claude-sonnet' | 'claude-haiku' | 'gpt-fallback';
  generatedAt: number;
  fromCache: boolean;
  /** Pieces still awaiting their Layer 1 classification at call time. */
  untaggedCount: number;
  /** Recommendations in the taste memory at call time. */
  dismissedCount: number;
}

export interface BeauAssessmentInput {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  budgets?: Record<string, CategoryBudget>;
  prefs?: StylePrefs | null;
  /** Skip the cache and re-run the model (the tab's explicit Re-assess). */
  forceRefresh?: boolean;
  onPhase?: (phase: string) => void;
}

// ---------------------------------------------------------------------------
// Archetype ids → the names the decision logic uses
// ---------------------------------------------------------------------------

const ARCHETYPE_PROMPT_NAMES: Record<string, string> = {
  ivy: 'Classic Ivy',
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

function archetypePromptName(id: string): string {
  return ARCHETYPE_PROMPT_NAMES[(id || '').toLowerCase()] || label.archetype(id) || id;
}

// ---------------------------------------------------------------------------
// User payload — profile + archetypes + the semantically tagged wardrobe.
// ---------------------------------------------------------------------------

function budgetRangeSummary(budgets: Record<string, CategoryBudget> | undefined, profile: StyleProfile | null): string | null {
  const parts: string[] = [];
  for (const [category, b] of Object.entries(budgets || {})) {
    if (b?.min_price == null && b?.max_price == null) continue;
    const lo = b.min_price != null ? `£${b.min_price}` : '';
    const hi = b.max_price != null ? `£${b.max_price}` : '';
    parts.push(`${category} ${lo}${lo && hi ? '–' : ''}${hi}`.trim());
  }
  if (parts.length > 0) return parts.join('; ');
  return profile?.budget_range || null;
}

/** The lifestyle sentence Beau reasons from: setting, travel, city, occasions. */
function lifestyleSummary(profile: StyleProfile | null): string | null {
  if (!profile) return null;
  const life = profile.lifestyle || {};
  const bits: string[] = [];
  if (life.setting) bits.push(label.setting(life.setting));
  if (life.travel) bits.push(`travels ${label.travel(life.travel).toLowerCase()}`);
  if (life.city) bits.push(`based in ${life.city}`);
  const occasions = (profile.occasions || []).filter(Boolean).map((o) => label.occasion(o)).filter(Boolean);
  if (occasions.length > 0) bits.push(`dresses for ${occasions.join(', ').toLowerCase()}`);
  return bits.length > 0 ? bits.join('; ') : null;
}

/** Inches from a measurement the user may have entered in cm or inches. */
function inchesOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = String(raw).match(/[\d.]+/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (/"|inch|in\b/i.test(String(raw))) return value;
  // Bare numbers: anything over 45 can only sensibly be centimetres.
  return value > 45 ? value / 2.54 : value;
}

/**
 * True when the frame calls for short/petite sizing — an inseam under 30"
 * or a height of 5'9" or under. Drives which makers the brand reference
 * layer pulls forward.
 */
export function needsShortSizing(profile: StyleProfile | null, measurements: StyleMeasurements | null): boolean {
  const inseam = inchesOf(measurements?.inseam_cm);
  if (inseam != null && inseam < 30) return true;
  return profile?.height_range === 'under-56' || profile?.height_range === '56-59';
}

function buildUserMessage(
  profile: StyleProfile | null,
  pieces: WardrobePiece[],
  tags: Record<number, SemanticTags>,
  budgets: Record<string, CategoryBudget> | undefined,
  prefs: StylePrefs | null,
  measurements: StyleMeasurements | null,
  dismissed: DismissedRecommendation[],
  brandLayer: BrandReferenceEntry[],
): { message: string; untaggedCount: number } {
  const archetypeNames = (profile?.archetypes || []).filter(Boolean).map(archetypePromptName);
  let untaggedCount = 0;

  const wardrobe = pieces.map((p) => {
    const t = tags[p.id];
    if (t && (t.canonicalCategory || t.subType)) {
      return {
        userLabel: p.name,
        canonicalCategory: t.canonicalCategory || null,
        subType: t.subType || null,
        archetypesServed: t.archetypesServed,
        formalityLevel: t.formalityLevel || null,
        colourFamily: t.colourFamily || null,
        colourNotes: t.colourNotes || null,
        pairingFlags: t.pairingFlags.length > 0 ? t.pairingFlags : [],
      };
    }
    untaggedCount += 1;
    return {
      userLabel: p.name,
      untagged: true,
      rawCategory: p.category || null,
      rawType: p.slot || null,
      colours: p.colors && p.colors.length > 0 ? p.colors : null,
    };
  });

  const payload = {
    profile: {
      height: label.height(profile?.height_range) || null,
      chest: measurements?.chest_cm || null,
      waist: measurements?.waist_cm || null,
      inseam: measurements?.inseam_cm || null,
      shoulders: measurements?.shoulder_cm || null,
      usualSize: measurements?.clothing_size || null,
      shoeSize: measurements?.shoe_size
        ? `${measurements.shoe_size}${measurements.shoe_size_system ? ` ${measurements.shoe_size_system}` : ''}`
        : null,
      skinTone: label.skinTone(profile?.skin_tone) || null,
      bodyType: label.build(profile?.build) || null,
      budgetRange: budgetRangeSummary(budgets, profile),
      lifestyle: lifestyleSummary(profile),
      homeCity: homeCity(profile),
      inHisOwnWords: prefs?.free_text || null,
    },
    selectedArchetypes: archetypeNames,
    wardrobe,
    dismissedRecommendations: dismissalsForPrompt(dismissed),
    brandReferenceLayer: brandLayer.map((b) => ({
      brand: b.brand,
      category: b.category,
      qualitySignals: b.qualitySignals,
      archetypeFit: b.archetypeFit,
      priceRange: b.priceRange,
      ...(b.userTrusted ? { userAlreadyTrustsThisMaker: true } : {}),
      ...(b.shortSizing ? { offersShortSizing: true } : {}),
    })),
  };

  return {
    message: [
      'Here is my complete context — my profile and measurements, my selected style archetypes, my wardrobe with the semantic tags assigned at logging time, the recommendations I have already dismissed, and the verified brand reference layer — as JSON:',
      JSON.stringify(payload, null, 2),
      'Assess my wardrobe and respond with ONLY the JSON object described in your instructions.',
    ].join('\n\n'),
    untaggedCount,
  };
}

// ---------------------------------------------------------------------------
// Model transport — the SHARED Claude transport (claude.ts): Sonnet first
// (the specified Layer 2 model), Sonnet 4 as its stand-in, Haiku next, the
// platform OpenAI proxy as the never-dead-end fallback. The big verbatim
// assessment system prompt is sent with cache_control (prompt caching,
// Part 3.3), so re-assessments skip re-processing it; the user payload
// changes only when the wardrobe / profile fingerprint moves, which is
// exactly the caching invalidation contract.
// ---------------------------------------------------------------------------

function callClaude(model: string, system: string, user: string, maxTokens: number): Promise<string | null> {
  return callClaudeShared({
    model,
    system: [{ text: system, cache: true }],
    user,
    maxTokens,
    temperature: 0.4,
  });
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
          { role: 'user', content: user },
        ],
        max_tokens: 3500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] assessment fallback call failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing + sanitising
// ---------------------------------------------------------------------------

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
      } catch { /* unparseable */ }
    }
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && (x as string).trim()).map((x: string) => x.trim()) : [];

const DEFAULT_STEP_NAMES: Record<number, string> = {
  1: 'Foundation — tops, bottoms & shoes',
  2: 'Outerwear',
  3: 'Knitwear / mid-layers',
  4: 'Formalwear',
  5: 'Accessories',
};

function parseAssessment(text: string): BeauAssessment | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object') return null;

  const foundation: FoundationStepRead[] = [];
  const seenSteps = new Set<number>();
  for (const item of Array.isArray(raw.foundation) ? raw.foundation : []) {
    const step = Number(item?.step);
    if (!Number.isFinite(step) || step < 1 || step > 6 || seenSteps.has(step)) continue; // step 6 tolerated for stale caches
    seenSteps.add(step);
    const status = ['complete', 'current', 'upcoming'].includes(str(item?.status)) ? (str(item.status) as FoundationStepRead['status']) : 'upcoming';
    foundation.push({ step, name: str(item?.name) || DEFAULT_STEP_NAMES[step] || `Step ${step}`, status, read: str(item?.read) });
  }
  foundation.sort((a, b) => a.step - b.step);

  const recommendations: AssessmentRecommendation[] = [];
  for (const rec of Array.isArray(raw.recommendations) ? raw.recommendations : []) {
    const pieceName = str(rec?.pieceName) || str(rec?.piece_name);
    if (!pieceName) continue;
    recommendations.push({
      pieceName,
      category: str(rec?.category) || 'Wardrobe',
      subType: str(rec?.subType) || str(rec?.sub_type),
      whyNow: str(rec?.whyNow) || str(rec?.why_now),
      archetypesServed: strList(rec?.archetypesServed ?? rec?.archetypes_served),
      qualitySignals: str(rec?.qualitySignals) || str(rec?.quality_signals),
      exampleBrand: str(rec?.exampleBrand) || str(rec?.example_brand),
      fitNote: str(rec?.fitNote) || str(rec?.fit_note),
      replacesDismissed: str(rec?.replacesDismissed) || str(rec?.replaces_dismissed),
    });
    if (recommendations.length >= 6) break;
  }

  const archetypeCoverage: ArchetypeCoverage[] = [];
  for (const cov of Array.isArray(raw.archetypeCoverage) ? raw.archetypeCoverage : []) {
    const archetype = str(cov?.archetype);
    if (!archetype) continue;
    archetypeCoverage.push({ archetype, covered: strList(cov?.covered), missing: strList(cov?.missing) });
  }

  const cp = raw.currentPriority && typeof raw.currentPriority === 'object' ? raw.currentPriority : null;
  const currentPriority = cp && (str(cp.headline) || str(cp.why))
    ? { step: Number(cp.step) || 0, headline: str(cp.headline), why: str(cp.why) }
    : null;

  const verdict = str(raw.verdict);
  if (!verdict && foundation.length === 0 && recommendations.length === 0) return null;
  return { verdict, foundation, currentPriority, recommendations, archetypeCoverage };
}

// ---------------------------------------------------------------------------
// Cache — the assessment re-runs ONLY when the wardrobe, archetypes, profile
// or tagged coverage change (or after 24h, or on the explicit Re-assess).
// ---------------------------------------------------------------------------

const CACHE_KEY = 'ethaion_beau_assessment_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  fingerprint: string;
  generatedAt: number;
  engine: BeauAssessmentResult['engine'];
  assessment: BeauAssessment;
  untaggedCount: number;
  dismissedCount: number;
}

let memoryCache: CacheEntry | null = null;
let inflight: Promise<BeauAssessmentResult> | null = null;

function fingerprintOf(
  profile: StyleProfile | null,
  pieces: WardrobePiece[],
  taggedCount: number,
  measurements: StyleMeasurements | null,
  dismissed: DismissedRecommendation[],
  brandLayer: BrandReferenceEntry[],
): string {
  const wardrobe = pieces
    .map((p) => `${p.id}:${p.name}:${p.category}:${p.slot || ''}`)
    .sort()
    .join('|');
  const prof = profile
    ? [
        (profile.archetypes || []).slice().sort().join(','),
        profile.height_range,
        profile.build,
        profile.skin_tone,
        profile.materials,
        (profile.occasions || []).slice().sort().join(','),
        profile.lifestyle?.setting || '',
        profile.lifestyle?.travel || '',
        homeCity(profile),
      ].join('~')
    : 'no-profile';
  const body = measurements
    ? [measurements.chest_cm, measurements.waist_cm, measurements.inseam_cm, measurements.shoulder_cm, measurements.clothing_size, measurements.shoe_size].join('~')
    : 'no-measurements';
  return [
    'v3', // bumped: Step 1 became the joint tops+bottoms+shoes foundation
    wardrobe,
    prof,
    body,
    `tagged:${taggedCount}`,
    `dismissed:${dismissalSignature(dismissed)}`,
    `brands:${brandLayerSignature(brandLayer)}`,
  ].join('\u241f');
}

function readStoredCache(): CacheEntry | null {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed && parsed.assessment) {
      memoryCache = parsed;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function freshCache(fingerprint: string): CacheEntry | null {
  const entry = readStoredCache();
  return entry && entry.fingerprint === fingerprint && Date.now() - entry.generatedAt < CACHE_TTL_MS ? entry : null;
}

function writeCache(entry: CacheEntry): void {
  memoryCache = entry;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

/**
 * The LAST assessment Beau produced, whatever its fingerprint — used by the
 * Wardrobe tab's summary card, which must never trigger a model call itself.
 * (Its full home is The Edit tab.)
 */
export function peekBeauAssessment(): { assessment: BeauAssessment; generatedAt: number } | null {
  const entry = readStoredCache();
  return entry ? { assessment: entry.assessment, generatedAt: entry.generatedAt } : null;
}

/**
 * The last stored assessment as a full result object (fromCache: true) —
 * used by the app-level assessment provider to seed its state instantly on
 * a fresh session without spending a call. Returns null when nothing has
 * ever been assessed on this device.
 */
export function peekBeauAssessmentResult(): BeauAssessmentResult | null {
  const entry = readStoredCache();
  if (!entry) return null;
  return {
    assessment: entry.assessment,
    engine: entry.engine,
    generatedAt: entry.generatedAt,
    fromCache: true,
    untaggedCount: entry.untaggedCount,
    dismissedCount: entry.dismissedCount ?? 0,
  };
}

/** True when the user has ever produced an assessment on this device — the
 * background auto-refresh only spends a call for wardrobes that use The
 * Edit tab. */
export function hasBeauAssessment(): boolean {
  return readStoredCache() != null;
}

// ---------------------------------------------------------------------------
// The one public entry point
// ---------------------------------------------------------------------------

/**
 * Get Beau's assessment for the current wardrobe + profile. Cached: the
 * model is only called when the wardrobe, archetypes, profile or tagged
 * coverage changed (or forceRefresh — the Re-assess button).
 */
export async function getBeauAssessment(input: BeauAssessmentInput): Promise<BeauAssessmentResult> {
  const { profile, pieces, budgets, prefs = null, forceRefresh = false, onPhase } = input;

  // One call at a time — concurrent (non-forced) requests share the in-flight
  // job instead of spawning duplicates.
  if (!forceRefresh && inflight) return inflight;

  const job = (async (): Promise<BeauAssessmentResult> => {
    onPhase?.('Beau is pulling out his notes\u2026');
    const [tags, measurements, dismissed] = await Promise.all([
      fetchSemanticTags(),
      fetchStyleMeasurements(),
      fetchDismissedRecommendations(),
    ]);
    const archetypeNames = (profile?.archetypes || []).filter(Boolean).map(archetypePromptName);
    const brandLayer = await buildBrandReferenceLayer({
      archetypes: archetypeNames,
      budgetRange: budgetRangeSummary(budgets, profile),
      prefersShortSizing: needsShortSizing(profile, measurements),
    });
    const taggedCount = pieces.filter((p) => tags[p.id] && (tags[p.id].canonicalCategory || tags[p.id].subType)).length;
    const fingerprint = fingerprintOf(profile, pieces, taggedCount, measurements, dismissed, brandLayer);

    if (!forceRefresh) {
      const cached = freshCache(fingerprint);
      if (cached) {
        return {
          assessment: cached.assessment,
          engine: cached.engine,
          generatedAt: cached.generatedAt,
          fromCache: true,
          untaggedCount: cached.untaggedCount,
          dismissedCount: cached.dismissedCount ?? dismissed.length,
        };
      }
    }

    const { message, untaggedCount } = buildUserMessage(profile, pieces, tags, budgets, prefs, measurements, dismissed, brandLayer);

    onPhase?.('Beau is reading your wardrobe against your directions\u2026');
    let engine: BeauAssessmentResult['engine'] = 'claude-sonnet';
    let text = await callClaude(CLAUDE_SONNET, BEAU_ASSESSMENT_SYSTEM_PROMPT, message, 3500);
    if (!text) text = await callClaude(CLAUDE_SONNET_4, BEAU_ASSESSMENT_SYSTEM_PROMPT, message, 3500);
    if (!text) {
      engine = 'claude-haiku';
      text = await callClaude(CLAUDE_HAIKU, BEAU_ASSESSMENT_SYSTEM_PROMPT, message, 3500);
    }
    if (!text) {
      engine = 'gpt-fallback';
      text = await callGptFallback(BEAU_ASSESSMENT_SYSTEM_PROMPT, message);
    }
    if (!text) throw new Error('Beau couldn\u2019t reach his desk just now — try again in a moment.');

    const assessment = parseAssessment(text);
    if (!assessment) throw new Error('Beau lost his train of thought — tap Re-assess to try again.');

    const entry: CacheEntry = {
      fingerprint,
      generatedAt: Date.now(),
      engine,
      assessment,
      untaggedCount,
      dismissedCount: dismissed.length,
    };
    writeCache(entry);
    window.dispatchEvent(new CustomEvent('ethaion:assessment-updated'));
    return { assessment, engine, generatedAt: entry.generatedAt, fromCache: false, untaggedCount, dismissedCount: dismissed.length };
  })();

  inflight = job.finally(() => {
    inflight = null;
  });
  return inflight;
}

// ---------------------------------------------------------------------------
// Background auto-refresh — "automatically when a piece is added or removed,
// archetypes are updated, profile data changes". Debounced so a burst of
// logging produces ONE re-assessment, and gated on the user having used The
// Edit tab at least once (no silent spend for wardrobes that never open it).
// ---------------------------------------------------------------------------

let kickTimer: number | null = null;

export function kickBeauAssessment(input: Omit<BeauAssessmentInput, 'forceRefresh' | 'onPhase'>): void {
  if (!hasBeauAssessment()) return;
  if (kickTimer != null) window.clearTimeout(kickTimer);
  // The delay gives Layer 1 time to tag freshly logged pieces, so the
  // re-assessment reasons over their semantics rather than raw labels.
  kickTimer = window.setTimeout(() => {
    kickTimer = null;
    void getBeauAssessment(input).catch(() => undefined);
  }, 12000);
}
