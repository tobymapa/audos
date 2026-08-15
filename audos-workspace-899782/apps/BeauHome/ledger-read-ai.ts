/**
 * THE LEDGER · BEAU'S READ OF WHAT HE OWNS.
 *
 * The arithmetic (ledger-model.ts) knows which piece is finished, which one
 * he never reaches for and which category the record argues with. It cannot
 * write the three pieces of prose the design is made of, and not one of them
 * may be authored copy — they are all about THIS man's own pieces:
 *
 *   1. THE PIECE READS — one of the five verdicts (Core · Sound · Under-used
 *      · Wrong register · Worn out) and one or two sentences against it, in
 *      the column the design calls “Beau's read”.
 *   2. THE CATEGORY LINES — the line under each category name: what that
 *      part of the wardrobe is actually doing for him.
 *   3. WHAT HE WOULD CUT — the reason each piece in the cut table is there,
 *      in the order he would deal with them, and the closing line explaining
 *      the order.
 *
 * ONE call (claude.ts `callModel` — Sonnet, the same model again, Haiku, then
 * the platform's own text model, so it never dead-ends), read against his
 * whole record (hunt-reader.ts). CACHED on a fingerprint of the facts
 * themselves, in memory and in sessionStorage: re-rendering, switching
 * face, unfolding a category or coming back to the tab all cost nothing,
 * while logging a piece or correcting one re-writes the read by itself.
 *
 * TWO RULES THE PROMPT CANNOT BEND. His labels are sacred — a piece is
 * referred to by the name he typed, never renamed or corrected. And the cut
 * list is evidence: the only pieces he may argue against are the ones the
 * arithmetic already put in front of him.
 *
 * NOTHING HERE CAN LEAVE THE PAGE EMPTY: every read, line and reason has a
 * deterministic version written from the same facts, so the ledger is
 * complete and honest whether or not a call lands.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel, type ClaudeSystemBlock } from './claude';
import { huntReaderBrief, type HuntReader } from './hunt-reader';
import {
  CUT_FOOT,
  LEDGER_READS,
  computeCuts,
  computedCategoryLine,
  type LedgerModel,
  type LedgerPieceRow,
  type LedgerRead,
  ledgerFingerprint,
} from './ledger-model';

export interface LedgerVerdict {
  read: LedgerRead;
  note: string;
}

export interface LedgerReading {
  /** piece id → his verdict and the line under it. */
  pieces: Record<number, LedgerVerdict>;
  /** category id → the line under the category name. */
  categories: Record<string, string>;
  /** piece id → why the cut table has it. */
  cuts: Record<number, string>;
  /** The order he would deal with them, by piece id. */
  cutOrder: number[];
  /** The closing line under the cut table. */
  foot: string;
  fromBeau: boolean;
}

export function emptyLedgerReading(): LedgerReading {
  return { pieces: {}, categories: {}, cuts: {}, cutOrder: [], foot: CUT_FOOT, fromBeau: false };
}

// ---------------------------------------------------------------------------
// The session cache
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'ethaion:ledger-reading:v1:';
const memory = new Map<string, LedgerReading>();
const inflight = new Map<string, Promise<LedgerReading>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): LedgerReading | null {
  const held = memory.get(key);
  if (held) return held;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerReading;
    if (!parsed || typeof parsed.pieces !== 'object') return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: LedgerReading): void {
  memory.set(key, value);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the memory copy carries the session */
  }
}

// ---------------------------------------------------------------------------
// Reading the reply
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

function str(v: unknown, max = 240): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function readOf(v: unknown): LedgerRead | null {
  const wanted = str(v, 40).toLowerCase();
  return LEDGER_READS.find((r) => r.toLowerCase() === wanted) || null;
}

// ---------------------------------------------------------------------------
// The voice
// ---------------------------------------------------------------------------

const VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. You are writing THE RAIL: your read of everything he actually owns, piece by piece. '
    + 'Register: quiet, knowing, concrete, lightly British; short declarative sentences; no marketing, no exclamation marks, no emoji, no bullet lists, no headings. Write TO him (“you”). '
    + 'HIS LABELS ARE SACRED: refer to a piece only by the name he typed, exactly as given — never rename it, correct it, expand it or substitute a different garment. '
    + 'Every line must be earned from the FACTS you are given — the cloth, the colour, the temperature band, the condition he noted, the wears logged, how it fits him, where he actually wears it, how he says he feels in it, and anything he wrote for you. '
    + 'Never invent a piece, a price, a wear or a fault. Where a fact is missing, say what he could tell you instead of guessing. Never write a generic compliment. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it, no commentary.',
  cache: true,
};

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

