/**
 * THE HUNT · MODEL — the shape of the tab and the one place its tags are
 * written.
 *
 * The Hunt sits immediately LEFT of The Index and reads the SAME taxonomy
 * The Index reads, so the two can never drift:
 *
 *  · CATEGORIES — `INDEX_CATEGORY_IDS` (category-order.ts), which is exactly
 *    the left-to-right order of The Index's category strip. On The Hunt the
 *    same order runs TOP TO BOTTOM: tops · knitwear · sweatshirts ·
 *    outerwear · bottoms · formalwear · base layers · shoes · accessories ·
 *    bags · hats.
 *  · SUB-CATEGORIES — the garment RUNS (garment-type-runs.ts): the specific
 *    piece types within a category, grouped the way a tailor would set them
 *    ("Coats", "Rain & wind", "Loafers & monks"). FIX data, identical for
 *    every reader. Beau's Picks no longer draws a shelf per run — it draws
 *    three for the category — but the runs are still the reference the
 *    recommendation prompt chooses within, so a pick names a real type.
 *
 * TAGS (Save · Favourite · Pass) persist in the `hunt_calls` WorkspaceDB
 * table, keyed by a stable `card_key` so re-tagging a card UPDATES its row
 * rather than filing a second one. localStorage is the fast local mirror:
 * the Your Calls table and every card's tag state paint from it instantly
 * and reconcile when the read lands.
 *
 * Passed pieces feed BACK into the recommendation prompt (hunt-picks-ai.ts)
 * so Beau never offers the same piece twice in the same form.
 *
 * Explicit tags are also INTENTIONAL DECISIONS, so each Save / Favourite /
 * Pass files one fact into Beau's persistent style memory (style-memory.ts,
 * the beau_style_memory table) — read into his chat context every session.
 * Passive scores and casual swipes never touch the memory; removing a tag
 * removes its fact.
 */
import { INDEX_CATEGORY_IDS, type GarmentCategoryId } from './garment-types';
import { GARMENT_RUNS, type GarmentRun } from './garment-type-runs';
import { categoryName } from './index-model';
import { clearSearchTagFact, recordSearchTagFact } from './style-memory';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// The tab's spine — categories and their sub-categories.
// ---------------------------------------------------------------------------

export interface HuntSubCategory {
  /** The run label, e.g. "Coats" — the sub-category's display name. */
  label: string;
  /** The run's one-line FIX description of what it is for. */
  note: string;
  /** The garment type ids it covers — the reference Beau recommends within. */
  typeIds: string[];
}

export interface HuntCategory {
  id: GarmentCategoryId;
  name: string;
  subCategories: HuntSubCategory[];
}

/**
 * The Hunt's categories, TOP TO BOTTOM in the same order The Index reads
 * LEFT TO RIGHT. Main categories only — no 'other' bucket, never a
 * hand-ordered list.
 */
export const HUNT_CATEGORIES: HuntCategory[] = INDEX_CATEGORY_IDS.map((id) => {
  const runs: GarmentRun[] = GARMENT_RUNS[id as Exclude<GarmentCategoryId, 'other'>] || [];
  return {
    id,
    name: categoryName(id),
    subCategories: runs.map((run) => ({ label: run.label, note: run.note, typeIds: run.typeIds })),
  };
});

