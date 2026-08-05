/**
 * THE CANONICAL CATEGORY ORDER (Recommendation Engine overhaul, Part 3).
 *
 * ONE list, used everywhere clothing categories are listed — The Ledger,
 * The Rail, the Coverage Map, World of Menswear, the Fitting's category
 * filters. Standard premium menswear convention (Mr Porter, END Clothing,
 * Selfridges): every WORN garment first, then shoes, then accessories,
 * then the carried / added pieces.
 *
 *   Tops · Knitwear · Outerwear · Bottoms · Formalwear · Base Layers ·
 *   Shoes · Accessories · Bags · Hats/Headwear · Others
 *
 * Surfaces must never hand-order their own category lists again — import
 * `categoryRank` / `sortByCategoryOrder` and the order stays in step
 * everywhere from a single edit here.
 */

export const CATEGORY_ORDER: string[] = [
  'tops',
  'knitwear',
  'outerwear',
  'bottoms',
  'formalwear',
  'base-layers',
  'shoes',
  'accessories',
  'bags',
  'hats',
  'other',
];

const RANK = new Map<string, number>(CATEGORY_ORDER.map((id, i) => [id, i]));

/** The other spellings the same category answers to across the app — the
 * coverage map's canonical row names, World of Menswear's labels, and the
 * looser strings the AI layers hand back. */
const ALIASES: Record<string, string> = {
  top: 'tops',
  knit: 'knitwear',
  knits: 'knitwear',
  outer: 'outerwear',
  bottom: 'bottoms',
  trousers: 'bottoms',
  'trousers & bottoms': 'bottoms',
  formal: 'formalwear',
  'base layer': 'base-layers',
  'base layers': 'base-layers',
  baselayers: 'base-layers',
  baselayer: 'base-layers',
  shoe: 'shoes',
  footwear: 'shoes',
  accessory: 'accessories',
  bag: 'bags',
  hat: 'hats',
  headwear: 'hats',
  'hats & headwear': 'hats',
  'hats / headwear': 'hats',
  'hats/headwear': 'hats',
  others: 'other',
};

/** Where a category sits in the canonical order — unknown ids sort last. */
export function categoryRank(id: string | null | undefined): number {
  const key = (id || '').trim().toLowerCase();
  const canonical = ALIASES[key] || key;
  const rank = RANK.get(canonical);
  return rank == null ? CATEGORY_ORDER.length : rank;
}

/** Any list of category-shaped things, in the canonical order. Stable for
 * entries that share a rank, so a surface's own secondary order survives. */
export function sortByCategoryOrder<T>(items: T[], idOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, rank: categoryRank(idOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}
