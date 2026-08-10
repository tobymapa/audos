/**
 * Fitting engine — the shared state behind the Fitting tab and every "Try
 * this on" entry point across the app (Hunt candidates, owned pieces,
 * What-to-wear suggestions).
 *
 *  - requestFittingRoomTryOn(piece): the ONE way any surface hands a piece
 *    to The Fitting — it navigates there and the piece lands on the
 *    flat-lay board.
 *  - Board handoffs (manual / today / trip) and the module-level canvas
 *    memory that makes tab switches free.
 *
 * THE AVATAR PATH IS DELETED (design handoff §dead-code): the flat lay
 * replaced the try-on figure. lib/tryon (the Fashn provider seam, the
 * avatar builder) and the tryon_renders cache reads are gone with it —
 * dead weight, not a flag.
 */
import { fetchProductImage } from './og-image';
import { goToTab } from './profile-data';

// ---------------------------------------------------------------------------
// The piece being fitted — everything The Fitting needs to speak about it,
// resolve its garment image, and link back to the listing.
// ---------------------------------------------------------------------------

export interface FittingPiece {
  /** Stable identity for caching and board keys, e.g. 'curated-drakes-ocbd'.
   * Owned wardrobe pieces carry `owned-<id>` — everything else draws DASHED
   * on the board (not yours yet) and saves as a proposal. */
  key: string;
  name: string;
  brand?: string | null;
  /** Wardrobe category — used to place pieces in their flat-lay zone. */
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
// Cross-surface handoff — "Try this on" anywhere lands HERE.
// ---------------------------------------------------------------------------

export const FITTING_PIECE_EVENT = 'ethaion:fitting-piece';

let pendingPiece: FittingPiece | null = null;

/** The Fitting reads (and clears) the piece it was opened with. */
export function consumePendingFittingPiece(): FittingPiece | null {
  const piece = pendingPiece;
  pendingPiece = null;
  return piece;
}

/**
 * The ONE entry point for every "Try this on" button: navigates to The
 * Fitting with the piece, which lays it out on the flat-lay board.
 */
export function requestFittingRoomTryOn(piece: FittingPiece): void {
  pendingPiece = piece;
  goToTab('fitting-room');
  window.dispatchEvent(new CustomEvent(FITTING_PIECE_EVENT, { detail: { piece } }));
}

// ---------------------------------------------------------------------------
// Board handoffs (Fitting overhaul, Part 3.1) — The Fitting is ONE shared
// canvas with three entry points, all landing here:
//   · manual ("Build a Look" on The Ledger)   → empty board
//   · today  ("Beau · Today" on The Ledger)   → AI-composed board + reasoning
//   · trip   ("Beau · Trip" form on The Ledger) → multi-day boards + packing
// Entering with NO handoff at all also lands on today's look — the board
// opens dressed (design handoff 10a).
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
