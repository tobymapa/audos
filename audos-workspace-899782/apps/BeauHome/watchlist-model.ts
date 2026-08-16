/**
 * THE SEARCH · THE WATCHLIST · MODEL — the shape of a watched piece and the
 * one place the `watchlist` table is written.
 *
 * A WATCH is not a call. Your Calls records what he THINKS of a piece (saved,
 * favourite, passed); the Watchlist records that he wants Beau to KEEP AN EYE
 * ON one — the same piece can be both, and neither writes the other's row.
 *
 * ONE ROW PER PIECE, keyed by a stable `watch_key` (the retailer URL where
 * there is one, otherwise the source and the normalised piece name), so
 * watching the same piece from Beau's Picks and from Your Calls can never
 * file it twice. Taking a piece off the Watchlist ARCHIVES its row rather
 * than deleting it — watching it again revives the same row, with the
 * history of what Beau has already noticed still on it.
 *
 * THE BASELINE PRICE. `last_known_price` is the price the card stated when
 * the piece was watched, and the on-open poll (watchlist-poll.ts) compares
 * against it WITHOUT overwriting it. That is deliberate: it is what lets the
 * alert keep reading “dropped £40 since you saved it” instead of quietly
 * re-basing itself to today's price and clearing the alert before he has
 * seen it. The only time the poll writes the column is when the piece was
 * watched with no price at all.
 *
 * TWO KINDS OF WATCH (August 2026). `watch_type` tells them apart. A PIECE
 * row is the original: one product page, watched for its price and whether it
 * is still there. A BRAND row is a whole maker — `retailer_url` holds its new
 * arrivals page rather than a product, `piece_name` and `brand` both hold the
 * brand's name, and there is no price to compare, so the poll compares an
 * FNV-1a hash of the page's own content (`page_snapshot_hash`) and says so
 * when it moves. Everything else — the archive, the alert, the stamp — works
 * identically, so one Watchlist holds both.
 *
 * localStorage is the fast local mirror (the same treatment hunt-model.ts
 * gives Your Calls): every Watch button paints from it instantly and the
 * table read reconciles when it lands. The mirror holds the ACTIVE rows only
 * — an archived piece is not on the Watchlist.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

/** Where the piece was put on watch from. */
export type WatchSource = 'beaus_picks' | 'ask_beau' | 'your_calls';

export const WATCH_SOURCE_LABELS: Record<WatchSource, string> = {
  beaus_picks: "Beau's Picks",
  ask_beau: 'Ask Beau',
  your_calls: 'Your Calls',
};

/** What a row watches: one product page, or a whole brand's new arrivals. */
export type WatchType = 'piece' | 'brand';

/** What a card hands the Watch button. */
export interface WatchTarget {
  pieceName: string;
  brand?: string | null;
  /** The product page — what the poll re-reads. A piece without one is
   * watched, listed and never polled. */
  retailerUrl?: string | null;
  imageUrl?: string | null;
  /** The price the card stated — the baseline the poll reads against. */
  price?: string | null;
  /** Beau's short assessment from the card, carried onto the row. */
  verdict?: string | null;
  source: WatchSource;
  /** 'piece' when absent. A 'brand' target names the maker in `pieceName`
   * and its new-arrivals page in `retailerUrl`. */
  watchType?: WatchType;
}

/** One piece on the Watchlist, as every surface reads it. */
export interface WatchedPiece {
  /** DB row id — null while only the local mirror holds it. */
  id: number | null;
  watchKey: string;
  pieceName: string;
  brand: string | null;
  retailerUrl: string | null;
  imageUrl: string | null;
  lastKnownPrice: string | null;
  /** ISO timestamp of the last poll, or null before the first one. */
  lastCheckedAt: string | null;
  alertTriggered: boolean;
  alertMessage: string | null;
  beauVerdict: string | null;
  source: WatchSource;
  addedAt: string;
  archived: boolean;
  /** A piece, or a whole brand. */
  watchType: WatchType;
  /** Brand rows only — the hash of the page as Beau last read it. */
  pageSnapshotHash: string | null;
}

