/**
 * DOSSIER MEASUREMENTS (extended) — the Dossier rebuild's new physical and
 * sizing facts that style_measurements (which cannot be altered) has no
 * column for:
 *
 *   · foot_length — the PHYSICAL measurement of the foot (e.g. '27 cm'),
 *     renamed from the old "Shoe size" field in Physical profile. Distinct
 *     from the shoe-size LABEL the user wears, which stays in the Sizes
 *     section (style_measurements.shoe_size + shoe_size_system).
 *   · clothes_size_system — which system the general clothing size is
 *     expressed in: 'alpha' (XS/S/M/L/XL), 'eu' (numerical) or 'us'
 *     (numerical).
 *   · garment_sizes — per-garment-category size labels (UI corrections
 *     pass): a JSON object keyed by category id (shirt / trouser / jacket /
 *     knitwear / suit), each value the size label the user wears in that
 *     category, e.g. {"shirt":"M","trouser":"W32","jacket":"EU 50"}.
 *     Complements (never replaces) the general clothing_size.
 *
 * Same companion-table pattern as measurement_extras and dossier_details:
 * one row per visitor session, updated in place. Every read is non-fatal —
 * a missing row returns empty values rather than throwing.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

export interface DossierMeasurements {
  id: number;
  /** Foot length, free text with unit, e.g. '27 cm' or '10.6 in'. */
  foot_length: string | null;
  /** 'alpha' | 'eu' | 'us' — the system clothing_size is expressed in. */
  clothes_size_system: string | null;
  /** Per-garment-category sizes, JSON object keyed by GARMENT_SIZE_CATEGORIES id. */
  garment_sizes: string | null;
}

export const EMPTY_DOSSIER_MEASUREMENTS: DossierMeasurements = {
  id: 0,
  foot_length: null,
  clothes_size_system: null,
  garment_sizes: null,
};

/** The garment categories that carry their OWN size label — one field each
 * in the Dossier's Sizes section. Shoes keep their own subsection (with the
 * full standard selector), so they are not repeated here. */
export const GARMENT_SIZE_CATEGORIES: Array<{ id: string; label: string; placeholder: string }> = [
  { id: 'shirt', label: 'Shirt / top', placeholder: 'e.g. M or 15.5″ collar' },
  { id: 'trouser', label: 'Trouser / bottom', placeholder: 'e.g. W32 L32 or EU 48' },
  { id: 'jacket', label: 'Jacket / blazer', placeholder: 'e.g. EU 50 or 40R' },
  { id: 'knitwear', label: 'Knitwear', placeholder: 'e.g. M' },
  { id: 'suit', label: 'Suit / formalwear', placeholder: 'e.g. 50 or 40R' },
];

/** Best-effort read of the stored garment_sizes JSON — bad data reads as
 * empty rather than throwing. */
export function parseGarmentSizes(stored: string | null | undefined): Record<string, string> {
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Serialise the per-category drafts back to the stored JSON (or null when
 * every field is empty). */
export function serializeGarmentSizes(drafts: Record<string, string>): string | null {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(drafts)) {
    if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
  }
  return Object.keys(clean).length > 0 ? JSON.stringify(clean) : null;
}

export const CLOTHES_SIZE_SYSTEMS: Array<{ id: string; label: string }> = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'eu', label: 'EU' },
  { id: 'us', label: 'US' },
];

export async function fetchDossierMeasurements(): Promise<DossierMeasurements> {
  try {
    const { data } = await ws().from('dossier_measurements').orderBy('created_at', 'asc').limit(1).get();
    return (data && data[0]) ? (data[0] as DossierMeasurements) : EMPTY_DOSSIER_MEASUREMENTS;
  } catch (e) {
    console.warn('[Ethaion] dossier measurements fetch failed (non-fatal):', e);
    return EMPTY_DOSSIER_MEASUREMENTS;
  }
}

/** Serialised writes so two quick saves cannot race each other. */
let writeChain: Promise<unknown> = Promise.resolve();

export function saveDossierMeasurements(
  patch: Partial<Omit<DossierMeasurements, 'id'>>,
): Promise<DossierMeasurements> {
  const job = writeChain.then(async () => {
    const existing = await fetchDossierMeasurements();
    if (existing.id > 0) {
      await ws().from('dossier_measurements').update(existing.id, patch);
    } else {
      await ws().from('dossier_measurements').insert(patch);
    }
    return fetchDossierMeasurements();
  });
  writeChain = job.catch(() => undefined);
  return job;
}
