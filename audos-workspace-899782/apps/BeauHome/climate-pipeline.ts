/**
 * THE CLIMATE PIPELINE — one-time-per-user derivation of the 8-band day
 * histogram the Index weights garment types by (Data Layer task,
 * Deliverable 6). Framework-free: no React, no UI — the Task 2 screens
 * call into this.
 *
 * WHAT IT PRODUCES: eight integers summing to 365 — how many days of a
 * typical year the user's location spends in each apparent-temperature
 * band (temperature-bands.ts). A FIT computation: pure arithmetic over
 * ~20 years of hourly climate records, never a model estimate.
 *
 * WHY APPARENT TEMPERATURE, AVERAGED OVER 08:00–20:00: daily-mean air
 * temperature lies about what a day needs. Apparent (feels-like)
 * temperature folds in wind and humidity — a 10°C day in Manchester and a
 * 10°C day in Madrid genuinely need different coats — and averaging the
 * daylight/outdoor hours (08:00–20:00 local) rather than the whole night
 * makes the band counts feel true.
 *
 * DATA SOURCE: Open-Meteo's ERA5 reanalysis (free, no API key). NOTE: the
 * hourly `apparent_temperature` series lives on the HISTORICAL WEATHER
 * endpoint (archive-api.open-meteo.com/v1/archive, ERA5). The similarly
 * named climate-api.open-meteo.com/v1/climate endpoint serves CMIP6 model
 * PROJECTIONS and has no apparent temperature at all — so the archive
 * endpoint is the correct one for this FIT computation.
 *
 * THE FALLBACK LADDER (nothing ever blocks):
 *   1. navigator.geolocation → precise lat/long histogram
 *   2. typed place → Open-Meteo geocoding → lat/long histogram
 *   3. existing CLIMATE_OPTIONS choice → baked-in stock 8-band curve
 *   4. nothing at all → null bands (unweighted — band names, no counts)
 *
 * STORAGE: the histogram + resolved city + its coordinates land in
 * dossier_details (climate_bands / city / city_lat / city_lng /
 * climate_source) via saveDossierDetails. Stored once; climate normals do
 * not move month to month, so it is only ever recomputed when the user
 * changes their city.
 */

import { TEMPERATURE_BAND_ORDER, bandForTemperature, type TemperatureBand } from './temperature-bands';
import { fetchDossierDetails, saveDossierDetails, type DossierDetails } from './dossier-details';

export type ClimateSource = 'geolocation' | 'geocoded' | 'stock' | 'none';

export interface ClimateCurve {
  source: ClimateSource;
  /** Resolved display city — null when unknown (e.g. bare geolocation). */
  city: string | null;
  /** Eight integers, coldest band first, summing 365 — or null (source 'none'). */
  bands: number[] | null;
  latitude?: number;
  longitude?: number;
}

/** Years of daily history averaged into the curve. */
export const CLIMATE_YEARS = 20;

// ---------------------------------------------------------------------------
// Step 1 — location resolution
// ---------------------------------------------------------------------------

export interface ResolvedPlace {
  latitude: number;
  longitude: number;
  /** Display name when known — geocoding returns one, raw GPS does not. */
  city: string | null;
}

/**
 * Browser geolocation, permission-gated. Resolves null (never rejects) on
 * denial, timeout or unsupported — the ladder simply steps down.
 */
