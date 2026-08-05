/**
 * THE FLAT-LAY BOARD — ONE component, every surface that shows an outfit as
 * a composition: the Fitting's stage (flat-view StyledOutfitBoard) and the
 * "Beau · Today" card on The Ledger, the second at a smaller scale on the
 * walnut panel. Nothing re-implements this layout; there is one flat-lay in
 * this app and it lives here.
 *
 * THE ZONE SYSTEM (Fitting Room layout overhaul). This SUPERSEDES every
 * earlier positioning spec — the seeded scatter, the per-item rotation, the
 * "looks hand-arranged" drift are all retired. Every category has exactly ONE
 * fixed position and items render UPRIGHT, WITH ZERO ROTATION — clean catalog
 * style. An item either renders in its zone correctly or it doesn't; no
 * subjective judgement, no interpretation required.
 *
 * The zones, top to bottom on a portrait 480 × 600 board:
 *   · HEAD — hats and eyewear. Small, centred, at the very top, floating
 *     with a small clear gap above the torso stack (the invisible head) —
 *     never overlapping the torso zone.
 *   · TORSO — outerwear + tops, LAYERED the way they are WORN: the base top
 *     sits rightmost at the BACK, and each layer worn over it shifts LEFT
 *     and renders IN FRONT (base top → knitwear → jacket → outerwear), so
 *     the outerwear — physically on top when worn — is the leftmost,
 *     FRONTMOST layer (highest z), overlapping the base top behind it.
 *   · WAIST — the belt, if present: a thin horizontal strip between torso
 *     and legs.
 *   · LEGS — trousers/shorts, centred, below the waist strip.
 *   · FEET — shoes at the very bottom, IN FRONT of the trouser hem. Socks,
 *     if shown, sit just above the shoes and slightly overlap them.
 *   · SIDE ACCESSORY COLUMN — bag, watch, fragrance, anything not worn on
 *     the body — a column down the right edge, each item vertically anchored
 *     near the body zone it corresponds to (watch at torso height, bag at
 *     waist/hip height).
 *
 * Each item is a BARE cutout: no card, no plate, no border, no shadow and no
 * ground of its own — it sits directly on the board's panel, CONTAINED in
 * its zone box (object-fit: contain — never cropped, never stretched).
 *
 * AND ONLY A CUTOUT MAY LIE HERE. A piece whose ingestion could find nothing
 * but ON-BODY photography, or whose cut was flagged by the verification step
 * (photo-enhance `flatLayReady: false`), is held OUT of the composition and
 * named beneath the board instead. That is a sourcing fact, not a styling
 * one: no CSS turns a photograph of a foot in a loafer into a photograph of a
 * loafer, and laying one among cutouts is the single thing that stops a
 * flat-lay reading as a flat-lay.
 *
 * NO BLEND TRICKS AND NO PLATES IN THE COMPOSITION. A piece whose
 * transparent PNG has not landed yet is held out with the flagged ones —
 * named beneath the stage, excluded from the tray — and joins the board the
 * moment its cutout lands. Nothing inside the composition ever carries a
 * solid ground, a border or a blend mode of its own.
 *
 * TWO THINGS THE DARK PANEL NEEDS, and only it (`panel: 'walnut'`, the Today
 * card):
 *   · ONE LIGHT CANVAS under the WHOLE outfit — a single field in the card
 *     tone #FBF8F1, inset from the slab's edge, sharp-cornered, carrying one
 *     inset frame 10px inside its own edge — 2px in the house hairline tone
 *     #D9CFBE (2px, not 1px: the thinner line failed to read; the founder's
 *     spec allows a 1.5px fallback if 2px proves too heavy). On walnut a
 *     navy jacket or a
 *     black shoe washes out to nothing; the canvas is what keeps a dark
 *     piece visible. It is the ONLY background surface in the card: a light
 *     square behind each individual piece is exactly what turns one composed
 *     outfit back into a row of little cards.
 *
 * The geometry is closed-form: every zone box is a fixed percentage of the
 * board, so no piece can overflow the board and nothing reflows when an
 * image lands.
 *
 * This module deliberately depends on nothing but body-order and the
 * cutout-recognition helper, so The Ledger can show a flat-lay without
 * pulling the Fitting Room's engine into the initial payload.
 */
