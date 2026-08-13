/**
 * Fitting-board reasoning (Fitting overhaul, Parts 3–5) — the ONE endpoint
 * behind every AI-originated outfit board in The Fitting:
 *
 *  · composeFittingBoard(…)  — builds (or ADJUSTS) a single outfit board from
 *    the OWNED wardrobe. When an `adjustment` is passed together with the
 *    current board's ids, the call is a TARGETED single-slot change — only
 *    the relevant piece(s) swap, never a full regeneration. This is the
 *    backend contract the quick-adjust chips (Warmer · Cooler · More casual ·
 *    More formal · Swap shoes · Swap top) call into.
 *  · composeTripBoards(…)    — builds the multi-day board set for Trip mode:
 *    one board per day from the occasion mix, pieces deliberately re-worn
 *    across days (real packing), plus a single trip-level gap note when the
 *    wardrobe can't cover part of the brief.
 *  · fetchTodayWeatherLine() — best-effort weather context for the Today
 *    entry point (stored location → Open-Meteo; null when unavailable).
 *
 * WEATHER IS A HARD FILTER, NOT CONTEXT (Today weather-reasoning fix). Before
 * the single-board compose runs, the wardrobe is cut down to the pieces
 * actually rated for today's FEELS-LIKE temperature (warmth-model.ts). The
 * model only ever sees the surviving candidates, so a waxed jacket on a 30°C
 * day is not offered and rejected — it is not in the list at all. When that
 * cut leaves a core slot uncovered, the closest owned piece is used AND named
 * in a gap note, so Beau is honest rather than quietly wrong. Trip boards are
 * deliberately NOT cut against today's local reading: a trip is reasoned
 * against the destination's climate for the dates, so the prompt rules carry
 * that work there.
 *
 * MODEL TIERING (Performance overhaul, Part 3.4) + PROMPT CACHING (3.3):
 *  · FULL board composition and TRIP board sets are deep-context work —
 *    Claude Sonnet, via the shared transport (claude.ts).
 *  · QUICK-ADJUST chips (Warmer · Cooler · Swap shoes …) are one targeted
 *    slot change against an existing board — Claude Haiku.
 *  · The verbatim system prompts and the wardrobe context block are sent
 *    with cache_control, so consecutive calls (a compose followed by chip
 *    taps, or several trip briefs) skip re-processing the wardrobe.
 *  · The platform OpenAI proxy (gpt-4o-mini) stays as the never-dead-end
 *    fallback, and every call still has a local deterministic compose.
 */
import { callClaude, CLAUDE_HAIKU, CLAUDE_SONNET } from './claude';
import { materialFor, type StyleProfile, type WardrobePiece } from './profile-data';
import { boardSlotFor, type BoardSlot } from './flat-view';
import { getSharedWeather, sharedFilterTempC, sharedWeatherIsWet, sharedWeatherPromptLine } from './weather-context';
import { tempFromWeatherLine, weatherExclusionReason, weatherHardRulesPrompt } from './weather-rules';
import {
  feelsLikeC,
  filterForWeather,
  logExclusions,
  warmthFor,
  warmthPromptSuffix,
  type PieceWarmth,
} from './warmth-model';

// ---------------------------------------------------------------------------
// Shared plumbing
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
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pieceLine(
  p: WardrobePiece,
  materials: Record<number, string>,
  warmth: Record<number, PieceWarmth> = {},
): string {
  const material = materialFor(p, materials);
  return [
    `id ${p.id}: ${p.name}`,
    p.brand ? `by ${p.brand}` : null,
    `[${p.category}${p.slot ? `/${p.slot}` : ''}]`,
    material ? `material: ${material}` : null,
    // Each candidate carries its own temperature band, so the model can see
    // WHY it is on the list and reason inside it.
    warmthPromptSuffix(warmthFor(p, materials, warmth)),
    (p.seasons || []).length > 0 ? `seasons: ${(p.seasons || []).join(',')}` : null,
    (p.occasions || []).length > 0 ? `occasions: ${(p.occasions || []).join(',')}` : null,
  ].filter(Boolean).join(' ');
}

