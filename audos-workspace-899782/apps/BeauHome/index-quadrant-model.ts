/**
 * THE INDEX · QUADRANT · MODEL — the FIT arithmetic behind the quadrant
 * reading (corrections pass, screenshot 8). Three axis PAIRS, selectable
 * by a control (across, never down); the dots are pieces or makers
 * depending on which face is active. Everything here is computed from the
 * record — no model call, same inputs same output (29b). The one
 * generated element on the screen — the annotation sentence — lives in
 * index-gen.tsx and abstains like every other GEN slot.
 */
import { BRAND_DIRECTORY, PRICE_BAND_ORDER, type BrandProfile, type Register } from './brands';
import { findGarmentType, garmentTypesForMaker, type GarmentType } from './garment-types';
import { temperatureBandRank } from './temperature-bands';
import { daysInSpan, isBandedCategory, spanOf, type IndexModel } from './index-model';

export type QuadrantFace = 'pieces' | 'makers';
export type QuadrantMode = 'formality-versatility' | 'warmth-rain' | 'essential-cost';

export interface QuadrantModeDef {
  id: QuadrantMode;
  label: string;
  /** Vertical axis, high at the top. */
  yAxis: string;
  /** Horizontal axis, high at the right. */
  xAxis: string;
  /** Corner labels — [top-left, top-right, bottom-left, bottom-right]. */
  corners: [string, string, string, string];
  /** The FIX one-paragraph description of what this pairing reveals. */
  blurb: string;
}

export const QUADRANT_MODES: QuadrantModeDef[] = [
  {
    id: 'formality-versatility',
    label: 'Formality × Versatility',
    yAxis: 'Formality',
    xAxis: 'Versatility',
    corners: ['Dressed, single-purpose', 'Dressed & versatile', 'Easy, single-purpose', 'Easy & versatile'],
    blurb:
      'How dressed a thing is, against how many registers it genuinely carries. The top-right corner is where a wardrobe earns its keep — pieces that dress up without refusing an ordinary day.',
  },
  {
    id: 'warmth-rain',
    label: 'Warmth × Rain',
    yAxis: 'Warmth',
    xAxis: 'Rain-readiness',
    corners: ['Warm, fair-weather', 'Warm & weatherproof', 'Light, fair-weather', 'Light & weatherproof'],
    blurb:
      'What a thing does against actual weather: the warmth its band buys, against how it takes rain — read from cloth and construction. Accessories and bags carry no band, so they sit this reading out.',
  },
  {
    id: 'essential-cost',
    label: 'Essentialness × Cost',
    yAxis: 'Essentialness',
    xAxis: 'Cost',
    corners: ['Essential & affordable', 'Essential — an investment', 'Niche & cheap', 'Niche & dear — be sure'],
    blurb:
      'How many of your days a thing actually answers, against what the makers who cut it well tend to charge. The top-left is where to spend first; the bottom-right is where to be certain before you do.',
  },
];

export function quadrantMode(id: QuadrantMode): QuadrantModeDef {
  return QUADRANT_MODES.find((m) => m.id === id) || QUADRANT_MODES[0];
}

// ---------------------------------------------------------------------------
// Axis metrics — every one arithmetic over the FIX record (and the FIT
// climate curve where the axis is day-weighted). All normalised 0..1.
// ---------------------------------------------------------------------------

const REGISTER_RANK: Record<Register, number> = {
  'Black-Tie': 1,
  Formal: 0.85,
  Business: 0.68,
  'Smart-Casual': 0.45,
  Casual: 0.25,
  'Outdoor-Work': 0.1,
};

function formalityOfRegisters(regs: Register[]): number {
  let best = 0.25;
  for (const r of regs) best = Math.max(best, REGISTER_RANK[r] ?? 0.25);
  return best;
}

/** Rain-readiness — deterministic string work over the FIX record: cloth
 * and construction named in the type's own name. */
