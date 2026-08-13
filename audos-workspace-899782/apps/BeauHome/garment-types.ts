/**
 * THE GARMENT TYPE CANON — every classic menswear garment type as one
 * structured, typed record (Data Layer task, Deliverable 1).
 *
 * ~380 type records across the ELEVEN visible categories (category-order.ts
 * minus 'other'), from the everyday (OCBD, chinos, penny loafer) to the
 * obscure classics (Teba jacket, Sahariana, donkey jacket, paletot,
 * veldskoen, sou’wester). These are garment type CATEGORIES, never
 * individual products.
 *
 * Each record carries:
 *   · category — one of the canonical category ids (category-order.ts)
 *   · band    — its ONE primary apparent-temperature band (temperature-bands.ts),
 *               which the climate histogram (climate-pipeline.ts) keys on
 *   · reach   — which of the SIX registers it can serve (brands.ts Register)
 *   · cuts / colours — the variants and canonical colours the type comes in
 *   · makers  — maker names from the merged pool (BRAND_DIRECTORY +
 *               BRAND_WEBSITES + brand-reference), matched case-insensitively
 *               via findCatalogBrand / brandWebsiteUrl; empty = no verified
 *               maker, never guessed
 *
 * 'other' category records EXIST in the data (pyjamas, dressing gown…) but
 * are flagged: they must NEVER appear in Index navigation or plate views —
 * consume INDEX_GARMENT_TYPES / visibleGarmentTypes(), not GARMENT_TYPES,
 * anywhere a customer can see.
 *
 * The records live in four entry files (garment-type-entries-1..4.ts) to
 * keep each file reviewable; THIS file is the only import surface.
 */

import { CATEGORY_ORDER, sortByCategoryOrder } from './category-order';
import type { Register } from './brands';
import type { TemperatureBand } from './temperature-bands';
import type { GarmentCategoryId, GarmentType } from './garment-type-model';
import { GARMENT_TYPE_ENTRIES_1 } from './garment-type-entries-1';
import { GARMENT_TYPE_ENTRIES_2 } from './garment-type-entries-2';
import { GARMENT_TYPE_ENTRIES_3 } from './garment-type-entries-3';
import { GARMENT_TYPE_ENTRIES_4 } from './garment-type-entries-4';

export type { GarmentCategoryId, GarmentType } from './garment-type-model';

/** EVERY record, including the flagged 'other' bucket — data-layer use only. */
export const GARMENT_TYPES: GarmentType[] = [
  ...GARMENT_TYPE_ENTRIES_1,
  ...GARMENT_TYPE_ENTRIES_2,
  ...GARMENT_TYPE_ENTRIES_3,
  ...GARMENT_TYPE_ENTRIES_4,
];

/** The ELEVEN category ids the Index shows — canonical order, no 'other'. */
export const INDEX_CATEGORY_IDS: GarmentCategoryId[] = CATEGORY_ORDER.filter(
  (id) => id !== 'other',
) as GarmentCategoryId[];

/** True when a type may appear in Index navigation / plate views. */
export function isIndexedGarmentType(type: GarmentType): boolean {
  return type.category !== 'other';
}

/** The visible canon — what every Index surface must consume. In the app's
 * ONE canonical category order (category-order.ts). */
export const INDEX_GARMENT_TYPES: GarmentType[] = sortByCategoryOrder(
  GARMENT_TYPES.filter(isIndexedGarmentType),
  (t) => t.category,
);

/** Alias kept deliberately verb-shaped for call sites that read better
 * with a function — same data as INDEX_GARMENT_TYPES. */
export function visibleGarmentTypes(): GarmentType[] {
  return INDEX_GARMENT_TYPES;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const BY_ID = new Map<string, GarmentType>(GARMENT_TYPES.map((t) => [t.id, t]));

export function findGarmentType(id: string | null | undefined): GarmentType | null {
  return BY_ID.get((id || '').trim().toLowerCase()) || null;
}

/** All visible types in one category, e.g. 'outerwear'. */
export function garmentTypesForCategory(category: GarmentCategoryId): GarmentType[] {
  if (category === 'other') return [];
  return INDEX_GARMENT_TYPES.filter((t) => t.category === category);
}

/** Visible types whose PRIMARY band is the given one. */
export function garmentTypesForBand(band: TemperatureBand): GarmentType[] {
  return INDEX_GARMENT_TYPES.filter((t) => t.band === band);
}

/** Visible types whose reach includes the given register. */
export function garmentTypesForRegister(register: Register): GarmentType[] {
  return INDEX_GARMENT_TYPES.filter((t) => t.reach.includes(register));
}

/** Visible types a given maker (any pool name, case-insensitive) makes. */
export function garmentTypesForMaker(makerName: string): GarmentType[] {
  const q = (makerName || '').trim().toLowerCase();
  if (!q) return [];
  return INDEX_GARMENT_TYPES.filter((t) => t.makers.some((m) => m.toLowerCase() === q));
}

/** Visible-type counts per category, for plate headers and sanity checks. */
export function garmentTypeCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of INDEX_CATEGORY_IDS) counts[id] = 0;
  for (const t of INDEX_GARMENT_TYPES) counts[t.category] = (counts[t.category] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Integrity — cheap dev-time checks Task 2 screens can assert against.
// ---------------------------------------------------------------------------

/** Duplicate ids across the four entry files (should always be []). */
export function duplicateGarmentTypeIds(): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const t of GARMENT_TYPES) {
    if (seen.has(t.id)) dupes.add(t.id);
    seen.add(t.id);
  }
  return [...dupes];
}

/** Total record count (visible + flagged 'other'). */
export const GARMENT_TYPE_COUNT = GARMENT_TYPES.length;