export function huntCategory(id: string): HuntCategory | null {
  return HUNT_CATEGORIES.find((c) => c.id === id) || null;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export type HuntTag = 'saved' | 'favourite' | 'passed';
/** 'score' is the Ask Beau drawer's SCORE A PIECE mode — a structured
 * Regret Risk assessment filed into Your Calls (August 2026). */
export type HuntSource = 'picks' | 'ask' | 'score';

export const HUNT_TAG_LABELS: Record<HuntTag, string> = {
  saved: 'Saved',
  favourite: 'Favourite',
  passed: 'Passed',
};

export const HUNT_SOURCE_LABELS: Record<HuntSource, string> = {
  picks: "Beau's Picks",
  ask: 'Ask Beau',
  score: "Beau's assessment",
};

/** The tag order the Your Calls table sorts by — a favourite outranks a
 * save, a save outranks a pass. */
const TAG_RANK: Record<HuntTag, number> = { favourite: 0, saved: 1, passed: 2 };

export function tagRank(tag: HuntTag): number {
  return TAG_RANK[tag] ?? 3;
}

/** What a card needs to carry to be taggable, from either sub-tab. */
export interface HuntTaggable {
  pieceName: string;
  categoryId: string | null;
  subCategory: string | null;
  source: HuntSource;
  maker?: string | null;
  priceGuide?: string | null;
  note?: string | null;
  productUrl?: string | null;
  /** The photograph the card painted — carried onto the Your Calls row so
   * the table shows the piece rather than re-resolving it. */
  imageUrl?: string | null;
}

export interface HuntCall extends HuntTaggable {
  /** DB row id — null while only the local mirror holds it. */
  id: number | null;
  cardKey: string;
  tag: HuntTag;
  /** ISO timestamp of the last tag change. */
  taggedAt: string;
}

/**
 * The stable identity of one card. A product URL is the strongest key when
 * there is one (the same listing tagged twice is one call); otherwise the
 * source, the category and the normalised piece name.
 */
export function huntCardKey(item: HuntTaggable): string {
  const url = (item.productUrl || '').trim().toLowerCase();
  if (url) return `url\u241f${url}`;
  const name = (item.pieceName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${item.source}\u241f${(item.categoryId || 'none').toLowerCase()}\u241f${name}`;
}

// ---------------------------------------------------------------------------
// Persistence — the DB is the truth, localStorage the fast mirror.
// ---------------------------------------------------------------------------

const MIRROR_KEY = 'ethaion:hunt-calls:v1';
export const HUNT_CALLS_EVENT = 'ethaion:hunt-calls-changed';

interface CallRow {
  id: number;
  card_key: string | null;
  piece_name: string | null;
  category_id: string | null;
  sub_category: string | null;
  tag: string | null;
  source: string | null;
  maker: string | null;
  price_guide: string | null;
  note: string | null;
  product_url: string | null;
  image_url: string | null;
  tagged_at: string | null;
  created_at?: string;
}

function isTag(value: unknown): value is HuntTag {
  return value === 'saved' || value === 'favourite' || value === 'passed';
}

function callFromRow(row: CallRow): HuntCall | null {
  const pieceName = (row.piece_name || '').trim();
  const cardKey = (row.card_key || '').trim();
  if (!pieceName || !cardKey || !isTag(row.tag)) return null;
  return {
    id: row.id,
    cardKey,
    pieceName,
    categoryId: row.category_id || null,
    subCategory: row.sub_category || null,
    tag: row.tag,
    source: row.source === 'ask' ? 'ask' : row.source === 'score' ? 'score' : 'picks',
    maker: row.maker || null,
    priceGuide: row.price_guide || null,
    note: row.note || null,
    productUrl: row.product_url || null,
    imageUrl: row.image_url || null,
    taggedAt: row.tagged_at || row.created_at || new Date().toISOString(),
  };
}

export function loadHuntCallsMirror(): HuntCall[] {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as HuntCall[]).filter((c) => c && c.cardKey && isTag(c.tag)) : [];
  } catch {
    return [];
  }
}

function storeMirror(calls: HuntCall[]): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(calls));
  } catch {
    /* storage unavailable — the session state still carries the tags */
  }
}

function announce(): void {
  window.dispatchEvent(new CustomEvent(HUNT_CALLS_EVENT));
}

/**
 * Every call on file, newest tag first. Reads the table; falls back to the
 * local mirror when the read fails, so the tab still works offline.
 */
export async function fetchHuntCalls(): Promise<HuntCall[]> {
  try {
    const { data } = await db().from('hunt_calls').orderBy('created_at', 'desc').limit(300).get();
    const seen = new Set<string>();
    const calls: HuntCall[] = [];
    for (const row of (data || []) as CallRow[]) {
      const call = callFromRow(row);
      if (!call || seen.has(call.cardKey)) continue;
      seen.add(call.cardKey);
      calls.push(call);
    }
    storeMirror(calls);
    return calls;
  } catch {
    return loadHuntCallsMirror();
  }
}

/** The mirror with one call replaced (or added) — used to paint immediately. */
function mergeIntoMirror(call: HuntCall): HuntCall[] {
  const rest = loadHuntCallsMirror().filter((c) => c.cardKey !== call.cardKey);
  const next = [call, ...rest];
  storeMirror(next);
  return next;
}

/**
 * Tag one card — Save, Favourite or Pass. Re-tagging the same card moves
 * the existing row instead of filing a second call. The local mirror is
 * written FIRST so the button state flips instantly, then the row lands.
 */
export async function setHuntTag(item: HuntTaggable, tag: HuntTag): Promise<void> {
  const cardKey = huntCardKey(item);
  const taggedAt = new Date().toISOString();
  mergeIntoMirror({ ...item, id: null, cardKey, tag, taggedAt });
  announce();
  // An explicit tag is an intentional decision — file it into Beau's
  // persistent style memory too (fire-and-forget, never blocks the tag).
  void recordSearchTagFact(
    {
      pieceName: item.pieceName,
      maker: item.maker,
      categoryId: item.categoryId,
      subCategory: item.subCategory,
    },
    tag,
    cardKey,
  );
  const payload = {
    card_key: cardKey,
    piece_name: item.pieceName,
    category_id: item.categoryId || null,
    sub_category: item.subCategory || null,
    tag,
    source: item.source,
    maker: item.maker || null,
    price_guide: item.priceGuide || null,
    note: item.note || null,
    product_url: item.productUrl || null,
    image_url: item.imageUrl || null,
    tagged_at: taggedAt,
  };
  try {
    const { data } = await db().from('hunt_calls').eq('card_key', cardKey).limit(1).get();
    const existing = (data || [])[0] as CallRow | undefined;
    if (existing) await db().from('hunt_calls').update(existing.id, payload);
    else await db().from('hunt_calls').insert(payload);
    await fetchHuntCalls();
  } catch (e) {
    console.warn('[Ethaion] hunt tag write failed (the local mirror still holds it):', e);
  }
  announce();
}

/** Remove a tag entirely — the piece goes back to being untagged. */
export async function clearHuntTag(cardKey: string): Promise<void> {
  storeMirror(loadHuntCallsMirror().filter((c) => c.cardKey !== cardKey));
  announce();
  // An untagged card holds no opinion — its style-memory fact goes with it.
  void clearSearchTagFact(cardKey);
  try {
    const { data } = await db().from('hunt_calls').eq('card_key', cardKey).limit(5).get();
    for (const row of (data || []) as CallRow[]) {
      await db().from('hunt_calls').delete(row.id);
    }
    await fetchHuntCalls();
  } catch (e) {
    console.warn('[Ethaion] hunt tag removal failed:', e);
  }
  announce();
}

// ---------------------------------------------------------------------------
// Replaced picks — a "Replace" is a local preference, not an opinion: the
// card goes off the shelf and Beau draws another in its place. Kept per
// shelf so the replacement is never the piece just cleared away.
// ---------------------------------------------------------------------------

const RETIRED_KEY = 'ethaion:hunt-retired:v1';

function retiredStore(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(RETIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** The sub-category's own key in the retired store. */
export function subCategoryKey(categoryId: string, subCategory: string): string {
  return `${categoryId}\u241f${subCategory}`.toLowerCase();
}

export function retiredPieceNames(categoryId: string, subCategory: string): string[] {
  return retiredStore()[subCategoryKey(categoryId, subCategory)] || [];
}

/** The shelf a CATEGORY-level draw retires against. Beau's Picks draws three
 * pieces for the category as a whole rather than one shelf per run, so the
 * names cleared away are kept against the category itself. The leading unit
 * separator can never collide with a run label. */
const CATEGORY_SHELF = '\u241fcategory';

/** Everything cleared away in this category, so neither this draw nor a later
 * one repeats it. */
export function retiredInCategory(categoryId: string): string[] {
  return retiredPieceNames(categoryId, CATEGORY_SHELF);
}

export function retireInCategory(categoryId: string, pieceName: string): void {
  retirePieceName(categoryId, CATEGORY_SHELF, pieceName);
}

export function retirePieceName(categoryId: string, subCategory: string, pieceName: string): void {
  const store = retiredStore();
  const key = subCategoryKey(categoryId, subCategory);
  const list = store[key] || [];
  const name = pieceName.trim();
  if (name && !list.some((n) => n.toLowerCase() === name.toLowerCase())) {
    // Twenty is plenty of history to keep a replacement honest without
    // growing the prompt unboundedly.
    store[key] = [...list, name].slice(-20);
    try {
      window.localStorage.setItem(RETIRED_KEY, JSON.stringify(store));
    } catch {
      /* storage unavailable — the session state still excludes it */
    }
  }
}
