/**
 * THE EDIT · THE MODEL — the arithmetic behind the tab, rebuilt to the
 * founder's reference design (“Your year, and what it is missing”).
 *
 * THE PAGE IS A YEAR, NOT A WARDROBE. Every day of the reader's year falls
 * in one of the eight temperature bands the whole app keys on
 * (temperature-bands.ts, the same eight The Index bands its pieces by), and
 * his climate curve says how many days a year fall in each. THE MAP is
 * therefore CATEGORIES × BANDS: each cell says how many of his own pieces
 * can answer that category in that band.
 *
 * FIVE CELL STATES, the design's own:
 *   · DEEP    (four or more) — solid walnut. Nothing to buy; something to
 *     take out.
 *   · COVERED (two or three) — the mid ink.
 *   · THIN    (one)          — the pale ink: one piece doing all the work.
 *   · GAP     (none)         — the hatched gold. The page goes blank.
 *   · N/A                    — the category has no business in that band
 *     (a sweatshirt is not a 30° garment). Never a gap, never clickable.
 *
 * A BAND IS SHORT when any of the FIVE critical categories — tops,
 * knitwear, outerwear, trousers and shoes, the ones a man cannot leave the
 * house without — has a gap in it. That single rule drives the headline
 * percentage, the four figures, the tint on the band heads and the day bar:
 * “261 days answered · 104 short” is arithmetic over his own climate, not an
 * opinion.
 *
 * BY CATEGORY reads the same wardrobe the other way: the eleven categories,
 * each unfolding into its sub-categories (the garment RUNS,
 * garment-type-runs.ts) with Covered · Thin · Gap against them.
 *
 * Beau's own reading (edit-coverage-ai.ts) writes the words on top of this:
 * which gaps matter, in what order, and why. The arithmetic here is what he
 * reasons over, and it is also the fallback — the page is complete and
 * honest whether or not a model call lands.
 */
import { GARMENT_RUNS, runOfType } from './garment-type-runs';
import {
  INDEX_CATEGORY_IDS,
  INDEX_GARMENT_TYPES,
  findGarmentType,
  type GarmentCategoryId,
  type GarmentType,
} from './garment-types';
import {
  categoryName,
  computeCategoryBandCounts,
  daysInBand,
  matchGarmentTypeId,
  pieceIndexCategory,
  type IndexClimate,
} from './index-model';
import { type WardrobePiece } from './profile-data';
import {
  TEMPERATURE_BANDS,
  TEMPERATURE_BAND_ORDER,
  temperatureBandRank,
  type TemperatureBand,
} from './temperature-bands';
import { warmthFor, type PieceWarmth } from './warmth-model';

// ---------------------------------------------------------------------------
// The shading — the design's own scale. One ink at four weights plus the
// hatched gold; nothing here is a new colour.
// ---------------------------------------------------------------------------

export const SHADE_DEEP = '#241a12';
export const SHADE_COVERED = 'rgba(59,43,29,0.42)';
export const SHADE_THIN = 'rgba(59,43,29,0.16)';
export const HATCH_GAP =
  'repeating-linear-gradient(45deg,rgba(168,113,44,0.5) 0 3px,rgba(251,248,241,0) 3px 6px)';
export const HATCH_GAP_ON_PAGE =
  'repeating-linear-gradient(45deg,rgba(168,113,44,0.5) 0 3px,rgba(239,231,217,0) 3px 6px)';

// ---------------------------------------------------------------------------
// The bands
// ---------------------------------------------------------------------------

/** The compact head the map's columns carry — “<0°”, “10–15°”, “30°+”. */
export function shortBandLabel(band: TemperatureBand): string {
  const def = TEMPERATURE_BANDS[temperatureBandRank(band)];
  if (!def) return band;
  if (def.tempMin == null) return `<${def.tempMax}\u00b0`;
  if (def.tempMax == null) return `${def.tempMin}\u00b0+`;
  return `${def.tempMin}\u2013${def.tempMax}\u00b0`;
}

/** The bounds each band spans — the same ones index-model measures against. */
const BAND_BOUNDS: Record<TemperatureBand, { lo: number; hi: number }> = {
  'below-0': { lo: -10, hi: 0 },
  '0-5': { lo: 0, hi: 5 },
  '5-10': { lo: 5, hi: 10 },
  '10-15': { lo: 10, hi: 15 },
  '15-20': { lo: 15, hi: 20 },
  '20-25': { lo: 20, hi: 25 },
  '25-30': { lo: 25, hi: 30 },
  'above-30': { lo: 30, hi: 36 },
};

