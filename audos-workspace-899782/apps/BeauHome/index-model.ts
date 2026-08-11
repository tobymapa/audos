/**
 * THE INDEX · MODEL — the FIT layer behind all eleven Index screens
 * (Ethaion Ledger Corrected · 29b): everything computed per reader is
 * arithmetic over their record — no model call, same inputs same output.
 *
 *  · FIX — the taxonomy (garment-types.ts + garment-type-runs.ts), each
 *    type's span, register reach, cuts, colours and makers. Identical for
 *    every reader.
 *  · FIT — here: the reader's climate curve (8 integers summing ~365, from
 *    the dossier via the Task-1 climate pipeline, with the stock-curve and
 *    unweighted rungs of the ladder), day counts per band/span, the verdict
 *    column, owned marks and swatches, gap flags, muted registers.
 *  · GEN — none in this file, deliberately. Generated slots live in the
 *    screens as abstaining elements (index-chrome.tsx GenSlot).
 */
import { useEffect, useMemo, useState } from 'react';
import { swatchFor, type WardrobePiece } from './profile-data';
import { peekBeauAssessment } from './beau-assessment';
import { GARMENT_RUNS, type GarmentRun } from './garment-type-runs';
import { INDEX_CATEGORY_IDS, INDEX_GARMENT_TYPES, findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { TEMPERATURE_BANDS, TEMPERATURE_BAND_ORDER, temperatureBandRank, type TemperatureBand } from './temperature-bands';
import { STOCK_CLIMATE_CURVES } from './climate-pipeline';
import { DOSSIER_DETAILS_EVENT, fetchDossierDetails } from './dossier-details';
import { COVERAGE_PREFS_EVENT, MUTED_STORE_KEY, fetchCoveragePrefs, fetchRegisterFrequencies, loadLocalJson } from './coverage-prefs';
import type { Register } from './brands';

// ---------------------------------------------------------------------------
// Category display + banding rules (27b: accessories and bags carry no band).
// ---------------------------------------------------------------------------

export const CATEGORY_NAMES: Record<string, string> = {
  tops: 'Tops',
  knitwear: 'Knitwear',
  sweatshirts: 'Sweatshirts',
  outerwear: 'Outerwear',
  bottoms: 'Trousers & bottoms',
  formalwear: 'Formalwear',
  'base-layers': 'Base layers',
  shoes: 'Shoes',
  accessories: 'Accessories',
  bags: 'Bags',
  hats: 'Hats & headwear',
};

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] || id;
}

/** Categories the Index declines to band — judged by material and place. */
export const UNBANDED_CATEGORIES: GarmentCategoryId[] = ['accessories', 'bags'];

export function isBandedCategory(id: GarmentCategoryId): boolean {
  return !UNBANDED_CATEGORIES.includes(id);
}

// ---------------------------------------------------------------------------
// Spans — FIX. A type centres in its primary band and reaches a little each
// side; the span in °C drives the plate ruler, the ruler's muted repeats and
// the day-count arithmetic.
// ---------------------------------------------------------------------------

export interface TempSpan {
  lo: number;
  hi: number;
}

const BAND_BOUNDS: Record<TemperatureBand, TempSpan> = {
  'below-0': { lo: -10, hi: 0 },
  '0-5': { lo: 0, hi: 5 },
  '5-10': { lo: 5, hi: 10 },
  '10-15': { lo: 10, hi: 15 },
  '15-20': { lo: 15, hi: 20 },
  '20-25': { lo: 20, hi: 25 },
  '25-30': { lo: 25, hi: 30 },
  'above-30': { lo: 30, hi: 36 },
};

export const RULER_LO = -10;
export const RULER_HI = 36;

/** The span one type answers: its centre band widened by three degrees each
 * side, clamped to the ruler. Null for the unbanded categories. */
export function spanOf(type: GarmentType): TempSpan | null {
  if (!isBandedCategory(type.category)) return null;
  const bounds = BAND_BOUNDS[type.band];
  return { lo: Math.max(RULER_LO, bounds.lo - 3), hi: Math.min(RULER_HI, bounds.hi + 3) };
}

export function spanLabel(span: TempSpan | null): string {
  if (!span) return '—';
  return `${span.lo}–${span.hi}°`;
}

