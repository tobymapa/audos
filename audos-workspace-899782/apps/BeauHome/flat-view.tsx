/**
 * FLAT VIEW — the Fitting Room's always-instant outfit board.
 *
 * No AI rendering, no wait: a clean oatmeal canvas where garment thumbnails
 * are arranged contextually — outerwear in the upper area, tops below it,
 * bottoms in the middle, shoes at the bottom, accessories to the side. The
 * user taps pieces from the three rails (Beau's Picks · Radar · Owned) to
 * place them; tapping a piece in the same category REPLACES the piece in
 * that slot. Pieces without an image show a minimal placeholder — hairline
 * border box, category name in Lora.
 *
 * Boards can be saved with a name ("Beau's suggestion", or user-named) into
 * the saved_outfits WorkspaceDB table; the Saved outfits section below the
 * board lists them, taps back onto the board, and deletes quietly.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { typography } from '../../lib/colors';
import { resolveGarmentImage, type FittingPiece } from './fitting-room-state';
import { isTransparentCutout } from './photo-enhance';
import { FlatLayBoard, composeFlatLayBoard } from './flat-lay-board';

// The flat-lay itself lives in flat-lay-board.tsx so The Ledger's "Beau ·
// Today" card can show one WITHOUT pulling the Fitting Room's engine into
// the initial payload. Re-exported here because this module is where every
// board consumer already looks.
export { FlatLayBoard, composeFlatLayBoard };
export type { FlatLayPiece, FlatLayPlacedItem } from './flat-lay-board';

/** How a board image sits on the canvas. A stored cutout (a genuine
 * transparent PNG from the ingestion pipeline) is drawn as-is, straight on
 * the canvas. A photograph the pipeline has not cut yet is NEVER shown raw
 * and never plated on a white box (the founder's universal transparency
 * rule — a solid box behind an item is exactly what the flat-lay must never
 * show): the quiet processing tile holds its place until the cutout lands. */
