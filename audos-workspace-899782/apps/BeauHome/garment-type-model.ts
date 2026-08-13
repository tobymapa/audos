/**
 * GARMENT TYPE MODEL — the shared shape and compact constructor behind the
 * garment-type entry files (Data Layer task, Deliverable 1).
 *
 * The entry files (garment-type-entries-1..4.ts) each hold one slice of the
 * ~390-type canon as one-line `gt(...)` records; garment-types.ts assembles
 * and indexes them. The model lives HERE, in its own small file, so the
 * entry files can import it without a circular import through the
 * aggregator.
 *
 * These are garment type CATEGORIES (“Harrington jacket”, “Teba jacket”),
 * never individual products.
 */

import type { Register } from './brands';
import type { TemperatureBand } from './temperature-bands';

/**
 * Category ids — mirrors CATEGORY_ORDER in category-order.ts exactly.
 * Eleven categories are visible in the Index; 'other' is the catch-all
 * bucket that NEVER gets a plate and NEVER appears in navigation.
 */
export type GarmentCategoryId =
  | 'tops'
  | 'knitwear'
  | 'sweatshirts'
  | 'outerwear'
  | 'bottoms'
  | 'formalwear'
  | 'base-layers'
  | 'shoes'
  | 'accessories'
  | 'bags'
  | 'hats'
  | 'other';

export interface GarmentType {
  /** Slug id, e.g. 'harrington-jacket'. Unique across the whole canon. */
  id: string;
  /** Display name, e.g. 'Harrington Jacket'. */
  name: string;
  /** One of the eleven visible category ids — or 'other' (flagged, hidden). */
  category: GarmentCategoryId;
  /** The ONE primary apparent-temperature band the type is most appropriate
   * for — the climate histogram (climate-pipeline.ts) keys on this. */
  band: TemperatureBand;
  /** Which of the six registers this type can serve. */
  reach: Register[];
  /** The cut/fit variants the type exists in, e.g. ['Regular', 'Slim']. */
  cuts: string[];
  /** Canonical colours the type commonly comes in. */
  colours: string[];
  /** Maker names (BRAND_DIRECTORY / BRAND_WEBSITES / brand-reference names,
   * matched case-insensitively via findCatalogBrand / brandWebsiteUrl).
   * Empty where no verified maker in the merged pool makes the type —
   * never guessed. */
  makers: string[];
}

// Register shorthands — keep the ~390 one-line records readable.
export const C: Register = 'Casual';
export const SC: Register = 'Smart-Casual';
export const B: Register = 'Business';
export const F: Register = 'Formal';
export const BT: Register = 'Black-Tie';
export const OW: Register = 'Outdoor-Work';

/** Compact record constructor — argument order matches the interface. */
export function gt(
  id: string,
  name: string,
  category: GarmentCategoryId,
  band: TemperatureBand,
  reach: Register[],
  cuts: string[],
  colours: string[],
  makers: string[],
): GarmentType {
  return { id, name, category, band, reach, cuts, colours, makers };
}
