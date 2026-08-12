/**
 * THE HUNT · BEAU'S PICKS — the recommendation engine behind the first
 * sub-tab.
 *
 * NOTHING on this surface is authored. When a category is unfolded Beau is
 * asked, live, for the pieces HE would put in front of THIS man for each of
 * that category's sub-categories, and he reasons over the whole record
 * (hunt-reader.ts): his frame, colouring and palette notes, his sizes, his
 * style directions and named references, the registers he actually dresses
 * for, his city and climate curve, every piece on his ledger in that
 * category by his own name for it, the makers he trusts and the makers he
 * has ruled out — and THE CALLS HE HAS ALREADY MADE, so a piece he passed on
 * never comes back in the same form and one he saved is not offered twice.
 *
 * ONE call per category, made on first unfold and cached against a
 * fingerprint of exactly those facts — so unfolding a category twice costs
 * nothing, while logging a piece or passing on a pick re-writes the picks by
 * itself. A single "Delete & replace" is its own small call for ONE
 * sub-category, never a re-draw of the page.
 *
 * There is deliberately NO static fallback list: when Beau cannot be reached
 * the sub-category says so plainly and offers to try again. Placeholder
 * recommendations would be worse than none — they would read as his advice.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callClaude, type ClaudeSystemBlock } from './claude';
import { findGarmentType } from './garment-types';
import {
  HUNT_CATEGORIES,
  huntCategory,
  loadHuntCallsMirror,
  retiredPieceNames,
  type HuntCall,
  type HuntCategory,
  type HuntSubCategory,
} from './hunt-model';
import { callsInCategory, huntReaderBrief, ownedInCategory, type HuntReader } from './hunt-reader';

// ---------------------------------------------------------------------------
// The shape of one recommendation
// ---------------------------------------------------------------------------

export interface HuntPick {
  /** The piece as Beau names it, e.g. "Olive waxed cotton field jacket". */
  pieceName: string;
  /** The classic garment type it answers, from the sub-category's own run. */
  garmentType: string;
  /** One real maker Beau would start with — never fast fashion. */
  maker: string;
  /** Honest price guide in the reader's display currency. */
  priceGuide: string;
  /** Why THIS piece, for THIS man — read from his record. */
  whyYou: string;
  /** The colour, and why it works against his complexion. */
  colourNote: string;
  /** What to look for when buying — cloth, construction, make. */
  qualitySignals: string;
}

export interface HuntSubCategoryPicks {
  /** The sub-category (garment run) label these picks answer. */
  subCategory: string;
  /** Beau's one line on where this man stands in this run — what he has,
   * what is missing, why it is worth (or not worth) filling now. */
  read: string;
  picks: HuntPick[];
}

export interface HuntCategoryPicks {
  categoryId: string;
  subCategories: HuntSubCategoryPicks[];
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Cache — memory first, then localStorage, keyed on the facts themselves.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'ethaion:hunt-picks:v1:';
const memory = new Map<string, HuntCategoryPicks>();
const inflight = new Map<string, Promise<HuntCategoryPicks | null>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): HuntCategoryPicks | null {
  const held = memory.get(key);
  if (held) return held;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HuntCategoryPicks;
    if (!parsed || !Array.isArray(parsed.subCategories)) return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: HuntCategoryPicks): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full — the memory copy carries the session */
  }
}

// ---------------------------------------------------------------------------
// The voice — stable, so Anthropic caches the processed prefix across every
// category the reader unfolds in a session.
// ---------------------------------------------------------------------------

const VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. You are writing THE HUNT: the pieces you would actually put in front of THIS man. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no marketing, no exclamation marks, no emoji. Write TO him (“you”). '
    + 'THE THESIS, applied without exception: natural or genuinely good materials, considered construction, timeless design, a piece that can be repaired or resoled and still reads right in fifteen years. Fast fashion never appears — no Zara, H&M, ASOS, Shein, Temu, Primark or Boohoo — whatever the price fits. Name REAL makers only, and only ones that genuinely make the piece in question; when you are not certain a maker makes it, choose one you are certain of. '
    + 'Every line must be earned from the FACTS you are given — his frame, colouring, sizes, directions, city, climate, what is on his ledger and the calls he has already made. Never invent ownership, never name a maker or place the facts do not warrant, never write a generic compliment. If a sub-category genuinely does not deserve a pick for this man (he has it covered, or it is the wrong tool where he lives) return FEWER picks rather than filler. Return STRICT JSON only — no markdown fences, no prose around it.',
  cache: true,
};

