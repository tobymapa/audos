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
}

export const EMPTY_DOSSIER_MEASUREMENTS: DossierMeasurements = {
  id: 0,
  foot_length: null,
  clothes_size_system: null,
};

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