/**
 * The temperature every gate in this module filters on: the live shared
 * reading's feels-like figure first (it is what the customer can see on the
 * card), the weather line's own digit as the fallback.
 */
function gateTempC(weatherLine?: string | null): number | null {
  return sharedFilterTempC() ?? tempFromWeatherLine(weatherLine);
}

const isSuit = (p: WardrobePiece) => p.slot === 'suit' || p.slot === 'dinner-suit';

/**
 * THE MAN, as every board compose must know him (personalisation audit,
 * August 2026). The old block carried his archetypes ALONE — the board was
 * composed blind to his frame, colouring and the registers of his life.
 * Everything here is read from what he actually gave the Dossier; a fact
 * he has not given is simply absent.
 */
function profileBlock(profile: StyleProfile | null): string | null {
  if (!profile) return null;
  const lines: string[] = [];
  const archetypes = (Array.isArray(profile.archetypes) ? profile.archetypes : []).filter(Boolean);
  if (archetypes.length > 0) lines.push(`HIS DIRECTION: ${archetypes.join(', ')}`);
  const frame = [
    profile.build ? `${String(profile.build).toLowerCase()} build` : null,
    profile.height_range || null,
    profile.fit_notes ? `fit note: ${profile.fit_notes}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (frame) lines.push(`HIS FRAME: ${frame} — favour the silhouettes that flatter it.`);
  if (profile.skin_tone) lines.push(`HIS COLOURING: ${profile.skin_tone} — weigh every colour pairing against it.`);
  const occasions = (Array.isArray(profile.occasions) ? profile.occasions : []).filter(Boolean);
  if (occasions.length > 0) lines.push(`HE DRESSES FOR: ${occasions.join(', ')}`);
  if (profile.materials) lines.push(`HIS MATERIALS RULE: ${profile.materials}`);
  const city = (profile as any)?.lifestyle?.city;
  if (typeof city === 'string' && city.trim()) lines.push(`HOME CITY: ${city.trim()}`);
  return lines.length > 0 ? lines.join('\n') : null;
}

/** Model ids → owned pieces: dedupe, one per category, suit-is-one-garment. */
function sanitizeIds(ids: unknown, byId: Map<number, WardrobePiece>): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const seenCategories = new Set<string>();
  const out: WardrobePiece[] = [];
  for (const raw of ids) {
    const id = Number(raw);
    const piece = byId.get(id);
    if (piece && !seen.has(id) && !seenCategories.has(piece.category)) {
      seen.add(id);
      seenCategories.add(piece.category);
      out.push(piece);
    }
  }
  const withSuitRule = out.some(isSuit)
    ? out.filter((p) => isSuit(p) || (p.category !== 'bottoms' && p.category !== 'outerwear'))
    : out;
  return withSuitRule.map((p) => p.id);
}

/** Deterministic fallback — one piece per foundation slot, occasion-aware. */
function composeLocalBoard(pieces: WardrobePiece[], occasion: string, seed: number): number[] {
  const formalish = /work|dinner|wedding|formal|date|smart|business/i.test(occasion);
  const score = (p: WardrobePiece) => {
    const o = p.occasions || [];
    if (formalish) return o.includes('business') || o.includes('formal') || o.includes('smart-casual') ? 1 : 0;
    return o.includes('casual') || o.includes('smart-casual') ? 1 : 0;
  };
  const pick = (filter: (p: WardrobePiece) => boolean, offset: number): WardrobePiece | null => {
    const pool = pieces.filter(filter).sort((a, b) => score(b) - score(a));
    if (pool.length === 0) return null;
    const strong = pool.filter((p) => score(p) === score(pool[0]));
    return strong[(seed + offset) % strong.length];
  };
  const suit = formalish ? pick((p) => p.category === 'formalwear' && isSuit(p), 1) : null;
  const out = [
    pick((p) => p.category === 'tops', 0),
    suit,
    suit ? null : pick((p) => p.category === 'bottoms', 1),
    pick((p) => p.category === 'shoes', 2),
  ].filter(Boolean) as WardrobePiece[];
  return out.map((p) => p.id);
}

// ---------------------------------------------------------------------------
// composeFittingBoard — single board, with the ADJUSTMENT parameter (Part 5)
// ---------------------------------------------------------------------------

export type BoardAdjustment =
  | 'warmer'
  | 'cooler'
  | 'more-casual'
  | 'more-formal'
  | 'swap-shoes'
  | 'swap-top';

export const ADJUSTMENT_LABELS: Record<BoardAdjustment, string> = {
  warmer: 'Warmer',
  cooler: 'Cooler',
  'more-casual': 'More casual',
  'more-formal': 'More formal',
  'swap-shoes': 'Swap shoes',
  'swap-top': 'Swap top',
};

const ADJUSTMENT_BRIEFS: Record<BoardAdjustment, string> = {
  warmer: 'Make the outfit WARMER — add or swap in a warmer layer (knitwear/outerwear). Touch only the layer(s) that change the warmth.',
  cooler: 'Make the outfit COOLER/LIGHTER — drop or swap the heavy layer(s) for lighter pieces. Touch only the layer(s) that change the warmth.',
  'more-casual': 'Take the register DOWN a step — more casual. Swap only the piece(s) that read too formal.',
  'more-formal': 'Take the register UP a step — more formal. Swap only the piece(s) that read too casual.',
  'swap-shoes': 'Swap ONLY the shoes for a different owned pair that works with the rest. Every other piece stays exactly as it is.',
  'swap-top': 'Swap ONLY the top/shirt for a different owned one that works with the rest. Every other piece stays exactly as it is.',
};

const BOARD_SYSTEM = `You are Beau, Ethaion's menswear valet, composing ONE outfit board from a man's real wardrobe. You are given his owned pieces (each with an id) and the brief. You may ONLY use the ids provided — never invent clothes he doesn't own.

Respond ONLY with strict JSON (no markdown):
{
  "pieceIds": number[],  // the full outfit — one bottoms, one pair of shoes, one shirt/top; knitwear and/or outerwear as the weather or brief demands; optional accessories
  "reasoning": string    // ONE short sentence in Beau's warm, direct voice explaining the pairing AGAINST the given weather — e.g. "At 29°C in Manila I've kept it light — linen shirt, tailored shorts, loafers." Never a generic line that ignores the conditions.
}

Rules: respect any weather given (rain → weatherproof outer layer if he owns one; below 12°C → layer knitwear; above 20°C → keep it light); respect the occasion's formality; A SUIT IS ONE GARMENT — jacket and trousers together: if you pick a suit, do NOT add separate trousers, a blazer, or another jacket alongside it; JSON only.

If an ADJUSTMENT and a CURRENT BOARD are given, this is a TARGETED change, not a regeneration: keep every id from the current board that the adjustment does not demand changing, and swap/add/remove ONLY the piece(s) the adjustment names. The reasoning sentence should explain just the change.

` + weatherHardRulesPrompt();

export interface ComposedBoard {
  pieceIds: number[];
  reasoning: string;
  /** One honest sentence when the wardrobe cannot dress today's conditions
   * properly — null when it can. */
  gapNote?: string | null;
}

export async function composeFittingBoard({
  pieces,
  materials,
  profile,
  occasion,
  weatherLine,
  adjustment,
  currentIds,
  warmth,
}: {
  pieces: WardrobePiece[];
  materials: Record<number, string>;
  profile: StyleProfile | null;
  /** The brief — e.g. "an ordinary day", "dinner out", "Day 2 of a Lisbon trip, mostly casual". */
  occasion?: string | null;
  weatherLine?: string | null;
  /** Quick-adjust chips (Part 3.6) — a single constraint added to the last call. */
  adjustment?: BoardAdjustment | null;
  /** The board being adjusted — required for a targeted change. */
  currentIds?: number[] | null;
  /** Stored warmth rows when the caller has them; inference covers the rest. */
  warmth?: Record<number, PieceWarmth>;
}): Promise<ComposedBoard> {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const current = (currentIds || []).filter((id) => byId.has(id));
  const targeted = !!adjustment && current.length > 0;

  // THE PRE-FILTER — the real fix, and the first thing that happens.
  // Everything below reasons over `candidates` only: the pieces rated for
  // today's feels-like temperature. A targeted adjustment keeps the board's
  // own pieces so the untouched slots can be restored, but nothing else out
  // of band comes back.
  const filterTempC = gateTempC(weatherLine);
  const filtered = filterForWeather({
    pieces,
    materials,
    warmth,
    filterTempC,
    wet: sharedWeatherIsWet(),
    keepIds: targeted ? current : [],
  });
  logExclusions('fitting board', filtered, filterTempC);
  // Deliberately NOT `filtered.candidates.length > 0 ? … : pieces`. An empty
  // cut used to mean "hand the model the whole wardrobe again", which is
  // precisely how a waxed jacket reached a 30°C board. filterForWeather now
  // guarantees a non-empty set whenever anything is logged — admitting the
  // closest pieces owned as compromises and saying so in the gap note.
  const candidates = filtered.candidates;

  // The STABLE context — direction + wardrobe — travels as a cached system
  // block (Part 3.3): a compose followed by quick-adjust taps re-uses the
  // processed wardrobe instead of re-reading it, and any wardrobe change
  // rewrites the block so the stale prefix never matches.
  const wardrobeBlock = [
    profileBlock(profile),
    candidates.length > 0
      ? `HIS WARDROBE, ALREADY FILTERED TO WHAT TODAY ALLOWS (only these ids):\n${candidates
          .map((p) => pieceLine(p, materials, warmth))
          .join('\n')}`
      : 'HIS WARDROBE: empty — nothing logged yet.',
  ].filter(Boolean).join('\n\n');
  const userMessage = [
    weatherLine || null,
    filtered.gapNote
      ? `WARDROBE GAP FOR TODAY: ${filtered.gapNote} Say this plainly in your reasoning \u2014 never pretend the piece is right for the conditions.`
      : null,
    `OCCASION: ${(occasion || '').trim() || 'an ordinary day'}`,
    targeted ? `CURRENT BOARD (ids): [${current.join(',')}]` : null,
    targeted && adjustment ? `ADJUSTMENT: ${ADJUSTMENT_BRIEFS[adjustment]}` : null,
  ].filter(Boolean).join('\n\n');

  try {
    // Tiering (Part 3.4): a full composition reasons over the whole
    // wardrobe — Sonnet; a quick-adjust chip is one targeted slot change —
    // Haiku. The OpenAI proxy remains the fallback transport.
    let text = await callClaude({
      model: targeted ? CLAUDE_HAIKU : CLAUDE_SONNET,
      system: [
        { text: BOARD_SYSTEM, cache: true },
        { text: wardrobeBlock, cache: true },
      ],
      user: userMessage,
      maxTokens: 500,
      temperature: targeted ? 0.4 : 0.8,
    });
    if (!text) {
      const res = await fetch('/proxy/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: BOARD_SYSTEM },
            { role: 'user', content: `${wardrobeBlock}\n\n${userMessage}` },
          ],
          max_tokens: 500,
          temperature: targeted ? 0.4 : 0.8,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error('board call failed');
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      text = typeof content === 'string' ? content : null;
    }
    if (!text) throw new Error('board call failed');
    const parsed = extractJson(text);
    let ids = sanitizeIds(parsed?.pieceIds, byId);
    if (ids.length === 0) throw new Error('no board returned');
    if (targeted && adjustment) ids = enforceTargetedChange(current, ids, byId, adjustment);
    // OUTPUT ENFORCEMENT — the belt and braces over the pre-filter above.
    // Whatever the model returned, a layer that violates the hard temperature
    // gates (a wax jacket at 29°C, knitwear at 30°C) is dropped before it
    // reaches the board. Gated on the SAME feels-like figure the candidate cut
    // used, so the two layers can never disagree with each other.
    const tempC = filterTempC ?? getSharedWeather()?.tempC ?? null;
    ids = ids.filter((id) => {
      const piece = byId.get(id);
      if (!piece) return false;
      const reason = weatherExclusionReason(
        { category: piece.category, slot: piece.slot, name: piece.name, material: materialFor(piece, materials) },
        tempC,
      );
      if (reason) console.warn(`[Ethaion] fitting board dropped "${piece.name}" — ${reason}.`);
      return !reason;
    });
    if (ids.length === 0) throw new Error('no weather-appropriate board returned');
    return {
      pieceIds: ids,
      reasoning:
        typeof parsed?.reasoning === 'string' && parsed.reasoning.trim()
          ? parsed.reasoning.trim()
          : 'Composed from what you own, for the brief you gave.',
      gapNote: filtered.gapNote,
    };
  } catch (e) {
    console.warn('[Ethaion] fitting board AI failed, composing locally:', e);
    // The local fallback composes from the FILTERED set too — a dead model
    // call must never be the route by which a wax jacket reaches a 30°C board.
    const ids = composeLocalBoard(candidates, occasion || 'casual', current.length + 1);
    return {
      pieceIds: targeted ? current : ids,
      reasoning: targeted
        ? 'Beau couldn\u2019t adjust that just now \u2014 board stands as it was.'
        : 'A clean, weather-safe pairing from what you own.',
      gapNote: filtered.gapNote,
    };
  }
}

/**
 * Belt-and-braces for the quick-adjust contract: even if the model returns a
 * fuller rewrite, only the slot(s) the adjustment names are allowed to change
 * — every other slot is restored from the current board.
 */
function enforceTargetedChange(
  currentIds: number[],
  proposedIds: number[],
  byId: Map<number, WardrobePiece>,
  adjustment: BoardAdjustment,
): number[] {
  const slotOf = (id: number): BoardSlot => {
    const p = byId.get(id)!;
    return boardSlotFor(p.category, p.name);
  };
  // Which slots the adjustment is ALLOWED to touch.
  const touchable: Record<BoardAdjustment, BoardSlot[]> = {
    warmer: ['outerwear', 'top'],
    cooler: ['outerwear', 'top'],
    'more-casual': ['outerwear', 'top', 'bottom', 'shoes'],
    'more-formal': ['outerwear', 'top', 'bottom', 'shoes'],
    'swap-shoes': ['shoes'],
    'swap-top': ['top'],
  };
  const allowed = new Set(touchable[adjustment]);
  const currentBySlot = new Map<BoardSlot, number>();
  for (const id of currentIds) currentBySlot.set(slotOf(id), id);
  const proposedBySlot = new Map<BoardSlot, number>();
  for (const id of proposedIds) proposedBySlot.set(slotOf(id), id);

  const out: number[] = [];
  const slots: BoardSlot[] = ['outerwear', 'top', 'bottom', 'shoes', 'accessory'];
  for (const slot of slots) {
    if (allowed.has(slot)) {
      // The adjustment may swap, add or (for cooler/register moves) drop it.
      const id = proposedBySlot.get(slot);
      if (id != null) out.push(id);
    } else {
      const id = currentBySlot.get(slot);
      if (id != null) out.push(id);
    }
  }
  return out.length > 0 ? out : currentIds;
}

// ---------------------------------------------------------------------------
// composeTripBoards — the multi-day board set for Trip mode (Part 4)
// ---------------------------------------------------------------------------

export interface TripDayBoard {
  label: string;
  pieceIds: number[];
  reasoning: string;
}

export interface TripBoards {
  days: TripDayBoard[];
  /** ONE trip-level sentence when the wardrobe can't cover part of the mix — else null. */
  gapNote: string | null;
}

const TRIP_BOARD_SYSTEM = `You are Beau, Ethaion's menswear valet, packing a man for a trip FROM HIS OWN WARDROBE. You are given the destination, the dates/length, the occasion mix, and his owned pieces (each with an id). Build one outfit board per day. You may ONLY use the ids provided — never invent clothes he doesn't own.

Respond ONLY with strict JSON (no markdown):
{
  "days": [                 // one entry per day of the trip, in order (cap at 7)
    {
      "label": string,      // e.g. "Day 1 · Travel + casual"
      "pieceIds": number[], // that day's outfit — one bottoms, one shoes, one top; layers as the climate demands
      "reasoning": string   // ONE short sentence in Beau's voice for THIS day's pairing
    }
  ],
  "gapNote": string | null  // if the wardrobe can't properly cover part of the occasion mix, ONE short sentence naming it — e.g. "Nothing formal enough for the dinner on Day 2 — worth adding." — else null
}

Rules: pack like a real suitcase — RE-WEAR pieces across days deliberately (the same trousers or shoes on multiple days is good packing); reason from the destination's typical climate for the dates given; respect the occasion mix day by day; A SUIT IS ONE GARMENT — never suit + separate trousers or a second jacket; keep every string tight; JSON only.

` + weatherHardRulesPrompt();

export async function composeTripBoards({
  destination,
  dates,
  occasions,
  pieces,
  materials,
  profile,
}: {
  destination: string;
  dates: string;
  occasions: string;
  pieces: WardrobePiece[];
  materials: Record<number, string>;
  profile: StyleProfile | null;
}): Promise<TripBoards> {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const fallbackDays = (): TripDayBoard[] => {
    const guessed = Math.min(Math.max(parseDayCount(dates) ?? 3, 1), 7);
    return Array.from({ length: guessed }, (_, i) => ({
      label: `Day ${i + 1}`,
      pieceIds: composeLocalBoard(pieces, occasions || 'casual', i),
      reasoning: 'A clean, packable pairing from what you own.',
    }));
  };

  const wardrobeBlock = [
    profileBlock(profile),
    pieces.length > 0
      ? `HIS WARDROBE (only these ids):\n${pieces.map((p) => pieceLine(p, materials)).join('\n')}`
      : 'HIS WARDROBE: empty — nothing logged yet.',
  ].filter(Boolean).join('\n\n');
  const userMessage = [
    `TRIP: ${destination.trim()}${dates.trim() ? `, ${dates.trim()}` : ''}.`,
    `OCCASION MIX: ${occasions.trim() || 'mostly casual'}`,
  ].join('\n\n');

  try {
    // Trip packing is full outfit generation across days — Sonnet (Part
    // 3.4), with the system prompt and wardrobe block cached (Part 3.3).
    let text = await callClaude({
      model: CLAUDE_SONNET,
      system: [
        { text: TRIP_BOARD_SYSTEM, cache: true },
        { text: wardrobeBlock, cache: true },
      ],
      user: userMessage,
      maxTokens: 1100,
      temperature: 0.6,
    });
    if (!text) {
      const res = await fetch('/proxy/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: TRIP_BOARD_SYSTEM },
            { role: 'user', content: `${wardrobeBlock}\n\n${userMessage}` },
          ],
          max_tokens: 1100,
          temperature: 0.6,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error('trip board call failed');
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      text = typeof content === 'string' ? content : null;
    }
    if (!text) throw new Error('trip board call failed');
    const parsed = extractJson(text);
    const days: TripDayBoard[] = (Array.isArray(parsed?.days) ? parsed.days : [])
      .map((d: any, i: number) => ({
        label: typeof d?.label === 'string' && d.label.trim() ? d.label.trim() : `Day ${i + 1}`,
        pieceIds: sanitizeIds(d?.pieceIds, byId),
        reasoning: typeof d?.reasoning === 'string' ? d.reasoning.trim() : '',
      }))
      .filter((d: TripDayBoard) => d.pieceIds.length > 0)
      .slice(0, 7);
    if (days.length === 0) throw new Error('no trip days returned');
    return {
      days,
      gapNote: typeof parsed?.gapNote === 'string' && parsed.gapNote.trim() ? parsed.gapNote.trim() : null,
    };
  } catch (e) {
    console.warn('[Ethaion] trip boards AI failed, composing locally:', e);
    return {
      days: fallbackDays(),
      gapNote: pieces.length < 6 ? 'The wardrobe log is thin for a full trip — the more you log, the sharper the packing.' : null,
    };
  }
}

/** "3 days", "5–7 Aug", "a week" → a best-effort day count; null when unreadable. */
function parseDayCount(dates: string): number | null {
  const text = dates.toLowerCase();
  const explicit = text.match(/(\d+)\s*(?:day|night)/);
  if (explicit) return Number(explicit[1]);
  if (/weekend/.test(text)) return 3;
  if (/fortnight|two weeks|2 weeks/.test(text)) return 7; // capped board set
  if (/week/.test(text)) return 7;
  const range = text.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (range) {
    const span = Number(range[2]) - Number(range[1]) + 1;
    if (span > 0 && span <= 31) return span;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Weather context for the Today entry point — best-effort, never blocking
// ---------------------------------------------------------------------------

/** Same storage key style-today uses — the last-used location wins. */
const LAST_LOCATION_KEY = 'brummell_last_location';

export async function fetchTodayWeatherLine(profile: StyleProfile | null): Promise<string | null> {
  // The live shared reading (weather-context) answers instantly and matches
  // exactly what the user sees on the card and in The Fitting.
  const live = sharedWeatherPromptLine();
  if (live) return live;
  let city: string | null = null;
  try {
    city = localStorage.getItem(LAST_LOCATION_KEY);
  } catch { /* storage unavailable */ }
  if (!city || !city.trim()) {
    const home = (profile as any)?.lifestyle?.city;
    city = typeof home === 'string' && home.trim() ? home.trim() : null;
  }
  if (!city) return null;
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    if (!geoRes.ok) return null;
    const hit = (await geoRes.json())?.results?.[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
    const params = new URLSearchParams({
      latitude: String(hit.latitude),
      longitude: String(hit.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '1',
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const temp = Math.round(Number(data?.current?.temperature_2m ?? NaN));
    if (Number.isNaN(temp)) return null;
    const min = Math.round(Number(data?.daily?.temperature_2m_min?.[0] ?? temp));
    const max = Math.round(Number(data?.daily?.temperature_2m_max?.[0] ?? temp));
    const rain = Math.round(Number(data?.daily?.precipitation_probability_max?.[0] ?? 0));
    const numberOrNull = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const humidity = numberOrNull(data?.current?.relative_humidity_2m);
    const apparentC = numberOrNull(data?.current?.apparent_temperature);
    const windKmh = numberOrNull(data?.current?.wind_speed_10m);
    // 30°C at 80% humidity is a heavier day than 30°C in dry air — the line
    // says so, and tempFromWeatherLine reads the feels-like figure first so
    // the candidate filter gates on it.
    const feels = feelsLikeC({ tempC: temp, apparentC, humidity, windKmh });
    const feelsBit =
      feels != null && Math.abs(feels - temp) >= 2
        ? ` — FEELS LIKE ${feels}°C${humidity != null ? ` at ${humidity}% humidity` : ''}`
        : humidity != null
          ? `, ${humidity}% humidity`
          : '';
    return `WEATHER TODAY in ${city}: ${temp}°C now (${min}–${max}°C)${feelsBit}, ${rain}% chance of rain.`;
  } catch {
    return null;
  }
}
