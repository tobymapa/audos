/**
 * COVERAGE-MAP PREFERENCES — the per-cell "doesn't apply" marks and the
 * muted registers, persisted in the `coverage_prefs` WorkspaceDB table so
 * they SURVIVE ACROSS DEVICES (the founder's persistence fix — they used to
 * live only in this browser's localStorage).
 *
 * localStorage stays as the FAST LOCAL MIRROR: reads seed from it instantly,
 * the DB read reconciles when it lands, and every write goes to both. The
 * module is deliberately framework-free so BOTH the coverage map (UI) and
 * Beau's assessment engine (beau-assessment.ts — muted registers feed his
 * prompt, so he holds no opinion on muted categories) can import it without
 * dragging React around.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

export const NA_STORE_KEY = 'ethaion_coverage_na_v1';
export const MUTED_STORE_KEY = 'ethaion_muted_registers_v1';
export const FREQ_STORE_KEY = 'ethaion_register_freqs_v1';
export const COVERAGE_PREFS_EVENT = 'ethaion:coverage-prefs-changed';

export interface CoveragePrefRow {
  id: number;
  kind: string;
  pref_key: string;
  pref_value: string | null;
  created_at?: string;
}

export interface CoveragePrefs {
  /** cellKey → override: true forces doesn't-apply, false un-marks a default. */
  na: Record<string, boolean>;
  /** Muted register ids — Beau holds no opinion about these. */
  muted: string[];
}

export function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function storeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable — the session state still applies */ }
}

/** Newest row per kind+key wins — rows arrive newest-first. */
export function prefsFromRows(rows: CoveragePrefRow[] | null | undefined): CoveragePrefs {
  const na: Record<string, boolean> = {};
  const muted: string[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    const kind = (row.kind || '').trim();
    const key = (row.pref_key || '').trim();
    if (!kind || !key) continue;
    const dedupe = `${kind}\u241f${key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const value = String(row.pref_value ?? 'true') === 'true';
    if (kind === 'na') na[key] = value;
    if (kind === 'muted' && value) muted.push(key);
  }
  return { na, muted };
}

async function readRows(): Promise<CoveragePrefRow[]> {
  const { data } = await db().from('coverage_prefs').orderBy('created_at', 'desc').limit(300).get();
  return (data || []) as CoveragePrefRow[];
}

/**
 * The stored preferences — DB first (cross-device truth), the localStorage
 * mirror refreshed on the way through, the mirror alone when the read
 * fails (offline still works).
 */
export async function fetchCoveragePrefs(): Promise<CoveragePrefs> {
  try {
    const prefs = prefsFromRows(await readRows());
    storeLocalJson(NA_STORE_KEY, prefs.na);
    storeLocalJson(MUTED_STORE_KEY, prefs.muted);
    return prefs;
  } catch {
    return {
      na: loadLocalJson<Record<string, boolean>>(NA_STORE_KEY, {}),
      muted: loadLocalJson<string[]>(MUTED_STORE_KEY, []),
    };
  }
}

/** The muted registers alone — what Beau's assessment engine reads. */
export async function fetchMutedRegisters(): Promise<string[]> {
  const prefs = await fetchCoveragePrefs();
  return prefs.muted;
}

/** Insert-or-update one preference row; fires the change event. */
async function upsertPref(kind: 'na' | 'muted' | 'frequency', prefKey: string, value: boolean | string): Promise<void> {
  try {
    const rows = await readRows();
    const existing = rows.find((r) => (r.kind || '') === kind && (r.pref_key || '') === prefKey);
    if (existing) {
      await db().from('coverage_prefs').update(existing.id, { pref_value: String(value) });
    } else {
      await db().from('coverage_prefs').insert({ kind, pref_key: prefKey, pref_value: String(value) });
    }
    window.dispatchEvent(new CustomEvent(COVERAGE_PREFS_EVENT));
  } catch (e) {
    console.warn('[Ethaion] coverage preference write failed (the local mirror still holds it):', e);
  }
}

// ---------------------------------------------------------------------------
// REGISTER FREQUENCIES (onboarding screen 3 · M11 · the dossier's register
// frequencies): how often each dress register actually comes up —
// 'most-days' · 'weekly' · 'rarely' · 'never'. Stored as kind='frequency'
// rows in the SAME coverage_prefs table; 'never' also MUTES the register
// (and any other answer un-mutes it), so The Edit's map and Beau's
// assessment honour the answer immediately.
// ---------------------------------------------------------------------------

export type RegisterFrequency = 'most-days' | 'weekly' | 'rarely' | 'never';

export const REGISTER_FREQUENCY_LABELS: Record<RegisterFrequency, string> = {
  'most-days': 'Most days',
  weekly: 'Weekly',
  rarely: 'Rarely',
  never: 'Not for me',
};

/** register id → frequency, newest row per register winning. */
export function frequenciesFromRows(rows: CoveragePrefRow[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows || []) {
    if ((row.kind || '').trim() !== 'frequency') continue;
    const key = (row.pref_key || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (row.pref_value) out[key] = String(row.pref_value);
  }
  return out;
}

export async function fetchRegisterFrequencies(): Promise<Record<string, string>> {
  try {
    const freqs = frequenciesFromRows(await readRows());
    storeLocalJson(FREQ_STORE_KEY, freqs);
    return freqs;
  } catch {
    return loadLocalJson<Record<string, string>>(FREQ_STORE_KEY, {});
  }
}

/** Persist one register's frequency — 'never' mutes the register too. */
export function writeRegisterFrequency(register: string, freq: RegisterFrequency): void {
  const local = loadLocalJson<Record<string, string>>(FREQ_STORE_KEY, {});
  local[register] = freq;
  storeLocalJson(FREQ_STORE_KEY, local);
  void upsertPref('frequency', register, freq);
  // The consequence, applied at the source: never → muted; anything else
  // un-mutes. The muted mirror follows the same rule.
  const muted = loadLocalJson<string[]>(MUTED_STORE_KEY, []);
  const nextMuted = freq === 'never' ? [...new Set([...muted, register])] : muted.filter((r) => r !== register);
  storeLocalJson(MUTED_STORE_KEY, nextMuted);
  void upsertPref('muted', register, freq === 'never');
}

/** Persist a per-cell doesn't-apply override (localStorage + DB). */
export function writeNaPref(cellKey: string, value: boolean, allLocal: Record<string, boolean>): void {
  storeLocalJson(NA_STORE_KEY, allLocal);
  void upsertPref('na', cellKey, value);
}

/** Persist a register mute/unmute (localStorage + DB). */
export function writeMutedPref(register: string, muted: boolean, allLocal: string[]): void {
  storeLocalJson(MUTED_STORE_KEY, allLocal);
  void upsertPref('muted', register, muted);
}
