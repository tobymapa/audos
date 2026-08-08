/**
 * GARMENT PROPORTIONS — the ONE category-height ratio table for every
 * surface that lays garments out as an outfit.
 *
 * Each category maps to a share of the total outfit column height, based on
 * real-life body coverage: a shirt covers more of the visible body than the
 * legs of trousers do, so tops must render larger than a naive
 * equal-height (or image-aspect-derived) layout would draw them. For a
 * typical cap + top + trousers + shoes outfit the shares sum to ~0.94
 * (0.10 + 0.30 + 0.42 + 0.12) — intentionally short of 1.0, leaving a
 * little breathing room between pieces.
 *
 * Consumers:
 *   · flat-lay-board.tsx — the zone composition behind the "Beau · Today"
 *     tray on The Ledger AND The Fitting's Build a Look stage (one
 *     component, both surfaces).
 *   · store.tsx OutfitStack — the side-by-side outfit stack (the What to
 *     Wear looks and the wardrobe's mix preview).
 *
 * Extend it here, never inline: add the new category key (lowercase) with
 * its share of the column, and every surface picks it up at once.
 */
import { bodyOrderRank, type BodyOrderPiece } from './body-order';

export const GARMENT_HEIGHT_RATIOS: Record<string, number> = {
  // Headwear
  hat: 0.10,
  cap: 0.10,
  headwear: 0.10,
  hats: 0.10, // the wardrobe's own category id

  // Tops — shirts, jackets, coats, knitwear
  shirt: 0.30,
  top: 0.30,
  jacket: 0.30,
  coat: 0.30,
  sweater: 0.30,
  knitwear: 0.30,
  outerwear: 0.30,
  tops: 0.30, // wardrobe category id
  'base-layers': 0.30, // wardrobe category id
  formalwear: 0.30, // wardrobe category id — suits/blazers read at the jacket size

  // Bottoms — trousers, shorts, jeans
  trousers: 0.42,
  pants: 0.42,
  jeans: 0.42,
  shorts: 0.22, // shorts cover less leg
  bottoms: 0.42, // wardrobe category id

  // Shoes
  shoes: 0.12,
  boots: 0.16, // boots are taller
  sneakers: 0.12,

  // Small pieces the outfit surfaces also lay out
  belt: 0.03,
  socks: 0.11,
  bag: 0.16,
  bags: 0.16, // wardrobe category id
  accessory: 0.12,
  accessories: 0.12, // wardrobe category id

  // Default fallback for unmapped categories
  default: 0.28,
};

/**
 * The height ratio for a raw category string. Case-insensitive and
 * whitespace-trimmed — "Trousers", "trousers" and " TROUSERS " all resolve
 * to the same entry — with the map's `default` for anything unmapped.
 */
export function garmentHeightRatio(category?: string | null): number {
  const key = (category || '').trim().toLowerCase();
  return GARMENT_HEIGHT_RATIOS[key] ?? GARMENT_HEIGHT_RATIOS.default;
}

// ---------------------------------------------------------------------------
// Piece-aware lookup — the category alone cannot tell shorts from trousers
// (both live under the wardrobe's `bottoms` category) or boots from shoes,
// so the piece's slot/name text refines the read the same way the flat-lay's
// zone logic does.
// ---------------------------------------------------------------------------

const SHORTS_WORDS = /\bshorts\b/i;
const BOOT_WORDS = /\bboots?\b/i;
const BELT_WORDS = /\bbelts?\b/i;
const SOCK_WORDS = /\bsocks?\b/i;
const EYEWEAR_WORDS = /\b(sunglasses|glasses|eyewear|spectacles)\b/i;

/**
 * The height ratio for a piece-shaped record ({ category, slot, name }) —
 * category first, refined by the piece's own wording: shorts inside
 * `bottoms` take the shorts share, boots inside `shoes` the boots share,
 * and belts/socks/eyewear are recognised wherever they were filed. Unmapped
 * categories fall back to the map's `default`.
 */
export function garmentHeightRatioFor(piece: BodyOrderPiece): number {
  const r = GARMENT_HEIGHT_RATIOS;
  const text = `${piece.slot || ''} ${piece.name || ''}`.toLowerCase();
  if (SOCK_WORDS.test(text)) return r.socks;
  if (BELT_WORDS.test(text)) return r.belt;
  const rank = bodyOrderRank(piece);
  if (rank === 0 || EYEWEAR_WORDS.test(text)) return r.hat;
  if (rank >= 1 && rank <= 4) return r.top; // outerwear · jacket · knitwear · top — one tops tier
  if (rank === 5) return SHORTS_WORDS.test(text) ? r.shorts : r.trousers;
  if (rank === 6) return BOOT_WORDS.test(text) ? r.boots : r.shoes;
  if (rank === 7) return r.bags;
  // Accessories and anything unrecognised — the plain category lookup
  // (accessories resolve small; a truly unmapped category gets `default`).
  return garmentHeightRatio(piece.category);
}
