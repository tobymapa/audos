/**
 * THE HUNT · BEAU'S PICKS — the recommendation engine behind the first
 * sub-tab.
 *
 * NOTHING on this surface is authored. Unfolding a category asks Beau, live,
 * for the THREE pieces he would have THIS man acquire next in it, and he
 * reasons over the whole record (hunt-reader.ts): his frame, colouring and
 * palette notes, his sizes, his style directions and named references, the
 * registers he actually dresses for, his city and climate curve, EVERY PIECE
 * ON HIS LEDGER — the ones in this category by his own name for them, and the
 * shape of the rest of the wardrobe so a pick complements what he already has
 * — the makers he trusts, the makers he has ruled out, and THE CALLS HE HAS
 * ALREADY MADE, so a piece he passed on never comes back in the same form and
 * one he saved is not offered twice.
 *
 * ONE call per category, made on first unfold and cached against a
 * fingerprint of exactly those facts — so unfolding a category twice costs
 * nothing, while logging a piece or passing on a pick re-writes the picks by
 * itself. A single "Replace" is its own small call for ONE card, never a
 * re-draw of the shelf.
 *
 * THE READER NEVER SEES A FAILURE. There is no static fallback list — a
 * placeholder recommendation would read as Beau's advice — so a draw that
 * does not land returns null and the surface keeps its loading state and asks
 * again (hunt-picks.tsx). Nothing here writes an error string, because
 * nothing here has anywhere to show one.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callClaude, type ClaudeSystemBlock } from './claude';
import { findGarmentType } from './garment-types';
import {
  HUNT_CATEGORIES,
  huntCategory,
  loadHuntCallsMirror,
  retiredInCategory,
  type HuntCall,
  type HuntCategory,
} from './hunt-model';
import { callsInCategory, huntReaderBrief, ownedInCategory, type HuntReader } from './hunt-reader';

/** Three per category — the shelf the founder's screens carry. */
export const PICKS_PER_CATEGORY = 3;

// ---------------------------------------------------------------------------
// The shape of one recommendation
// ---------------------------------------------------------------------------

export interface HuntPick {
  /** The piece as Beau names it, e.g. "Slim-fit merino rollneck in camel". */
  pieceName: string;
  /** The classic garment type it answers, from the category's own runs. */
  garmentType: string;
  /** One real maker Beau would start with — never fast fashion. */
  maker: string;
  /** Honest price guide in the reader's display currency. */
  priceGuide: string;
  /** Why THIS piece, for THIS man — read from his record and his gaps. */
  whyYou: string;
  /** The colour, and why it works against his complexion. */
  colourNote: string;
  /** What to look for when buying — cloth, construction, make. */
  qualitySignals: string;
}

