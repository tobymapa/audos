/**
 * DOSSIER DETAILS — the facts The Dossier holds that style_profile has no
 * column for.
 *
 * style_profile cannot be altered, so the pattern here is the same one
 * measurement_extras and piece_details already use: a companion table, one
 * row per visitor session, updated in place. It carries the name Beau
 * addresses him by, the two colour facts beyond skin tone (hair colour and
 * his own notes on what he wears well), the style references he has NAMED
 * — "Don Draper", "Steve McQueen" — and the climate he actually dresses for.
 *
 * NOT to be confused with taste_references, which stores looks he has SHARED
 * with Beau (a link, a photo, a voice note) and the signal Beau read out of
 * them. These are the names he gives when asked who he dresses like.
 *
 * Every read is non-fatal: a failure returns empty details rather than
 * throwing, because a missing hair colour must never take the screen down.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

/** Fired after a successful save, so other surfaces can re-read. */
export const DOSSIER_DETAILS_EVENT = 'ethaion:dossier-details-updated';

// ---------------------------------------------------------------------------
// Synchronous display-name cache — the "Made For" tape must never flash its
// placeholder for a name the user has already given. The last known name is
// mirrored to localStorage on every fetch/save, so the Dossier can seed its
// very first render with it (before any DB round-trip resolves).
// ---------------------------------------------------------------------------

const NAME_CACHE_KEY = 'ethaion_dossier_display_name';

/** The last known display name, read synchronously — or null when none. */
export function cachedDisplayName(): string | null {
  try {
    const raw = (localStorage.getItem(NAME_CACHE_KEY) || '').trim();
    return raw || null;
  } catch {
    return null;
  }
}

function rememberDisplayName(name: string | null): void {
  try {
    const clean = (name || '').trim();
    if (clean) localStorage.setItem(NAME_CACHE_KEY, clean);
    else localStorage.removeItem(NAME_CACHE_KEY);
  } catch { /* storage unavailable — the DB value still wins on load */ }
}

export interface DossierDetails {
  id: number;
  displayName: string | null;
  hairColour: string | null;
  paletteNotes: string | null;
  styleReferences: string[];
  climate: string | null;
  /** Resolved home city (display only) — the climate pipeline stores it
   * alongside the derived curve, which is what band arithmetic uses. */
  city: string | null;
  /** Coordinates of the resolved home location — stored so the climate
   * pipeline can recompute without re-geocoding. Null until a location is
   * set (geolocation or geocoded typed place). */
  cityLat: number | null;
  cityLng: number | null;
  /** Register ids (of the SIX — brands.ts ALL_REGISTERS) excluded from
   * Index recommendations. Empty means all six are active. */
  mutedRegisters: string[];
  /** The derived 8-integer day histogram, coldest band first (below-0 …
   * above-30), summing ~365. null until the climate pipeline has run. */
  climateBands: number[] | null;
  /** 'geolocation' | 'geocoded' | 'stock' — how climateBands was derived. */
  climateSource: string | null;
}

export const EMPTY_DOSSIER_DETAILS: DossierDetails = {
  id: 0,
  displayName: null,
  hairColour: null,
  paletteNotes: null,
  styleReferences: [],
  climate: null,
  city: null,
  cityLat: null,
  cityLng: null,
  mutedRegisters: [],
  climateBands: null,
  climateSource: null,
};

/** Hair colour is a tap, not a free-text box — Beau reasons over the id. */
export const HAIR_COLOURS: Array<{ id: string; label: string; swatch: string }> = [
  { id: 'black', label: 'Black', swatch: '#1c1815' },
  { id: 'dark-brown', label: 'Dark brown', swatch: '#3b2b1d' },
  { id: 'light-brown', label: 'Light brown', swatch: '#7a5533' },
  { id: 'auburn', label: 'Auburn', swatch: '#8b3a3a' },
  { id: 'blond', label: 'Blond', swatch: '#c8a464' },
  { id: 'grey', label: 'Grey', swatch: '#9a938a' },
  { id: 'salt-and-pepper', label: 'Salt & pepper', swatch: '#6b6560' },
  { id: 'white', label: 'White', swatch: '#e6e1d8' },
  { id: 'none', label: 'Shaved / none', swatch: '#c0b6a6' },
];

/** The climate he dresses for — often not the one his city is famous for. */
export const CLIMATE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'temperate', label: 'Temperate — four real seasons' },
  { id: 'mild-wet', label: 'Mild and wet' },
  { id: 'cold-winters', label: 'Cold winters' },
  { id: 'hot-dry', label: 'Hot and dry' },
  { id: 'hot-humid', label: 'Hot and humid' },
  { id: 'tropical', label: 'Tropical year round' },
];

export function hairColourLabel(id: string | null): string {
  if (!id) return '';
  return HAIR_COLOURS.find((h) => h.id === id)?.label || id;
}