const MIRROR_KEY = 'ethaion:watchlist:v1';
export const WATCHLIST_EVENT = 'ethaion:watchlist-changed';

/** The unit separator every key in the app joins its parts with. */
const SEP = '\u241f';

/** One brand's name as every surface compares it — trimmed, collapsed, cased
 * down. Beau's inbox normalises the same way, so an email from a brand meets
 * the row watching it. */
export function normaliseBrandName(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The looser key two SPELLINGS of one house agree on: “Spier & Mackay” and the
 * sender domain “spierandmackay.com” both reduce to “spierandmackay”. Used only
 * to match Beau's post to a watched brand, never to store or display a name —
 * an email that names the maker differently from the card still finds its row.
 */
export function looseBrandKey(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/** The stable identity of one WATCHED BRAND — the name, never the URL, so
 * correcting the new-arrivals link keeps the same row. */
export function brandWatchKey(brandName: string): string {
  return `brand${SEP}${normaliseBrandName(brandName)}`;
}

/**
 * The stable identity of one watched piece. The product URL is the strongest
 * key when there is one — the same listing watched from two faces is one row;
 * otherwise the source and the normalised name. A brand target is keyed by
 * its name instead (see brandWatchKey).
 */
export function watchKeyFor(target: WatchTarget): string {
  if (target.watchType === 'brand') return brandWatchKey(target.pieceName);
  const url = (target.retailerUrl || '').trim().toLowerCase();
  if (url) return `url${SEP}${url}`;
  const name = (target.pieceName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${target.source}${SEP}${name}`;
}

/**
 * FNV-1a, 32 bits, base-36 — the same cheap content hash the image pipeline
 * keys its cutout store with. Here it stands in for “the page as it was”: two
 * reads that hash the same have nothing new on them.
 */
export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** What a brand watch got for a page, and how sure we are of it. */
export interface BrandArrivalsGuess {
  url: string | null;
  /** 'arrivals' — a real new-arrivals path we could work out. 'domain' — only
   * the maker's own front page, which is watchable but worth correcting. */
  kind: 'arrivals' | 'domain' | null;
}

/**
 * The brand's new-arrivals page, worked out from one of its product links.
 *
 * A product URL under `/products/…` is Shopify's own shape, and a Shopify shop
 * keeps its new arrivals at `/collections/new-arrivals` — worth taking. For
 * anything else only the domain is honest, so that is what is stored and the
 * row says plainly that it wants the real link. Never blocks the watch.
 */
export function inferBrandArrivalsUrl(retailerUrl: string | null | undefined): BrandArrivalsGuess {
  const raw = (retailerUrl || '').trim();
  if (!raw) return { url: null, kind: null };
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const origin = `${parsed.protocol}//${parsed.host}`;
    if (/\/products\//i.test(parsed.pathname)) {
      return { url: `${origin}/collections/new-arrivals`, kind: 'arrivals' };
    }
    return { url: origin, kind: 'domain' };
  } catch {
    return { url: null, kind: null };
  }
}

/** True when a brand row is only watching a front page — the row offers the
 * reader a box to put the real new-arrivals link in. */
export function brandUrlNeedsArrivals(url: string | null): boolean {
  const raw = (url || '').trim();
  if (!raw) return true;
  try {
    const path = new URL(raw).pathname.replace(/\/+$/, '');
    return path === '';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Rows in, pieces out
// ---------------------------------------------------------------------------

interface WatchRow {
  id: number;
  watch_key: string | null;
  piece_name: string | null;
  brand: string | null;
  retailer_url: string | null;
  image_url: string | null;
  last_known_price: string | null;
  last_checked_at: string | null;
  alert_triggered: boolean | null;
  alert_message: string | null;
  beau_verdict: string | null;
  source: string | null;
  added_at: string | null;
  is_archived: boolean | null;
  watch_type: string | null;
  page_snapshot_hash: string | null;
  created_at?: string;
}

function watchTypeOf(value: unknown): WatchType {
  return value === 'brand' ? 'brand' : 'piece';
}

function sourceOf(value: unknown): WatchSource {
  return value === 'ask_beau' || value === 'your_calls' ? value : 'beaus_picks';
}

function pieceFromRow(row: WatchRow): WatchedPiece | null {
  const pieceName = (row.piece_name || '').trim();
  const watchKey = (row.watch_key || '').trim();
  if (!pieceName || !watchKey) return null;
  return {
    id: row.id,
    watchKey,
    pieceName,
    brand: row.brand || null,
    retailerUrl: row.retailer_url || null,
    imageUrl: row.image_url || null,
    lastKnownPrice: row.last_known_price || null,
    lastCheckedAt: row.last_checked_at || null,
    alertTriggered: row.alert_triggered === true,
    alertMessage: row.alert_message || null,
    beauVerdict: row.beau_verdict || null,
    source: sourceOf(row.source),
    addedAt: row.added_at || row.created_at || new Date().toISOString(),
    archived: row.is_archived === true,
    watchType: watchTypeOf(row.watch_type),
    pageSnapshotHash: row.page_snapshot_hash || null,
  };
}

// ---------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------

export function loadWatchlistMirror(): WatchedPiece[] {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    // A mirror written before brand watching existed holds pieces only.
    return (parsed as WatchedPiece[])
      .filter((p) => p && p.watchKey && p.pieceName && !p.archived)
      .map((p) => ({
        ...p,
        watchType: watchTypeOf(p.watchType),
        pageSnapshotHash: p.pageSnapshotHash || null,
      }));
  } catch {
    return [];
  }
}

function storeMirror(pieces: WatchedPiece[]): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(pieces));
  } catch {
    /* storage unavailable — the session state still carries the Watchlist */
  }
}

