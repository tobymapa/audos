/**
 * THE UPFRONT LOAD (startup performance pass · Fix 5, August 2026) — one paid
 * loading moment at open, then everything reads from cache.
 *
 * The founder's rule: the app pays its full loading cost ONCE, behind one
 * visible hairline bar, and after that no screen makes him wait. So after the
 * profile lands, this module eagerly prefetches every DATA READ the tabs lean
 * on — the hunt reader's companion tables (dossier details, measurements,
 * avatar, materials, register frequencies, brand signals, ledger notes),
 * the wardrobe's piece semantics, and Beau's persistent style-memory facts —
 * and computes the CATEGORY-VERDICT FINGERPRINT (the same brief-derived
 * fingerprint edit-coverage-ai.ts and hunt-picks-ai.ts key their localStorage
 * caches on), so those caches answer instantly when a tab opens.
 *
 * DATA READS ONLY — the founder's hard constraint. Nothing here may spend a
 * live model call: Beau's Picks, the written verdicts and the Search
 * summaries all stay lazy and are generated on first interaction, exactly as
 * before. Preloading them would bill inference for screens never opened.
 *
 * WHEN IT RE-RUNS. The whole prefetch is keyed on a SIGNATURE of the facts
 * themselves (`startupFactsSignature`): the profile's identity and
 * updated-stamp, the ledger's piece keys, and the prefs that move
 * recommendations. Coming back from the background, switching tabs, or
 * re-rendering costs nothing — only a signature that actually moved re-runs
 * the reads, and it does so silently (no bar). A returning SESSION whose
 * stored signature still matches (`startupCacheWarm`) skips the visible bar
 * too: its screens restore from the fingerprint-keyed localStorage caches
 * while the reads warm quietly behind them.
 *
 * The tab modules are pulled in with dynamic import() so this module adds
 * nothing to the first-paint bundle — the reader machinery loads on the idle
 * prefetch, not on the critical path.
 */
import type { StylePrefs, StyleProfile, WardrobePiece } from './profile-data';
import type { HuntReader } from './hunt-reader';

export interface StartupPrefetchInput {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
}

/** Where the signature + verdict fingerprint survive the session boundary. */
const STORE_KEY = 'ethaion:startup-cache:v1';

/** A stored signature younger than this keeps a returning session's open
 * quiet — no bar, cache-first — while the reads still refresh behind it. */
const WARM_WINDOW_MS = 6 * 60 * 60 * 1000;

let held: { sig: string; reader: HuntReader; at: number } | null = null;
let running: Promise<void> | null = null;
let runningSig: string | null = null;

/** FNV-1a, 32 bits, base-36 — the same fingerprint every verdict cache uses. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * The facts the prefetch is keyed on. Everything that moves a recommendation
 * or a verdict is in here; render-time identities (fresh objects from a
 * re-fetch of the same row) are not, so a focus re-read that changed nothing
 * re-runs nothing.
 */
export function startupFactsSignature(input: StartupPrefetchInput): string {
  const { profile, pieces, prefs } = input;
  const ledger = pieces
    .map((p) => `${p.id}:${p.category}:${p.slot || ''}`)
    .sort()
    .join('|');
  return fingerprint({
    profile: profile
      ? {
          id: profile.id,
          updated: profile.updated_at || null,
          archetypes: profile.archetypes || [],
          occasions: profile.occasions || [],
          build: profile.build || null,
          skin: profile.skin_tone || null,
          materials: profile.materials || null,
        }
      : null,
    ledger,
    prefs: prefs ? { currency: prefs.currency || null, secondhand: prefs.secondhand || null } : null,
  });
}

/** True when a recent session already prefetched THESE facts — the open can
 * restore from cache without showing the loading bar. */
export function startupCacheWarm(sig: string): boolean {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { sig?: string; at?: number }) : null;
    return !!parsed && parsed.sig === sig && Date.now() - Number(parsed.at || 0) < WARM_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * The reader the prefetch loaded, synchronously — what lets The Search (and
 * anything else that reasons over the record) paint on its first frame
 * instead of waiting for its own seven companion reads. Null before the
 * prefetch lands; callers still run their own load and reconcile.
 */
export function peekStartupReader(): HuntReader | null {
  return held ? held.reader : null;
}

/**
 * The prefetch. Idempotent per signature: repeat calls with the same facts
 * cost nothing, and a call that arrives while an older one is in flight
 * queues behind it rather than racing it.
 */
export async function runStartupPrefetch(input: StartupPrefetchInput): Promise<void> {
  const sig = startupFactsSignature(input);
  if (held?.sig === sig) return;
  if (running && runningSig === sig) return running;

  const prior = running;
  runningSig = sig;
  running = (async () => {
    if (prior) await prior.catch(() => undefined);
    if (held?.sig === sig) return;

    // DATA READS ONLY — no model call may hide in here.
    const [huntReaderModule, huntModel, semantics, memory] = await Promise.all([
      import('./hunt-reader'),
      import('./hunt-model'),
      import('./semantic-tags'),
      import('./style-memory'),
    ]);
    const calls = huntModel.loadHuntCallsMirror();
    const [reader] = await Promise.all([
      // The reader gathers the dossier, measurements, avatar, materials,
      // register frequencies, brand signals and ledger notes in one pass.
      huntReaderModule.loadHuntReader({
        profile: input.profile,
        pieces: input.pieces,
        prefs: input.prefs,
        calls,
      }),
      semantics.fetchSemanticTags().catch(() => ({})),
      memory.fetchStyleMemory().catch(() => []),
    ]);
    held = { sig, reader, at: Date.now() };

    try {
      // The category-verdict fingerprint: the brief is what every verdict
      // cache keys itself on, so storing its fingerprint alongside the
      // signature is what lets the next open (and a restore from the
      // background) tell "still valid — read the cache" from "the facts
      // moved — re-read" without re-fetching anything first.
      window.localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          sig,
          verdict: fingerprint(huntReaderModule.huntReaderBrief(reader)),
          at: Date.now(),
        }),
      );
    } catch {
      /* storage unavailable — the in-memory copy still carries this session */
    }
  })().finally(() => {
    if (runningSig === sig) {
      running = null;
      runningSig = null;
    }
  });
  return running;
}
