/**
 * THE LEDGER · THE ARITHMETIC (rebuilt to the founder's reference design).
 *
 * Everything the tab shows about a piece is read off the record — the
 * wardrobe_pieces row, its cloth (piece_materials), its temperature band
 * (piece_warmth), its condition (piece_condition), its wear counter
 * (piece_value) and the man's own corrections (piece_ledger). Nothing on
 * this page is authored copy about a piece that does not exist.
 *
 * TWO judgements are computed here, and both are EVIDENCE, not taste:
 *
 *  1. BEAU'S READ of each piece — Core · Sound · Under-used · Wrong
 *     register · Worn out. The strongest signal is what the man himself
 *     said: a piece he never quite feels right in reads Wrong register
 *     however good the cloth is, and a condition note that says the thing
 *     is finished reads Worn out. After that it is arithmetic — wears
 *     logged, how long it has sat unworn, whether something else on the
 *     ledger already does its job, and whether it is the only piece
 *     covering its layer.
 *  2. WHAT BEAU WOULD CUT — the pieces the record argues against: the worn
 *     out, the wrong register, and the under-used he has told Beau he never
 *     quite feels right in. Nothing else can reach that table.
 *
 * The WORDS against each read are Beau's, from one cached model call
 * (ledger-read-ai.ts). Every one of them has a deterministic line written
 * from these same facts, so the page is complete and honest whether or not
 * a call lands.
 */
import {
  materialFor,
  slotLabel,
  type PieceCondition,
  type PieceValue,
  type WardrobePiece,
} from './profile-data';
import { categoryName, pieceIndexCategory } from './index-model';
import { CATEGORY_ORDER } from './category-order';
import { warmthFor, type PieceWarmth } from './warmth-model';
import { capWord, numberWord } from './mono-type';
import { emptyLedgerNote, type LedgerCall, type LedgerNote } from './ledger-notes';

// ---------------------------------------------------------------------------
// The five reads
// ---------------------------------------------------------------------------

export type LedgerRead = 'Core' | 'Sound' | 'Under-used' | 'Wrong register' | 'Worn out';

export const LEDGER_READS: LedgerRead[] = ['Core', 'Sound', 'Under-used', 'Wrong register', 'Worn out'];

/** The ink each read carries — the reference's own colouring. */
export const READ_INK: Record<LedgerRead, string> = {
  Core: '#7c4a17',
  Sound: '#3b2b1d',
  'Under-used': '#856c51',
  'Wrong register': '#a68e70',
  'Worn out': '#a68e70',
};

/**
 * The ELEVEN categories the tab always shows — the app's ONE canonical set
 * (category-order.ts), in the canonical menswear order: Tops · Knitwear ·
 * Sweatshirts · Outerwear · Trousers & bottoms · Formalwear · Base layers ·
 * Shoes · Accessories · Bags · Hats & headwear. Anything filed under Other
 * appears as soon as a piece is logged in it.
 */
export const LEDGER_CATEGORY_IDS = CATEGORY_ORDER.filter((id) => id !== 'other');

/** Every category the tab can show, in the one canonical order. */
const ALL_LEDGER_CATEGORY_IDS = [...LEDGER_CATEGORY_IDS, 'other'];

/** The category's name as the whole app writes it — the Index's own wording,
 * so “Trousers & bottoms” reads the same on every tab. */
export function ledgerCategoryName(id: string): string {
  return id === 'other' ? 'Other' : categoryName(id);
}

/** The layers a wardrobe cannot do without — the only piece in one of these
 * is doing work nothing else can. */
const FOUNDATION_CATEGORY_IDS = new Set(['tops', 'bottoms', 'shoes', 'outerwear']);

/** What the cloth field says when nothing has read it yet. */
export const UNREAD_CLOTH = 'Not read yet';

/** A condition note that says the thing is finished. */
const FINISHED_CONDITION =
  /worn out|finished|threadbare|beyond repair|falling apart|hole|holes|torn|shot\b|dead\b|past it|needs replacing|replace it|frayed|fraying|stretched|pilled|pilling|scuffed through|sole gone|soles gone|thin at|thinning/i;

// ---------------------------------------------------------------------------
// One piece, as the tab reads it
// ---------------------------------------------------------------------------