export function requestGeolocation(timeoutMs = 10000): Promise<ResolvedPlace | null> {
  return new Promise((resolve) => {
    try {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, city: null }),
        () => resolve(null),
        { timeout: timeoutMs, maximumAge: 3600000, enableHighAccuracy: false },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Geocode a typed place name via Open-Meteo's free geocoding API (no key).
 * Returns the best match with a display city name, or null.
 */
export async function geocodeCity(query: string): Promise<ResolvedPlace | null> {
  const q = (query || '').trim();
  if (!q) return null;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
    return { latitude: hit.latitude, longitude: hit.longitude, city: hit.name || q };
  } catch {
    return null;
  }
}

/**
 * Best-effort reverse geocode so the GPS path can still show a city name.
 * Nominatim is free and keyless; failure is non-fatal — city stays null.
 */
async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&zoom=10&accept-language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    return a.city || a.town || a.village || a.municipality || a.county || data?.name || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Steps 2 & 3 — historical fetch + histogram computation
// ---------------------------------------------------------------------------

/**
 * Mean apparent temperature over the outdoor hours (08:00–20:00 local) for
 * every day in [startDate, endDate], from the ERA5 archive. One value per
 * day, in °C. Throws on network/API failure — callers own the fallback.
 */
async function fetchDaytimeApparentMeans(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
): Promise<number[]> {
  const url =
    'https://archive-api.open-meteo.com/v1/archive' +
    `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    '&hourly=apparent_temperature&timezone=auto';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive returned ${res.status}`);
  const data = await res.json();
  const times: string[] = data?.hourly?.time || [];
  const temps: Array<number | null> = data?.hourly?.apparent_temperature || [];
  if (times.length === 0 || times.length !== temps.length) throw new Error('Open-Meteo archive returned no hourly data');

  // Times arrive as local ISO strings 'YYYY-MM-DDTHH:00'. Group by date,
  // keep hours 08..19 (the 08:00–20:00 window), average per day.
  const sums = new Map<string, { sum: number; n: number }>();
  for (let i = 0; i < times.length; i++) {
    const t = temps[i];
    if (t == null || !Number.isFinite(t)) continue;
    const stamp = times[i];
    const hour = Number(stamp.slice(11, 13));
    if (hour < 8 || hour >= 20) continue;
    const day = stamp.slice(0, 10);
    const cur = sums.get(day) || { sum: 0, n: 0 };
    cur.sum += t;
    cur.n += 1;
    sums.set(day, cur);
  }
  const means: number[] = [];
  for (const { sum, n } of sums.values()) if (n > 0) means.push(sum / n);
  return means;
}

/** ISO date helper. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ~CLIMATE_YEARS years of daytime apparent-temperature day-means for a
 * point, fetched in 5-year chunks (hourly payloads are large; chunking
 * keeps each request modest and lets partial history still count).
 */
export async function fetchClimateHistory(latitude: number, longitude: number): Promise<number[]> {
  // ERA5 lags the present by a few days — end last full year for clean years.
  const endYear = new Date().getUTCFullYear() - 1;
  const startYear = endYear - (CLIMATE_YEARS - 1);
  const all: number[] = [];
  for (let from = startYear; from <= endYear; from += 5) {
    const to = Math.min(from + 4, endYear);
    const chunk = await fetchDaytimeApparentMeans(
      latitude,
      longitude,
      iso(new Date(Date.UTC(from, 0, 1))),
      iso(new Date(Date.UTC(to, 11, 31))),
    );
    all.push(...chunk);
  }
  if (all.length === 0) throw new Error('No climate history returned');
  return all;
}

/**
 * Bucket day-means into the 8 bands and scale to EXACTLY 365 days using
 * largest-remainder rounding. Pure arithmetic — a FIT computation.
 */
export function histogramFromDayMeans(dayMeans: number[]): number[] {
  const counts = new Array(TEMPERATURE_BAND_ORDER.length).fill(0);
  let total = 0;
  for (const mean of dayMeans) {
    if (!Number.isFinite(mean)) continue;
    counts[TEMPERATURE_BAND_ORDER.indexOf(bandForTemperature(mean))] += 1;
    total += 1;
  }
  if (total === 0) return counts;
  const exact = counts.map((c) => (c * 365) / total);
  const floored = exact.map((x) => Math.floor(x));
  let remainder = 365 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floored[order[k].i] += 1;
  return floored;
}

// ---------------------------------------------------------------------------
// Ladder rung 3 — stock curves for the six CLIMATE_OPTIONS ids. Each sums
// to exactly 365 days, coldest band first.
// ---------------------------------------------------------------------------

export const STOCK_CLIMATE_CURVES: Record<string, number[]> = {
  temperate: [5, 30, 60, 85, 90, 65, 25, 5],
  'mild-wet': [2, 25, 75, 110, 95, 45, 12, 1],
  'cold-winters': [45, 60, 55, 55, 60, 55, 30, 5],
  'hot-dry': [0, 5, 20, 45, 70, 85, 80, 60],
  'hot-humid': [0, 2, 8, 30, 60, 90, 100, 75],
  tropical: [0, 0, 0, 5, 25, 90, 150, 95],
};

export function stockCurveFor(climateOptionId: string | null | undefined): number[] | null {
  const curve = STOCK_CLIMATE_CURVES[(climateOptionId || '').trim().toLowerCase()];
  return curve ? [...curve] : null;
}

// ---------------------------------------------------------------------------
// The ladder, assembled
// ---------------------------------------------------------------------------

export interface ResolveClimateOptions {
  /** Try navigator.geolocation first (asks permission). Default true. */
  useGeolocation?: boolean;
  /** A typed place name (“Your city” input) — ladder rung 2. */
  typedCity?: string | null;
  /** The existing CLIMATE_OPTIONS id from the dossier — ladder rung 3. */
  climateOptionId?: string | null;
}