const RAIN_HIGH = ['rain', 'waxed', 'mackintosh', 'mac ', 'rubberised', 'anorak', 'cagoule', 'sou-wester', 'sou\u2019wester', 'wellington', 'duck boot', 'deck boot', 'storm', 'shell', 'sailing', 'fishtail', 'snorkel', 'trench', 'parka', 'oil'];
const RAIN_LOW = ['suede', 'linen', 'espadrille', 'canvas', 'seersucker', 'velvet', 'cashmere', 'silk', 'straw', 'panama', 'terry', 'loopwheel'];

function rainOfType(t: GarmentType): number {
  const text = `${t.name} ${t.id}`.toLowerCase();
  let score = t.category === 'outerwear' ? 0.42 : t.category === 'shoes' || t.category === 'hats' ? 0.36 : 0.28;
  if (RAIN_HIGH.some((k) => text.includes(k))) score += 0.45;
  if (RAIN_LOW.some((k) => text.includes(k))) score -= 0.2;
  return clamp(score);
}

function clamp(v: number): number {
  return Math.max(0.03, Math.min(0.97, v));
}

function warmthOfType(t: GarmentType): number | null {
  if (!isBandedCategory(t.category)) return null;
  // Coldest band = warmest garment: below-0 → 1, above-30 → 0.
  return clamp(1 - temperatureBandRank(t.band) / 7);
}

function versatilityOfType(t: GarmentType): number {
  return clamp((t.reach.length / 6) * 0.7 + Math.min(1, t.colours.length / 6) * 0.15 + Math.min(1, t.cuts.length / 4) * 0.15);
}

function essentialnessOfType(model: IndexModel, t: GarmentType): number | null {
  if (model.climate.weighted) {
    const days = daysInSpan(model.climate, spanOf(t));
    if (days == null) return null;
    return clamp(days / 180);
  }
  // The unweighted rung of the ladder — ordered only, by register breadth.
  return clamp(t.reach.length / 6);
}

function costOfType(t: GarmentType): number {
  const bands = t.makers
    .map((name) => BRAND_DIRECTORY.find((b) => b.brand.toLowerCase() === name.toLowerCase()))
    .filter(Boolean)
    .map((b) => PRICE_BAND_ORDER.indexOf((b as BrandProfile).priceBand) / (PRICE_BAND_ORDER.length - 1));
  if (bands.length === 0) return 0.5;
  return clamp(bands.reduce((a, b) => a + b, 0) / bands.length);
}

function warmthOfMaker(b: BrandProfile): number {
  const types = garmentTypesForMaker(b.brand).map(warmthOfType).filter((v): v is number => v != null);
  if (types.length === 0) return 0.5;
  return clamp(types.reduce((a, v) => a + v, 0) / types.length);
}

function rainOfMaker(b: BrandProfile): number {
  const types = garmentTypesForMaker(b.brand);
  const own = `${b.signaturePieces.join(' ')} ${b.materials.join(' ')}`.toLowerCase();
  let score = types.length > 0 ? types.map(rainOfType).reduce((a, v) => a + v, 0) / types.length : 0.3;
  if (RAIN_HIGH.some((k) => own.includes(k))) score += 0.25;
  return clamp(score);
}

function essentialnessOfMaker(model: IndexModel, b: BrandProfile): number {
  const types = garmentTypesForMaker(b.brand)
    .map((t) => essentialnessOfType(model, t))
    .filter((v): v is number => v != null);
  if (types.length === 0) return clamp(b.registers.length / 6);
  return clamp(types.reduce((a, v) => a + v, 0) / types.length);
}

// ---------------------------------------------------------------------------
// Dots — one per type or maker, positioned 0..1 on both axes.
// ---------------------------------------------------------------------------

export interface QuadrantDot {
  kind: QuadrantFace;
  id: string;
  label: string;
  x: number;
  y: number;
  owned: boolean;
  gap: boolean;
  note: string;
}

/** Small deterministic jitter from the id, so identical records never
 * stack perfectly — same input, same output, still FIT. */
