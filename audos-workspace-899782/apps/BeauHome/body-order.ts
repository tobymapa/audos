/**
 * BODY-ORDER SEQUENCING + PROPORTIONAL SIZING — the shared layout language
 * for every surface that lays an outfit's pieces out side by side (the
 * "What to wear today?" slab on The Ledger and the fitting stage in The
 * Fitting).
 *
 * SEQUENCING (left → right follows the body, top → bottom):
 *   Hat/headwear → Outerwear (coat/parka) → Jacket/blazer → Knitwear →
 *   Top/shirt → Trousers/bottoms → Shoes — then bags and small accessories
 *   after the worn run. Leftmost = head, rightmost = feet.
 *
 * SIZING (the Whering approach): pieces are NOT all drawn at one container
 * size — a shoe drawn as large as a coat is what made the stage read wrong.
 * Each category carries a multiplier of the stage's base unit so pieces
 * look proportionally correct relative to each other:
 *   coats/heavy outerwear 1.0 · jackets/blazers 0.90 · knitwear 0.80 ·
 *   tops/shirts 0.75 · trousers/bottoms 0.85 · shoes 0.55 · bags 0.50 ·
 *   hats 0.40 · accessories 0.35
 *
 * FLAT-LAY PLACEMENT (the third table, added with the flat-lay board): the
 * canvas proportion, the vertical anchor and the layer order each category
 * gets when pieces are composed as a genuine flat-lay rather than a row.
 * ONE table serves two consumers, which is what keeps them honest:
 *   · photo-enhance normalizes every ingested cutout onto its category's
 *     canvas, so all shoes share a bounding proportion, all coats share
 *     another, and a board can compute an item's height from its width;
 *   · flat-view positions each piece from the same anchor/layer numbers.
 */

export interface BodyOrderPiece {
  category?: string | null;
  slot?: string | null;
  name?: string | null;
}

/** Wording that reads as a HEAVY COAT rather than a jacket/blazer — the
 * split inside the outerwear category that the body sequence (and the size
 * multipliers) care about. */
const HEAVY_COAT_WORDS =
  /\b(coat|coats|parka|pea\s?coat|peacoat|duffle|duffel|overcoat|greatcoat|topcoat|trench|anorak|puffer|down|shearling|mac)\b/i;

const HAT_WORDS = /\b(hat|cap|beanie|beret|trilby|fedora|panama)\b/i;
const BAG_WORDS = /\b(bag|briefcase|backpack|tote|holdall|duffle bag|satchel|weekender)\b/i;

function textOf(piece: BodyOrderPiece): string {
  return `${piece.slot || ''} ${piece.name || ''}`.toLowerCase();
}

/** True when an outerwear-shaped piece is a full coat rather than a
 * jacket/blazer — drives both its sequence slot and its stage size. */
export function isHeavyCoat(piece: BodyOrderPiece): boolean {
  return HEAVY_COAT_WORDS.test(textOf(piece));
}

/**
 * Where a piece sits in the left-to-right body sequence. Lower = closer to
 * the head. Unknown categories land with the accessories at the end.
 */
export function bodyOrderRank(piece: BodyOrderPiece): number {
  const cat = (piece.category || '').trim().toLowerCase();
  const text = textOf(piece);
  if (cat === 'hats' || HAT_WORDS.test(text)) return 0;
  if (cat === 'outerwear') return isHeavyCoat(piece) ? 1 : 2;
  if (cat === 'formalwear') return 2; // suits/blazers read at the jacket slot
  if (cat === 'knitwear') return 3;
  if (cat === 'tops' || cat === 'base-layers') return 4;
  if (cat === 'bottoms') return 5;
  if (cat === 'shoes') return 6;
  if (cat === 'bags' || BAG_WORDS.test(text)) return 7;
  return 8; // accessories and everything else — after the worn run
}

/** Any list of piece-shaped things, in body order. Stable for entries that
 * share a rank, so the caller's own secondary order survives. */
export function sortByBodyOrder<T>(items: T[], pieceOf: (item: T) => BodyOrderPiece): T[] {
  return items
    .map((item, index) => ({ item, index, rank: bodyOrderRank(pieceOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * The category-based size multiplier for the fitting stage — a share of the
 * stage's base unit (the width a coat takes). See the table in the header.
 */
export function sizeMultiplierFor(piece: BodyOrderPiece): number {
  const cat = (piece.category || '').trim().toLowerCase();
  const text = textOf(piece);
  if (cat === 'hats' || HAT_WORDS.test(text)) return 0.4;
  if (cat === 'bags' || BAG_WORDS.test(text)) return 0.5;
  if (cat === 'outerwear') return isHeavyCoat(piece) ? 1.0 : 0.9;
  if (cat === 'formalwear') return 0.9;
  if (cat === 'knitwear') return 0.8;
  if (cat === 'tops' || cat === 'base-layers') return 0.75;
  if (cat === 'bottoms') return 0.85;
  if (cat === 'shoes') return 0.55;
  return 0.35; // accessories and anything unrecognised — the smallest tier
}

// ---------------------------------------------------------------------------
// FLAT-LAY PLACEMENT — the per-category rules the flat-lay board and the
// image pipeline share. Indexed by the body rank above, so a category can
// never drift between the two.
// ---------------------------------------------------------------------------

export interface FlatLayPlacement {
  /** Canvas proportion (width ÷ height) the category's cutout is normalized
   * onto — every shoe lands on the same wide plate, every coat on the same
   * tall one. The board reads it to know an item's height from its width. */
  aspect: number;
  /** Where the piece hangs on the board, 0 = flush with the top edge,
   * 1 = flush with the bottom. Head high, feet low. */
  anchor: number;
  /** Layer order — higher sits closer to the camera, following real-world
   * draping: OUTERWEAR renders in FRONT of the layers it is worn over (a
   * jacket physically sits on top when worn), trousers lie behind the torso
   * stack at the overlap, and shoes sit in front of the trouser hem. */
  layer: number;
}

/** By body rank: hat · coat · jacket · knitwear · top · bottoms · shoes ·
 * bags · accessories. */
const FLAT_LAY_PLACEMENTS: FlatLayPlacement[] = [
  { aspect: 1.3, anchor: 0.0, layer: 7 }, // 0 · hat
  { aspect: 0.78, anchor: 0.05, layer: 6 }, // 1 · coat / heavy outerwear — frontmost torso layer
  { aspect: 0.82, anchor: 0.13, layer: 5 }, // 2 · jacket / blazer
  { aspect: 1.0, anchor: 0.22, layer: 4 }, // 3 · knitwear
  { aspect: 0.95, anchor: 0.3, layer: 3 }, // 4 · top / shirt — the base layer, at the back
  { aspect: 0.72, anchor: 0.58, layer: 1 }, // 5 · trousers / bottoms — behind the top at the overlap
  { aspect: 1.35, anchor: 0.96, layer: 2 }, // 6 · shoes — in front of the trouser hem
  { aspect: 1.0, anchor: 0.72, layer: 8 }, // 7 · bags
  { aspect: 1.1, anchor: 0.38, layer: 9 }, // 8 · accessories
];

/** The flat-lay canvas, anchor and layer for a piece. */
export function flatLayPlacementFor(piece: BodyOrderPiece): FlatLayPlacement {
  return FLAT_LAY_PLACEMENTS[bodyOrderRank(piece)] || FLAT_LAY_PLACEMENTS[8];
}

/** The canvas proportion alone — what the ingestion pipeline normalizes to. */
export function flatLayCanvasAspect(piece: BodyOrderPiece): number {
  return flatLayPlacementFor(piece).aspect;
}
