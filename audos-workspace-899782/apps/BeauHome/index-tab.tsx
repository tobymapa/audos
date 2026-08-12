/**
 * THE INDEX — deliberately blank (blank-slate reset, August 2026).
 *
 * Every layout, view, toggle and rendered element that used to live in this
 * tab has been removed on request. The tab stays registered in the nav
 * (App.tsx lazy-loads IndexTab from this file) and opens to a completely
 * empty screen — no placeholder copy, no skeleton.
 *
 * The data and reasoning layers are untouched and remain available for a
 * future rebuild:
 *   · garment-types.ts (+ garment-type-entries-1…4.ts, garment-type-runs.ts,
 *     garment-type-model.ts), temperature-bands.ts, category-order.ts
 *   · brands.ts (BRAND_DIRECTORY / BRAND_WEBSITES) and brand-reference.ts
 *   · index-model.ts (spans, ownership, climate — fed by climate-pipeline.ts
 *     and dossier-details.ts)
 *   · index-gen.tsx (Beau's generated-copy engine), index-beau-copy.ts and
 *     index-lenses.ts
 */
import type { StyleProfile, WardrobePiece } from './profile-data';

export function IndexTab(_props: { pieces: WardrobePiece[]; profile: StyleProfile | null }) {
  return null;
}