function jitter(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.028;
}

function typeDot(model: IndexModel, t: GarmentType, mode: QuadrantMode): QuadrantDot | null {
  let x: number | null = null;
  let y: number | null = null;
  if (mode === 'formality-versatility') {
    y = formalityOfRegisters(t.reach);
    x = versatilityOfType(t);
  } else if (mode === 'warmth-rain') {
    y = warmthOfType(t);
    x = y == null ? null : rainOfType(t);
  } else {
    y = essentialnessOfType(model, t);
    x = y == null ? null : costOfType(t);
  }
  if (x == null || y == null) return null;
  return {
    kind: 'pieces',
    id: t.id,
    label: t.name,
    x: clamp(x + jitter(t.id, 7)),
    y: clamp(y + jitter(t.id, 131)),
    owned: model.ownership.swatches.has(t.id),
    gap: model.gaps.has(t.id),
    note: t.category,
  };
}

function makerDot(model: IndexModel, b: BrandProfile, mode: QuadrantMode): QuadrantDot | null {
  let x: number;
  let y: number;
  if (mode === 'formality-versatility') {
    y = formalityOfRegisters(b.registers);
    x = clamp((b.registers.length / 6) * 0.7 + Math.min(1, b.signaturePieces.length / 5) * 0.3);
  } else if (mode === 'warmth-rain') {
    y = warmthOfMaker(b);
    x = rainOfMaker(b);
  } else {
    y = essentialnessOfMaker(model, b);
    x = clamp(PRICE_BAND_ORDER.indexOf(b.priceBand) / (PRICE_BAND_ORDER.length - 1));
  }
  const ownedBy = [...model.ownership.brands.values()].some((brand) => brand.toLowerCase() === b.brand.toLowerCase());
  return {
    kind: 'makers',
    id: b.brand,
    label: b.brand,
    x: clamp(x + jitter(b.brand, 7)),
    y: clamp(y + jitter(b.brand, 131)),
    owned: ownedBy,
    gap: false,
    note: [b.city, b.country].filter(Boolean).join(', '),
  };
}

export function quadrantDots(model: IndexModel, face: QuadrantFace, mode: QuadrantMode): QuadrantDot[] {
  if (face === 'makers') {
    return BRAND_DIRECTORY.filter((b) => !model.hiddenMakers.has(b.brand.toLowerCase()))
      .map((b) => makerDot(model, b, mode))
      .filter(Boolean) as QuadrantDot[];
  }
  const types = model.categories
    .flatMap((cat) => cat.runs.flatMap((r) => r.typeIds))
    .map((id) => findGarmentType(id))
    .filter(Boolean) as GarmentType[];
  return types.map((t) => typeDot(model, t, mode)).filter(Boolean) as QuadrantDot[];
}

// ---------------------------------------------------------------------------
// Quadrant stats — the FIT figures the annotation column prints, and the
// facts block the GEN slot reasons from.
// ---------------------------------------------------------------------------

export interface QuadrantStats {
  total: number;
  ownedTotal: number;
  /** Counts by corner — [top-left, top-right, bottom-left, bottom-right]. */
  corners: [number, number, number, number];
  ownedCorners: [number, number, number, number];
  /** Whether the essentialness axis is day-weighted (a city is set). */
  weighted: boolean;
}

export function quadrantStats(dots: QuadrantDot[], weighted: boolean): QuadrantStats {
  const corners: [number, number, number, number] = [0, 0, 0, 0];
  const ownedCorners: [number, number, number, number] = [0, 0, 0, 0];
  for (const d of dots) {
    const idx = (d.y >= 0.5 ? 0 : 2) + (d.x >= 0.5 ? 1 : 0);
    corners[idx] += 1;
    if (d.owned) ownedCorners[idx] += 1;
  }
  return {
    total: dots.length,
    ownedTotal: dots.filter((d) => d.owned).length,
    corners,
    ownedCorners,
    weighted,
  };
}