import { isTransparentCutout } from './photo-enhance';
import { bodyOrderRank, sortByBodyOrder } from './body-order';

/** The shape the board needs from a piece — structurally satisfied by
 * flat-view's BoardPiece, and cheap for any other surface to build. */
export interface FlatLayPiece {
  key: string;
  name: string;
  category?: string | null;
  slot?: string | null;
  /** The flat-lay-ready cutout. '' while one is still being resolved. */
  image: string;
  /** false when the ingestion pipeline could only get an ON-BODY photograph
   * for this piece (photo-enhance tier 2), or when the verification step
   * flagged the cut as imperfect. Such a piece is held OUT of the composition
   * and named beneath it instead — a photograph of a foot in a loafer cannot
   * be laid among cutouts, and no amount of CSS makes it one.
   * Undefined means "nothing known against it", which composes as usual. */
  flatLayReady?: boolean;
  /** Pixel dimensions of the stored TIGHT-CROPPED cutout (pipeline v3+) —
   * the item's true silhouette plus a fixed 4px margin. When present, the
   * composer derives the item's render WIDTH from its category height and
   * this true aspect ratio, so the box hugs the item exactly and the
   * `object-fit: contain` image genuinely fills its category height instead
   * of shrinking inside an oversized zone box. Absent on older cuts and
   * uncut photographs — those keep the zone's full width. */
  croppedWidth?: number | null;
  croppedHeight?: number | null;
}

export interface FlatLayPlacedItem<T extends FlatLayPiece = FlatLayPiece> {
  piece: T;
  /** All four in % of the board — left/width of its width, top/height of
   * its height — so the board scales purely by changing its own size. */
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
  /** Always 0 — items render upright, catalog style. Kept on the shape so
   * existing consumers of the composer keep compiling. */
  rot: number;
}

// ---------------------------------------------------------------------------
// THE ZONES — fixed boxes in % of the board. The design canvas is portrait
// 480 × 600 (aspect 0.8); the percentages scale with the board.
// ---------------------------------------------------------------------------

interface ZoneBox {
  top: number;
  left: number;
  width: number;
  z: number;
}

/** REAL-WORLD PROPORTIONAL SIZING (founder's spec). Every category carries a
 * fixed real-world reference height in CENTIMETRES, and every item's box is
 * scaled from THAT — independent of how its source photograph happened to be
 * framed. The board's full height stands for a ~180cm reference figure, so
 * pixels-per-cm falls out of the tray's own height and a 104cm pair of
 * trousers always draws taller than a 28cm shoe, whatever the photos did. */
export const CATEGORY_REFERENCE_HEIGHT_CM: Record<string, number> = {
  hat: 22,
  outerwear: 72,
  knitwear: 66,
  top: 70,
  belt: 4,
  trousers: 104,
  shorts: 52,
  shoes: 28,
  socks: 20,
  accessory: 22,
};

/** The reference figure the board's full height stands for, in cm. */
const REFERENCE_FIGURE_CM = 180;

/** A real-world height in cm → % of the board's height. */
function cmToBoardPct(cm: number): number {
  return (cm / REFERENCE_FIGURE_CM) * 100;
}

/** The design canvas's own proportion (portrait 480 × 600). Needed to convert
 * between %-of-height and %-of-width when deriving an item's render width
 * from its height and true aspect ratio: widthPct = heightPct × (imageW/imageH)
 * ÷ boardAspect. The tray's dynamic renormalization multiplies item heights
 * and the stage aspect by the same factor, so this relation survives it. */
const DESIGN_BOARD_ASPECT = 480 / 600;

/** The item's render width in board-% for a given render height — from the
 * tight-cropped PNG's true aspect ratio when the piece carries one (pipeline
 * v3 stores it), null when it doesn't. Null means "use the zone's width":
 * the pre-v3 canvases and uncut photographs keep the old contain behaviour. */
