/**
 * THE EDIT · BEAU'S READING OF THE YEAR (rebuilt to the founder's reference
 * design).
 *
 * The arithmetic (edit-model.ts) knows WHICH cells are blank and how many
 * days of his year they cost. It cannot write the three pieces of prose the
 * design is made of, and none of them may be authored copy — they are all
 * about THIS man:
 *
 *   1. THE CELL NOTES — what a blank cell on the map actually means, in two
 *      sentences (“Thirty-four days with no outer layer that finishes an
 *      outfit…”), for the cells worth explaining.
 *   2. THE SUB-CATEGORY LINES — one line against each sub-category on the By
 *      Category face, in the register the design sets: what he owns there and
 *      whether it is doing its job.
 *   3. THE GAPS, IN THE ORDER HE WOULD CLOSE THEM — each named as a real
 *      piece (“A charcoal overcoat”), with the reason the order is that order.
 *
 * ONE call (claude.ts `callModel` — Sonnet, the same model again, Haiku, then
 * the platform's own text model, so it never dead-ends), read against his
 * whole record (hunt-reader.ts). CACHED PER SESSION on a fingerprint of the
 * facts themselves, in memory and in sessionStorage: re-rendering, switching
 * face, unfolding a category or coming back to the tab all cost nothing,
 * while logging a piece or editing the dossier re-writes the read by itself.
 *
 * NOTHING HERE CAN LEAVE THE PAGE EMPTY. Every one of the three has a
 * deterministic fallback written from the same arithmetic, so the map, the
 * category rows and the gap table are complete and honest whether or not a
 * model call lands. The reader is never shown an error, because there is
 * nothing for him to fix.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel, type ClaudeSystemBlock } from './claude';
import { findGarmentType } from './garment-types';
import { matchGarmentTypeId } from './index-model';
import { huntReaderBrief, type HuntReader } from './hunt-reader';
import {
  CRITICAL_CATEGORY_IDS,
  TIER_LABEL,
  type EditCategoryRow,
  type EditSubRow,
  type RulerModel,
} from './edit-model';

export interface EditCellNote {
  title: string;
  body: string;
}

export interface EditGap {
  /** The sub-category row's key, so the table and the tier lists agree. */
  key: string;
  /** The piece, as Beau names it — “A charcoal overcoat”. */
  name: string;
  categoryId: string;
  categoryName: string;
  subCategory: string;
  bandLabel: string;
  days: number | null;
  why: string;
  typeId: string | null;
  fromBeau: boolean;
}

export interface EditReading {
  /** `${categoryId}|${bandIndex}` → the note that cell carries. */
  cells: Record<string, EditCellNote>;
  /** sub-category row key → Beau's line against it. */
  subs: Record<string, string>;
  /** The gaps, in the order he would close them. */
  gaps: EditGap[];
  /** The closing line under the gap table. */
  foot: string;
  fromBeau: boolean;
}

// ---------------------------------------------------------------------------
// The session cache
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'ethaion:edit-reading:v2:';
const memory = new Map<string, EditReading>();
const inflight = new Map<string, Promise<EditReading>>();

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): EditReading | null {
  const held = memory.get(key);
  if (held) return held;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditReading;
    if (!parsed || !Array.isArray(parsed.gaps)) return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: EditReading): void {
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

// ---------------------------------------------------------------------------
// The voice
// ---------------------------------------------------------------------------

const VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. You are writing THE EDIT: the audit of how much of his YEAR his wardrobe actually answers, band by band. '
    + 'Register: quiet, knowing, concrete, lightly British; short declarative sentences; no marketing, no exclamation marks, no emoji, no bullet lists. Write TO him (“you”). Count in words where the design does (“Thirty-four days…”). '
    + 'Every line must be earned from the FACTS you are given — the pieces on his ledger, the days a year his own climate spends in each band, his frame, colouring, directions and the registers he actually dresses for. Never invent a piece he owns, never name a gap he has already filled, never write a generic compliment, and never call something a gap that his life plainly has no use for. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it, no commentary.',
  cache: true,
};

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

function rulerTable(ruler: RulerModel): string {
  const head = `bands: ${ruler.bands.map((b) => `${b.label}${b.days == null ? '' : ` (${b.days} days)`}`).join(' | ')}`;
  const rows = ruler.rows.map((row) => {
    const cells = row.cells
      .map((c) => `${c.bandLabel}: ${c.state === 'na' ? 'n/a' : `${c.count}`}`)
      .join(', ');
    return `- ${row.name} [${row.id}] — ${cells}`;
  });
  return `${head}\n${rows.join('\n')}`;
}

function subTable(categories: EditCategoryRow[]): string {
  return categories
    .map((category) => {
      const rows = category.rows
        .map(
          (row) =>
            `    · ${row.subCategory} | ${row.bandLabel} | ${TIER_LABEL[row.tier]} | ${row.count} owned`
            + `${row.ownedNames.length > 0 ? ` (${row.ownedNames.join('; ')})` : ''}`,
        )
        .join('\n');
      return `- ${category.name} [${category.id}] — ${category.owned} logged\n${rows}`;
    })
    .join('\n');
}

