/**
 * BODY PROFILE — the visitor's physical figures (height, weight, body type,
 * skin tone), stored in the avatar_profiles WorkspaceDB row.
 *
 * Extracted from lib/tryon/avatar.ts when the avatar try-on path was
 * deleted (design handoff: the flat lay replaced the avatar concept). The
 * TABLE and its data survive — onboarding and The Dossier's "Body — sizes &
 * measurements" read and write these figures, and Beau's proportion
 * reasoning consumes them. Only the figure-building/compositing/render
 * machinery is gone.
 */

export type BodyType = 'slim' | 'athletic' | 'broad';

export interface AvatarInputs {
  heightCm: number | null;
  heightUnit: 'cm' | 'ftin';
  weightKg: number | null;
  weightUnit: 'kg' | 'lbs';
  bodyType: BodyType | null;
  /** Swatch id from profile-data's SKIN_TONES. */
  skinTone: string | null;
}

export const EMPTY_INPUTS: AvatarInputs = {
  heightCm: null,
  heightUnit: 'cm',
  weightKg: null,
  weightUnit: 'kg',
  bodyType: null,
  skinTone: null,
};

interface ProfileRow {
  id: number;
  height_cm: number | string | null;
  height_unit: string | null;
  weight_kg: number | string | null;
  weight_unit: string | null;
  body_type: string | null;
  skin_tone: string | null;
}

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

let cachedRow: ProfileRow | null | undefined; // undefined = not read yet
let rowPromise: Promise<ProfileRow | null> | null = null;

async function fetchProfileRow(force = false): Promise<ProfileRow | null> {
  if (!force && cachedRow !== undefined) return cachedRow;
  if (!force && rowPromise) return rowPromise;
  rowPromise = (async () => {
    try {
      const { data } = await db().from('avatar_profiles').orderBy('created_at', 'desc').limit(1).get();
      cachedRow = Array.isArray(data) && data.length > 0 ? (data[0] as ProfileRow) : null;
    } catch (e) {
      console.warn('[Ethaion] reading the body profile failed:', e);
    } finally {
      rowPromise = null;
    }
    return cachedRow ?? null;
  })();
  return rowPromise;
}

function rowToInputs(row: ProfileRow | null): AvatarInputs {
  if (!row) return { ...EMPTY_INPUTS };
  const num = (v: number | string | null) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
  };
  return {
    heightCm: num(row.height_cm),
    heightUnit: row.height_unit === 'ftin' ? 'ftin' : 'cm',
    weightKg: num(row.weight_kg),
    weightUnit: row.weight_unit === 'lbs' ? 'lbs' : 'kg',
    bodyType: row.body_type === 'slim' || row.body_type === 'athletic' || row.body_type === 'broad' ? row.body_type : null,
    skinTone: row.skin_tone || null,
  };
}

/** Read the visitor's saved body figures (cached after the first read). */
export async function fetchAvatarInputs(force = false): Promise<AvatarInputs> {
  return rowToInputs(await fetchProfileRow(force));
}

/** Save (upsert) the body figures. */
export async function saveAvatarInputs(patch: Partial<AvatarInputs>): Promise<AvatarInputs> {
  const row = await fetchProfileRow(true);
  const merged = { ...rowToInputs(row), ...patch };
  const record = {
    height_cm: merged.heightCm,
    height_unit: merged.heightUnit,
    weight_kg: merged.weightKg,
    weight_unit: merged.weightUnit,
    body_type: merged.bodyType,
    skin_tone: merged.skinTone,
  };
  try {
    if (row) {
      await db().from('avatar_profiles').update(row.id, record);
    } else {
      await db().from('avatar_profiles').insert(record);
    }
    await fetchProfileRow(true);
  } catch (e) {
    console.warn('[Ethaion] saving the body profile failed:', e);
  }
  return merged;
}