// ---------------------------------------------------------------------------
// The map's rows — the app's ONE canonical eleven-category set
// (category-order.ts via INDEX_CATEGORY_IDS), so The Edit reads the same
// categories as every other tab. A category with no types in a band simply
// shows that cell as not-applicable.
// ---------------------------------------------------------------------------

export const RULER_CATEGORY_IDS: GarmentCategoryId[] = [...INDEX_CATEGORY_IDS];

/** The five a man cannot leave the house without. A band with a gap in any
 * of them is a day that goes wrong. */
export const CRITICAL_CATEGORY_IDS = new Set<string>([
  'tops',
  'knitwear',
  'outerwear',
  'bottoms',
  'shoes',
]);

export type CellState = 'na' | 'gap' | 'thin' | 'ok' | 'deep';

export function cellStateFor(count: number, applicable: boolean): CellState {
  if (!applicable) return 'na';
  if (count <= 0) return 'gap';
  if (count === 1) return 'thin';
  return count >= 4 ? 'deep' : 'ok';
}

/** The types one category holds in one band — an empty list is what makes a
 * cell not-applicable. */
function typesIn(categoryId: GarmentCategoryId, band: TemperatureBand): GarmentType[] {
  return INDEX_GARMENT_TYPES.filter((t) => t.category === categoryId && t.band === band);
}

export interface RulerCell {
  key: string;
  categoryId: GarmentCategoryId;
  categoryName: string;
  band: TemperatureBand;
  bandIndex: number;
  bandLabel: string;
  /** Days a year his city spends in the band — null when his climate is
   * unweighted. */
  days: number | null;
  count: number;
  state: CellState;
  /** The sub-category the cell's own way out opens on. */
  subCategory: string | null;
  typeId: string | null;
}

export interface RulerRow {
  id: GarmentCategoryId;
  name: string;
  /** The runs the category holds, read as one quiet line. */
  note: string;
  cells: RulerCell[];
  hasGap: boolean;
}

export interface RulerBand {
  id: TemperatureBand;
  label: string;
  days: number | null;
  /** How many critical categories are empty here. */
  short: number;
}

export interface RulerModel {
  bands: RulerBand[];
  rows: RulerRow[];
  /** Days a year with every critical layer present. */
  answeredDays: number;
  shortDays: number;
  /** Days carried by a single piece somewhere critical. */
  thinDays: number;
  totalDays: number;
  pct: number;
  /** False when no climate is on file — the day figures are withheld rather
   * than invented. */
  hasDays: boolean;
}

/** The run one category's band belongs to — what a cell's “Beau's picks”
 * opens on. */
function runForCell(categoryId: GarmentCategoryId, band: TemperatureBand): { label: string; typeId: string } | null {
  const types = typesIn(categoryId, band);
  for (const type of types) {
    const run = runOfType(type.id);
    if (run) return { label: run.run.label, typeId: type.id };
  }
  return null;
}