function pieceLine(row: LedgerPieceRow): string {
  const facts: string[] = [`${row.categoryName} \u00b7 ${row.sub}`, `cloth ${row.cloth}`];
  if (row.colour) facts.push(`colour ${row.colour}`);
  facts.push(`band ${row.band}`);
  if (row.maker) facts.push(`maker ${row.maker}`);
  if (row.fits.length > 0) facts.push(`fits ${row.fits.join(', ').toLowerCase()}`);
  if (row.feel) facts.push(`he says: ${row.feel.toLowerCase()}`);
  if (row.wearContexts.length > 0) facts.push(`worn for ${row.wearContexts.join(', ').toLowerCase()}`);
  facts.push(`${row.wears} wears logged`);
  if (row.loggedDaysAgo != null) facts.push(`logged ${row.loggedDaysAgo} days ago`);
  if (row.condition) facts.push(`his condition note: “${row.condition}”`);
  if (row.tailoring) facts.push(`altered: ${row.tailoring}`);
  if (row.sameJobAs) facts.push(`same job as his “${row.sameJobAs}”`);
  if (row.ownNote) facts.push(`he wrote: “${row.ownNote}”`);
  return `- id ${row.id} | “${row.name}” | ${facts.join(' | ')} | the arithmetic reads it ${row.read}`;
}

function categoryLines(model: LedgerModel): string {
  return model.categories
    .map(
      (category) =>
        `- ${category.id} | ${category.name} | ${category.owned} logged | ${category.toLookAt} the record argues with`,
    )
    .join('\n');
}

/** How many pieces one call reads. A ledger longer than this is read in its
 * canonical order and the rest keep the arithmetic's own lines. */
const READ_LIMIT = 40;

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