export function climateLabel(id: string | null): string {
  if (!id) return '';
  return CLIMATE_OPTIONS.find((c) => c.id === id)?.label || id;
}

function parseReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** The stored climate histogram — exactly 8 finite numbers, or null. */
function parseClimateBands(value: unknown): number[] | null {
  let parsed: unknown = value;
  if (typeof value === 'string' && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== 8) return null;
  const nums = parsed.map((n) => Number(n));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

/** A finite coordinate or null — decimal columns can arrive as strings. */
function parseCoord(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? (n as number) : null;
}

function rowToDetails(row: any): DossierDetails {
  return {
    id: Number(row?.id) || 0,
    displayName: row?.display_name || null,
    hairColour: row?.hair_colour || null,
    paletteNotes: row?.palette_notes || null,
    styleReferences: parseReferences(row?.style_references),
    climate: row?.climate || null,
    city: row?.city || null,
    cityLat: parseCoord(row?.city_lat),
    cityLng: parseCoord(row?.city_lng),
    mutedRegisters: parseReferences(row?.muted_registers),
    climateBands: parseClimateBands(row?.climate_bands),
    climateSource: row?.climate_source || null,
  };
}

/** This visitor's row, or empty details when there is not one yet. */
export async function fetchDossierDetails(): Promise<DossierDetails> {
  try {
    const { data } = await ws().from('dossier_details').orderBy('created_at', 'desc').limit(1).get();
    const details = data?.[0] ? rowToDetails(data[0]) : EMPTY_DOSSIER_DETAILS;
    rememberDisplayName(details.displayName);
    return details;
  } catch (e) {
    console.warn('[Ethaion] dossier details fetch failed (non-fatal):', e);
    return EMPTY_DOSSIER_DETAILS;
  }
}

export interface DossierDetailsPatch {
  displayName?: string | null;
  hairColour?: string | null;
  paletteNotes?: string | null;
  styleReferences?: string[];
  climate?: string | null;
  city?: string | null;
  cityLat?: number | null;
  cityLng?: number | null;
  mutedRegisters?: string[];
  climateBands?: number[] | null;
  climateSource?: string | null;
}

/**
 * Write the changed fields onto the single row, creating it on first save.
 * Returns the details as they now stand so the caller can hold one truth
 * rather than guessing at what landed.
 */
export async function saveDossierDetails(patch: DossierDetailsPatch): Promise<DossierDetails> {
  const fields: Record<string, unknown> = {};
  if ('displayName' in patch) fields.display_name = (patch.displayName || '').trim() || null;
  if ('hairColour' in patch) fields.hair_colour = patch.hairColour || null;
  if ('paletteNotes' in patch) fields.palette_notes = (patch.paletteNotes || '').trim() || null;
  if ('climate' in patch) fields.climate = patch.climate || null;
  if ('styleReferences' in patch) {
    const clean = (patch.styleReferences || []).map((r) => r.trim()).filter(Boolean).slice(0, 12);
    fields.style_references = JSON.stringify(clean);
  }
  if ('city' in patch) fields.city = (patch.city || '').trim() || null;
  if ('cityLat' in patch) fields.city_lat = Number.isFinite(patch.cityLat as number) ? patch.cityLat : null;
  if ('cityLng' in patch) fields.city_lng = Number.isFinite(patch.cityLng as number) ? patch.cityLng : null;
  if ('mutedRegisters' in patch) {
    const clean = [...new Set((patch.mutedRegisters || []).map((r) => r.trim()).filter(Boolean))];
    fields.muted_registers = JSON.stringify(clean);
  }
  if ('climateBands' in patch) {
    const bands = patch.climateBands;
    fields.climate_bands =
      Array.isArray(bands) && bands.length === 8 && bands.every((n) => Number.isFinite(n))
        ? JSON.stringify(bands.map((n) => Math.round(n)))
        : null;
  }
  if ('climateSource' in patch) fields.climate_source = patch.climateSource || null;

  try {
    const { data } = await ws().from('dossier_details').orderBy('created_at', 'desc').limit(1).get();
    const existing = data?.[0] || null;
    if (existing) {
      await ws().from('dossier_details').update(existing.id, fields);
      const merged = rowToDetails({ ...existing, ...fields });
      rememberDisplayName(merged.displayName);
      window.dispatchEvent(new CustomEvent(DOSSIER_DETAILS_EVENT, { detail: merged }));
      return merged;
    }
    await ws().from('dossier_details').insert(fields);
    const fresh = await fetchDossierDetails();
    window.dispatchEvent(new CustomEvent(DOSSIER_DETAILS_EVENT, { detail: fresh }));
    return fresh;
  } catch (e) {
    console.warn('[Ethaion] could not save the dossier details:', e);
    throw e instanceof Error ? e : new Error('Could not save that just now.');
  }
}