function aspectWidthPct(piece: FlatLayPiece, heightPct: number): number | null {
  const cw = Number(piece.croppedWidth) || 0;
  const ch = Number(piece.croppedHeight) || 0;
  if (cw <= 0 || ch <= 0) return null;
  return (heightPct * (cw / ch)) / DESIGN_BOARD_ASPECT;
}

/** Single-position zones — top/left/width in board %, z toward the camera.
 * Heights are deliberately NOT fixed here: each item's height comes from its
 * category's real-world reference height (the table above). Multiple items
 * in one zone split the zone's width evenly, side by side — still
 * deterministic, still zero rotation. */
const ZONE_HEAD: ZoneBox = { top: 0, left: 32, width: 36, z: 7 };
/** The belt — the FRONTMOST layer at the waist, over every torso layer. */
const ZONE_WAIST: ZoneBox = { top: 38, left: 38, width: 24, z: 7 };
/** Trousers render BEHIND the torso stack at the overlap and BEHIND the
 * shoes at the hem — real-world draping order. */
const ZONE_LEGS: ZoneBox = { top: 40, left: 28, width: 44, z: 1 };
/** Shoes — at the very bottom, IN FRONT of the trouser hem (z above legs).
 * With trousers present the feet anchor to their hem; without them the zone
 * falls back to this fixed position. */
const ZONE_FEET = { fallbackTop: 68, left: 34, width: 32, z: 2 };
/** Socks sit just above the shoes and slightly overlap them, in front. */
const ZONE_SOCKS = { left: 40, width: 20, z: 3 };

/** The torso zone. Layers are stacked the way they are WORN: back-to-front
 * is base top → knitwear → jacket → outerwear, each layer worn over the one
 * behind shifting LEFT by TORSO_LAYER_SHIFT and rendering IN FRONT of it —
 * the outerwear ends up leftmost and FRONTMOST (highest z), physically on
 * top, overlapping the base top behind it. z rises toward the camera. */
const ZONE_TORSO = { top: 6, left: 18, width: 60, zBase: 3 };
/** The clear air between the hat and the torso stack — the invisible head.
 * The hat never overlaps the torso zone. */
const HEAD_TORSO_GAP = 2;
/** -12% of the torso zone's 60% width, in board % per front layer. */
const TORSO_LAYER_SHIFT = 7.2;

/** The side accessory column, down the right edge (right: 2%, width 18%).
 * Each item is anchored near the body zone it corresponds to (see
 * accessoryAnchorTop). */
const ACCESSORY_COLUMN = { left: 80, width: 18, itemHeight: 12, gap: 3, z: 8 };

const EYEWEAR_WORDS = /\b(sunglasses|glasses|eyewear|spectacles)\b/i;
const SHORTS_WORDS = /\bshorts\b/i;
const BELT_WORDS = /\bbelts?\b/i;
const SOCK_WORDS = /\bsocks?\b/i;
const WATCH_WORDS = /\b(watch|watches|bracelet|cufflinks?)\b/i;
const BAG_ZONE_WORDS = /\b(bag|briefcase|backpack|tote|holdall|satchel|weekender|rucksack)\b/i;

type ZoneId = 'head' | 'torso' | 'waist' | 'legs' | 'feet' | 'socks' | 'accessories';

function pieceText(piece: FlatLayPiece): string {
  return `${piece.slot || ''} ${piece.name || ''}`.toLowerCase();
}

/** Which zone a piece renders in — category first, name for the pieces that
 * live outside their zone's category (a belt is an accessory by category but
 * a waist item by position; socks are base-layers but sit above the shoes). */
function zoneFor(piece: FlatLayPiece): ZoneId {
  const text = pieceText(piece);
  if (SOCK_WORDS.test(text)) return 'socks';
  const rank = bodyOrderRank({ category: piece.category, slot: piece.slot, name: piece.name });
  if (rank === 0 || EYEWEAR_WORDS.test(text)) return 'head';
  if (BELT_WORDS.test(text)) return 'waist';
  if (rank >= 1 && rank <= 4) return 'torso';
  if (rank === 5) return 'legs';
  if (rank === 6) return 'feet';
  return 'accessories';
}