function announce(): void {
  window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Every ACTIVE watched piece, newest first. Reads the table; falls back to
 * the local mirror when the read fails, so the tab still works offline.
 */
export async function fetchWatchlist(): Promise<WatchedPiece[]> {
  try {
    const { data } = await db().from('watchlist').orderBy('created_at', 'desc').limit(300).get();
    const seen = new Set<string>();
    const pieces: WatchedPiece[] = [];
    for (const row of (data || []) as WatchRow[]) {
      const piece = pieceFromRow(row);
      // Newest row per key wins; an archived piece is not on the Watchlist.
      if (!piece || seen.has(piece.watchKey)) continue;
      seen.add(piece.watchKey);
      if (!piece.archived) pieces.push(piece);
    }
    storeMirror(pieces);
    return pieces;
  } catch {
    return loadWatchlistMirror();
  }
}

/** One read of the table per page load, however many buttons ask for it. */
let loaded: Promise<WatchedPiece[]> | null = null;

export function ensureWatchlistLoaded(): Promise<WatchedPiece[]> {
  if (!loaded) {
    loaded = fetchWatchlist().then((pieces) => {
      announce();
      return pieces;
    });
  }
  return loaded;
}

/** Re-read the table on the next ask — what a write calls when it lands. */
export function invalidateWatchlist(): void {
  loaded = null;
}

/** The row on file for one key, or null. Reads the table, not the mirror. */
async function rowFor(watchKey: string): Promise<WatchRow | null> {
  const { data } = await db().from('watchlist').eq('watch_key', watchKey).limit(5).get();
  const rows = ((data || []) as WatchRow[]).slice().sort((a, b) => b.id - a.id);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Put one piece on the Watchlist. The mirror is written FIRST so the button
 * flips to “Watching” instantly, then the row lands: an existing row for the
 * same key is REVIVED (un-archived) and refreshed with whatever the card can
 * tell it, rather than a second row being filed.
 */
export async function watchPiece(target: WatchTarget): Promise<void> {
  const watchKey = watchKeyFor(target);
  const addedAt = new Date().toISOString();
  const optimistic: WatchedPiece = {
    id: null,
    watchKey,
    pieceName: target.pieceName,
    brand: target.brand || null,
    retailerUrl: target.retailerUrl || null,
    imageUrl: target.imageUrl || null,
    lastKnownPrice: target.price || null,
    lastCheckedAt: null,
    alertTriggered: false,
    alertMessage: null,
    beauVerdict: target.verdict || null,
    source: target.source,
    addedAt,
    archived: false,
    watchType: 'piece',
    pageSnapshotHash: null,
  };
  storeMirror([optimistic, ...loadWatchlistMirror().filter((p) => p.watchKey !== watchKey)]);
  announce();

  try {
    const existing = await rowFor(watchKey);
    if (existing) {
      // Revive it, and let the card top up anything the old row lacked —
      // never blank a fact the row already holds.
      await db().from('watchlist').update(existing.id, {
        is_archived: false,
        piece_name: target.pieceName || existing.piece_name,
        brand: target.brand || existing.brand || null,
        retailer_url: target.retailerUrl || existing.retailer_url || null,
        image_url: target.imageUrl || existing.image_url || null,
        last_known_price: existing.last_known_price || target.price || null,
        beau_verdict: target.verdict || existing.beau_verdict || null,
        source: existing.source || target.source,
        added_at: existing.added_at || addedAt,
        watch_type: 'piece',
      });
    } else {
      await db().from('watchlist').insert({
        watch_key: watchKey,
        piece_name: target.pieceName,
        brand: target.brand || null,
        retailer_url: target.retailerUrl || null,
        image_url: target.imageUrl || null,
        last_known_price: target.price || null,
        last_checked_at: null,
        alert_triggered: false,
        alert_message: null,
        beau_verdict: target.verdict || null,
        source: target.source,
        added_at: addedAt,
        is_archived: false,
        watch_type: 'piece',
      });
    }
    invalidateWatchlist();
    await fetchWatchlist();
  } catch (e) {
    console.warn('[Ethaion] watch write failed (the local mirror still holds it):', e);
  }
  announce();
}

/**
 * Take one piece off the Watchlist — the row is ARCHIVED, and its alert
 * cleared with it, so reviving it later starts from a quiet slate.
 */
export async function unwatchPiece(watchKey: string): Promise<void> {
  storeMirror(loadWatchlistMirror().filter((p) => p.watchKey !== watchKey));
  announce();
  try {
    const existing = await rowFor(watchKey);
    if (existing) {
      await db()
        .from('watchlist')
        .update(existing.id, { is_archived: true, alert_triggered: false, alert_message: null });
    }
    invalidateWatchlist();
    await fetchWatchlist();
  } catch (e) {
    console.warn('[Ethaion] watch removal failed:', e);
  }
  announce();
}

/** Watch it, or — when it is already watched — take it off. */
export async function toggleWatch(target: WatchTarget, watching: boolean): Promise<void> {
  if (watching) await unwatchPiece(watchKeyFor(target));
  else await watchPiece(target);
}

// ---------------------------------------------------------------------------
// Watching a whole brand
// ---------------------------------------------------------------------------

/**
 * Put one BRAND on the Watchlist — the maker itself rather than a piece of
 * its. `newArrivalsUrl` is the page Beau re-reads: its new-arrivals or
 * all-products page where the card could name one, otherwise its front page,
 * which the row then asks the reader to correct. Watching a brand twice
 * revives the one row, exactly as a piece does, and a brand already watched
 * only tops up the link when it gets a better one.
 */
export async function watchBrand(
  brandName: string,
  newArrivalsUrl?: string | null,
  source: WatchSource = 'beaus_picks',
): Promise<void> {
  const name = (brandName || '').trim();
  if (!name) return;
  const watchKey = brandWatchKey(name);
  const url = (newArrivalsUrl || '').trim() || null;
  const addedAt = new Date().toISOString();
  const optimistic: WatchedPiece = {
    id: null,
    watchKey,
    pieceName: name,
    brand: name,
    retailerUrl: url,
    imageUrl: null,
    lastKnownPrice: null,
    lastCheckedAt: null,
    alertTriggered: false,
    alertMessage: null,
    beauVerdict: null,
    source,
    addedAt,
    archived: false,
    watchType: 'brand',
    pageSnapshotHash: null,
  };
  storeMirror([optimistic, ...loadWatchlistMirror().filter((p) => p.watchKey !== watchKey)]);
  announce();

  try {
    const existing = await rowFor(watchKey);
    if (existing) {
      // A real arrivals path beats a bare domain; otherwise keep what is there.
      const better = url && brandUrlNeedsArrivals(existing.retailer_url) && !brandUrlNeedsArrivals(url);
      await db().from('watchlist').update(existing.id, {
        is_archived: false,
        piece_name: name,
        brand: name,
        retailer_url: better ? url : existing.retailer_url || url,
        watch_type: 'brand',
        source: existing.source || source,
        added_at: existing.added_at || addedAt,
      });
    } else {
      await db().from('watchlist').insert({
        watch_key: watchKey,
        piece_name: name,
        brand: name,
        retailer_url: url,
        image_url: null,
        last_known_price: null,
        last_checked_at: null,
        alert_triggered: false,
        alert_message: null,
        beau_verdict: null,
        source,
        added_at: addedAt,
        is_archived: false,
        watch_type: 'brand',
        page_snapshot_hash: null,
      });
    }
    invalidateWatchlist();
    await fetchWatchlist();
  } catch (e) {
    console.warn('[Ethaion] brand watch write failed (the local mirror still holds it):', e);
  }
  announce();
}

/**
 * Point a watched brand at a better page — what the row's own box writes when
 * the reader pastes the maker's new-arrivals link. The snapshot and any alert
 * go with the old page: a new page has nothing to have changed from yet.
 */
export async function setBrandWatchUrl(watchKey: string, url: string): Promise<void> {
  const next = (url || '').trim();
  if (!next) return;
  const withProtocol = /^https?:\/\//i.test(next) ? next : `https://${next}`;
  storeMirror(
    loadWatchlistMirror().map((p) =>
      p.watchKey === watchKey
        ? { ...p, retailerUrl: withProtocol, pageSnapshotHash: null, alertTriggered: false, alertMessage: null }
        : p,
    ),
  );
  announce();
  try {
    const existing = await rowFor(watchKey);
    if (existing) {
      await db().from('watchlist').update(existing.id, {
        retailer_url: withProtocol,
        page_snapshot_hash: null,
        alert_triggered: false,
        alert_message: null,
      });
    }
    invalidateWatchlist();
    await fetchWatchlist();
  } catch (e) {
    console.warn('[Ethaion] brand watch link could not be saved:', e);
  }
  announce();
}

/**
 * Record what a poll found. Used by watchlist-poll.ts only; never clears a
 * fact the check could not establish.
 */
export async function recordWatchCheck(
  rowId: number,
  patch: {
    lastCheckedAt: string;
    alertTriggered?: boolean;
    alertMessage?: string | null;
    lastKnownPrice?: string;
    /** Brand rows: the hash of the page as this check read it. */
    pageSnapshotHash?: string;
  },
): Promise<void> {
  const fields: Record<string, unknown> = { last_checked_at: patch.lastCheckedAt };
  if (patch.alertTriggered !== undefined) fields.alert_triggered = patch.alertTriggered;
  if (patch.alertMessage !== undefined) fields.alert_message = patch.alertMessage;
  if (patch.lastKnownPrice !== undefined) fields.last_known_price = patch.lastKnownPrice;
  if (patch.pageSnapshotHash !== undefined) fields.page_snapshot_hash = patch.pageSnapshotHash;
  await db().from('watchlist').update(rowId, fields);
}
