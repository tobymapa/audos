/**
 * Fitting Room engine — the shared state behind the Fitting Room tab and
 * every "Try this on" entry point across the app (Curated picks, Radar rows,
 * What-to-wear suggestions, owned pieces).
 *
 *  - requestFittingRoomTryOn(piece): the ONE way any surface starts a try-on.
 *    It kicks the render off IMMEDIATELY (so it is already cooking while the
 *    tab opens) and navigates to the Fitting Room, which picks the piece up
 *    as its active render. The old inline try-on modal is retired — the
 *    Fitting Room tab is the single home for all try-on activity.
 *  - ensureRender(person, garment): renders through lib/tryon (the swappable
 *    provider seam — Fashn today) with a THREE-layer cache: in-flight dedupe,
 *    in-memory, and the tryon_renders WorkspaceDB table, so a piece rendered
 *    once (by a tap or the shelf pre-loader) reappears near-instantly.
 *  - The PERSON image is the cached AVATAR (lib/tryon/avatar.ts) — the
 *    masculine figure built once from profile data, already wearing men's
 *    pyjamas in its default state. No render is needed until a piece is
 *    actually tapped, and the avatar URL is stable, so every piece rendered
 *    onto it caches cleanly per user.
 *
 * Screens never import a provider: everything goes through lib/tryon.
 */
import { tryOn } from '../../lib/tryon/index';
import { ensureAvatar } from '../../lib/tryon/avatar';
import { fetchProductImage } from './og-image';
import { goToTab } from './profile-data';

/**
 * THE AVATAR FEATURE FLAG — parked, not deleted.
 *
 * The whole avatar path (the figure, the body render, the pinned-piece layer,
 * the Avatar/Flat switcher and the avatar profile block in The Dossier) is
 * left in the codebase and switched off from this one place. With it false,
 * The Fitting opens directly onto the flat-lay board, “Try this on” lays the
 * piece out on that board, and nothing avatar-related is fetched, built or
 * rendered. Flip it to true to bring the idea back.
 */
export const AVATAR_ENABLED: boolean = false;

// ---------------------------------------------------------------------------
// The piece being fitted — everything the Fitting Room needs to speak about
// it, resolve its garment image, and link back to the listing.
// ---------------------------------------------------------------------------