/** The bands a span reaches into, beyond its centre — the ruler's muted
 * repeats (27a: “the bands at the edge of its reach carry it muted”). */
export function reachBands(type: GarmentType): TemperatureBand[] {
  const span = spanOf(type);
  if (!span) return [];
  return TEMPERATURE_BAND_ORDER.filter((band) => {
    if (band === type.band) return false;
    const b = BAND_BOUNDS[band];
    return Math.min(span.hi, b.hi) - Math.max(span.lo, b.lo) >= 2;
  });
}

// ---------------------------------------------------------------------------
// The climate curve — FIT. Eight integers, coldest first, from the dossier
// (Task-1 pipeline). Ladder: stored curve → stock curve from the climate
// enum → unweighted (bands still order and name; they stop being weighted).
// ---------------------------------------------------------------------------

export interface IndexClimate {
  city: string | null;
  /** Eight day-counts, coldest band first — null when unweighted. */
  bands: number[] | null;
  weighted: boolean;
}

export const UNWEIGHTED_CLIMATE: IndexClimate = { city: null, bands: null, weighted: false };

export function useIndexClimate(): IndexClimate {
  const [climate, setClimate] = useState<IndexClimate>(UNWEIGHTED_CLIMATE);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchDossierDetails()
        .then((details) => {
          if (!alive) return;
          if (details.climateBands && details.climateBands.length === 8) {
            setClimate({ city: details.city, bands: details.climateBands, weighted: true });
            return;
          }
          const stock = details.climate ? STOCK_CLIMATE_CURVES[details.climate] : null;
          if (stock) {
            setClimate({ city: details.city, bands: [...stock], weighted: true });
            return;
          }
          setClimate({ city: details.city, bands: null, weighted: false });
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(DOSSIER_DETAILS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(DOSSIER_DETAILS_EVENT, load);
    };
  }, []);
  return climate;
}

/** Days a year the city spends in one band — null when unweighted. */
export function daysInBand(climate: IndexClimate, band: TemperatureBand): number | null {
  if (!climate.bands) return null;
  return climate.bands[temperatureBandRank(band)] ?? null;
}

/** Days a year a span answers — the sum of the bands it overlaps. */
export function daysInSpan(climate: IndexClimate, span: TempSpan | null): number | null {
  if (!climate.bands || !span) return null;
  let days = 0;
  for (const def of TEMPERATURE_BANDS) {
    const b = BAND_BOUNDS[def.id];
    const overlap = Math.min(span.hi, b.hi) - Math.max(span.lo, b.lo);
    if (overlap <= 0) continue;
    const width = b.hi - b.lo;
    days += (climate.bands[temperatureBandRank(def.id)] || 0) * Math.min(1, overlap / width);
  }
  return Math.round(days);
}

// ---------------------------------------------------------------------------
// The verdict — FIT. One rule applied to every banded type; never a model.
// ---------------------------------------------------------------------------

export type IndexVerdict = 'essential' | 'works' | 'niche' | 'wrong tool' | null;

export const VERDICT_TEXT: Record<Exclude<IndexVerdict, null>, string> = {
  essential: 'Essential',
  works: 'Works',
  niche: 'Niche',
  'wrong tool': 'Wrong tool',
};

export function verdictFor(climate: IndexClimate, type: GarmentType, gap: boolean): IndexVerdict {
  const span = spanOf(type);
  if (!span) return null; // unbanded — judged by material and place
  const days = daysInSpan(climate, span);
  if (days == null) return null; // unweighted — the second column is withheld
  if (gap) return 'essential';
  if (days < 18) return 'wrong tool';
  if (days < 38) return 'niche';
  if (days >= 85) return 'essential';
  return 'works';
}

// ---------------------------------------------------------------------------
// Ownership + gaps — FIT, from the ledger and the last stored assessment.
// ---------------------------------------------------------------------------

function keywordsOf(type: GarmentType): string[] {
  const name = type.name.toLowerCase();
  const kws = new Set<string>([name]);
  const noParen = name.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (noParen) kws.add(noParen);
  kws.add(type.id.replace(/-/g, ' '));
  // The head noun run — lets “navy wool overcoat” claim “Wool Overcoat”.
  const words = noParen.split(' ');
  if (words.length > 2) kws.add(words.slice(-2).join(' '));
  return [...kws].filter((k) => k.length >= 4);
}