function ProcessingBoardTile({ name }: { name: string }) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center bg-[#eadfcb]"
      role="img"
      aria-label={`${name} — image being prepared`}
    >
      <span
        className="block w-1/3 opacity-70"
        style={{ background: 'var(--space-neutral-300, #dccdb2)', aspectRatio: '1 / 1' }}
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * THE STAGED ITEM CAP. No single piece on the board may render wider than
 * this, whatever share of the canvas its zone asks for. A tapped piece used
 * to open at 45–60% of the canvas, which on a phone is most of the screen —
 * one garment dominating a board meant to hold a whole look. Capped here,
 * two or three pieces sit on screen together comfortably, which is the
 * proportion Mr Porter, Farfetch and ASOS all use in their builder views.
 * The image keeps its own aspect ratio inside the cap (width caps, height
 * follows), so nothing is squashed.
 */
const STAGE_ITEM_MAX_WIDTH = '220px';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// Board slots — contextual placement by category
// ---------------------------------------------------------------------------

export type BoardSlot = 'outerwear' | 'top' | 'bottom' | 'shoes' | 'accessory';

export const BOARD_SLOT_LABELS: Record<BoardSlot, string> = {
  outerwear: 'Outerwear',
  top: 'Top',
  bottom: 'Bottoms',
  shoes: 'Shoes',
  accessory: 'Accessory',
};

/** Which board slot a piece lands in — category first, with a name check
 * for the accessory-shaped pieces that live in other categories (a tie is
 * filed under formalwear; a belt under accessories). */
export function boardSlotFor(category?: string | null, name?: string | null): BoardSlot {
  const cat = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (/\b(tie|belt|scarf|watch|glove|cap|hat|bag|briefcase|backpack)\b/.test(n)) return 'accessory';
  if (cat === 'outerwear' || cat === 'formalwear') return 'outerwear';
  if (cat === 'tops' || cat === 'knitwear' || cat === 'sweatshirts' || cat === 'base-layers') return 'top';
  if (cat === 'bottoms') return 'bottom';
  if (cat === 'shoes') return 'shoes';
  return 'accessory';
}

export interface BoardPiece {
  slot: BoardSlot;
  key: string;
  name: string;
  brand: string | null;
  category: string | null;
  /** Resolved thumbnail URL — '' while resolving / when none exists. */
  image: string;
  /** The piece's ORIGINAL photograph (the wardrobe's normalized product
   * shot) — the flat-lay's render fallback when the cutout is missing or
   * broken, so a piece on the board always shows as clothes, never as a
   * text label (founder's correction, August 2026). */
  sourceImage?: string | null;
  /** false once ingestion has established that the only photography that
   * exists for this piece has a model in it (photo-enhance tier 2), or that
   * the cut itself did not pass verification. The flat-lay then holds it out
   * of the composition and names it beneath the board — a worn shot laid among
   * cutouts is exactly what the board must never show. Undefined until
   * ingestion has an answer. */
  flatLayReady?: boolean;
  /** Pixel dimensions of the stored tight-cropped cutout (pipeline v3) — set
   * alongside `image` when the ingested asset carries them, so the flat-lay
   * composer can derive the item's render width from its category height and
   * true aspect ratio. Absent on older cuts and uncut photographs. */
  croppedWidth?: number | null;
  croppedHeight?: number | null;
  /** DASHED MEANS NOT YOURS (build brief rule 2): true for candidates —
   * pieces the wearer doesn't own. The flat-lay draws them with a dashed
   * accent outline, and a board holding one saves as a PROPOSAL. */
  notOwned?: boolean;
}

export type OutfitBoardState = Partial<Record<BoardSlot, BoardPiece>>;

/** Build the board entry for a rail piece — the image resolves lazily.
 * Ownership reads off the piece key: owned wardrobe pieces carry the
 * `owned-<id>` key; everything else (weighing, Beau's picks, pasted links)
 * is a candidate and draws dashed. */
export function boardPieceFrom(piece: FittingPiece): BoardPiece {
  return {
    slot: boardSlotFor(piece.category, piece.name),
    key: piece.key,
    name: piece.name,
    brand: piece.brand || null,
    category: piece.category || null,
    image: (piece.garmentImageUrl || '').trim(),
    sourceImage: (piece.garmentImageUrl || '').trim() || null,
    notOwned: !piece.key.startsWith('owned-'),
  };
}

export { resolveGarmentImage };

// ---------------------------------------------------------------------------
// One garment card on the board — clean thumbnail, or the minimal hairline
// placeholder with the category name in Lora.
// ---------------------------------------------------------------------------

function BoardCard({
  piece,
  wide = false,
  onRemove,
}: {
  piece: BoardPiece | undefined;
  /** Bottoms get a slightly taller plate so trousers read as trousers. */
  wide?: boolean;
  onRemove?: (slot: BoardSlot) => void;
}) {
  if (!piece) return null;
  return (
    <div className={`relative flex-shrink-0 ${wide ? 'w-[104px] sm:w-[128px]' : 'w-[96px] sm:w-[118px]'}`}>
      {/* A stored cutout gets no plate frame and no ground of its own — the
          same rule the flat-lay canvas follows, so a piece does not change
          appearance depending on which board it lands on. A photograph with
          no cutout yet shows the processing tile (ProcessingBoardTile above)
          — never the raw source. The board is above the fold in The Fitting,
          so its images load eagerly rather than waiting on the lazy queue. */}
      {/* The image is absolutely positioned inside the (relative) aspect box:
          a percentage-height child inside an aspect-ratio box collapses to
          zero height on some desktop engines (older Safari/WebKit), which
          left the board's piece images invisible on desktop. */}
      <span className="relative block w-full aspect-[4/5] overflow-hidden">
        {piece.image && isTransparentCutout(piece.image) ? (
          <img
            src={piece.image}
            alt={piece.name}
            className="absolute inset-0 w-full h-full object-contain"
            loading="eager"
          />
        ) : piece.image ? (
          <ProcessingBoardTile name={piece.name} />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center text-center px-1 text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 11px)', lineHeight: 1.4 }}
          >
            {BOARD_SLOT_LABELS[piece.slot]}
          </span>
        )}
      </span>
      <span
        className="block mt-1 text-[var(--color-text,#241a12)] leading-tight break-words"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: 'max(var(--eth-serif, 0px), 12px)', fontWeight: 500 }}
      >
        {piece.name}
      </span>
      {piece.brand && (
        <span className="block leading-tight" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-micro, 0px), 10px)', color: 'var(--color-accent,#a8712c)' }}>
          {piece.brand}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(piece.slot)}
          aria-label={`Remove ${piece.name} from the board`}
          title="Remove from the board"
          className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-600,#856c51)] hover:text-[var(--color-accent-700,#7c4a17)] rounded-full"
          style={{ fontSize: 'max(var(--eth-label, 0px), 12px)', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The board canvas — outerwear up top, tops below, bottoms middle, shoes at
// the bottom, accessories to the side.
// ---------------------------------------------------------------------------

export function FlatOutfitBoard({
  board,
  onRemove,
  minHeight = '54vh',
  layout = 'column',
}: {
  board: OutfitBoardState;
  onRemove: (slot: BoardSlot) => void;
  /** The sticky-board overhaul pins the board to the viewport — a shorter
   * canvas leaves room for the shelf to scroll beneath it. */
  minHeight?: string;
  /** 'column' is the classic wearing-order column; 'grid' is the fixed-
   * height canvas arrangement (the Fitting's top board zone) — a 2×2
   * flat-lay that shows the whole outfit without scrolling. */
  layout?: 'column' | 'grid';
}) {
  const empty = Object.keys(board).length === 0;
  const emptyState = (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
      <span className="block w-12 h-[3px] bg-[var(--color-neutral-300,#dccdb2)]" aria-hidden="true" />
      <p
        className={`${typography.color.primary} mt-4`}
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '21px', lineHeight: 1.3, maxWidth: '28ch' }}
      >
        Build the look flat — no rendering, no wait.
      </p>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-2`} style={{ fontFamily: 'var(--space-font-family)', maxWidth: '40ch' }}>
        Tap pieces on the shelf below and they appear here instantly, arranged the way you'd lay them on the
        bed. Tapping another piece in the same category swaps it in.
      </p>
    </div>
  );

  if (layout === 'grid') {
    // The fixed-canvas flat-lay: the whole outfit reads at a glance inside
    // a definite-height zone — no internal scrolling needed.
    return (
      <div className="relative w-full h-full" style={{ background: 'var(--color-bg,#efe7d9)' }}>
        {empty ? (
          emptyState
        ) : (
          <div className="h-full w-full flex items-center justify-center px-4 py-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-5 sm:gap-x-8 gap-y-3 justify-items-center">
              <BoardCard piece={board.outerwear} onRemove={onRemove} />
              <BoardCard piece={board.top} onRemove={onRemove} />
              <BoardCard piece={board.bottom} wide onRemove={onRemove} />
              <BoardCard piece={board.shoes} onRemove={onRemove} />
              {board.accessory && (
                <div className="col-span-2 flex justify-center">
                  <BoardCard piece={board.accessory} onRemove={onRemove} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ background: 'var(--color-bg,#efe7d9)', minHeight }}>
      {empty ? (
        emptyState
      ) : (
        <div className="flex items-start justify-center gap-4 sm:gap-8 px-4 py-6" style={{ minHeight }}>
          {/* The outfit column — top to bottom in wearing order. */}
          <div className="flex flex-col items-center gap-3">
            <BoardCard piece={board.outerwear} onRemove={onRemove} />
            <BoardCard piece={board.top} onRemove={onRemove} />
            <BoardCard piece={board.bottom} wide onRemove={onRemove} />
            <BoardCard piece={board.shoes} onRemove={onRemove} />
          </div>
          {/* Accessories — to the side. */}
          {board.accessory && (
            <div className="flex flex-col items-center pt-10">
              <BoardCard piece={board.accessory} onRemove={onRemove} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE FLAT-LAY BOARD (Fitting Room layout overhaul) — the multi-select
// canvas.
//
// A deterministic ZONE composition, not a stacked list: every piece is a
// background-removed cutout, absolutely positioned on a portrait 480 × 600
// canvas in its category's ONE fixed zone (head / torso / waist / legs /
// feet, accessories in a side column), with category-tied layering (z
// increases toward the camera) and ZERO rotation — clean catalog style.
// The zone is tied to the piece's category, so swapping a piece for another
// of the same category inherits the zone's exact placement, and the same
// outfit always lays out identically — by construction, no seed needed.
// ---------------------------------------------------------------------------

/** Dressing order — kept for API compatibility. */
export const DRESSING_ORDER: BoardSlot[] = ['outerwear', 'top', 'bottom', 'shoes', 'accessory'];

/* Deterministic seeded pseudo-random: FNV-1a string hash → mulberry32. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The flat-lay zones: four garment zones plus the bag/accessory zone and
 * the small-accessory zone (belt, watch, cap…). */
type FlatLaySlotId = 'outerwear' | 'top' | 'bottom' | 'shoes' | 'bag' | 'small';

interface FlatLayZone {
  top: number; // % of canvas height
  left: number; // % of canvas width
  width: number; // % of canvas width
  z: number; // layering — higher = closer to the camera
  rotMin: number; // deg
  rotMax: number; // deg
}

/** Placement by category: z increases toward the camera — outerwear sits
 * UNDER the top/knitwear, accessories over everything — and the bottoms'
 * top edge deliberately tucks under the hem of the top. */
const FLAT_LAY_ZONES: Record<FlatLaySlotId, FlatLayZone> = {
  outerwear: { top: 2, left: 18, width: 60, z: 3, rotMin: -3, rotMax: 3 },
  top: { top: 8, left: 28, width: 45, z: 4, rotMin: -2, rotMax: 2 },
  bottom: { top: 40, left: 22, width: 50, z: 2, rotMin: -2, rotMax: 2 },
  shoes: { top: 68, left: 6, width: 35, z: 1, rotMin: -6, rotMax: -3 },
  bag: { top: 45, left: 68, width: 30, z: 5, rotMin: 2, rotMax: 5 },
  small: { top: 5, left: 4, width: 15, z: 6, rotMin: -10, rotMax: 10 },
};

export interface FlatLayItem {
  piece: BoardPiece;
  top: number;
  left: number;
  width: number;
  z: number;
  rot: number;
}

/**
 * Compose the flat-lay: group pieces into their category zones (the first
 * accessory takes the bag zone, later ones the small-accessory zone), shift
 * zones inward when a neighbouring zone is empty, then apply the seeded
 * rotation and ±3% position jitter. The random stream is keyed on
 * seed × slot — NOT on the piece — so swapping a piece for another of the
 * same category inherits the slot's exact placement.
 */
export function composeFlatLay(pieces: BoardPiece[], seed: string): FlatLayItem[] {
  const groups = new Map<FlatLaySlotId, BoardPiece[]>();
  let accessories = 0;
  for (const piece of pieces) {
    let slot: FlatLaySlotId;
    if (piece.slot === 'accessory') {
      accessories += 1;
      slot = accessories === 1 ? 'bag' : 'small';
    } else {
      slot = piece.slot;
    }
    const list = groups.get(slot) || [];
    list.push(piece);
    groups.set(slot, list);
  }
  const has = (s: FlatLaySlotId) => (groups.get(s) || []).length > 0;

  // Partial outfits close ranks: when a zone is empty its neighbours shift
  // slightly inward instead of leaving a dead area on the canvas.
  const zones: Record<FlatLaySlotId, FlatLayZone> = { ...FLAT_LAY_ZONES };
  if (!has('outerwear') && has('top')) zones.top = { ...zones.top, top: 5, left: 25, width: 52 };
  if (!has('top') && has('outerwear')) zones.outerwear = { ...zones.outerwear, top: 5, left: 20 };
  if (!has('outerwear') && !has('top') && has('bottom')) zones.bottom = { ...zones.bottom, top: 22 };
  if (!has('bottom') && has('shoes')) zones.shoes = { ...zones.shoes, top: 54, left: 14 };
  if (!has('bag') && has('small')) zones.small = { ...zones.small, top: 42, left: 72, width: 18 };

  const out: FlatLayItem[] = [];
  for (const [slot, list] of groups) {
    const zone = zones[slot];
    list.forEach((piece, i) => {
      const rand = mulberry32(hashString(`${seed}::${slot}::${i}`));
      let rot = zone.rotMin + rand() * (zone.rotMax - zone.rotMin);
      // Rotation is never exactly 0° — even 1–2° breaks the grid feel.
      if (Math.abs(rot) < 0.8) rot = (rand() < 0.5 ? -1 : 1) * (1 + rand() * 1.5);
      out.push({
        piece,
        top: zone.top + (rand() * 2 - 1) * 3 + i * 7,
        left: zone.left + (rand() * 2 - 1) * 3 + i * 6,
        width: zone.width * (i === 0 ? 1 : 0.9),
        z: zone.z * 10 + i,
        rot,
      });
    });
  }
  return out;
}

/** Below ~280px the flat-lay canvas is no longer readable — degrade to a
 * simple two-column grid (acceptable degradation, not the primary view). */
function useNarrowBoard(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth > 0 && el.clientWidth < 280);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return [ref, narrow];
}

export function StyledOutfitBoard({
  pieces,
  onRemove,
  seed = 'ethaion',
  canvasMaxWidth = '420px',
  canvasMaxHeight,
  quiet = false,
}: {
  /** Every selected piece, in the order they were added. */
  pieces: BoardPiece[];
  onRemove?: (key: string) => void;
  /** Hold the empty footprint but say NOTHING in it. The Fitting sets this
   * while Beau is composing: the surrounding screen already shows the one
   * building message, and this board's own “Build the look flat” invitation
   * showing through underneath it was one of three strings stacking on the
   * canvas at once (founder's correction, August 2026). */
  quiet?: boolean;
  /** How wide the square canvas may draw. The portrait stage scales to it,
   * so this is what sizes the garments themselves — The Fitting's board is
   * the main event and asks for a large one. */
  canvasMaxWidth?: string;
  /** HARD HEIGHT CAP (founder's correction, August 2026): the canvas box may
   * never draw taller than this — The Fitting sets it so the band ends right
   * below the day rail's last day. The stage scales the whole composition
   * down to fit inside the cap. */
  canvasMaxHeight?: string;
  /** Stable per-outfit seed — the SAME outfit always lays out identically;
   * it changes only when the outfit itself changes context (a new day, a
   * different saved outfit, a fresh manual board). */
  seed?: string;
}) {
  // THE FITTING'S STAGE is the flat-lay board at full size — the same
  // component, the same fixed ZONE layout the "Beau · Today" card uses at a
  // smaller scale (head / torso / waist / legs / feet plus the side accessory
  // column, zero rotation). There is one flat-lay in this app and this is it;
  // nothing here re-implements the layout.
  if (pieces.length === 0) {
    return (
      <div className="relative w-full" style={{ background: 'transparent' }}>
        {/* The empty state holds a SHORT wide footprint (3/1 — founder's
            height fix, August 2026): with no clothes on it there is nothing
            to hold room for, so the invitation strip stays shallow even
            though the populated canvas may draw much taller (its own
            canvasMaxHeight cap). No field, no frame — the Fitting board is
            transparent space (founder's correction). */}
        <div className="relative w-full mx-auto" style={{ maxWidth: canvasMaxWidth, aspectRatio: '3 / 1', maxHeight: canvasMaxHeight }}>
          {!quiet && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 sm:px-8">
              <span className="block w-12 h-[3px] bg-[var(--color-neutral-300,#dccdb2)]" aria-hidden="true" />
              <p
                className={`${typography.color.primary} mt-4`}
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', lineHeight: 1.3, maxWidth: '28ch' }}
              >
                Build the look flat — no rendering, no wait.
              </p>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-2`} style={{ fontFamily: 'var(--space-font-family)', maxWidth: '40ch' }}>
                Tap pieces on the shelf below and they land here instantly — each in its own place, head to
                toe, clean catalog style. Tap a piece again to take it off the board.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // THE ZONE SYSTEM'S CANVAS — one fixed portrait board, whatever the piece
  // count. Every category has exactly one defined position on it (the
  // vertical zone structure in flat-lay-board.tsx), so the board never grows
  // or reflows as pieces are added.
  // NO BACKGROUND BOX (founder's correction): the Fitting's outfit board has
  // no field, no fill and no frame behind the composition — the clothes
  // float on transparent empty space (`ground="transparent"`). The framed
  // #EDE8DF square survives ONLY on the "Beau · Today" card on The Ledger,
  // where it sits on the dark walnut slab and needs the visual frame.
  // Held-out pieces are still named beneath the board (`showHeldOut`).
  // THE COLUMN STAGE (founder's correction, August 2026 — replacing the
  // short-lived wide stage): the outfit reads top-to-bottom exactly as worn
  // — headwear right under the top edge, clear air for the invisible head,
  // then the tops, the bottoms tucked under their hem, and the shoes at the
  // foot (the classic portrait zone composition, composeFlatLayBoard). The
  // Fitting caps the canvas height so the whole column fits the band, and
  // the pieces keep their TRUE category proportions on it (the
  // garment-proportions.ts shares: tops 0.30, trousers 0.42, shoes 0.10
  // of the column) — NO fit-to-content inflation: with the height cap in
  // charge, the old rebase blew a sparse board's pieces up past their
  // real-world proportions (founder's correction: “too big on the canvas”).
  const aspect = 480 / 600;
  // FULL FIGURE SCALE (founder's correction, August 2026): the earlier 70%
  // and 49% shrinks were judged against a broken Safari layout that spilled
  // pieces out of the canvas; once the geometry was fixed, 49% read tiny —
  // a thumbnail outfit lost in the field. At 1 the column uses its designed
  // category proportions in full: the figure fills the capped canvas top to
  // bottom — reserved head air, tops, the trousers' reserved band, shoes at
  // the foot. This constant remains the ONE dial for piece size on this
  // canvas alone.
  const FITTING_PIECE_SCALE = 1.155; // +10% on the 1.05 pass (founder, August 2026)
  // PER-ZONE SHIFTS (founder's corrections, August 2026): everything but
  // the shoes came back UP half a centimetre (14% → 7% of the 260px cap),
  // while the shoes' designated area went DOWN a further centimetre
  // (14% → 28%) — the shoes may settle into the slack band just below the
  // stage floor, which the frameless canvas no longer clips.
  const FITTING_PIECE_OFFSET_Y = 7;
  const FITTING_FEET_OFFSET_Y = 28;

  return (
    <div className="relative w-full" style={{ background: 'transparent' }}>
      {/* No padding of its own: the canvas carries its own 16px margin, and
          every pixel spared here is a pixel the board itself can use. */}
      <div>
        <FlatLayBoard
          pieces={pieces}
          seed={seed}
          // DRAGGABLE PIECES: on the Fitting's stage every composed piece can
          // be repositioned by hand; the delta persists per outfit (the same
          // stable seed that keys the layout) and the zone system remains the
          // default starting state.
          dragKey={seed}
          aspect={aspect}
          maxWidth={canvasMaxWidth}
          trayMaxWidth={canvasMaxWidth}
          trayMaxHeight={canvasMaxHeight}
          panel="paper"
          variant="tray"
          ground="transparent"
          canvasAspect="480 / 600"
          pieceScale={FITTING_PIECE_SCALE}
          pieceOffsetY={FITTING_PIECE_OFFSET_Y}
          feetOffsetY={FITTING_FEET_OFFSET_Y}
          showHeldOut
          onRemove={onRemove}
          className={`today-canvas--center${canvasMaxWidth === '420px' ? '' : ' today-canvas--flush'}`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saving + the saved outfits shelf (saved_outfits WorkspaceDB table)
// ---------------------------------------------------------------------------

interface SavedOutfitRow {
  id: number;
  name: string;
  pieces: unknown;
  created_at?: string;
}

export function parsePieces(raw: unknown): BoardPiece[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return [];
    return value.filter((p) => p && typeof p.name === 'string' && typeof p.slot === 'string') as BoardPiece[];
  } catch {
    return [];
  }
}

export function SavedOutfitsSection({
  board,
  onLoad,
}: {
  board: OutfitBoardState;
  onLoad: (state: OutfitBoardState) => void;
}) {
  const { data: rows, refresh } = window.useWorkspaceDB<SavedOutfitRow>('saved_outfits', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 30,
  });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const boardPieces = Object.values(board) as BoardPiece[];

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(false), 2200);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  const save = async () => {
    if (saving || boardPieces.length === 0) return;
    setSaving(true);
    try {
      await db()
        .from('saved_outfits')
        .insert({ name: name.trim() || 'Beau\u2019s suggestion', pieces: JSON.stringify(boardPieces), mode: 'flat' });
      setName('');
      setSavedFlash(true);
      refresh();
    } catch (e) {
      console.warn('[Ethaion] saving the outfit failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (deletingId != null) return;
    setDeletingId(id);
    try {
      await db().from('saved_outfits').delete(id);
      refresh();
    } catch (e) {
      console.warn('[Ethaion] removing the saved outfit failed:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const load = (row: SavedOutfitRow) => {
    const state: OutfitBoardState = {};
    for (const piece of parsePieces(row.pieces)) state[piece.slot] = piece;
    onLoad(state);
  };

  return (
    <div>
      {/* Save the board — name input + save, inline and quiet. */}
      <div className="flex items-center gap-2 flex-wrap pt-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this outfit — e.g. Beau’s suggestion"
          aria-label="Outfit name"
          disabled={boardPieces.length === 0}
          className="flex-1 min-w-[180px] px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] text-[var(--color-text,#241a12)] focus:outline-none focus:border-[var(--color-accent,#a8712c)] disabled:opacity-50"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', borderRadius: 0 }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || boardPieces.length === 0}
          className="px-4 min-h-[44px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', borderRadius: 0 }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save this outfit
        </button>
        {savedFlash && (
          <span style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', color: 'var(--color-accent-700,#7c4a17)' }}>
            Saved — it’s on the shelf below.
          </span>
        )}
      </div>

      {/* Saved outfits — tap to load back onto the board. */}
      <section aria-label="Saved outfits" className="pt-6">
        <p
          className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: 'max(var(--eth-serif, 0px), 13px)', letterSpacing: '0.16em' }}
        >
          Saved outfits
        </p>
        {(rows || []).length > 0 ? (
          <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
            {(rows || []).map((row) => {
              const pieces = parsePieces(row.pieces);
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => load(row)}
                    className="flex-1 min-w-0 min-h-[44px] py-2.5 text-left group"
                    title={`Load “${row.name}” onto the board`}
                  >
                    <span className="block truncate" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', fontWeight: 500, color: 'var(--color-text,#241a12)' }}>
                      {row.name}
                    </span>
                    <span className="block truncate group-hover:underline" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)', color: 'var(--color-neutral-600,#856c51)' }}>
                      {pieces.length > 0 ? pieces.map((p) => p.name).join(' · ') : 'Empty board'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    disabled={deletingId === row.id}
                    aria-label={`Delete the saved outfit ${row.name}`}
                    title="Delete this saved outfit"
                    className="flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] disabled:opacity-40"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)' }}
                  >
                    {deletingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '×'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-3 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)' }}>
            Nothing saved yet — build a board above and give it a name.
          </p>
        )}
      </section>
    </div>
  );
}