/** The blank cells worth a note — the critical categories first, the most
 * expensive days first, and never more than this many. */
const NOTED_CELLS = 10;

function cellsWorthNoting(ruler: RulerModel): Array<{ key: string; label: string; days: number | null; category: string; band: string }> {
  const out: Array<{ key: string; label: string; days: number | null; category: string; band: string; score: number }> = [];
  for (const row of ruler.rows) {
    for (const cell of row.cells) {
      if (cell.state !== 'gap' && cell.state !== 'thin') continue;
      const critical = CRITICAL_CATEGORY_IDS.has(row.id) ? 2 : 1;
      const days = cell.days == null ? 45 : cell.days;
      out.push({
        key: cell.key,
        label: `${row.name} · ${cell.bandLabel}`,
        days: cell.days,
        category: row.name,
        band: cell.bandLabel,
        score: critical * days * (cell.state === 'gap' ? 2 : 1),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, NOTED_CELLS);
}

// ---------------------------------------------------------------------------
// The fallbacks — the arithmetic's own words.
// ---------------------------------------------------------------------------

const WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
];

function word(n: number): string {
  return WORDS[n] || String(n);
}

/** The note a cell carries when Beau has not written one. */
export function fallbackCellNote(input: {
  categoryName: string;
  bandLabel: string;
  days: number | null;
  count: number;
  state: string;
  ownedNames: string[];
}): EditCellNote {
  const days = input.days == null ? null : input.days;
  const dayLine = days == null ? '' : ` ${days} day${days === 1 ? '' : 's'} of your year fall here.`;
  if (input.state === 'gap') {
    return {
      title: `Nothing for ${input.bandLabel}`,
      body: `Nothing on your rail answers ${input.categoryName.toLowerCase()} at ${input.bandLabel}.${dayLine} Beau's picks for it are already waiting in the Search.`,
    };
  }
  if (input.state === 'thin') {
    return {
      title: `One piece for ${input.bandLabel}`,
      body: `${input.ownedNames[0] || 'One piece'} is carrying ${input.categoryName.toLowerCase()} on its own here.${dayLine} One more would give you a choice rather than a uniform.`,
    };
  }
  if (input.state === 'deep') {
    return {
      title: `Deep at ${input.bandLabel}`,
      body: `${word(input.count)} pieces for this band.${dayLine} Beau would not add to this cell — he would take something out of it.`,
    };
  }
  return {
    title: `${input.categoryName} at ${input.bandLabel}`,
    body: `${word(input.count)} piece${input.count === 1 ? '' : 's'} answer this band.${dayLine} Nothing to buy in this cell.`,
  };
}

/** A gap as the table states it when Beau has not named it. */
function computedGap(row: EditSubRow): EditGap {
  return {
    key: row.key,
    name: row.label,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    subCategory: row.subCategory,
    bandLabel: row.bandLabel,
    days: row.days,
    why: row.note,
    typeId: row.typeId,
    fromBeau: false,
  };
}

export function gapsFromArithmetic(gapRows: EditSubRow[]): EditGap[] {
  return gapRows.map(computedGap);
}

export function emptyReading(gapRows: EditSubRow[]): EditReading {
  return {
    cells: {},
    subs: {},
    gaps: gapsFromArithmetic(gapRows),
    foot: 'Order is not size: the gap that goes first is the one whose days currently go wrong, not the one that covers the most of them. Each link opens that sub-category in The Search on Beau\u2019s ranked picks.',
    fromBeau: false,
  };
}

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

/** How many gaps he is asked to rank. */
const RANKED = 6;

export async function readEditCoverage(input: {
  reader: HuntReader;
  ruler: RulerModel;
  categories: EditCategoryRow[];
  gapRows: EditSubRow[];
  forceRefresh?: boolean;
}): Promise<EditReading> {
  const { reader, ruler, categories, gapRows } = input;
  const brief = huntReaderBrief(reader);
  const skeleton = ruler.rows.map((r) => `${r.id}:${r.cells.map((c) => (c.state === 'na' ? 'x' : c.count)).join('')}`);
  const key = `${CACHE_PREFIX}${fingerprint({ brief, skeleton })}`;
  const fallback = emptyReading(gapRows);

  if (!input.forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
    const running = inflight.get(key);
    if (running) return running;
  }

  const job = (async (): Promise<EditReading> => {
    const noted = cellsWorthNoting(ruler);
    const choosable = categories.flatMap((c) => c.rows.filter((r) => r.tier !== 'covered'));
    const user = [
      `THE MAN:\n${brief}`,
      `HIS YEAR, BAND BY BAND — how many of his own pieces answer each category in each temperature band (n/a means the category has no business in that band):\n${rulerTable(ruler)}`,
      ruler.hasDays
        ? `${ruler.answeredDays} days of his year have every critical layer (tops, knitwear, outerwear, trousers, shoes). ${ruler.shortDays} days are short of at least one.`
        : 'His climate is not on file yet, so day counts are unknown — do not invent any.',
      `HIS COVERAGE, SUB-CATEGORY BY SUB-CATEGORY (three or more is covered, one or two is thin, none is a gap):\n${subTable(categories)}`,
      `THE BLANK AND THIN CELLS WORTH EXPLAINING — answer each one by its key exactly:\n${noted
        .map((c) => `- ${c.key} | ${c.label}${c.days == null ? '' : ` | ${c.days} days a year`}`)
        .join('\n')}`,
      `THE SUB-CATEGORIES YOU MAY NAME AS GAPS — use the category id and the sub-category label EXACTLY as written:\n${choosable
        .map((r) => `- ${r.categoryId} | ${r.subCategory} | ${TIER_LABEL[r.tier]} | ${r.bandLabel}${r.days == null ? '' : ` | ${r.days} days`}`)
        .join('\n')}`,
      'Write THREE things.\n\n'
        + '1. CELLS — for each key listed above: a title of at most 34 characters in the design\u2019s own form (“Nothing for 4–8°”, “One piece for 8–12°”, “No cold-weather trouser”) and a body of TWO sentences, max 300 characters, saying what the blank actually costs him and which piece closes it. Name the days where you have them.\n\n'
        + '2. SUBS — one line against each sub-category that is a Gap or Thin above: max 130 characters, concrete about what he owns there and why it does or does not do the job. Never a definition of the sub-category.\n\n'
        + `3. GAPS — the ${RANKED} gaps you would close, IN THE ORDER YOU WOULD CLOSE THEM, chosen only from the sub-categories listed. Name each one as a real piece a man would buy (“A charcoal overcoat”, “Grey flannel trousers”), and say in one or two sentences why it sits where it does in the order. Order is not size — the first is the one whose days currently go most wrong.\n\n`
        + 'Also write FOOT: one or two sentences under the table explaining the order you chose, max 320 characters.\n\n'
        + 'Return JSON: {"cells": [{"key": "<key verbatim>", "title": "…", "body": "…"}], "subs": [{"categoryId": "<id verbatim>", "subCategory": "<label verbatim>", "line": "…"}], "gaps": [{"categoryId": "<id verbatim>", "subCategory": "<label verbatim>", "name": "…", "why": "…"}], "foot": "…"}',
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

    const validCells = new Set(noted.map((c) => c.key));
    const cells: Record<string, EditCellNote> = {};
    for (const entry of Array.isArray(parsed.cells) ? parsed.cells : []) {
      const cellKey = str(entry?.key, 40);
      const title = str(entry?.title, 60);
      const body = str(entry?.body, 360);
      if (cellKey && title && body && validCells.has(cellKey)) cells[cellKey] = { title, body };
    }

    const byLabel = new Map<string, EditSubRow>();
    for (const category of categories) {
      for (const row of category.rows) {
        byLabel.set(`${row.categoryId}\u241f${row.subCategory.toLowerCase()}`, row);
      }
    }
    const lookup = (categoryId: string, subCategory: string): EditSubRow | null =>
      byLabel.get(`${categoryId}\u241f${subCategory.toLowerCase()}`) || null;

    const subs: Record<string, string> = {};
    for (const entry of Array.isArray(parsed.subs) ? parsed.subs : []) {
      const row = lookup(str(entry?.categoryId, 40).toLowerCase(), str(entry?.subCategory, 60));
      const line = str(entry?.line ?? entry?.why, 200);
      if (row && line) subs[row.key] = line;
    }

    const named: EditGap[] = [];
    const claimed = new Set<string>();
    for (const entry of Array.isArray(parsed.gaps) ? parsed.gaps : []) {
      const row = lookup(str(entry?.categoryId, 40).toLowerCase(), str(entry?.subCategory, 60));
      const name = str(entry?.name ?? entry?.piece, 70);
      if (!row || !name || claimed.has(row.key)) continue;
      claimed.add(row.key);
      // The Index opens on whatever his name actually points at, when it
      // points at a type in the same category; otherwise the run's first.
      const namedType = matchGarmentTypeId({ name, category: row.categoryId });
      const inThisCategory = namedType ? findGarmentType(namedType)?.category === row.categoryId : false;
      named.push({
        key: row.key,
        name,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        subCategory: row.subCategory,
        bandLabel: row.bandLabel,
        days: row.days,
        why: str(entry?.why, 260) || row.note,
        typeId: inThisCategory ? namedType : row.typeId,
        fromBeau: true,
      });
    }

    if (named.length === 0 && Object.keys(cells).length === 0 && Object.keys(subs).length === 0) {
      return fallback;
    }

    // His order first, then every remaining blank sub-category beneath it —
    // the table is the whole audit, not just his top six.
    const rest = gapRows.filter((row) => !claimed.has(row.key)).map(computedGap);
    const reading: EditReading = {
      cells,
      subs,
      gaps: [...named, ...rest],
      foot: str(parsed?.foot, 400) || fallback.foot,
      fromBeau: true,
    };
    writeCache(key, reading);
    return reading;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}