let keywordCache: Array<{ id: string; kws: string[] }> | null = null;
function allKeywords(): Array<{ id: string; kws: string[] }> {
  if (!keywordCache) keywordCache = INDEX_GARMENT_TYPES.map((t) => ({ id: t.id, kws: keywordsOf(t) }));
  return keywordCache;
}

export interface IndexOwnership {
  /** typeId → up to four swatch colours from the reader's own pieces. */
  swatches: Map<string, string[]>;
  /** typeId → the maker name of the first owned piece. */
  brands: Map<string, string>;
  /** typeId → the owned piece names, the reader's own words. */
  names: Map<string, string[]>;
}

export function computeOwnership(pieces: WardrobePiece[]): IndexOwnership {
  const flat = allKeywords();
  const swatches = new Map<string, string[]>();
  const brands = new Map<string, string>();
  const names = new Map<string, string[]>();
  for (const piece of pieces) {
    const text = `${piece.name || ''} ${piece.slot || ''} ${piece.category || ''}`.toLowerCase();
    if (!text.trim()) continue;
    let bestId: string | null = null;
    let bestLen = 0;
    for (const { id, kws } of flat) {
      for (const kw of kws) {
        if (kw.length > bestLen && text.includes(kw)) {
          bestId = id;
          bestLen = kw.length;
        }
      }
    }
    if (!bestId) continue;
    const sw = swatches.get(bestId) || [];
    for (const c of piece.colors || []) {
      const s = swatchFor(c);
      if (s && sw.length < 4 && !sw.includes(s)) sw.push(s);
    }
    if (sw.length === 0) sw.push('#d5d3cd');
    swatches.set(bestId, sw);
    const brand = (piece.brand || '').trim();
    if (brand && !brands.has(bestId)) brands.set(bestId, brand);
    const owned = names.get(bestId) || [];
    if (piece.name && owned.length < 4) owned.push(piece.name);
    names.set(bestId, owned);
  }
  return { swatches, brands, names };
}

/** The gaps the board names — read from the LAST stored assessment (never
 * triggers a model call), each claiming its best type, capped at four. */
export function computeGaps(owned: Map<string, string[]>): Map<string, number> {
  const ranks = new Map<string, number>();
  const peeked = peekBeauAssessment();
  if (!peeked) return ranks;
  const flat = allKeywords();
  for (const rec of peeked.assessment.recommendations || []) {
    const text = `${(rec as any).pieceName || ''} ${(rec as any).subType || ''} ${(rec as any).category || ''}`.toLowerCase();
    if (!text.trim()) continue;
    let bestId: string | null = null;
    let bestLen = 0;
    for (const { id, kws } of flat) {
      if (owned.has(id) || ranks.has(id)) continue;
      for (const kw of kws) {
        if (kw.length > bestLen && text.includes(kw)) {
          bestId = id;
          bestLen = kw.length;
        }
      }
    }
    if (bestId) ranks.set(bestId, ranks.size + 1);
    if (ranks.size >= 4) break;
  }
  return ranks;
}

// ---------------------------------------------------------------------------
// The six registers — the field's rows (28a), most dressed first.
// ---------------------------------------------------------------------------

export const FIELD_REGISTERS: Register[] = ['Black-Tie', 'Formal', 'Business', 'Smart-Casual', 'Casual', 'Outdoor-Work'];

export const FIELD_REGISTER_LABELS: Record<string, string> = {
  'Black-Tie': 'Black tie',
  Formal: 'Formal',
  Business: 'Business',
  'Smart-Casual': 'Smart casual',
  Casual: 'Casual',
  'Outdoor-Work': 'Outdoor & work',
};

/** The one register a type answers first — the most dressed of its reach. */
export function primaryRegister(type: GarmentType): Register {
  for (const reg of FIELD_REGISTERS) if (type.reach.includes(reg)) return reg;
  return 'Casual';
}

/** Muted registers, merged from the coverage prefs (the coverage map's own
 * three ids) — kept live on the same event that surface uses. */
