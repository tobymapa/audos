/**
 * WORLD OF MENSWEAR — the reference taxonomy's shared types (The Rail's
 * second sub-tab). A comprehensive, browseable encyclopedia of classic
 * menswear: every category, famous and obscure alike, so the user never has
 * to already know a thing exists in order to find it.
 *
 * The entries themselves live in world-entries-1..4.ts (split by category
 * cluster to keep each file readable); world-taxonomy.ts assembles and
 * indexes them; world-of-menswear.tsx is the surface.
 */

import { sortByCategoryOrder } from './category-order';

export type WorldCategoryId =
  | 'tops'
  | 'bottoms'
  | 'shoes'
  | 'outerwear'
  | 'knitwear'
  | 'sweatshirts'
  | 'formalwear'
  | 'accessories'
  | 'bags'
  | 'hats'
  | 'base-layers';

export interface WorldCategory {
  id: WorldCategoryId;
  label: string;
  /** One editorial line under the category head. */
  blurb: string;
}

/** Declared in file-of-record order; WORLD_CATEGORIES below hands them out
 * in the app's ONE canonical order (category-order.ts). */
const WORLD_CATEGORIES_UNORDERED: WorldCategory[] = [
  { id: 'tops', label: 'Tops', blurb: 'Shirts and tees — the layer the world actually sees most days.' },
  { id: 'bottoms', label: 'Bottoms', blurb: 'Trousers and shorts, from five-pocket denim to high-rise flannel.' },
  { id: 'shoes', label: 'Shoes', blurb: 'The foundation — welted, stitched and moulded, formal to weekend.' },
  { id: 'outerwear', label: 'Outerwear', blurb: 'The biggest family in menswear — a century of coats and jackets.' },
  { id: 'knitwear', label: 'Knitwear', blurb: 'Wool worked into shape — gauge, stitch and collar decide the register.' },
  { id: 'sweatshirts', label: 'Sweatshirts', blurb: 'Loopback cotton and fleece — the off-duty mid-layer with athletic roots.' },
  { id: 'formalwear', label: 'Formalwear', blurb: 'Tailoring proper: suits, coats and the dress codes around them.' },
  { id: 'accessories', label: 'Accessories', blurb: 'The small decisions that finish an outfit — or quietly carry it.' },
  { id: 'bags', label: 'Bags', blurb: 'What you carry it all in — canvas, bridle leather and brass.' },
  { id: 'hats', label: 'Hats & Headwear', blurb: 'From the ballpark to the racecourse — crowns, brims and caps.' },
  { id: 'base-layers', label: 'Base Layers', blurb: 'The unseen layer that makes everything above it sit better.' },
];

/**
 * Browse order — the canonical menswear order shared with The Ledger, The
 * Rail and the Coverage Map: Tops → Knitwear → Outerwear → Bottoms →
 * Formalwear → Base Layers → Shoes → Accessories → Bags → Hats/Headwear.
 */
export const WORLD_CATEGORIES: WorldCategory[] = sortByCategoryOrder(
  WORLD_CATEGORIES_UNORDERED,
  (cat) => cat.id,
);

export interface WorldFindLink {
  /** Retailer or maker name, e.g. "Drake's". */
  retailer: string;
  /** A real URL specific to this item type — a filtered search or category
   * page on a quality retailer or brand site, never a bare homepage. */
  url: string;
}

export interface WorldEntry {
  id: string;
  /** Display name, e.g. "Balmacaan Coat". */
  name: string;
  categoryId: WorldCategoryId;
  /** What it is — 2–3 sentences: concise description, defining characteristics. */
  what: string;
  /** Origin & history — 2–3 sentences: where it came from, when, cultural context. */
  history: string;
  /** Use case — when and how to wear it. */
  useCase: string;
  /** What it pairs well with — 3–5 specific pairings. */
  pairings: string[];
  /** true → "Wardrobe essential — fills a foundational gap";
   * false → "Specialist piece — adds range once the essentials are in place". */
  essential: boolean;
  /** Where to find one — 2–3 direct links to quality retailers or brand
   * sites carrying this type. */
  find: WorldFindLink[];
  /** Search terms, wardrobe-ownership matching, and For You routing words. */
  keywords: string[];
}