/** An item's render height in % of the board: its category's real-world
 * reference height against the ~180cm figure — never derived from the source
 * photo's framing, so a shoe can never draw coat-sized. */
function referenceHeightPct(piece: FlatLayPiece): number {
  const cm = CATEGORY_REFERENCE_HEIGHT_CM;
  const text = pieceText(piece);
  if (SOCK_WORDS.test(text)) return cmToBoardPct(cm.socks);
  if (BELT_WORDS.test(text)) return cmToBoardPct(cm.belt);
  const rank = bodyOrderRank({ category: piece.category, slot: piece.slot, name: piece.name });
  if (rank === 0 || EYEWEAR_WORDS.test(text)) return cmToBoardPct(cm.hat);
  if (rank === 1 || rank === 2) return cmToBoardPct(cm.outerwear);
  if (rank === 3) return cmToBoardPct(cm.knitwear);
  if (rank === 4) return cmToBoardPct(cm.top);
  if (rank === 5) return cmToBoardPct(SHORTS_WORDS.test(text) ? cm.shorts : cm.trousers);
  if (rank === 6) return cmToBoardPct(cm.shoes);
  return cmToBoardPct(cm.accessory);
}

/** The column anchor for a side accessory — near the body zone it belongs
 * to: watch at torso height, bag at waist/hip height, the rest between. */
