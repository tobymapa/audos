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
 * The zones, top to bottom on a portrait 480 × 600 board — ELEVEN of them
 * (design handoff §7 zone expansion): head · eyewear · neck · outer layer ·
 * mid layer · top · waist · bottom · feet · carry · wrist. A zone accepts
 * more than one piece and stacks outward from the body:
 *   · HEAD — hats and caps. Small, centred, at the very top, floating
 *     with a small clear gap above the torso stack (the invisible head) —
 *     never overlapping the torso zone.
 *   · EYEWEAR — glasses and sunglasses, a small box at the top-left corner
 *     beside the head slot.
 *   · NECK — ties, scarves, cravats: a narrow strip laid over the top of
 *     the torso stack, frontmost, the way neckwear sits when worn.
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
 *   · ONE LIGHT CANVAS under the WHOLE outfit — a single field in the
 *     slightly darker beige #EDE8DF (the founder's 7-point fix pass — one
 *     step darker than the #FBF8F1 card tone), inset from the slab's edge,
 *     sharp-cornered, carrying one inset frame 10px inside its own edge —
 *     2px in dark walnut #241a12 (the same fix pass: the hairline #D9CFBE
 *     line is retired here). The composition is CLIPPED to the area inside
 *     that frame (`.today-clip`, overflow hidden), so no piece can ever
 *     render across the line and break the framed effect. On walnut a
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
import { useEffect, useRef, useState } from 'react';
import { isTransparentCutout } from './photo-enhance';
import { CUTOUTS_HYDRATED_EVENT } from './image-pipeline';
import { bodyOrderRank, sortByBodyOrder } from './body-order';
import { GARMENT_HEIGHT_RATIOS, garmentHeightRatioFor } from './garment-proportions';

// ---------------------------------------------------------------------------
// DRAGGABLE PIECES — a positional override the user applies ON TOP of the
// deterministic zone layout. The composer's output is always the STARTING
// state; a drag stores a per-piece {dx, dy} delta (in % of the board, so it
// scales with the surface) in localStorage keyed by the outfit's identity
// (`dragKey`), and the piece re-renders at zone position + delta — clamped
// so nothing can leave the canvas. Clearing the stored key restores the
// default layout exactly.
// ---------------------------------------------------------------------------

interface DragOffset {
  dx: number;
  dy: number;
}

const DRAG_STORE_PREFIX = 'ethaion_layout_';