export function buildRuler(
  pieces: WardrobePiece[],
  warmth: Record<number, PieceWarmth>,
  materials: Record<number, string>,
  climate: IndexClimate,
): RulerModel {
  const counts: Record<string, Record<string, number>> = {};
  for (const id of RULER_CATEGORY_IDS) {
    counts[id] = computeCategoryBandCounts(pieces, id, warmth, materials).counts;
  }

  const rows: RulerRow[] = RULER_CATEGORY_IDS.map((id) => {
    const runs = GARMENT_RUNS[id as Exclude<GarmentCategoryId, 'other'>] || [];
    const cells: RulerCell[] = TEMPERATURE_BAND_ORDER.map((band, i) => {
      const applicable = typesIn(id, band).length > 0;
      const count = counts[id][band] || 0;
      const run = runForCell(id, band);
      return {
        key: `${id}|${i}`,
        categoryId: id,
        categoryName: categoryName(id),
        band,
        bandIndex: i,
        bandLabel: shortBandLabel(band),
        days: daysInBand(climate, band),
        count: applicable ? count : 0,
        state: cellStateFor(count, applicable),
        subCategory: run?.label || null,
        typeId: run?.typeId || null,
      };
    });
    return {
      id,
      name: categoryName(id),
      note: runs
        .slice(0, 3)
        .map((r) => r.label.toLowerCase())
        .join(', '),
      cells,
      hasGap: cells.some((c) => c.state === 'gap'),
    };
  });

  const bands: RulerBand[] = TEMPERATURE_BAND_ORDER.map((band, i) => ({
    id: band,
    label: shortBandLabel(band),
    days: daysInBand(climate, band),
    short: rows.filter((r) => CRITICAL_CATEGORY_IDS.has(r.id) && r.cells[i].state === 'gap').length,
  }));

  const hasDays = bands.every((b) => b.days != null);
  let answeredDays = 0;
  let shortDays = 0;
  let thinDays = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const days = bands[i].days || 0;
    if (bands[i].short > 0) shortDays += days;
    else answeredDays += days;
    const thin = rows.filter((r) => CRITICAL_CATEGORY_IDS.has(r.id) && r.cells[i].state === 'thin').length;
    if (thin > 0) thinDays += days;
  }
  const totalDays = answeredDays + shortDays;

  return {
    bands,
    rows,
    answeredDays,
    shortDays,
    thinDays,
    totalDays,
    pct: totalDays > 0 ? Math.round((answeredDays / totalDays) * 100) : 0,
    hasDays,
  };
}

/** The pieces of one category whose own temperature range reaches one band —
 * what the detail panel lists under “what you own here”. */
export function piecesInCell(
  pieces: WardrobePiece[],
  categoryId: string,
  band: TemperatureBand,
  warmth: Record<number, PieceWarmth>,
  materials: Record<number, string>,
): WardrobePiece[] {
  const bounds = BAND_BOUNDS[band];
  const out: WardrobePiece[] = [];
  for (const piece of pieces) {
    if (pieceIndexCategory(piece) !== categoryId) continue;
    const read = warmthFor(piece, materials, warmth);
    if (read.warmth_level === 'all-weather') continue;
    const lo = read.min_comfortable_temp_c;
    const hi = read.max_comfortable_temp_c;
    if (Math.min(hi, bounds.hi) - Math.max(lo, bounds.lo) >= 2) out.push(piece);
  }
  return out;
}

/** One piece's own range, as the detail list states it. */
export function pieceTemperatureLabel(
  piece: WardrobePiece,
  materials: Record<number, string>,
  warmth: Record<number, PieceWarmth>,
): string {
  const read = warmthFor(piece, materials, warmth);
  if (read.warmth_level === 'all-weather') return 'any weather';
  return `${read.min_comfortable_temp_c}\u2013${read.max_comfortable_temp_c}\u00b0`;
}

// ---------------------------------------------------------------------------
// BY CATEGORY — the eleven categories, each unfolding into its runs.
// ---------------------------------------------------------------------------

export type CoverageTier = 'covered' | 'thin' | 'gap';

export const TIER_LABEL: Record<CoverageTier, string> = {
  covered: 'Covered',
  thin: 'Thin',
  gap: 'Gap',
};

/** Three pieces is the floor for “covered” — below it he has something, but
 * not a choice. */
export const COVERED_FLOOR = 3;

export function tierFor(count: number): CoverageTier {
  if (count <= 0) return 'gap';
  return count >= COVERED_FLOOR ? 'covered' : 'thin';
}

export interface EditSubRow {
  key: string;
  /** The run's label — “Overcoats”, “Suede boots”. */
  label: string;
  /** The run's own FIX line — the fallback when Beau has not written one. */
  note: string;
  categoryId: GarmentCategoryId;
  categoryName: string;
  subCategory: string;
  typeId: string | null;
  /** The stretch of the ruler it answers — “8–16°”, “all year”. */
  bandLabel: string;
  /** Days a year those bands hold — null when the climate is unweighted. */
  days: number | null;
  count: number;
  tier: CoverageTier;
  ownedNames: string[];
}

export interface EditCategoryRow {
  id: GarmentCategoryId;
  name: string;
  owned: number;
  covered: number;
  thin: number;
  gap: number;
  rows: EditSubRow[];
}

/** `${categoryId}\u241f${run label}`. */
export function subKey(categoryId: string, label: string): string {
  return `${categoryId}\u241f${label}`;
}