function accessoryAnchorTop(piece: FlatLayPiece): number {
  const text = pieceText(piece);
  if (WATCH_WORDS.test(text)) return 8; // torso height (the torso zone starts at 6%)
  if (BAG_ZONE_WORDS.test(text) || bodyOrderRank({ category: piece.category, slot: piece.slot, name: piece.name }) === 7) {
    return 40; // waist / hip height
  }
  return 24; // fragrance, scarf-in-hand, everything else — mid column
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Compose the flat-lay — DETERMINISTIC BY CONSTRUCTION. Every category has
 * one fixed zone, every item renders upright at rotation 0, and the same
 * pieces always produce the same layout. The `seed` and `boardAspect`
 * parameters are kept for API compatibility (earlier passes seeded a scatter
 * and derived heights from the board's proportion); neither influences the
 * zone layout.
 */
export function composeFlatLayBoard<T extends FlatLayPiece>(
  pieces: T[],
  _seed?: string,
  _boardAspect?: number,
  _options?: {
    /** Retired — the zone boxes size every piece now. Accepted so existing
     * callers keep compiling. */
    uniform?: boolean;
  },
): Array<FlatLayPlacedItem<T>> {
  const ordered = sortByBodyOrder(pieces, (p) => ({ category: p.category, slot: p.slot, name: p.name }));
  if (ordered.length === 0) return [];

  const groups: Record<ZoneId, T[]> = {
    head: [],
    torso: [],
    waist: [],
    legs: [],
    feet: [],
    socks: [],
    accessories: [],
  };
  for (const piece of ordered) groups[zoneFor(piece)].push(piece);

  const placed: Array<FlatLayPlacedItem<T>> = [];

  /** Place a single-position zone's items — one item fills the box; several
   * split its width evenly, side by side. Each item's HEIGHT is its
   * category's real-world reference height, never a zone constant — and its
   * WIDTH is derived from that height and the cutout's true aspect ratio
   * when the piece carries one (tight-cropped pipeline v3), centred in its
   * slot, so the box hugs the item exactly. */
  const placeRow = (items: T[], box: ZoneBox) => {
    if (items.length === 0) return;
    const slotWidth = box.width / items.length;
    items.forEach((piece, i) => {
      const height = referenceHeightPct(piece);
      const width = Math.min(slotWidth, aspectWidthPct(piece, height) ?? slotWidth);
      placed.push({
        piece,
        left: box.left + i * slotWidth + (slotWidth - width) / 2,
        top: box.top,
        width,
        height,
        z: box.z,
        rot: 0,
      });
    });
  };

  placeRow(groups.head, ZONE_HEAD);

  // The hat floats with a small clear gap above the torso stack — the
  // invisible head — never overlapping the torso zone.
  const headBottom =
    groups.head.length > 0 ? ZONE_HEAD.top + Math.max(...groups.head.map((p) => referenceHeightPct(p))) : null;
  const torsoTop = headBottom != null ? Math.max(ZONE_TORSO.top, headBottom + HEAD_TORSO_GAP) : ZONE_TORSO.top;

  // TORSO — layered as WORN. Back-to-front is REVERSED body order (base top
  // first): the base top sits rightmost at the back, and each layer worn
  // over it shifts LEFT and renders IN FRONT — the outerwear ends up
  // leftmost, FRONTMOST (highest z), physically on top, overlapping the base
  // top behind it.
  const torsoLayers = [...groups.torso].reverse();
  torsoLayers.forEach((piece, i) => {
    const height = referenceHeightPct(piece);
    const width = Math.min(ZONE_TORSO.width, aspectWidthPct(piece, height) ?? ZONE_TORSO.width);
    placed.push({
      piece,
      left: clamp(ZONE_TORSO.left + (ZONE_TORSO.width - width) / 2 - TORSO_LAYER_SHIFT * i, 0, 100 - width),
      top: torsoTop,
      width,
      height,
      z: ZONE_TORSO.zBase + i,
      rot: 0,
    });
  });

  placeRow(groups.waist, ZONE_WAIST);
  placeRow(groups.legs, ZONE_LEGS);

  // FEET — at the very bottom, IN FRONT of the trouser hem (z above legs).
  // With trousers present the shoes anchor to the hem and overlap it. WITHOUT
  // trousers they tuck up under the torso stack instead of dropping to the
  // fixed fallback position — which is what lets a shirt-and-shoes outfit
  // produce a visibly SHORTER tray than one with trousers in it, rather than
  // leaving a dead band of canvas where the trousers would have been.
  const shoeHeight =
    groups.feet.length > 0
      ? Math.max(...groups.feet.map((p) => referenceHeightPct(p)))
      : cmToBoardPct(CATEGORY_REFERENCE_HEIGHT_CM.shoes);
  const legsBottom =
    groups.legs.length > 0 ? ZONE_LEGS.top + Math.max(...groups.legs.map((p) => referenceHeightPct(p))) : null;
  const torsoBottom =
    torsoLayers.length > 0 ? torsoTop + Math.max(...torsoLayers.map((p) => referenceHeightPct(p))) : null;
  const feetTop = clamp(
    legsBottom != null
      ? legsBottom - shoeHeight * 0.35
      : torsoBottom != null
        ? torsoBottom + 3
        : ZONE_FEET.fallbackTop,
    0,
    100 - shoeHeight,
  );
  // SOCKS — just above the shoes, slightly overlapping them, in front.
  const sockHeight = cmToBoardPct(CATEGORY_REFERENCE_HEIGHT_CM.socks);
  const sockTop = clamp(feetTop - sockHeight * 0.8, 0, 100 - sockHeight);
  placeRow(groups.socks, { top: sockTop, left: ZONE_SOCKS.left, width: ZONE_SOCKS.width, z: ZONE_SOCKS.z });
  placeRow(groups.feet, { top: feetTop, left: ZONE_FEET.left, width: ZONE_FEET.width, z: ZONE_FEET.z });

  // SIDE ACCESSORY COLUMN — each item anchored near its body zone, walked
  // top to bottom with collisions resolved downward so items never overlap.
  const column = groups.accessories
    .map((piece) => ({ piece, anchor: accessoryAnchorTop(piece) }))
    .sort((a, b) => a.anchor - b.anchor);
  let cursor = 0;
  column.forEach(({ piece, anchor }) => {
    const top = clamp(Math.max(anchor, cursor), 0, 100 - ACCESSORY_COLUMN.itemHeight);
    cursor = top + ACCESSORY_COLUMN.itemHeight + ACCESSORY_COLUMN.gap;
    placed.push({
      piece,
      left: ACCESSORY_COLUMN.left,
      top,
      width: ACCESSORY_COLUMN.width,
      height: ACCESSORY_COLUMN.itemHeight,
      z: ACCESSORY_COLUMN.z,
      rot: 0,
    });
  });

  return placed;
}

/**
 * THE TRAY — the Today card's literal structure, and it is ONE surface with
 * bare cutouts lying on it:
 *
 *   .today-canvas   ONE light field, the only background in the card. Inset
 *                   16px from the walnut slab, sharp-cornered, with a single
 *                   2px #D9CFBE frame 10px inside its own edge (the ::before)
 *                   — a picture frame sitting inside the canvas boundary,
 *                   never a stroke on the boundary itself. (2px, not 1px, per
 *                   the founder's spec — fall back to 1.5px only if 2px reads
 *                   too heavy.)
 *   .today-stage    the transparent positioning box inside the canvas. The
 *                   composer's percentages are relative to it, so the
 *                   composition keeps the 480 × 600 portrait proportion the
 *                   zone system is designed on.
 *   .today-piece    one per garment, absolutely positioned, and TRANSPARENT:
 *                   no background, no border, no shadow, no radius, no
 *                   padding and NO ROTATION. The cutout lies straight on the
 *                   canvas, contained inside its zone box.
 *
 * 480 × 600 is the DESIGN canvas; the tray's real height is DYNAMIC — the
 * board measures the vertical band its items actually occupy and derives the
 * stage's `aspect-ratio` from it, so a three-piece outfit produces a visibly
 * shorter tray than a seven-piece one (tightly stacked, no dead space), and
 * the whole composition scales down in proportion on a narrow phone rather
 * than overflowing. The canvas's own floor is deliberately LOW (160px — just
 * enough for the inset frame to read): the height should come from the
 * outfit's content, never from the container.
 */
const TRAY_CSS =
  '.today-canvas{position:relative;box-sizing:border-box;width:calc(100% - 32px);max-width:480px;' +
  'margin:16px 16px 16px auto;background:var(--today-canvas-ground,#FBF8F1);border-radius:0;min-height:160px;height:auto;' +
  'transition:min-height 0.2s ease;display:flex;align-items:center}' +
  '.today-canvas::before{content:"";position:absolute;inset:10px;border:2px solid #D9CFBE;pointer-events:none;z-index:0}' +
  '.today-stage{position:relative;width:100%;aspect-ratio:var(--aspect,480/600);background:transparent;border:none;box-shadow:none}' +
  '.today-piece{position:absolute;left:var(--x);top:var(--y);width:var(--w);height:var(--h);' +
  'z-index:var(--z);box-sizing:border-box;display:flex;align-items:center;' +
  'justify-content:center;padding:0;background:transparent!important;background-color:transparent!important;' +
  'border:none!important;box-shadow:none!important;border-radius:0}' +
  '.today-piece img{max-width:100%;max-height:100%;object-fit:contain;background:transparent;border:none;border-radius:0;box-shadow:none}';

export function FlatLayBoard<T extends FlatLayPiece>({
  pieces,
  seed = 'ethaion',
  aspect = 480 / 600,
  maxWidth = '480px',
  panel = 'paper',
  uniformItems = false,
  variant = 'stage',
  onRemove,
  className = '',
  ariaLabel,
}: {
  pieces: T[];
  /** Kept for API compatibility — the zone layout is deterministic and no
   * longer seeded. */
  seed?: string;
  /** The board's own width ÷ height. The zone system is designed portrait
   * (480 × 600) and both the stage and the tray use that proportion. */
  aspect?: number;
  maxWidth?: string;
  /** Which light ground the pieces lie on. 'paper' is the light stage itself.
   * 'walnut' is the dark panel: there the light ground is the tray's ONE
   * canvas under the whole outfit — never a square per piece — which is what
   * keeps a dark garment visible on it. */
  panel?: 'paper' | 'walnut';
  /** Retired — the zone boxes size every piece now. Accepted so existing
   * callers keep compiling. */
  uniformItems?: boolean;
  /** 'stage' is the Fitting's full-size board. 'tray' is the Today card's
   * ONE `.today-canvas` — the single light field the whole outfit lies on,
   * with a transparent `.today-stage` inside it and a transparent
   * `.today-piece` per garment — the same zone composition, expressed through
   * the tray's own CSS. */
  variant?: 'stage' | 'tray';
  onRemove?: (key: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  // THE SOURCING RULE, ENFORCED AT THE BOARD — and with it the founder's
  // TRANSPARENCY RULE: only GENUINE alpha-channel cutouts may lie in the
  // composition. A piece is composed when nothing is known against it AND its
  // image — if it already has one — is a real stored cutout; a photograph the
  // pipeline has not cut yet (or could not cut cleanly, or could only source
  // ON-BODY) is held out and named beneath the stage instead of being plated
  // on a solid ground INSIDE the composition — a white/solid box behind an
  // item image is exactly what a flat-lay must never show. An imageless piece
  // composes as its quiet transparent name placeholder.
  const composes = (piece: T) => piece.flatLayReady !== false && (!piece.image || isTransparentCutout(piece.image));
  const composable = pieces.filter(composes);
  const heldOut = pieces.filter((piece) => !composes(piece));
  const placed = composeFlatLayBoard(composable, seed, aspect, { uniform: uniformItems });
  const tray = variant === 'tray';
  // THE TRAY'S DYNAMIC HEIGHT (founder's spec): the tray is as tall as the
  // OUTFIT, never a fixed slab. The vertical band the placed items actually
  // occupy (min top → max bottom, in design %) is measured, the placements
  // are renormalized to fill it, and the stage's aspect ratio is derived
  // from that band — so a three-piece outfit produces a visibly shorter tray
  // than a seven-piece one, tightly stacked, with no dead space above or
  // below the composition.
  let trayItems = placed;
  let trayAspect = aspect;
  if (tray && placed.length > 0) {
    const minTop = Math.max(0, Math.min(...placed.map((item) => item.top)));
    const maxBottom = Math.min(100, Math.max(...placed.map((item) => item.top + item.height)));
    // Never tighter than a third of the design canvas — a lone accessory
    // still gets a readable tray rather than a hairline strip.
    const usedBand = Math.max(33, maxBottom - minTop);
    const scale = 100 / usedBand;
    trayItems = placed.map((item) => ({ ...item, top: (item.top - minTop) * scale, height: item.height * scale }));
    trayAspect = aspect * scale;
  }
  // THE LIGHT GROUND, and there is only ever ONE of it. On the walnut panel it
  // is the tray's single canvas under the whole outfit (below); on paper the
  // stage already is one, so nothing is added there — and nowhere does a piece
  // get a ground of its own.
  const canvasGround = panel === 'walnut' ? '#FBF8F1' : 'transparent';
  // The board itself is transparent. On the tray it is the positioning box
  // INSIDE the canvas; every piece is an absolutely-positioned child of it.
  const board = (
    <div
      className={tray ? 'today-stage' : `flat-lay-board relative w-full mx-auto ${className}`}
      style={tray ? undefined : { maxWidth, aspectRatio: `${aspect}`, position: 'relative' }}
      aria-label={tray ? undefined : ariaLabel}
    >
      {(tray ? trayItems : placed).map((item) => (
        <div
          key={item.piece.key}
          className={tray ? 'today-piece' : 'flat-lay-item absolute'}
          style={tray ? ({
            // The placement facts, handed to the tray's CSS as custom
            // properties — the zone box, verbatim. No rotation.
            ['--x' as string]: `${item.left.toFixed(2)}%`,
            ['--y' as string]: `${item.top.toFixed(2)}%`,
            ['--w' as string]: `${item.width.toFixed(2)}%`,
            ['--h' as string]: `${item.height.toFixed(2)}%`,
            ['--z' as string]: String(item.z),
          } as React.CSSProperties) : {
            left: `${item.left}%`,
            top: `${item.top}%`,
            width: `${item.width}%`,
            height: `${item.height}%`,
            zIndex: item.z,
            // No rotation — items render upright, catalog style. No border,
            // no frame, no shadow and no background: a CUTOUT is never a card
            // and never carries a ground — the board beneath it is the only
            // surface there is.
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={item.piece.name}
        >
          {item.piece.image && isTransparentCutout(item.piece.image) ? (
            /* The stored transparent PNG: it lies straight on the board with
               nothing behind it and nothing done to it. */
            <img
              src={item.piece.image}
              alt={item.piece.name}
              className={tray ? 'select-none' : 'block w-full h-full object-contain select-none'}
              loading="eager"
              decoding="async"
              draggable={false}
              style={tray ? {
                // `.today-piece img` governs the size — nothing is decided per
                // piece here.
                background: 'transparent',
              } : {
                border: 'none',
                background: 'transparent',
                boxShadow: 'none',
                borderRadius: 0,
                position: 'relative',
                zIndex: 1,
                boxSizing: 'border-box',
              }}
            />
          ) : (
            /* The cutout has not landed yet — a quiet named placeholder that
               disappears the moment it does. */
            <span
              className="relative flex w-full h-full items-center justify-center text-center px-1"
              style={{
                zIndex: 1,
                fontFamily: 'var(--space-font-family)',
                fontSize: '10px',
                lineHeight: 1.4,
                // Every ground a placeholder can sit on is light — the paper
                // stage, or the tray's canvas on the walnut panel.
                color: 'var(--color-neutral-600,#856c51)',
              }}
            >
              {item.piece.name}
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item.piece.key)}
              aria-label={`Remove ${item.piece.name} from the outfit`}
              title={`Remove ${item.piece.name} from the outfit`}
              className="absolute -top-2 -right-2 z-10 w-6 h-6 flex items-center justify-center bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-600,#856c51)] hover:text-[var(--color-accent-700,#7c4a17)] rounded-full"
              style={{ fontSize: '12px', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );

  // THE CANVAS — the tray's one light field, and the ONLY background surface
  // in the Today card. The pieces lie directly on it with nothing of their own
  // behind them, and a single 2px frame sits 10px inside its edge like a
  // picture frame within the canvas boundary. Nothing is appended below it: the
  // card has no room to name what it left out, so a held-out piece is simply
  // EXCLUDED from the preview — the honest option of the two the verification
  // step allows, and the tap-through to The Fitting names it in full.
  if (tray) {
    return (
      <div
        className={`today-canvas ${className}`.replace(/\s+/g, ' ').trim()}
        style={{
          ['--aspect' as string]: String(trayAspect),
          ['--today-canvas-ground' as string]: canvasGround,
        } as React.CSSProperties}
        aria-label={ariaLabel}
      >
        <style>{TRAY_CSS}</style>
        {board}
      </div>
    );
  }
  if (heldOut.length === 0) return board;

  return (
    <>
      {board}
      <div
        className="mx-auto"
        style={{ maxWidth, marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #D9CFBE' }}
      >
        <p
          className="uppercase"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', color: '#8A7F70' }}
        >
          Shown as photographs
        </p>
        <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.6, color: '#8A7F70', marginTop: '2px' }}>
          These have no clean cutout yet — the image is still being prepared, the only photography that
          exists is worn, or the cut came back imperfect. Beau shows them as photographs rather than laying
          them among the cutouts.
        </p>
        <div className="flex flex-wrap gap-4" style={{ marginTop: '10px' }}>
          {heldOut.map((piece) => (
            <div key={piece.key} className="flex items-center gap-2" style={{ maxWidth: '220px' }}>
              {piece.image && (
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: '40px', height: '40px', background: '#FBF8F1', border: '1px solid #D9CFBE', boxSizing: 'border-box', overflow: 'hidden' }}
                >
                  <img
                    src={piece.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </span>
              )}
              <span
                className="min-w-0 truncate"
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '13px', color: '#241a12' }}
                title={piece.name}
              >
                {piece.name}
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(piece.key)}
                  aria-label={`Remove ${piece.name} from the outfit`}
                  title={`Remove ${piece.name} from the outfit`}
                  className="flex-shrink-0 text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)]"
                  style={{ fontSize: '13px', lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