export function useMutedRegisters(): Set<Register> {
  const [muted, setMuted] = useState<string[]>(() => loadLocalJson<string[]>(MUTED_STORE_KEY, []));
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchCoveragePrefs()
        .then((prefs) => {
          if (alive) setMuted(prefs.muted);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(COVERAGE_PREFS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(COVERAGE_PREFS_EVENT, load);
    };
  }, []);
  return useMemo(() => {
    const map: Record<string, Register> = { casual: 'Casual', 'smart-casual': 'Smart-Casual', formal: 'Formal', business: 'Business', 'black-tie': 'Black-Tie', 'outdoor-work': 'Outdoor-Work' };
    return new Set(muted.map((id) => map[id]).filter(Boolean) as Register[]);
  }, [muted]);
}

/** Days a year each register runs — from the onboarding frequencies. */
export function useRegisterDays(): Record<string, number | null> {
  const [freqs, setFreqs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRegisterFrequencies()
        .then((f) => {
          if (alive) setFreqs(f);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(COVERAGE_PREFS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(COVERAGE_PREFS_EVENT, load);
    };
  }, []);
  return useMemo(() => {
    const DAYS: Record<string, number> = { 'most-days': 156, weekly: 52, rarely: 12, never: 0 };
    const out: Record<string, number | null> = {};
    const keyOf: Record<string, string> = { 'Black-Tie': 'black-tie', Formal: 'formal', Business: 'business', 'Smart-Casual': 'smart-casual', Casual: 'casual', 'Outdoor-Work': 'outdoor-work' };
    for (const reg of FIELD_REGISTERS) {
      const raw = freqs[keyOf[reg]];
      out[reg] = raw != null && DAYS[raw] != null ? DAYS[raw] : null;
    }
    return out;
  }, [freqs]);
}

// ---------------------------------------------------------------------------
// The assembled model — one hook the screens share.
// ---------------------------------------------------------------------------

export interface IndexCategoryModel {
  id: GarmentCategoryId;
  name: string;
  runs: GarmentRun[];
  total: number;
  ownedCount: number;
  banded: boolean;
}

export interface IndexModel {
  categories: IndexCategoryModel[];
  typeTotal: number;
  ownedTotal: number;
  ownership: IndexOwnership;
  gaps: Map<string, number>;
  climate: IndexClimate;
}

export function useIndexModel(pieces: WardrobePiece[]): IndexModel {
  const climate = useIndexClimate();
  const ownership = useMemo(() => computeOwnership(pieces), [pieces]);
  const gaps = useMemo(() => computeGaps(ownership.swatches), [ownership]);
  const categories = useMemo<IndexCategoryModel[]>(
    () =>
      INDEX_CATEGORY_IDS.map((id) => {
        const runs = GARMENT_RUNS[id as Exclude<GarmentCategoryId, 'other'>] || [];
        const ids = runs.flatMap((r) => r.typeIds);
        return {
          id,
          name: categoryName(id),
          runs,
          total: ids.length,
          ownedCount: ids.filter((t) => ownership.swatches.has(t)).length,
          banded: isBandedCategory(id),
        };
      }),
    [ownership],
  );
  const typeTotal = useMemo(() => categories.reduce((n, c) => n + c.total, 0), [categories]);
  const ownedTotal = ownership.swatches.size;
  return { categories, typeTotal, ownedTotal, ownership, gaps, climate };
}

// ---------------------------------------------------------------------------
// Neighbours — FIT: queried from the band, never authored (24a field 7).
// ---------------------------------------------------------------------------

export function neighboursOf(type: GarmentType, limit = 5): GarmentType[] {
  const span = spanOf(type);
  if (!span) return [];
  return INDEX_GARMENT_TYPES.filter((t) => {
    if (t.id === type.id || !isBandedCategory(t.category)) return false;
    if (t.band !== type.band) return false;
    return true;
  })
    .sort((a, b) => {
      // Same-category siblings first, then the reach the reader shares.
      const sameA = a.category === type.category ? 0 : 1;
      const sameB = b.category === type.category ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      const regA = a.reach.some((r) => type.reach.includes(r)) ? 0 : 1;
      const regB = b.reach.some((r) => type.reach.includes(r)) ? 0 : 1;
      return regA - regB;
    })
    .slice(0, limit);
}

export { findGarmentType };