export async function readLedgerVerdicts(input: {
  reader: HuntReader;
  model: LedgerModel;
  forceRefresh?: boolean;
}): Promise<LedgerReading> {
  const { reader, model } = input;
  const brief = huntReaderBrief(reader);
  const key = `${CACHE_PREFIX}${fingerprint({ brief, ledger: ledgerFingerprint(model) })}`;
  const fallback = emptyLedgerReading();
  if (model.rows.length === 0) return fallback;

  if (!input.forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
    const running = inflight.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<LedgerReading> => {
    const rows = model.rows.slice(0, READ_LIMIT);
    const cutIds = model.cuts.map((c) => c.id);
    const user = [
      `THE MAN:\n${brief}`,
      `HIS LEDGER — every piece he owns, with everything on file about it:\n${rows.map(pieceLine).join('\n')}`,
      `HIS CATEGORIES:\n${categoryLines(model)}`,
      cutIds.length > 0
        ? `THE RECORD ALREADY ARGUES AGAINST THESE (ids): ${cutIds.join(', ')}. They belong in the cut list whatever else you write.`
        : 'The record does not yet argue against anything by itself — no piece is marked finished and he has not told you he feels wrong in one.',
      'Write THREE things.\n\n'
        + '1. PIECES — for every id above: your read, which MUST be exactly one of Core, Sound, Under-used, Wrong register, Worn out; and a note of one or two sentences, max 220 characters, about THAT piece. '
        + 'Core is a piece the wardrobe runs on. Sound is right and needs nothing. Under-used is owned but not doing the job it holds. Wrong register is a piece that does not belong in the life he actually leads. Worn out is finished. '
        + 'You may disagree with the arithmetic — but never overrule what HE said: if he told you he never quite feels right in a piece, it is not Core or Sound.\n\n'
        + '2. CATEGORIES — one line against each category id, max 120 characters: what that part of his wardrobe is actually doing for him. Concrete about his own pieces; never a definition of the category.\n\n'
        + '3. CUTS — every piece you read as Worn out or Wrong register (and any flagged id above), in the order you would deal with them, each with a reason of one or two sentences (max 200 characters) naming the evidence from the facts. Never argue against a piece he told you he reaches for, and never because you would rather he owned something else. '
        + 'Also FOOT: one or two sentences under the table explaining how you cut and that keeping a piece anyway is part of the record (max 340 characters).\n\n'
        + 'Return JSON: {"pieces": [{"id": <number>, "read": "…", "note": "…"}], "categories": [{"id": "<category id verbatim>", "line": "…"}], "cuts": [{"id": <number>, "why": "…"}], "foot": "…"}',
    ]
      .filter(Boolean)
      .join('\n\n');

    const raw = await callModel({
      model: CLAUDE_SONNET,
      second: CLAUDE_HAIKU,
      system: [VOICE],
      user,
      maxTokens: 4000,
      temperature: 0.45,
    });
    const parsed = parseJson(raw);
    if (!parsed) return fallback;

    const known = new Map(model.rows.map((r) => [r.id, r]));
    const pieces: Record<number, LedgerVerdict> = {};
    for (const entry of Array.isArray(parsed.pieces) ? parsed.pieces : []) {
      const id = Number(entry?.id);
      const read = readOf(entry?.read);
      const note = str(entry?.note, 300);
      if (!known.has(id) || !read || !note) continue;
      const row = known.get(id) as LedgerPieceRow;
      // His own answer is not his to overrule.
      const honest: LedgerRead =
        row.feel === 'Never quite right' && (read === 'Core' || read === 'Sound') ? row.read : read;
      pieces[id] = { read: honest, note };
    }

    const validCategories = new Set(model.categories.map((c) => c.id));
    const categories: Record<string, string> = {};
    for (const entry of Array.isArray(parsed.categories) ? parsed.categories : []) {
      const id = str(entry?.id, 40).toLowerCase();
      const line = str(entry?.line ?? entry?.note, 200);
      if (validCategories.has(id) && line) categories[id] = line;
    }

    // A reason is kept for any piece on the ledger: whether it actually
    // reaches the table is decided by the merged READ, not by this list
    // (applyLedgerReading recomputes the membership), so a reason for a piece
    // he then reads as Sound is simply never shown.
    const cuts: Record<number, string> = {};
    const cutOrder: number[] = [];
    for (const entry of Array.isArray(parsed.cuts) ? parsed.cuts : []) {
      const id = Number(entry?.id);
      const why = str(entry?.why ?? entry?.reason, 260);
      if (!known.has(id) || cuts[id] || !why) continue;
      cuts[id] = why;
      cutOrder.push(id);
    }

    if (Object.keys(pieces).length === 0 && Object.keys(categories).length === 0) return fallback;

    const reading: LedgerReading = {
      pieces,
      categories,
      cuts,
      cutOrder,
      foot: str(parsed?.foot, 420) || CUT_FOOT,
      fromBeau: true,
    };
    writeCache(key, reading);
    return reading;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/**
 * The model with his words in it. The reads themselves can move — Beau may
 * call a piece the arithmetic thought sound under-used — so the cut list and
 * every category's status are recomputed from the merged reads rather than
 * carried over, and his ordering of the cuts is applied on top.
 */
export function applyLedgerReading(model: LedgerModel, reading: LedgerReading): LedgerModel {
  if (!reading.fromBeau) return model;

  const rows: LedgerPieceRow[] = model.rows.map((row) => {
    const verdict = reading.pieces[row.id];
    return verdict ? { ...row, read: verdict.read, note: verdict.note, fromBeau: true } : row;
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const categories = model.categories.map((category) => {
    const pieces = category.pieces.map((p) => byId.get(p.id) || p);
    const toLookAt = pieces.filter((p) => p.read === 'Wrong register' || p.read === 'Worn out').length;
    const line = reading.categories[category.id];
    return {
      ...category,
      pieces,
      toLookAt,
      status: toLookAt > 0 ? `${toLookAt} to look at` : pieces.length > 0 ? 'In order' : 'Nothing logged',
      line: line || computedCategoryLine(category.name, pieces, toLookAt),
      fromBeau: !!line,
    };
  });

  const cuts = computeCuts(rows).sort((a, b) => {
    const ai = reading.cutOrder.indexOf(a.id);
    const bi = reading.cutOrder.indexOf(b.id);
    if (ai === bi) return 0;
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });

  return { categories, rows, total: rows.length, cuts };
}