function loadDragOffsets(key: string): Record<string, DragOffset> {
  try {
    const raw = localStorage.getItem(DRAG_STORE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveDragOffsets(key: string, offsets: Record<string, DragOffset>): void {
  try {
    localStorage.setItem(DRAG_STORE_PREFIX + key, JSON.stringify(offsets));
  } catch { /* storage full/unavailable — the drag still works this session */ }
}

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
  /** DASHED MEANS NOT YOURS (build brief rule 2): true when the piece is a
   * candidate — something the wearer doesn't own — so the board draws it
   * with a dashed accent outline. A board holding one saves as a proposal. */
  notOwned?: boolean;
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

/** CATEGORY-PROPORTIONAL SIZING (founder's spec — category-height ratios).
 * Every category carries a fixed share of the total outfit column height
 * (GARMENT_HEIGHT_RATIOS in garment-proportions.ts — the ONE constants
 * object every outfit surface sizes from), and every item's box is scaled
 * from THAT — independent of how its source photograph happened to be
 * framed. Trousers at 0.42 of the column always draw taller than shoes at
 * 0.12, and a shirt at 0.30 reads larger than either shoe, whatever the
 * photos did. */

/** A category-height ratio (share of the outfit column) → % of the board's
 * height. The board IS the column, so the share converts directly. */
function ratioToBoardPct(ratio: number): number {
  return ratio * 100;
}

/** The design canvas's own proportion (portrait 480 × 600). Needed to convert
 * between %-of-height and %-of-width when deriving an item's render width
 * from its height and true aspect ratio: widthPct = heightPct × (imageW/imageH)
 * ÷ boardAspect. Both the stage and the tray render this exact design
 * proportion, so the relation holds on either surface. */
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
 * category's height ratio (GARMENT_HEIGHT_RATIOS). Multiple items in one
 * zone split the zone's width evenly, side by side — still deterministic,
 * still zero rotation. */
const ZONE_HEAD: ZoneBox = { top: 0, left: 32, width: 36, z: 7 };
/** Eyewear — a small box at the top-left corner, beside the head slot. */
const ZONE_EYEWEAR: ZoneBox = { top: 2, left: 6, width: 20, z: 8 };
/** Neckwear — a narrow strip over the TOP of the torso stack, frontmost,
 * the way a tie or scarf sits when worn. Its top anchors to the torso. */
const ZONE_NECK = { left: 41, width: 18, z: 9 };
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
/** The clear air between the hat slot and the torso stack — the invisible
 * head. The hat never overlaps the torso zone. */
const HEAD_TORSO_GAP = 2;
/** TIGHT SHIRT→TROUSERS SPACING (founder's fix): the trousers' top edge
 * tucks this far UNDER the torso stack's hem — legs render BEHIND the
 * torso (z 1 vs 3+), so the waistband slips under the shirt the way
 * clothes sit on a body instead of floating apart with a gap. */
const TORSO_LEGS_OVERLAP = 1.5;
/** -12% of the torso zone's 60% width, in board % per front layer. */
const TORSO_LAYER_SHIFT = 7.2;

/** The side accessory column, down the right edge (right: 2%, width 18%).
 * Each item is anchored near the body zone it corresponds to (see
 * accessoryAnchorTop). */
const ACCESSORY_COLUMN = { left: 80, width: 18, itemHeight: 12, gap: 3, z: 8 };

const EYEWEAR_WORDS = /\b(sunglasses|glasses|eyewear|spectacles)\b/i;
const NECK_WORDS = /\b(tie|ties|neck\s?tie|bow\s?tie|scarf|scarves|cravat|ascot|neckerchief|bandana|muffler|snood)\b/i;
const BELT_WORDS = /\bbelts?\b/i;
const SOCK_WORDS = /\bsocks?\b/i;
const WATCH_WORDS = /\b(watch|watches|bracelet|cufflinks?|wrist)\b/i;
const BAG_ZONE_WORDS = /\b(bag|briefcase|backpack|tote|holdall|satchel|weekender|rucksack)\b/i;

/** THE ELEVEN ZONES (design handoff §7) — plus 'socks' as an internal
 * helper slot and 'torso' carrying the outer/mid/top LAYER stack (the
 * outer-layer / mid-layer / top distinction is the stack's back-to-front
 * order, computed from body rank — see the torso placement below). */
type ZoneId =
  | 'head'
  | 'eyewear'
  | 'neck'
  | 'torso'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'socks'
  | 'carry'
  | 'wrist'
  | 'accessories';

function pieceText(piece: FlatLayPiece): string {
  return `${piece.slot || ''} ${piece.name || ''}`.toLowerCase();
}

/** Which zone a piece renders in — category first, name for the pieces that
 * live outside their zone's category (a belt is an accessory by category but
 * a waist item by position; socks are base-layers but sit above the shoes). */
function zoneFor(piece: FlatLayPiece): ZoneId {
  const text = pieceText(piece);
  if (SOCK_WORDS.test(text)) return 'socks';
  if (EYEWEAR_WORDS.test(text)) return 'eyewear';
  if (NECK_WORDS.test(text)) return 'neck';
  if (WATCH_WORDS.test(text)) return 'wrist';
  const rank = bodyOrderRank({ category: piece.category, slot: piece.slot, name: piece.name });
  if (rank === 0) return 'head';
  if (BELT_WORDS.test(text)) return 'waist';
  if (rank >= 1 && rank <= 4) return 'torso';
  if (rank === 5) return 'legs';
  if (rank === 6) return 'feet';
  if (rank === 7 || BAG_ZONE_WORDS.test(text)) return 'carry';
  return 'accessories';
}

/** An item's render height in % of the board: its category's share of the
 * outfit column (GARMENT_HEIGHT_RATIOS — case-insensitive, whitespace-
 * trimmed, `default` for unmapped categories) — never derived from the
 * source photo's framing, so a shoe can never draw coat-sized. */
function referenceHeightPct(piece: FlatLayPiece): number {
  return ratioToBoardPct(
    garmentHeightRatioFor({ category: piece.category, slot: piece.slot, name: piece.name }),
  );
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
    eyewear: [],
    neck: [],
    torso: [],
    waist: [],
    legs: [],
    feet: [],
    socks: [],
    carry: [],
    wrist: [],
    accessories: [],
  };
  for (const piece of ordered) groups[zoneFor(piece)].push(piece);

  const placed: Array<FlatLayPlacedItem<T>> = [];

  /** Place a single-position zone's items — one item fills the box; several
   * split its width evenly, side by side. Each item's HEIGHT is its
   * category's share of the column, never a zone constant — and its
   * WIDTH is derived from that height and the cutout's true aspect ratio
   * when the piece carries one (tight-cropped pipeline v3), centred in its
   * slot, so the box hugs the item exactly. */
  const placeRow = (items: T[], box: ZoneBox) => {
    if (items.length === 0) return;
    const slotWidth = box.width / items.length;
    items.forEach((piece, i) => {
      const height = referenceHeightPct(piece);
      // PROPORTIONS RULE (founder's fix): the category reference height IS
      // the item's render height — the zone's width never shrinks it. A
      // tight-cropped cutout keeps its true aspect ratio at that height even
      // when that makes it wider than its slot (the box is centred on the
      // slot and clamped to the board; the clipped tray absorbs any rare
      // spill). Capping the box at the slot width — the old behaviour — is
      // what silently shrank a wide-cropped shirt well below its 0.30
      // share against the 0.42 trousers. Only a dimension-less legacy
      // image still falls back to the slot's own width.
      const natural = aspectWidthPct(piece, height);
      const width = natural == null ? slotWidth : Math.min(natural, 96);
      placed.push({
        piece,
        left: clamp(box.left + i * slotWidth + (slotWidth - width) / 2, 0, 100 - width),
        top: box.top,
        width,
        height,
        z: box.z,
        rot: 0,
      });
    });
  };

  placeRow(groups.head, ZONE_HEAD);
  placeRow(groups.eyewear, ZONE_EYEWEAR);

  // RESERVED CAP SLOT (founder's fix): the headwear slot at the top of the
  // column is ALWAYS held, hat or no hat — when empty nothing renders there
  // (no placeholder, no border), but the torso anchors below the reserved
  // space either way, so adding or removing a cap never shifts the rest of
  // the outfit. The reserved height is the `hat: 0.10` share; a taller
  // headwear piece simply extends it.
  const headBottom =
    groups.head.length > 0 ? ZONE_HEAD.top + Math.max(...groups.head.map((p) => referenceHeightPct(p))) : null;
  const reservedHeadBottom = Math.max(
    headBottom ?? 0,
    ZONE_HEAD.top + ratioToBoardPct(GARMENT_HEIGHT_RATIOS.hat),
  );
  const torsoTop = reservedHeadBottom + HEAD_TORSO_GAP;

  // TORSO — layered as WORN. Back-to-front is REVERSED body order (base top
  // first): the base top sits rightmost at the back, and each layer worn
  // over it shifts LEFT and renders IN FRONT — the outerwear ends up
  // leftmost, FRONTMOST (highest z), physically on top, overlapping the base
  // top behind it.
  const torsoLayers = [...groups.torso].reverse();
  torsoLayers.forEach((piece, i) => {
    const height = referenceHeightPct(piece);
    // Same proportions rule as placeRow: the category height is never
    // sacrificed to the zone's width — a top at 0.30 renders at ~71% of the
    // 0.42 trousers whatever its crop's aspect ratio happens to be.
    const natural = aspectWidthPct(piece, height);
    const width = natural == null ? ZONE_TORSO.width : Math.min(natural, 96);
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

  const torsoBottom =
    torsoLayers.length > 0 ? torsoTop + Math.max(...torsoLayers.map((p) => referenceHeightPct(p))) : null;

  // NECK — laid over the top of the torso stack, frontmost (zone expansion).
  placeRow(groups.neck, { ...ZONE_NECK, top: torsoTop + 1 });

  // TIGHT VERTICAL SPACING (founder's fix): the trousers anchor to the torso
  // stack's hem rather than a fixed board position — the waistband tucks
  // slightly under the shirt (TORSO_LEGS_OVERLAP; legs render behind the
  // torso), so shirt and trousers sit close together like they do on a body.
  // Without a torso the legs keep their fixed fallback position.
  const legsTop = torsoBottom != null ? torsoBottom - TORSO_LEGS_OVERLAP : ZONE_LEGS.top;
  // The belt strip straddles the shirt/trouser junction, in front of both.
  placeRow(groups.waist, { ...ZONE_WAIST, top: legsTop - 1.5 });
  placeRow(groups.legs, { ...ZONE_LEGS, top: legsTop });

  // FEET — at the very bottom, IN FRONT of the trouser hem (z above legs).
  // With trousers present the shoes anchor to the hem and overlap it. WITHOUT
  // trousers they tuck up under the torso stack instead of dropping to the
  // fixed fallback position — which is what lets a shirt-and-shoes outfit
  // produce a visibly SHORTER tray than one with trousers in it, rather than
  // leaving a dead band of canvas where the trousers would have been.
  const shoeHeight =
    groups.feet.length > 0
      ? Math.max(...groups.feet.map((p) => referenceHeightPct(p)))
      : ratioToBoardPct(GARMENT_HEIGHT_RATIOS.shoes);
  const legsBottom =
    groups.legs.length > 0 ? legsTop + Math.max(...groups.legs.map((p) => referenceHeightPct(p))) : null;
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
  const sockHeight = ratioToBoardPct(GARMENT_HEIGHT_RATIOS.socks);
  const sockTop = clamp(feetTop - sockHeight * 0.8, 0, 100 - sockHeight);
  placeRow(groups.socks, { top: sockTop, left: ZONE_SOCKS.left, width: ZONE_SOCKS.width, z: ZONE_SOCKS.z });
  placeRow(groups.feet, { top: feetTop, left: ZONE_FEET.left, width: ZONE_FEET.width, z: ZONE_FEET.z });

  // SIDE ACCESSORY COLUMN — three zones share the right edge, each anchored
  // near the body zone it corresponds to (zone expansion §7): WRIST at torso
  // height, CARRY (bags) at waist/hip height, other accessories between —
  // walked top to bottom with collisions resolved downward so items never
  // overlap.
  const column = [
    ...groups.wrist.map((piece) => ({ piece, anchor: 8 })),
    ...groups.accessories.map((piece) => ({ piece, anchor: accessoryAnchorTop(piece) })),
    ...groups.carry.map((piece) => ({ piece, anchor: 40 })),
  ].sort((a, b) => a.anchor - b.anchor);
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
 *   .today-canvas   ONE light field, the only background in the card — the
 *                   slightly darker beige #EDE8DF (founder's fix pass).
 *                   Inset 16px from the walnut slab, sharp-cornered, with a
 *                   single 2px dark-walnut #241a12 frame 10px inside its own
 *                   edge (the ::before) — a picture frame sitting inside the
 *                   canvas boundary, never a stroke on the boundary itself.
 *   .today-clip     the clipping box INSIDE the inset frame (the canvas's
 *                   12px padding lands its edge exactly on the frame's inner
 *                   edge; overflow hidden). Every piece renders inside it,
 *                   so nothing can cross the frame line (founder's fix).
 *   .today-stage    the transparent positioning box inside the clip. The
 *                   composer's percentages are relative to it, so the
 *                   composition keeps the 480 × 600 portrait proportion the
 *                   zone system is designed on.
 *   .today-piece    one per garment, absolutely positioned, and TRANSPARENT:
 *                   no background, no border, no shadow, no radius, no
 *                   padding and NO ROTATION. The cutout lies straight on the
 *                   canvas, contained inside its zone box.
 *
 * 480 × 600 is the DESIGN canvas; the FRAME it sits in is a SQUARE
 * (founder's frame fix): the canvas has equal width and height, slightly
 * smaller than the old 480px rectangle (420px max, inset 16px from the
 * slab), and the portrait stage scales to fill the square's height — the
 * stacked garments fit inside the frame whatever its rendered size. The
 * same square canvas now fronts BOTH surfaces: the Today card on the
 * walnut slab and the Fitting's Build a Look stage (flat-view passes
 * `.today-canvas--center` to centre it on the paper panel).
 */
const TRAY_CSS =
  '.today-canvas{position:relative;box-sizing:border-box;width:calc(100% - 32px);max-width:var(--today-canvas-max,420px);aspect-ratio:1/1;' +
  'margin:16px 16px 16px auto;background:var(--today-canvas-ground,#EDE8DF);border-radius:0;min-height:160px;' +
  'padding:12px;display:flex;align-items:center;justify-content:center}' +
  '.today-canvas--center{margin:16px auto}' +
  // FLUSH — the canvas takes the whole column it is given and only a hair of
  // vertical margin. The Fitting's board uses it: every pixel spared at the
  // edges is a pixel the garments themselves get.
  '.today-canvas--flush{width:100%;margin:6px auto}' +
  '.today-canvas::before{content:"";position:absolute;inset:10px;border:2px solid #241a12;pointer-events:none;z-index:20}' +
  // THE BARE GROUND (founder's correction — the Fitting Room's outfit board
  // loses its square field and frame; the clothes float on transparent empty
  // space). Beau · Today on The Ledger keeps the framed canvas — it sits on
  // the dark walnut slab and needs the visual frame — so this is a modifier,
  // never the default.
  '.today-canvas--bare{background:transparent!important;padding:0}' +
  '.today-canvas--bare::before{display:none}' +
  '.today-clip{position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
  '.today-stage{position:relative;height:100%;max-width:100%;margin:0 auto;aspect-ratio:var(--aspect,480/600);background:transparent;border:none;box-shadow:none}' +
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
  trayMaxWidth,
  panel = 'paper',
  uniformItems = false,
  variant = 'stage',
  ground = 'canvas',
  showHeldOut = false,
  onRemove,
  dragKey,
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
  /** TRAY ONLY — how wide the one square canvas may draw (default 420px).
   * The portrait stage scales to the canvas, so this is the ONE knob that
   * sizes every garment on the board: The Fitting sets it larger, the
   * Ledger's “Beau · Today” card keeps the default. */
  trayMaxWidth?: string;
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
  /** Tray only — which ground the outfit lies on. 'canvas' is the framed
   * #EDE8DF square (Beau · Today on the Ledger — KEEP IT THERE); 'transparent'
   * removes the field and the inset frame entirely so the clothes float on
   * empty space (the Fitting Room's outfit board — founder's correction). */
  ground?: 'canvas' | 'transparent';
  /** Tray only: also name the held-out pieces beneath the canvas (the
   * Fitting's stage wants that; the Today card has no room and skips it). */
  showHeldOut?: boolean;
  onRemove?: (key: string) => void;
  /** When set, every composed piece becomes DRAGGABLE (pointer events —
   * mouse and touch alike): the user can reposition it on the canvas, the
   * delta persists in localStorage under this key (the outfit/session
   * identity), and pieces can never be dragged outside the canvas boundary.
   * Absent → the board behaves exactly as before. */
  dragKey?: string;
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
  // CUTOUT RECOGNITION IS RE-READ ONCE THE STORE HYDRATES (missing-pieces
  // fix, August 2026): `isTransparentCutout` answers from the image_cutouts
  // rows, which load asynchronously at boot — a board painted BEFORE they
  // landed mistook genuine stored cutouts for raw photographs and held them
  // out, which read as blank/missing pieces. The hydration event forces one
  // re-render so every URL is re-judged against the full store.
  const [, setCutoutTick] = useState(0);
  useEffect(() => {
    const bump = () => setCutoutTick((n) => n + 1);
    window.addEventListener(CUTOUTS_HYDRATED_EVENT, bump);
    return () => window.removeEventListener(CUTOUTS_HYDRATED_EVENT, bump);
  }, []);
  // A cutout URL that RESOLVES but fails to LOAD (an expired or blocked
  // file) must never leave an invisible <img> on the canvas — the piece
  // falls back to its quiet named placeholder instead (same fix).
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const composes = (piece: T) => piece.flatLayReady !== false && (!piece.image || isTransparentCutout(piece.image));
  const composable = pieces.filter(composes);

  // --- Drag state (only live when `dragKey` names an outfit) ---------------
  const [dragOffsets, setDragOffsets] = useState<Record<string, DragOffset>>(() =>
    dragKey ? loadDragOffsets(dragKey) : {},
  );
  const dragOffsetsRef = useRef(dragOffsets);
  useEffect(() => {
    dragOffsetsRef.current = dragOffsets;
  }, [dragOffsets]);
  // A different outfit → its own remembered layout.
  useEffect(() => {
    setDragOffsets(dragKey ? loadDragOffsets(dragKey) : {});
  }, [dragKey]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // TAP TO SELECT, THEN TAKE IT OFF (founder's canvas fix). With `onRemove`
  // live, tapping a piece SELECTS it — it lifts to the front, takes a walnut
  // outline and shows its own ×. Only the selected piece carries a control,
  // so the canvas is never littered with them; Escape, a tap on the ground,
  // or a second tap on the piece clears the selection. Removing a piece
  // takes it off THIS board only — nothing leaves the Ledger.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    if (selectedKey && !pieces.some((piece) => piece.key === selectedKey)) setSelectedKey(null);
  }, [pieces, selectedKey]);
  useEffect(() => {
    if (!selectedKey) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey]);

  /** The rendered position: zone layout + the user's stored delta, clamped
   * to the canvas so a restored offset can never strand a piece outside. */
  const positionOf = (item: FlatLayPlacedItem<T>): { left: number; top: number } => {
    const off = dragKey ? dragOffsets[item.piece.key] : undefined;
    if (!off) return { left: item.left, top: item.top };
    return {
      left: clamp(item.left + off.dx, 0, Math.max(0, 100 - item.width)),
      top: clamp(item.top + off.dy, 0, Math.max(0, 100 - item.height)),
    };
  };

  const handlePointerDown = (item: FlatLayPlacedItem<T>) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragKey) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cur = dragOffsetsRef.current[item.piece.key] || { dx: 0, dy: 0 };
    dragRef.current = { key: item.piece.key, startX: e.clientX, startY: e.clientY, baseDx: cur.dx, baseDy: cur.dy, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* capture is best-effort */ }
  };

  const handlePointerMove = (item: FlatLayPlacedItem<T>) => (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.key !== item.piece.key || !dragKey) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (!drag.moved && Math.abs(e.clientX - drag.startX) < 4 && Math.abs(e.clientY - drag.startY) < 4) return;
    drag.moved = true;
    e.preventDefault();
    const rawDx = drag.baseDx + ((e.clientX - drag.startX) / rect.width) * 100;
    const rawDy = drag.baseDy + ((e.clientY - drag.startY) / rect.height) * 100;
    // The piece's BOX stays inside the canvas — the boundary rule.
    const dx = clamp(rawDx, -item.left, Math.max(0, 100 - item.width - item.left));
    const dy = clamp(rawDy, -item.top, Math.max(0, 100 - item.height - item.top));
    setDragOffsets((cur) => ({ ...cur, [item.piece.key]: { dx, dy } }));
  };

  const handlePointerEnd = (item: FlatLayPlacedItem<T>) => () => {
    const drag = dragRef.current;
    if (!drag || drag.key !== item.piece.key) return;
    dragRef.current = null;
    if (drag.moved && dragKey) {
      saveDragOffsets(dragKey, dragOffsetsRef.current);
      // The drag's tail end must not read as a tap on the piece (or on
      // whatever card the board sits in).
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const heldOut = pieces.filter((piece) => !composes(piece));
  const placed = composeFlatLayBoard(composable, seed, aspect, { uniform: uniformItems });
  const tray = variant === 'tray';
  // MATCHED SIZING (founder's rule): the tray IS the framed canvas both
  // surfaces render — the Today card and the Fitting's Build a Look stage —
  // so pieces read at the same scale everywhere. The portrait stage scales
  // to fill the square frame's height (TRAY_CSS); nothing is re-scaled per
  // outfit.
  const trayItems = placed;
  const trayAspect = aspect;
  // THE LIGHT GROUND, and there is only ever ONE of it: the tray's single
  // square canvas under the whole outfit — the slightly darker beige #EDE8DF
  // (founder's fix pass) on EVERY panel it fronts (the walnut slab and the
  // Fitting's paper stage alike) — and nowhere does a piece get a ground of
  // its own. `panel` is kept for API compatibility.
  void panel;
  const canvasGround = '#EDE8DF';
  // The board itself is transparent. On the tray it is the positioning box
  // INSIDE the canvas; every piece is an absolutely-positioned child of it.
  const board = (
    <div
      ref={boardRef}
      className={tray ? 'today-stage' : `flat-lay-board relative w-full mx-auto ${className}`}
      style={tray ? undefined : { maxWidth, aspectRatio: `${aspect}`, position: 'relative' }}
      aria-label={tray ? undefined : ariaLabel}
      onClick={
        onRemove
          ? (e) => {
              // A tap on the bare ground puts the selection down.
              if (e.target === e.currentTarget) setSelectedKey(null);
            }
          : undefined
      }
    >
      {(tray ? trayItems : placed).map((item) => {
        // Zone position + the user's dragged delta (when `dragKey` is live),
        // clamped to the canvas.
        const pos = positionOf(item);
        const beingDragged = dragRef.current?.key === item.piece.key;
        const dragStyle: React.CSSProperties = dragKey
          ? { touchAction: 'none', cursor: beingDragged ? 'grabbing' : 'grab', userSelect: 'none' }
          : {};
        const selected = !!onRemove && selectedKey === item.piece.key;
        const selectStyle: React.CSSProperties = selected
          ? { outline: '1px solid #241a12', outlineOffset: '3px' }
          : {};
        const dragHandlers = dragKey
          ? {
              onPointerDown: handlePointerDown(item),
              onPointerMove: handlePointerMove(item),
              onPointerUp: handlePointerEnd(item),
              onPointerCancel: handlePointerEnd(item),
              onClickCapture: handleClickCapture,
            }
          : {};
        return (
        <div
          key={item.piece.key}
          data-piece-key={item.piece.key}
          className={tray ? 'today-piece' : 'flat-lay-item absolute'}
          {...dragHandlers}
          onClick={
            onRemove
              ? (e) => {
                  e.stopPropagation();
                  setSelectedKey((cur) => (cur === item.piece.key ? null : item.piece.key));
                }
              : undefined
          }
          style={tray ? ({
            // The placement facts, handed to the tray's CSS as custom
            // properties — the zone box (plus any dragged delta). No rotation.
            ['--x' as string]: `${pos.left.toFixed(2)}%`,
            ['--y' as string]: `${pos.top.toFixed(2)}%`,
            ['--w' as string]: `${item.width.toFixed(2)}%`,
            ['--h' as string]: `${item.height.toFixed(2)}%`,
            ['--z' as string]: String(selected ? item.z + 200 : item.z),
            ...dragStyle,
            ...selectStyle,
          } as React.CSSProperties) : {
            left: `${pos.left}%`,
            top: `${pos.top}%`,
            width: `${item.width}%`,
            height: `${item.height}%`,
            zIndex: selected ? item.z + 200 : item.z,
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
            ...dragStyle,
            ...selectStyle,
          }}
          title={
            onRemove
              ? `${item.piece.name}${item.piece.notOwned ? ' — not yours yet' : ''} — tap to select, then × to take it off`
              : item.piece.notOwned
                ? `${item.piece.name} — not yours yet`
                : item.piece.name
          }
        >
          {/* DASHED MEANS NOT YOURS — the 1px dashed accent outline on any
              piece the wearer doesn't own, on every surface the flat-lay
              fronts (build brief rule 2). Outline, not border: the tray's
              CSS forces border:none on every piece. */}
          {item.piece.notOwned && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                outline: '1.5px dashed var(--color-accent,#a8712c)',
                outlineOffset: '-1px',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          )}
          {item.piece.image && isTransparentCutout(item.piece.image) && !brokenImages[item.piece.key] ? (
            /* The stored transparent PNG: it lies straight on the board with
               nothing behind it and nothing done to it. A URL that fails to
               load falls back to the named placeholder below. */
            <img
              src={item.piece.image}
              alt={item.piece.name}
              className={tray ? 'select-none' : 'block w-full h-full object-contain select-none'}
              loading="eager"
              decoding="async"
              draggable={false}
              onError={() => setBrokenImages((cur) => ({ ...cur, [item.piece.key]: true }))}
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
          {/* The remove control belongs to the SELECTED piece alone, and sits
              INSIDE its box so the canvas's clip can never cut it off. */}
          {onRemove && selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedKey(null);
                onRemove(item.piece.key);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Take ${item.piece.name} off board`}
              title={`Take ${item.piece.name} off board — it stays in your Ledger`}
              className="absolute w-7 h-7 flex items-center justify-center bg-[var(--color-paper,#fbf8f1)] border border-[#241a12] text-[var(--color-text,#241a12)] hover:bg-[var(--color-accent-100,#fbf1de)] rounded-full"
              style={{ top: '1px', right: '1px', zIndex: 30, fontSize: '14px', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
        );
      })}
    </div>
  );

  // The held-out list — pieces the verification step keeps off the canvas,
  // NAMED beneath the board instead. Shared by the plain stage and (when
  // `showHeldOut` asks for it) the tray; the Today card skips it — a held-out
  // piece is simply EXCLUDED from the preview, and the tap-through to The
  // Fitting names it in full.
  const heldOutBlock =
    heldOut.length === 0 ? null : (
      <div
        className="mx-auto"
        style={{ maxWidth, marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #D9CFBE' }}
      >
        <p
          className="uppercase"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', color: '#8A7F70' }}
        >
          Not on board yet
        </p>
        <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.6, color: '#8A7F70', marginTop: '2px' }}>
          These have no clean cutout yet — the image is still being prepared, the only photography that
          exists is worn, or the cut came back imperfect. Beau names them here rather than laying anything
          unfinished among the cutouts.
        </p>
        <div className="flex flex-wrap gap-4" style={{ marginTop: '10px' }}>
          {heldOut.map((piece) => (
            <div key={piece.key} className="flex items-center gap-2" style={{ maxWidth: '220px' }}>
              {/* Only a GENUINE transparent cutout may appear even here — a
                  raw photograph is never an item's display image (universal
                  transparency rule), and the plate/border is gone with it. */}
              {piece.image && isTransparentCutout(piece.image) && (
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: '40px', height: '40px', background: 'transparent', boxSizing: 'border-box', overflow: 'hidden' }}
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
    );

  // THE CANVAS — the tray's one light field, and the ONLY background surface
  // wherever it fronts. The pieces lie directly on it with nothing of their
  // own behind them, and a single 2px frame sits 10px inside its edge like a
  // picture frame within the canvas boundary.
  if (tray) {
    const canvas = (
      <div
        className={`today-canvas ${ground === 'transparent' ? 'today-canvas--bare' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
        style={{
          ['--aspect' as string]: String(trayAspect),
          ['--today-canvas-ground' as string]: canvasGround,
          ...(trayMaxWidth ? { ['--today-canvas-max' as string]: trayMaxWidth } : null),
        } as React.CSSProperties}
        aria-label={ariaLabel}
      >
        <style>{TRAY_CSS}</style>
        {/* The clip — its edge sits exactly on the inset frame's inner edge
            (canvas padding 12px = 10px inset + 2px stroke), and overflow is
            hidden, so no piece can render across the frame line. */}
        <div className="today-clip">{board}</div>
      </div>
    );
    return showHeldOut && heldOutBlock ? (
      <>
        {canvas}
        {heldOutBlock}
      </>
    ) : (
      canvas
    );
  }
  if (!heldOutBlock) return board;

  return (
    <>
      {board}
      {heldOutBlock}
    </>
  );
}
