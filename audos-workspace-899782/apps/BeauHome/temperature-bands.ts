/**
 * TEMPERATURE BANDS — the eight apparent-temperature ranges the whole Index
 * data layer keys on (Data Layer task, Deliverable 2).
 *
 * Every garment type (garment-types.ts) carries exactly ONE primary band —
 * the range it is most appropriate for — and the climate pipeline
 * (climate-pipeline.ts) buckets a user's historical days into these same
 * eight bands, so "how often do I actually need this?" is pure arithmetic:
 * the type's band looked up against the user's 8-integer day histogram.
 *
 * The bounds are APPARENT temperature (feels-like, °C) — wind and humidity
 * included — not air temperature. A 10°C day in Manchester and a 10°C day
 * in Madrid genuinely need different coats; apparent temperature is what
 * makes the band counts feel true.
 */

export type TemperatureBand =
  | 'below-0'
  | '0-5'
  | '5-10'
  | '10-15'
  | '15-20'
  | '20-25'
  | '25-30'
  | 'above-30';

export interface TemperatureBandDef {
  id: TemperatureBand;
  /** Human-readable label, e.g. 'Freezing', 'Mild'. */
  label: string;
  /** Lower bound in °C apparent temperature — null means open-ended. */
  tempMin: number | null;
  /** Upper bound in °C apparent temperature — null means open-ended. */
  tempMax: number | null;
}

/** The eight bands, coldest first. This ordering is ALSO the storage order
 * of the dossier's climate_bands histogram — index 0 is 'below-0'. */
export const TEMPERATURE_BANDS: TemperatureBandDef[] = [
  { id: 'below-0', label: 'Freezing', tempMin: null, tempMax: 0 },
  { id: '0-5', label: 'Cold', tempMin: 0, tempMax: 5 },
  { id: '5-10', label: 'Cool', tempMin: 5, tempMax: 10 },
  { id: '10-15', label: 'Mild', tempMin: 10, tempMax: 15 },
  { id: '15-20', label: 'Warm', tempMin: 15, tempMax: 20 },
  { id: '20-25', label: 'Hot', tempMin: 20, tempMax: 25 },
  { id: '25-30', label: 'Very Hot', tempMin: 25, tempMax: 30 },
  { id: 'above-30', label: 'Tropical', tempMin: 30, tempMax: null },
];

/** Band ids, coldest first — the canonical order everywhere. */
export const TEMPERATURE_BAND_ORDER: TemperatureBand[] = TEMPERATURE_BANDS.map((b) => b.id);

const BAND_INDEX = new Map<TemperatureBand, number>(TEMPERATURE_BAND_ORDER.map((id, i) => [id, i]));

/** Where a band sits coldest→hottest; unknown ids sort last. */
export function temperatureBandRank(id: string | null | undefined): number {
  const rank = BAND_INDEX.get((id || '') as TemperatureBand);
  return rank == null ? TEMPERATURE_BANDS.length : rank;
}

export function temperatureBandDef(id: TemperatureBand): TemperatureBandDef {
  return TEMPERATURE_BANDS[temperatureBandRank(id)] || TEMPERATURE_BANDS[3];
}

export function temperatureBandLabel(id: TemperatureBand): string {
  return temperatureBandDef(id).label;
}

/** Display range, e.g. 'Below 0°C', '10–15°C', 'Above 30°C'. */
export function temperatureBandRange(id: TemperatureBand): string {
  const def = temperatureBandDef(id);
  if (def.tempMin == null) return `Below ${def.tempMax}\u00b0C`;
  if (def.tempMax == null) return `Above ${def.tempMin}\u00b0C`;
  return `${def.tempMin}\u2013${def.tempMax}\u00b0C`;
}

/**
 * The band a single apparent-temperature reading falls into. Bounds are
 * half-open [min, max), so 10.0°C lands in '10-15', never in two bands.
 */
export function bandForTemperature(celsius: number): TemperatureBand {
  if (!Number.isFinite(celsius)) return '10-15';
  if (celsius < 0) return 'below-0';
  if (celsius < 5) return '0-5';
  if (celsius < 10) return '5-10';
  if (celsius < 15) return '10-15';
  if (celsius < 20) return '15-20';
  if (celsius < 25) return '20-25';
  if (celsius < 30) return '25-30';
  return 'above-30';
}