export interface FittingPiece {
  /** Stable identity for caching and pinning, e.g. 'curated-drakes-ocbd'. */
  key: string;
  name: string;
  brand?: string | null;
  /** Wardrobe category — used to place pinned pieces around the figure. */
  category?: string | null;
  /** Catalog slot id (e.g. 'ocbd', 'derbies') — picks the garment
   * illustration used when no product photo can be resolved. */
  slotId?: string | null;
  /** Direct garment image URL (owned pieces, saved images). */
  garmentImageUrl?: string | null;
  /** Product page URL — resolved to its og:image when no direct image. */
  productUrl?: string | null;
  /** Curated stock-photo query (a catalogue pick's own photoQuery) — the
   * purposeful query that resolves a REAL product photograph when the piece
   * has no direct image and its product page yields no usable og:image. */
  imageQuery?: string | null;
  /** A short Beau line about the piece, when the source card has one. */
  note?: string | null;
  /** The card's existing CTA, carried into the error fallback. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// Garment image resolution — direct image first, og:image from the product
// page second (cached in og-image.tsx). '' when nothing usable exists.
// ---------------------------------------------------------------------------

export async function resolveGarmentImage(piece: FittingPiece): Promise<string> {
  const direct = (piece.garmentImageUrl || '').trim();
  if (direct) return direct;
  return fetchProductImage(piece.productUrl);
}

// ---------------------------------------------------------------------------
// Render cache — memory + tryon_renders (WorkspaceDB), keyed person::garment.
// Fashn result URLs are not permanent, so DB rows are only trusted for a
// couple of days; a broken image calls forgetRender() and re-renders.
// ---------------------------------------------------------------------------

const RENDER_TTL_MS = 48 * 60 * 60 * 1000;

const memoryRenders = new Map<string, string>();
const inflightRenders = new Map<string, Promise<string>>();
let dbCachePromise: Promise<void> | null = null;

const renderKey = (personUrl: string, garmentUrl: string) => `${personUrl}::${garmentUrl}`;

/** Warm the memory cache from tryon_renders once per session. */
function loadDbRenderCache(): Promise<void> {
  if (!dbCachePromise) {
    dbCachePromise = (async () => {
      try {
        const { data } = await db().from('tryon_renders').orderBy('created_at', 'desc').limit(100).get();
        const cutoff = Date.now() - RENDER_TTL_MS;
        for (const row of data || []) {
          if (!row?.person_url || !row?.garment_url || !row?.render_url) continue;
          const age = row.created_at ? new Date(row.created_at).getTime() : 0;
          if (age < cutoff) continue; // too old — the Fashn URL may be gone
          const key = renderKey(row.person_url, row.garment_url);
          if (!memoryRenders.has(key)) memoryRenders.set(key, row.render_url);
        }
      } catch (e) {
        console.warn('[Ethaion] reading the try-on render cache failed:', e);
      }
    })();
  }
  return dbCachePromise;
}

/** Synchronous cache peek — for "appears near-instantly" checks. */
export function cachedRender(personUrl: string, garmentUrl: string): string | null {
  return memoryRenders.get(renderKey(personUrl, garmentUrl)) || null;
}

/** Drop a cached render whose URL went stale (image failed to load). */
export function forgetRender(personUrl: string, garmentUrl: string): void {
  memoryRenders.delete(renderKey(personUrl, garmentUrl));
  void (async () => {
    try {
      const { data } = await db().from('tryon_renders').limit(100).get();
      for (const row of data || []) {
        if (row?.person_url === personUrl && row?.garment_url === garmentUrl) {
          await db().from('tryon_renders').delete(row.id);
        }
      }
    } catch { /* cache hygiene only — never blocks a re-render */ }
  })();
}

/**
 * Render `garmentUrl` onto `personUrl` — cached, deduplicated, provider-
 * agnostic (lib/tryon). Resolves with the rendered image URL; rejects with a
 * plain-English error the Fitting Room shows quietly.
 */
export async function ensureRender(
  personUrl: string,
  garmentUrl: string,
  { pieceName, onPhase }: { pieceName?: string | null; onPhase?: (phase: string) => void } = {},
): Promise<string> {
  const key = renderKey(personUrl, garmentUrl);
  await loadDbRenderCache();
  const cached = memoryRenders.get(key);
  if (cached) return cached;
  const running = inflightRenders.get(key);
  if (running) {
    // Re-attach this caller's phase copy to the shared render.
    onPhase?.('Beau is putting this together for you\u2026');
    return running;
  }
  const job = (async () => {
    try {
      const url = await tryOn(personUrl, garmentUrl, { onPhase });
      memoryRenders.set(key, url);
      // Persist for next visit — fire and forget.
      void db()
        .from('tryon_renders')
        .insert({ person_url: personUrl, garment_url: garmentUrl, render_url: url, piece_name: pieceName || null })
        .catch(() => undefined);
      return url;
    } finally {
      inflightRenders.delete(key);
    }
  })();
  inflightRenders.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// Cross-surface handoff — "Try this on" anywhere lands HERE.
// ---------------------------------------------------------------------------

export const FITTING_PIECE_EVENT = 'ethaion:fitting-piece';

let pendingPiece: FittingPiece | null = null;

/** The Fitting Room reads (and clears) the piece it was opened with. */
export function consumePendingFittingPiece(): FittingPiece | null {
  const piece = pendingPiece;
  pendingPiece = null;
  return piece;
}

/**
 * The ONE entry point for every "Try this on" button: starts the render
 * immediately (so it is already in progress when the tab opens) and
 * navigates to the Fitting Room with the piece as the active render. The
 * person image is the cached avatar — built here on demand if this is the
 * very first interaction.
 */
export function requestFittingRoomTryOn(piece: FittingPiece): void {
  pendingPiece = piece;
  // Head start: kick the render before the tab even mounts. Failures are
  // quiet here — the Fitting Room re-runs the flow and surfaces the error.
  // Avatar parked: no figure is built and no render is started; The Fitting
  // simply lays the piece out on the board.
  if (AVATAR_ENABLED) {
    void (async () => {
      try {
        const avatar = await ensureAvatar();
        const garment = await resolveGarmentImage(piece);
        if (!garment) return;
        await ensureRender(avatar.url, garment, { pieceName: piece.name });
      } catch { /* the Fitting Room's own flow handles and shows errors */ }
    })();
  }
  goToTab('fitting-room');
  window.dispatchEvent(new CustomEvent(FITTING_PIECE_EVENT, { detail: { piece } }));
}

// ---------------------------------------------------------------------------
// Board handoffs (Fitting overhaul, Part 3.1) — The Fitting is ONE shared
// canvas with three entry points, all landing here:
//   · manual ("Build a Look" on The Ledger)   → empty board
//   · today  ("Beau · Today" on The Ledger)   → AI-composed board + reasoning
//   · trip   ("Beau · Trip" form on The Ledger) → multi-day boards + packing
// ---------------------------------------------------------------------------

export type FittingBoardSource = 'manual' | 'today' | 'trip';

export interface TripBrief {
  destination: string;
  /** Free text — "3 days", "5–8 Sep", "a long weekend". */
  dates: string;
  /** The occasion mix — "mostly casual, one dinner out". */
  occasions: string;
}

export interface FittingBoardHandoff {
  source: FittingBoardSource;
  /** Only for source 'trip'. */
  trip?: TripBrief;
}

export const FITTING_BOARD_EVENT = 'ethaion:fitting-board';

let pendingBoardHandoff: FittingBoardHandoff | null = null;

/** The Fitting reads (and clears) the handoff it was opened with. */
export function consumePendingFittingBoard(): FittingBoardHandoff | null {
  const handoff = pendingBoardHandoff;
  pendingBoardHandoff = null;
  return handoff;
}

/**
 * The ONE entry point for every board handoff into The Fitting: "Build a
 * look" (manual), "Beau · Today" (today) and the "Beau · Trip" form (trip)
 * all call this, then the Fitting composes/clears the shared canvas itself.
 */
export function requestFittingBoard(handoff: FittingBoardHandoff): void {
  pendingBoardHandoff = handoff;
  goToTab('fitting-room');
  window.dispatchEvent(new CustomEvent(FITTING_BOARD_EVENT, { detail: { handoff } }));
}

// ---------------------------------------------------------------------------
// CANVAS MEMORY (global tab-caching fix, Part 3) — the Fitting's composed
// canvas lives at MODULE level, so switching tabs and coming back restores
// the exact board, reasoning and trip state WITHOUT any API re-run. The
// shapes are owned by fitting-room.tsx; this store only holds them.
// ---------------------------------------------------------------------------

export interface FittingCanvasSnapshot {
  boardSource: FittingBoardSource;
  board: unknown;
  reasoning: string | null;
  reasoningDismissed: boolean;
  /** The weather gap note for a single board — "nothing here is rated for
   * today's heat" — restored with the board so it does not vanish on a tab
   * switch. Trip-level gaps live on the trip state. */
  gapNote?: string | null;
  gapDismissed?: boolean;
  trip: unknown | null;
  /** The flat-lay's per-outfit seed — restored with the board so the
   * composition re-opens laid out identically. */
  seed?: string;
}

let canvasSnapshot: FittingCanvasSnapshot | null = null;

export function saveFittingCanvas(snapshot: FittingCanvasSnapshot): void {
  canvasSnapshot = snapshot;
}

export function loadFittingCanvas(): FittingCanvasSnapshot | null {
  return canvasSnapshot;
}

// ---------------------------------------------------------------------------
// TRIP BOARDS CACHE — one composed board set per (brief × wardrobe) per
// session. Re-submitting the same trip from the Ledger reuses the set
// instead of re-running the model; a changed brief or a changed wardrobe
// composes fresh.
// ---------------------------------------------------------------------------

function tripKey(brief: TripBrief, wardrobeIds: number[]): string {
  return [
    brief.destination.trim().toLowerCase(),
    brief.dates.trim().toLowerCase(),
    brief.occasions.trim().toLowerCase(),
    wardrobeIds.slice().sort((a, b) => a - b).join(','),
  ].join('\u241f');
}

const tripBoardsCache = new Map<string, unknown>();

export function cachedTripBoards(brief: TripBrief, wardrobeIds: number[]): unknown | null {
  return tripBoardsCache.get(tripKey(brief, wardrobeIds)) ?? null;
}

export function rememberTripBoards(brief: TripBrief, wardrobeIds: number[], boards: unknown): void {
  tripBoardsCache.set(tripKey(brief, wardrobeIds), boards);
}