export interface LedgerPieceRow {
  id: number;
  piece: WardrobePiece;
  /** His label, exactly as he entered it — never rewritten. */
  name: string;
  maker: string;
  categoryId: string;
  categoryName: string;
  /** The sub-type line under the name — the canonical slot, else the category. */
  sub: string;
  cloth: string;
  colour: string;
  /** The comfortable range, e.g. “14–22°”, or “any weather” for a belt. */
  band: string;
  bandMin: number | null;
  bandMax: number | null;
  /** How it fits him — zero or more of the sheet's five answers. */
  fits: string[];
  feel: string | null;
  wearContexts: string[];
  tailoring: string | null;
  /** What HE told Beau about it. */
  ownNote: string | null;
  condition: string | null;
  wears: number;
  lastWornAt: string | null;
  loggedDaysAgo: number | null;
  photo: string | null;
  /** Another piece on the ledger doing the same job, when there is one. */
  sameJobAs: string | null;
  read: LedgerRead;
  /** Beau's line against the read — his, or the arithmetic's. */
  note: string;
  fromBeau: boolean;
  call: LedgerCall | null;
  /** True for an optimistic row whose insert is still in flight. */
  pending: boolean;
}

export interface LedgerCategoryRow {
  id: string;
  name: string;
  /** Beau's line under the category name — his, or the arithmetic's. */
  line: string;
  pieces: LedgerPieceRow[];
  /** “5 pieces” / “1 piece”. */
  count: string;
  owned: number;
  /** How many in here the record argues with. */
  toLookAt: number;
  /** “In order” / “2 to look at” / “Nothing logged”. */
  status: string;
  fromBeau: boolean;
}

export interface LedgerModel {
  categories: LedgerCategoryRow[];
  rows: LedgerPieceRow[];
  total: number;
  /** The pieces the record argues against, worst first. */
  cuts: LedgerPieceRow[];
}

// ---------------------------------------------------------------------------
// Small readings of the record
// ---------------------------------------------------------------------------

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

/** “four months”, “two years”, “three weeks” — the tab never counts in digits
 * where prose will do. */
function ageWords(days: number): string {
  if (days < 14) return `${numberWord(Math.max(1, days))} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${numberWord(Math.round(days / 7))} weeks`;
  if (days < 730) return `${numberWord(Math.max(1, Math.round(days / 30)))} month${Math.round(days / 30) === 1 ? '' : 's'}`;
  return `${numberWord(Math.round(days / 365))} years`;
}

function listWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function bandLabel(warmth: PieceWarmth): string {
  if (warmth.warmth_level === 'all-weather') return 'any weather';
  return `${warmth.min_comfortable_temp_c}\u2013${warmth.max_comfortable_temp_c}\u00b0`;
}

// ---------------------------------------------------------------------------
// Beau's read, computed
// ---------------------------------------------------------------------------

interface ReadVerdict {
  read: LedgerRead;
  note: string;
}