/** The bands a run's types reach, and the stretch of the ruler they read as. */
function runSpan(typeIds: string[]): { bands: TemperatureBand[]; label: string } {
  const bands = new Set<TemperatureBand>();
  for (const id of typeIds) {
    const type = findGarmentType(id);
    if (type) bands.add(type.band);
  }
  const ordered = TEMPERATURE_BAND_ORDER.filter((b) => bands.has(b));
  if (ordered.length === 0) return { bands: [], label: 'all year' };
  if (ordered.length >= 6) return { bands: ordered, label: 'all year' };
  const lo = BAND_BOUNDS[ordered[0]].lo;
  const hi = BAND_BOUNDS[ordered[ordered.length - 1]].hi;
  return { bands: ordered, label: `${Math.max(lo, -5)}\u2013${hi}\u00b0` };
}

export interface LedgerIndex {
  byRun: Map<string, WardrobePiece[]>;
  byCategory: Map<string, WardrobePiece[]>;
}

export function readLedger(pieces: WardrobePiece[]): LedgerIndex {
  const byRun = new Map<string, WardrobePiece[]>();
  const byCategory = new Map<string, WardrobePiece[]>();
  for (const piece of pieces) {
    const category = pieceIndexCategory(piece);
    if (category) {
      const held = byCategory.get(category) || [];
      held.push(piece);
      byCategory.set(category, held);
    }
    const typeId = matchGarmentTypeId(piece);
    const placed = typeId ? runOfType(typeId) : null;
    if (!placed) continue;
    const key = subKey(placed.categoryId, placed.run.label);
    const list = byRun.get(key) || [];
    list.push(piece);
    byRun.set(key, list);
  }
  return { byRun, byCategory };
}

export function buildCategoryRows(ledger: LedgerIndex, climate: IndexClimate): EditCategoryRow[] {
  return INDEX_CATEGORY_IDS.map((id) => {
    const runs = GARMENT_RUNS[id as Exclude<GarmentCategoryId, 'other'>] || [];
    const rows: EditSubRow[] = runs.map((run) => {
      const held = ledger.byRun.get(subKey(id, run.label)) || [];
      const span = runSpan(run.typeIds);
      const days = climate.bands
        ? span.bands.reduce((total, band) => total + (daysInBand(climate, band) || 0), 0)
        : null;
      return {
        key: subKey(id, run.label),
        label: run.label,
        note: run.note,
        categoryId: id,
        categoryName: categoryName(id),
        subCategory: run.label,
        typeId: run.typeIds[0] || null,
        bandLabel: span.label,
        days,
        count: held.length,
        tier: tierFor(held.length),
        ownedNames: held
          .map((p) => (p.name || '').trim())
          .filter(Boolean)
          .slice(0, 4),
      };
    });
    return {
      id,
      name: categoryName(id),
      owned: (ledger.byCategory.get(id) || []).length,
      covered: rows.filter((r) => r.tier === 'covered').length,
      thin: rows.filter((r) => r.tier === 'thin').length,
      gap: rows.filter((r) => r.tier === 'gap').length,
      rows,
    };
  });
}

// ---------------------------------------------------------------------------
// THE GAP ORDER — what Beau would close first when he has not said.
// ---------------------------------------------------------------------------

const CATEGORY_CENTRALITY: Record<string, number> = {
  outerwear: 6,
  shoes: 6,
  bottoms: 5,
  knitwear: 4,
  tops: 4,
  'base-layers': 2,
  formalwear: 2,
  sweatshirts: 1.5,
  accessories: 1.5,
  bags: 1,
  hats: 1,
};

export function gapScore(row: EditSubRow): number {
  const centrality = CATEGORY_CENTRALITY[row.categoryId] || 1;
  const days = row.days == null ? 90 : row.days;
  return centrality * Math.max(12, days);
}

/** Every empty sub-category, the ones that cost the most days first. */
export function computeGapRows(categories: EditCategoryRow[]): EditSubRow[] {
  const gaps: EditSubRow[] = [];
  for (const category of categories) {
    for (const row of category.rows) {
      if (row.tier === 'gap') gaps.push(row);
    }
  }
  return gaps.sort((a, b) => gapScore(b) - gapScore(a));
}