const PICK_SHAPE =
  'Each pick is an object with exactly these keys: '
  + '"pieceName" (the piece as you would name it, colour and cloth included, e.g. "Olive waxed cotton field jacket" — max 60 chars), '
  + '"garmentType" (the classic type it answers, chosen from the sub-category\u2019s listed types), '
  + '"maker" (ONE real maker to start with), '
  + '"priceGuide" (an honest range in his currency, e.g. "\u00a3220\u2013\u00a3320"), '
  + '"whyYou" (1\u20132 short sentences, max 200 chars — why THIS piece for THIS man, read from his frame, colouring, climate, directions, what he owns and the gaps; never generic), '
  + '"colourNote" (ONE sentence on why that colour works against his complexion and what he already owns), '
  + '"qualitySignals" (ONE short sentence — the cloth weight, construction or make to look for).';

function parseJson(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
      const start = trimmed.indexOf(open);
      const end = trimmed.lastIndexOf(close);
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          /* try the next shape */
        }
      }
    }
    return null;
  }
}

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function sanitizePick(raw: any): HuntPick | null {
  const pieceName = str(raw?.pieceName ?? raw?.piece_name, 90);
  if (!pieceName) return null;
  return {
    pieceName,
    garmentType: str(raw?.garmentType ?? raw?.garment_type, 60),
    maker: str(raw?.maker ?? raw?.exampleBrand, 60),
    priceGuide: str(raw?.priceGuide ?? raw?.price_guide, 40),
    whyYou: str(raw?.whyYou ?? raw?.why_you ?? raw?.whyNow, 260),
    colourNote: str(raw?.colourNote ?? raw?.colour_note ?? raw?.colorwayNote, 220),
    qualitySignals: str(raw?.qualitySignals ?? raw?.quality_signals, 220),
  };
}

/** The classic types one sub-category covers, by name — the reference Beau
 * chooses within, so a pick is always a real menswear type. */