/**
 * Resolve the best available climate curve WITHOUT storing it. Walks the
 * ladder top-down; every failure steps down a rung; never throws.
 */
export async function resolveClimateCurve(options: ResolveClimateOptions = {}): Promise<ClimateCurve> {
  const { useGeolocation = true, typedCity = null, climateOptionId = null } = options;

  // Rung 1 — browser geolocation.
  if (useGeolocation) {
    const place = await requestGeolocation();
    if (place) {
      try {
        const bands = histogramFromDayMeans(await fetchClimateHistory(place.latitude, place.longitude));
        const city = await reverseGeocode(place.latitude, place.longitude);
        return { source: 'geolocation', city, bands, latitude: place.latitude, longitude: place.longitude };
      } catch (e) {
        console.warn('[Ethaion] climate fetch for geolocation failed (stepping down the ladder):', e);
      }
    }
  }

  // Rung 2 — typed place, geocoded.
  if (typedCity && typedCity.trim()) {
    const place = await geocodeCity(typedCity);
    if (place) {
      try {
        const bands = histogramFromDayMeans(await fetchClimateHistory(place.latitude, place.longitude));
        return { source: 'geocoded', city: place.city, bands, latitude: place.latitude, longitude: place.longitude };
      } catch (e) {
        console.warn('[Ethaion] climate fetch for typed city failed (stepping down the ladder):', e);
      }
    }
  }

  // Rung 3 — the coarse CLIMATE_OPTIONS choice, mapped to a stock curve.
  const stock = stockCurveFor(climateOptionId);
  if (stock) return { source: 'stock', city: null, bands: stock };

  // Rung 4 — nothing at all: unweighted bands (names shown, no counts).
  return { source: 'none', city: null, bands: null };
}

/**
 * Resolve AND persist — the one call an onboarding step or the Dossier's
 * “Your city” field needs. Stores city + climate_bands + climate_source in
 * dossier_details; 'none' results store nothing (so a later attempt can
 * still land). Returns the curve either way.
 */
export async function computeAndStoreClimateCurve(options: ResolveClimateOptions = {}): Promise<ClimateCurve> {
  const curve = await resolveClimateCurve(options);
  if (curve.source === 'none' || !curve.bands) return curve;
  try {
    await saveDossierDetails({
      city: curve.city || (options.typedCity || '').trim() || null,
      cityLat: Number.isFinite(curve.latitude as number) ? (curve.latitude as number) : null,
      cityLng: Number.isFinite(curve.longitude as number) ? (curve.longitude as number) : null,
      climateBands: curve.bands,
      climateSource: curve.source,
    });
  } catch (e) {
    console.warn('[Ethaion] could not store the climate curve (it still applies this session):', e);
  }
  return curve;
}

/**
 * The stored-once guarantee: returns the existing stored curve unless the
 * user's city changed (or nothing is stored yet), in which case it
 * recomputes and stores. Climate normals do not move month to month —
 * there is deliberately NO background refresh.
 */
export async function ensureClimateCurve(options: ResolveClimateOptions = {}): Promise<ClimateCurve> {
  let details: DossierDetails | null = null;
  try {
    details = await fetchDossierDetails();
  } catch {
    /* non-fatal — treat as nothing stored */
  }
  const typed = (options.typedCity || '').trim();
  const stored = details?.climateBands || null;
  const sameCity = !typed || (details?.city || '').trim().toLowerCase() === typed.toLowerCase();
  if (stored && sameCity) {
    return {
      source: (details?.climateSource as ClimateSource) || 'geocoded',
      city: details?.city || null,
      bands: stored,
      latitude: details?.cityLat ?? undefined,
      longitude: details?.cityLng ?? undefined,
    };
  }
  return computeAndStoreClimateCurve(options);
}

// ---------------------------------------------------------------------------
// Read-side helpers for Task 2 screens
// ---------------------------------------------------------------------------

/** Days per year in one band, from a curve — 0 when unweighted. */
export function daysInBand(curve: ClimateCurve | null, band: TemperatureBand): number {
  if (!curve?.bands) return 0;
  const i = TEMPERATURE_BAND_ORDER.indexOf(band);
  return i >= 0 ? curve.bands[i] || 0 : 0;
}

/** True when the curve carries real day counts (rungs 1–3 of the ladder). */
export function isWeightedCurve(curve: ClimateCurve | null): boolean {
  return !!curve?.bands && curve.bands.some((n) => n > 0);
}