function computeRead(row: Omit<LedgerPieceRow, 'read' | 'note' | 'fromBeau'>, onlyInLayer: boolean): ReadVerdict {
  const condition = (row.condition || '').trim();
  const clothKnown = row.cloth && row.cloth !== UNREAD_CLOTH;

  // 1. What the condition says, when it says the piece is done.
  if (condition && FINISHED_CONDITION.test(condition)) {
    return {
      read: 'Worn out',
      note: `Your own note on it reads “${condition}”. It has earned its keep — let it go rather than keep working around it.`,
    };
  }

  // 2. What he said about wearing it. Nothing outranks this.
  if (row.feel === 'Never quite right') {
    const where = row.wearContexts.length > 0 ? ` It only goes ${listWords(row.wearContexts.map((c) => c.toLowerCase()))}.` : '';
    return {
      read: 'Wrong register',
      note: `You told Beau you never quite feel right in it, and that is the record rather than taste.${where}`,
    };
  }

  // 3. Owned, and not doing the job it is holding.
  if (row.wearContexts.length === 1 && row.wearContexts[0] === 'Indoors only') {
    return {
      read: 'Under-used',
      note: 'Indoors only, by your own answer — it is holding a slot that never leaves the house.',
    };
  }
  if (row.wears === 0 && row.loggedDaysAgo != null && row.loggedDaysAgo >= 120) {
    return {
      read: 'Under-used',
      note: `Logged ${ageWords(row.loggedDaysAgo)} ago and never marked worn. Either it is not being reached for, or the wear counter is not being kept — both are worth knowing.`,
    };
  }
  if (row.sameJobAs && row.feel === 'Fine, unremarkable') {
    return {
      read: 'Under-used',
      note: `“${row.sameJobAs}” already does this job, and you told Beau this one is fine rather than reached for.`,
    };
  }

  // 4. The pieces the wardrobe runs on.
  if (row.feel === 'Reach for it') {
    return {
      read: 'Core',
      note: row.wears > 0
        ? `You reach for it, and the counter agrees — ${numberWord(row.wears)} wear${row.wears === 1 ? '' : 's'} logged.`
        : 'You reach for it, by your own answer. Beau builds outwards from pieces like this.',
    };
  }
  if (row.wears >= 8) {
    return {
      read: 'Core',
      note: `${capWord(numberWord(row.wears))} wears logged — more than most of what you own. Replace like for like when it goes.`,
    };
  }
  if (onlyInLayer) {
    return {
      read: 'Core',
      note: `The only ${row.categoryName.toLowerCase()} on your rail, so every outfit in that layer runs through it${row.band !== 'any weather' ? ` — and only from ${row.band}` : ''}.`,
    };
  }

  // 5. Sound — and the line still says something true about THIS piece.
  if (!clothKnown) {
    return {
      read: 'Sound',
      note: 'Beau has not read the cloth on this one yet. Open it and tell him — it is the field his recommendations lean on hardest.',
    };
  }
  const offFits = row.fits.filter((f) => f !== 'Fits as it should');
  if (offFits.length > 0) {
    return {
      read: 'Sound',
      note: `${row.cloth}, and it fits ${listWords(offFits.map((f) => f.toLowerCase()))} — worth a tailor before it is worth replacing.`,
    };
  }
  if (row.wears > 0) {
    return {
      read: 'Sound',
      note: `${row.cloth} · ${row.band}. ${capWord(numberWord(row.wears))} wear${row.wears === 1 ? '' : 's'} logged and nothing needed here.`,
    };
  }
  return { read: 'Sound', note: `${row.cloth} · ${row.band}. On the rail and doing its job — nothing to buy against it.` };
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export interface LedgerInput {
  pieces: Array<WardrobePiece & { pattern?: string | null; __pending?: boolean }>;
  materials: Record<number, string>;
  warmth: Record<number, PieceWarmth>;
  conditions: Record<number, PieceCondition>;
  values: Record<number, PieceValue>;
  notes: Record<number, LedgerNote>;
}

/** The category a piece is filed under — the same read The Index and The
 * Edit use (the garment type first, then a name hint, then the stored
 * category), so a watch cap is headwear on every tab. */
function categoryIdOf(piece: WardrobePiece): string {
  return pieceIndexCategory(piece) || 'other';
}

export function buildLedger(input: LedgerInput): LedgerModel {
  const { pieces, materials, warmth, conditions, values, notes } = input;

  // Which pieces share a job: same category AND same canonical slot. Two
  // oxford button-downs are the same job; an oxford and a flannel are not.
  const byJob = new Map<string, string[]>();
  for (const piece of pieces) {
    const key = `${categoryIdOf(piece)}\u241f${piece.slot || 'unplaced'}`;
    const list = byJob.get(key);
    if (list) list.push(piece.name);
    else byJob.set(key, [piece.name]);
  }
  const ownedPerCategory = new Map<string, number>();
  for (const piece of pieces) {
    const id = categoryIdOf(piece);
    ownedPerCategory.set(id, (ownedPerCategory.get(id) || 0) + 1);
  }

  const rows: LedgerPieceRow[] = pieces.map((piece) => {
    const categoryId = categoryIdOf(piece);
    const name = ledgerCategoryName(categoryId);
    const note = notes[piece.id] || emptyLedgerNote(piece.id);
    const read = warmthFor(piece, materials, warmth);
    const value = values[piece.id];
    const jobKey = `${categoryId}\u241f${piece.slot || 'unplaced'}`;
    const sameJob = (byJob.get(jobKey) || []).filter((other) => other !== piece.name);
    const base = {
      id: piece.id,
      piece: piece as WardrobePiece,
      name: piece.name,
      maker: (piece.brand || '').trim(),
      categoryId,
      categoryName: name,
      sub: slotLabel(piece.slot) || name,
      cloth: materialFor(piece, materials) || UNREAD_CLOTH,
      colour: (piece.colors || [])[0] || '',
      band: bandLabel(read),
      bandMin: read.warmth_level === 'all-weather' ? null : read.min_comfortable_temp_c,
      bandMax: read.warmth_level === 'all-weather' ? null : read.max_comfortable_temp_c,
      fits: note.fits,
      feel: note.feel,
      wearContexts: note.wearContexts,
      tailoring: note.tailoring,
      ownNote: note.note,
      condition: conditions[piece.id]?.condition_note || null,
      wears: value?.times_worn || 0,
      lastWornAt: value?.last_worn_at || null,
      loggedDaysAgo: daysSince(piece.created_at),
      photo: (piece.photo_url || '').trim() || null,
      sameJobAs: sameJob[0] || null,
      call: note.call,
      pending: !!(piece as { __pending?: boolean }).__pending,
    };
    const onlyInLayer = FOUNDATION_CATEGORY_IDS.has(categoryId) && (ownedPerCategory.get(categoryId) || 0) === 1;
    const verdict = computeRead(base, onlyInLayer);
    return { ...base, read: verdict.read, note: verdict.note, fromBeau: false };
  });

  const shownCategoryIds = ALL_LEDGER_CATEGORY_IDS.filter(
    (id) => LEDGER_CATEGORY_IDS.includes(id) || rows.some((r) => r.categoryId === id),
  );

  const categories: LedgerCategoryRow[] = shownCategoryIds.map((id) => {
    const inCategory = rows.filter((r) => r.categoryId === id);
    const toLookAt = inCategory.filter((r) => r.read === 'Wrong register' || r.read === 'Worn out').length;
    return {
      id,
      name: ledgerCategoryName(id),
      line: computedCategoryLine(ledgerCategoryName(id), inCategory, toLookAt),
      pieces: inCategory,
      owned: inCategory.length,
      count: `${inCategory.length} ${inCategory.length === 1 ? 'piece' : 'pieces'}`,
      toLookAt,
      status: toLookAt > 0 ? `${toLookAt} to look at` : inCategory.length > 0 ? 'In order' : 'Nothing logged',
      fromBeau: false,
    };
  });

  return { categories, rows, total: rows.length, cuts: computeCuts(rows) };
}

/** The span of temperatures a category actually answers, from its own
 * pieces — “8–22°”. Empty when nothing in it carries a band. */
function bandSpan(pieces: LedgerPieceRow[]): string {
  const mins = pieces.map((p) => p.bandMin).filter((v): v is number => v != null);
  const maxes = pieces.map((p) => p.bandMax).filter((v): v is number => v != null);
  if (mins.length === 0 || maxes.length === 0) return '';
  return `${Math.min(...mins)}\u2013${Math.max(...maxes)}\u00b0`;
}

/** The line under a category name when Beau has not written one. */
export function computedCategoryLine(name: string, pieces: LedgerPieceRow[], toLookAt: number): string {
  if (pieces.length === 0) return `Nothing logged in ${name.toLowerCase()} yet.`;
  const span = bandSpan(pieces);
  const core = pieces.filter((p) => p.read === 'Core').length;
  const parts: string[] = [`${capWord(numberWord(pieces.length))} logged`];
  if (core > 0) parts.push(`${numberWord(core)} the wardrobe runs on`);
  if (toLookAt > 0) parts.push(`${numberWord(toLookAt)} the record argues with`);
  return `${parts.join(', ')}${span ? ` \u00b7 answers ${span}` : ''}.`;
}

/**
 * THE CUT LIST. Only three things can put a piece here, and all three are
 * evidence: it is finished, he never quite feels right in it, or it is
 * under-used AND he never quite feels right in it. A piece he likes is
 * never on this list because Beau prefers something else.
 */
export function computeCuts(rows: LedgerPieceRow[]): LedgerPieceRow[] {
  const order: Record<string, number> = { 'Worn out': 0, 'Wrong register': 1, 'Under-used': 2 };
  return rows
    .filter(
      (row) =>
        row.read === 'Worn out'
        || row.read === 'Wrong register'
        || (row.read === 'Under-used' && row.feel === 'Never quite right'),
    )
    .sort((a, b) => (order[a.read] ?? 3) - (order[b.read] ?? 3));
}

/** The reason the cut table states, in the reference's own form. */
export function cutWhy(row: LedgerPieceRow): string {
  const note = row.note.charAt(0).toLowerCase() + row.note.slice(1);
  if (row.read === 'Worn out') return `Finished: ${note}`;
  if (row.read === 'Wrong register') return `Wrong register: ${note}`;
  return `Under-used: ${note}`;
}

/** The meta line under “What Beau would cut”. */
export function cutMeta(cuts: LedgerPieceRow[]): string {
  if (cuts.length === 0) return 'Nothing on your rail argues against itself';
  return `${cuts.length} ${cuts.length === 1 ? 'piece' : 'pieces'} the record argues against`;
}

/** The closing line under the cut table when Beau has not written one. */
export const CUT_FOOT =
  'Beau cuts on evidence, not taste: a piece is here because you told him you never quite feel right in it, or '
  + 'because it is holding a slot something better should hold. Keep anything you like — the override is part of '
  + 'the record too, and it changes what he suggests next.';

/** The one search over the ledger — name, maker, cloth, colour, category,
 * sub-type. */
export function matchesQuery(row: LedgerPieceRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row.name} ${row.maker} ${row.cloth} ${row.colour} ${row.categoryName} ${row.sub}`.toLowerCase().includes(q);
}

/** The facts the model call is keyed on — it re-reads when they move, and
 * never for a render. */
export function ledgerFingerprint(model: LedgerModel): string {
  return model.rows
    .map((r) =>
      [r.id, r.name, r.categoryId, r.sub, r.cloth, r.colour, r.band, r.fits.join('+'), r.feel || '', r.condition || '', r.wears, r.wearContexts.join('+'), r.ownNote || ''].join(':'),
    )
    .sort()
    .join('|');
}