function typeNames(sub: HuntSubCategory, limit = 14): string[] {
  return sub.typeIds
    .map((id) => findGarmentType(id)?.name || null)
    .filter((name): name is string => !!name)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// ONE CATEGORY — the call made when a category is unfolded.
// ---------------------------------------------------------------------------

/** Everything about this category that should move the cache when it changes. */
function categoryFacts(reader: HuntReader, category: HuntCategory): unknown {
  return {
    category: category.id,
    owned: ownedInCategory(reader, category.id),
    calls: callsInCategory(reader, category.id),
    retired: category.subCategories.map((sub) => retiredPieceNames(category.id, sub.label)),
  };
}

function categoryUserMessage(reader: HuntReader, category: HuntCategory): string {
  const owned = ownedInCategory(reader, category.id);
  const calls = callsInCategory(reader, category.id);
  const subLines = category.subCategories
    .map((sub) => {
      const retired = retiredPieceNames(category.id, sub.label);
      const types = typeNames(sub);
      return (
        `- "${sub.label}" — ${sub.note}\n`
        + `  the classic types it covers: ${types.join(', ') || 'use your own judgement within the run'}\n`
        + (retired.length > 0 ? `  already cleared away here, do NOT repeat: ${retired.join(', ')}\n` : '')
      );
    })
    .join('');
  return [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `ON HIS LEDGER IN ${category.name.toUpperCase()} (his own words for each piece):\n`
      + `${owned.length > 0 ? owned.join('\n') : 'nothing logged in this category yet'}`,
    'CALLS HE HAS ALREADY MADE IN THIS CATEGORY:\n'
      + `favourites: ${calls.favourite.join('; ') || 'none'}\n`
      + `saved: ${calls.saved.join('; ') || 'none'}\n`
      + `PASSED ON (never offer these again in the same form — answer the same need another way): ${calls.passed.join('; ') || 'none'}`,
    `THE SUB-CATEGORIES of ${category.name}, in order:\n${subLines}`,
    'Return JSON: {"subCategories": [{"subCategory": "<the label, verbatim>", "read": "…", "picks": [ … ]}]} — one entry for EVERY sub-category listed above, in the same order. '
      + '"read" is ONE sentence (max 150 chars) on where HE stands in that run: what he already has, what is missing, and whether it is worth filling now — written to him, never generic. '
      + `"picks" holds TWO picks (one only when a second would be filler, none at all when he genuinely has that run answered). ${PICK_SHAPE}`,
  ].join('\n\n');
}

/**
 * Beau's picks for ONE category, sub-category by sub-category. Cached on the
 * facts; returns null when he could not be reached.
 */
export async function getHuntCategoryPicks(
  reader: HuntReader,
  categoryId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<HuntCategoryPicks | null> {
  const category = huntCategory(categoryId);
  if (!category) return null;
  const key = `${CACHE_PREFIX}${categoryId}:${fingerprint({
    reader: huntReaderBrief(reader),
    facts: categoryFacts(reader, category),
  })}`;
  if (!options.forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
    const running = inflight.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<HuntCategoryPicks | null> => {
    const user = categoryUserMessage(reader, category);
    // Sonnet knows this man deeply enough to choose the pieces; Haiku is the
    // second pass so a busy moment on one model is never a dead end.
    let raw = await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 3600, temperature: 0.5 });
    if (!raw) raw = await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 3600, temperature: 0.5 });
    const parsed = parseJson(raw);
    const list: any[] = Array.isArray(parsed?.subCategories)
      ? parsed.subCategories
      : Array.isArray(parsed)
        ? parsed
        : [];
    if (list.length === 0) return null;
    const byLabel = new Map<string, any>();
    for (const entry of list) {
      const key_ = str(entry?.subCategory ?? entry?.sub_category ?? entry?.label, 80).toLowerCase();
      if (key_) byLabel.set(key_, entry);
    }
    const subCategories: HuntSubCategoryPicks[] = category.subCategories.map((sub) => {
      const entry = byLabel.get(sub.label.toLowerCase());
      const seen = new Set<string>();
      const picks = (Array.isArray(entry?.picks) ? entry.picks : [])
        .map(sanitizePick)
        .filter((pick: HuntPick | null): pick is HuntPick => {
          // The piece NAME is a shelf's identity — it keys the card, the tag
          // and the retired list — so the same name twice would collide.
          if (!pick) return false;
          const name = pick.pieceName.toLowerCase();
          if (seen.has(name)) return false;
          seen.add(name);
          return true;
        })
        .slice(0, 3);
      return { subCategory: sub.label, read: str(entry?.read, 200), picks };
    });
    if (subCategories.every((sub) => sub.picks.length === 0)) return null;
    const result: HuntCategoryPicks = { categoryId, subCategories, generatedAt: Date.now() };
    writeCache(key, result);
    return result;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// DELETE & REPLACE — ONE fresh pick for ONE sub-category.
// ---------------------------------------------------------------------------

/**
 * Draw a replacement for a single card. The piece just cleared away, its
 * siblings on that shelf and everything already cleared or passed there are
 * all excluded, so the replacement is genuinely a different answer to the
 * same need. Returns null when Beau is unreachable — the caller puts the
 * shelf back as it was and says so.
 */
export async function drawReplacementPick(input: {
  reader: HuntReader;
  categoryId: string;
  subCategory: string;
  /** Piece names that must not come back — the deleted one plus its siblings. */
  exclude: string[];
}): Promise<HuntPick | null> {
  const category = huntCategory(input.categoryId);
  const sub = category?.subCategories.find((s) => s.label === input.subCategory);
  if (!category || !sub) return null;
  const calls = callsInCategory(input.reader, input.categoryId);
  const excluded = [
    ...new Set(
      [...input.exclude, ...retiredPieceNames(input.categoryId, input.subCategory)]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const user = [
    `THE MAN:\n${huntReaderBrief(input.reader)}`,
    `ON HIS LEDGER IN ${category.name.toUpperCase()}:\n`
      + `${ownedInCategory(input.reader, input.categoryId).join('\n') || 'nothing logged in this category yet'}`,
    `PASSED ON in this category (never in the same form): ${calls.passed.join('; ') || 'none'}`,
    `THE SUB-CATEGORY: "${sub.label}" of ${category.name} — ${sub.note}\n`
      + `The classic types it covers: ${typeNames(sub).join(', ')}`,
    'He cleared these away and wants a DIFFERENT answer to the same need — none of them, and nothing that is '
      + `merely a colour change of one of them: ${excluded.join('; ') || 'none'}`,
    `Return JSON: {"pick": { … }} — exactly ONE pick. ${PICK_SHAPE}`,
  ].join('\n\n');
  let raw = await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 700, temperature: 0.65 });
  if (!raw) raw = await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 700, temperature: 0.65 });
  const parsed = parseJson(raw);
  return sanitizePick(parsed?.pick ?? parsed);
}