// ---------------------------------------------------------------------------
// Cache — memory first, then localStorage, keyed on the facts themselves.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'ethaion:hunt-picks:v2:';
const memory = new Map<string, HuntPick[]>();
const inflight = new Map<string, Promise<HuntPick[] | null>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): HuntPick[] | null {
  const held = memory.get(key);
  if (held) return held;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HuntPick[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: HuntPick[]): void {
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
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. You are writing THE HUNT: the pieces you would actually put in front of THIS man next. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no marketing, no exclamation marks, no emoji. Write TO him (“you”). '
    + 'THE THESIS, applied without exception: natural or genuinely good materials, considered construction, timeless design, a piece that can be repaired or resoled and still reads right in fifteen years. Fast fashion never appears — no Zara, H&M, ASOS, Shein, Temu, Primark or Boohoo — whatever the price fits. Name REAL makers only, and only ones that genuinely make the piece in question; when you are not certain a maker makes it, choose one you are certain of. '
    + 'Every pick must be SPECIFIC — a cut, a cloth and a colour, not a category (“slim-fit merino rollneck in camel”, never “a knit”). Every line must be earned from the FACTS you are given: his frame, colouring, sizes, directions, city, climate, what is already on his ledger and the calls he has already made. Never invent ownership, never name a maker or place the facts do not warrant, never write a generic compliment, and never repeat a piece he already owns in the same form. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it, no commentary.',
  cache: true,
};

const PICK_SHAPE =
  'Each pick is an object with exactly these keys: '
  + '"pieceName" (the piece as you would name it, cut, cloth and colour included, e.g. "Slim-fit merino rollneck in camel" — max 60 chars), '
  + '"garmentType" (the classic type it answers, chosen from the runs listed above), '
  + '"maker" (ONE real maker to start with), '
  + '"priceGuide" (an honest range in his currency, e.g. "\u00a3220\u2013\u00a3320"), '
  + '"whyYou" (1\u20132 short sentences, max 200 chars — why THIS piece for THIS man: name the thing in his profile it answers and the gap in his ledger it fills; never generic), '
  + '"colourNote" (ONE sentence on why that colour works against his complexion and what he already owns), '
  + '"qualitySignals" (ONE short sentence — the cloth weight, construction or make to look for).';

// ---------------------------------------------------------------------------
// Reading the reply. A reply that ran out of tokens mid-array is still worth
// reading: every COMPLETE object in it is salvaged rather than thrown away,
// so a long answer never costs the reader his shelf.
// ---------------------------------------------------------------------------

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

/** Every self-contained JSON object inside a string, at any depth — what a
 * truncated reply can still be read for. */
function objectsIn(text: string): any[] {
  const out: any[] = [];
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') starts.push(i);
    else if (ch === '}') {
      const start = starts.pop();
      if (start == null) continue;
      try {
        out.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        /* not a complete object on its own */
      }
    }
  }
  return out;
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

/** The picks in a reply, de-duplicated by piece name — the name is a card's
 * identity, so the same one twice would collide. */
function picksFrom(raw: string | null, exclude: string[] = []): HuntPick[] {
  if (!raw) return [];
  const parsed = parseJson(raw);
  const listed = Array.isArray(parsed?.picks)
    ? parsed.picks
    : Array.isArray(parsed)
      ? parsed
      : parsed?.pick
        ? [parsed.pick]
        : null;
  const candidates: any[] = listed || objectsIn(raw).filter((o) => o && (o.pieceName || o.piece_name));
  const seen = new Set(exclude.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const picks: HuntPick[] = [];
  for (const entry of candidates) {
    const pick = sanitizePick(entry);
    if (!pick) continue;
    const name = pick.pieceName.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    picks.push(pick);
  }
  return picks;
}

// ---------------------------------------------------------------------------
// What the prompt is built from
// ---------------------------------------------------------------------------

/** What a category covers, run by run — the reference Beau chooses within, so
 * a pick is always a real menswear type. */
function categoryReference(category: HuntCategory): string {
  return category.subCategories
    .slice(0, 12)
    .map((sub) => {
      const types = sub.typeIds
        .map((id) => findGarmentType(id)?.name || null)
        .filter((name): name is string => !!name)
        .slice(0, 7);
      return `- ${sub.label} — ${sub.note}${types.length > 0 ? `\n  e.g. ${types.join(', ')}` : ''}`;
    })
    .join('\n');
}

/** The shape of the whole wardrobe, one line per category — so a pick is
 * chosen to COMPLEMENT what he owns elsewhere, not just to fill this shelf. */
function wholeLedger(reader: HuntReader): string {
  const lines = HUNT_CATEGORIES.map((category) => {
    const owned = ownedInCategory(reader, category.id);
    return `- ${category.name}: ${owned.length > 0 ? owned.slice(0, 10).join('; ') : 'nothing logged'}`;
  });
  return lines.join('\n');
}

/** Everything about this category that should move the cache when it changes. */
function categoryFacts(reader: HuntReader, category: HuntCategory): unknown {
  return {
    category: category.id,
    owned: ownedInCategory(reader, category.id),
    ledger: reader.pieces.length,
    calls: callsInCategory(reader, category.id),
    cleared: retiredInCategory(category.id),
  };
}

function categoryUserMessage(reader: HuntReader, category: HuntCategory, exclude: string[], count: number): string {
  const owned = ownedInCategory(reader, category.id);
  const calls = callsInCategory(reader, category.id);
  const cleared = [
    ...new Set([...exclude, ...retiredInCategory(category.id)].map((n) => n.trim()).filter(Boolean)),
  ];
  return [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `ON HIS LEDGER IN ${category.name.toUpperCase()} — every piece he has logged here, in his own words:\n`
      + `${owned.length > 0 ? owned.join('\n') : 'nothing logged in this category yet'}`,
    `THE REST OF HIS WARDROBE, so your picks complement it rather than repeat it:\n${wholeLedger(reader)}`,
    'CALLS HE HAS ALREADY MADE IN THIS CATEGORY:\n'
      + `favourites: ${calls.favourite.join('; ') || 'none'}\n`
      + `saved: ${calls.saved.join('; ') || 'none'}\n`
      + `PASSED ON (never offer these again in the same form — answer the same need another way): ${calls.passed.join('; ') || 'none'}`,
    `WHAT ${category.name.toUpperCase()} COVERS — its runs, for your reference:\n${categoryReference(category)}`,
    cleared.length > 0
      ? `ALREADY CLEARED AWAY — do NOT offer any of these again, and nothing that is merely a colour change of one of them: ${cleared.join('; ')}`
      : null,
    `Choose the ${count} pieces you would have him acquire NEXT in ${category.name} — the best ${count}, not a survey of the category: `
      + 'each one filling a real gap in what he owns, suiting his frame, colouring, climate and the way he actually dresses, and spread across different runs where that serves him better than three of a kind. '
      + `Return JSON: {"picks": [ \u2026 ]} — EXACTLY ${count} picks. ${PICK_SHAPE}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// ONE CATEGORY — the call made when a category is unfolded.
// ---------------------------------------------------------------------------

/**
 * The three pieces Beau would have this man acquire next in one category.
 * Cached on the facts; returns null when he could not be reached, which the
 * surface treats as "still working" rather than as an error.
 */
export async function drawCategoryPicks(
  reader: HuntReader,
  categoryId: string,
  options: { forceRefresh?: boolean; count?: number } = {},
): Promise<HuntPick[] | null> {
  const category = huntCategory(categoryId);
  if (!category) return null;
  const count = options.count || PICKS_PER_CATEGORY;
  const key = `${CACHE_PREFIX}${categoryId}:${count}:${fingerprint({
    reader: huntReaderBrief(reader),
    facts: categoryFacts(reader, category),
  })}`;
  if (!options.forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
    const running = inflight.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<HuntPick[] | null> => {
    const user = categoryUserMessage(reader, category, [], count);
    // Sonnet knows this man deeply enough to choose the pieces; Haiku is the
    // second pass so a busy moment on one model is never a dead end.
    let picks = picksFrom(
      await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 1800, temperature: 0.5 }),
    );
    if (picks.length === 0) {
      picks = picksFrom(
        await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 1800, temperature: 0.55 }),
      );
    }
    if (picks.length === 0) return null;
    const result = picks.slice(0, count);
    writeCache(key, result);
    return result;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// REPLACE — ONE fresh pick for ONE card.
// ---------------------------------------------------------------------------

/**
 * Draw a replacement for a single card. The piece just cleared away, the two
 * still on the shelf and everything already cleared or passed in this
 * category are all excluded, so the replacement is genuinely a different
 * answer to the same need. Returns null when Beau is unreachable — the caller
 * simply leaves the shelf a card short and tops it up on its next pass.
 */
export async function drawCategoryReplacement(input: {
  reader: HuntReader;
  categoryId: string;
  /** Piece names that must not come back — the cleared one plus its siblings. */
  exclude: string[];
}): Promise<HuntPick | null> {
  const category = huntCategory(input.categoryId);
  if (!category) return null;
  const user = categoryUserMessage(input.reader, category, input.exclude, 1);
  let picks = picksFrom(
    await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 800, temperature: 0.65 }),
    input.exclude,
  );
  if (picks.length === 0) {
    picks = picksFrom(
      await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 800, temperature: 0.7 }),
      input.exclude,
    );
  }
  return picks[0] || null;
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
        + 'Return JSON: {"reads": [{"categoryId": "<the id, verbatim>", "line": "\u2026"}]} — one entry per category, in the order given.',
    ].join('\n\n');
    let raw = await callClaude({ model: CLAUDE_HAIKU, system: [VOICE], user, maxTokens: 1200, temperature: 0.5 });
    if (!raw) raw = await callClaude({ model: CLAUDE_SONNET, system: [VOICE], user, maxTokens: 1200, temperature: 0.5 });
    const parsed = parseJson(raw);
    const list: any[] = Array.isArray(parsed?.reads)
      ? parsed.reads
      : Array.isArray(parsed)
        ? parsed
        : objectsIn(raw || '').filter((o) => o && (o.categoryId || o.id));
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