// ---------------------------------------------------------------------------
// THE CATEGORY READS — the one line each COLLAPSED category carries.
//
// The list is the first thing on the sub-tab, and a bare list of eleven nouns
// says nothing about this man. So one call, made once when the list first
// paints, writes Beau's line for every category at once: where he stands in
// it, read from his ledger and his calls. It is cached on the same facts the
// picks are, so it costs nothing on a revisit and re-writes itself when his
// record moves. Failure is silent — the list simply reads without the lines
// rather than showing invented ones.
// ---------------------------------------------------------------------------

const READS_PREFIX = 'ethaion:hunt-reads:v1:';
const readsMemory = new Map<string, Record<string, string>>();
const readsInflight = new Map<string, Promise<Record<string, string>>>();

export async function getHuntCategoryReads(
  reader: HuntReader,
  options: { forceRefresh?: boolean } = {},
): Promise<Record<string, string>> {
  const ledger = HUNT_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    owned: ownedInCategory(reader, category.id),
    calls: callsInCategory(reader, category.id),
  }));
  const key = `${READS_PREFIX}${fingerprint({ brief: huntReaderBrief(reader), ledger })}`;
  if (!options.forceRefresh) {
    const held = readsMemory.get(key);
    if (held) return held;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === 'object') {
          readsMemory.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      /* storage unavailable — fall through and ask him */
    }
    const running = readsInflight.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<Record<string, string>> => {
    const user = [
      `THE MAN:\n${huntReaderBrief(reader)}`,
      `HIS LEDGER, CATEGORY BY CATEGORY:\n${ledger
        .map(
          (entry) =>
            `- ${entry.id} (${entry.name}): ${entry.owned.join('; ') || 'nothing logged'}`
            + `${entry.calls.passed.length > 0 ? ` — passed on: ${entry.calls.passed.join('; ')}` : ''}`,
        )
        .join('\n')}`,
      'Write ONE line for each category — where HE stands in it, read from what he owns and what he has passed on. '
        + 'Each line is a single sentence, max 90 characters, written to him, concrete and specific to his record — never a definition of the category and never a compliment. '
        + 'Return JSON: {"reads": [{"categoryId": "<the id, verbatim>", "line": "…"}]} — one entry per category, in the order given.',
    ].join('\n\n');
    let raw = await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 1200, temperature: 0.5 });
    if (!raw) raw = await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 1200, temperature: 0.5 });
    const parsed = parseJson(raw);
    const list: any[] = Array.isArray(parsed?.reads) ? parsed.reads : Array.isArray(parsed) ? parsed : [];
    const out: Record<string, string> = {};
    for (const entry of list) {
      const id = str(entry?.categoryId ?? entry?.id, 40).toLowerCase();
      const line = str(entry?.line ?? entry?.read, 140);
      if (id && line && huntCategory(id)) out[id] = line;
    }
    if (Object.keys(out).length === 0) return {};
    readsMemory.set(key, out);
    try {
      window.localStorage.setItem(key, JSON.stringify(out));
    } catch {
      /* storage full — the memory copy carries the session */
    }
    return out;
  })().finally(() => readsInflight.delete(key));

  readsInflight.set(key, job);
  return job;
}

/** The tags currently held, read synchronously from the local mirror — lets
 * a card paint its own state on the first frame. */
export function peekHuntCalls(): HuntCall[] {
  return loadHuntCallsMirror();
}
