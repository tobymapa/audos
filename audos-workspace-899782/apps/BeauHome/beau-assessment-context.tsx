/**
 * APP-LEVEL BEAU ASSESSMENT STATE — The Edit caching fix.
 *
 * The Layer 2 assessment result used to live in The Edit tab's component
 * state, so every tab switch unmounted it and the tab re-ran its whole
 * loading pass (several data fetches, and a fresh model call whenever the
 * fingerprint had drifted) on every return. This provider moves the result
 * to APP level: it survives tab navigation, so returning to The Edit paints
 * the cached assessment instantly.
 *
 * THE INVALIDATION CONTRACT (and nothing else re-runs the model):
 *   · a piece is added or removed from the wardrobe
 *   · the selected archetypes change
 *   · profile data changes (measurements, skin tone, budget, lifestyle)
 *   · a recommendation is dismissed or restored (taste memory)
 *   · the explicit "Re-assess" button inside The Edit (force)
 * Tab navigation NEVER triggers a re-run: `ensure()` loads only when no
 * validated result exists yet this session, and the signature effect below
 * only fires when the watched inputs actually change value (string
 * comparison, not object identity).
 *
 * Layer 1 semantic tags landing ('ethaion:semantics-updated') also sharpen
 * the read via the same debounced path — that is a wardrobe-data change,
 * not a navigation.
 *
 * SAVING AND RE-ASSESSING ARE TWO OPERATIONS. This provider is the WORKER
 * half: a save awaits its database write, calls
 * `queueWardrobeReassessment()` and returns — it never awaits a model call.
 * The request arrives here, is debounced into one pass, and runs as a
 * BACKGROUND pass: `loading` stays false so nothing on screen is replaced,
 * `reassessing` (and the shared job status in reassess-queue.ts) drives a
 * small non-blocking indicator, and when the read lands the result swaps in
 * place — the Verdict, the Coverage Map and Complete the Look re-render
 * where they stand, with no navigation and no reload.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBeauAssessment,
  hasBeauAssessment,
  peekBeauAssessmentResult,
  type BeauAssessmentResult,
} from './beau-assessment';
import type { CategoryBudget, StylePrefs, StyleProfile, WardrobePiece } from './profile-data';
import { REASSESS_REQUESTED_EVENT, setReassessStatus } from './reassess-queue';
import { TASTE_MEMORY_EVENT } from './taste-memory';
import { DOSSIER_DETAILS_EVENT } from './dossier-details';

export interface BeauAssessmentStore {
  result: BeauAssessmentResult | null;
  /** A FOREGROUND load — the first open of a session, with nothing to show
   * yet. This is the only one that may put a skeleton on the screen. */
  loading: boolean;
  /** A BACKGROUND pass, queued by a save or another wardrobe change, running
   * over an assessment that is already on the screen. Nothing waits on it:
   * it drives a small non-blocking indicator, and the sections re-render in
   * place when it lands. */
  reassessing: boolean;
  /** Either kind of pass is in flight — what "Re-assess" disables on, so a
   * queued pass and a tapped one can never both spend a call. */
  busy: boolean;
  phase: string;
  error: string | null;
  /** First-open hook: guarantees ONE validated load this session (the cache
   * answers instantly when fresh). Subsequent calls are no-ops. */
  ensure: () => void;
  /** Force a fresh model pass — the quiet "Re-assess" button. */
  reassess: () => void;
}

const BeauAssessmentContext = createContext<BeauAssessmentStore | null>(null);

export function useBeauAssessment(): BeauAssessmentStore {
  const store = useContext(BeauAssessmentContext);
  if (!store) {
    throw new Error('useBeauAssessment must be used inside BeauAssessmentProvider');
  }
  return store;
}

export function BeauAssessmentProvider({
  profile,
  pieces,
  budgets,
  prefs,
  children,
}: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  budgets: Record<string, CategoryBudget>;
  prefs: StylePrefs | null;
  children: React.ReactNode;
}) {
  // Seed from the last stored assessment so The Edit paints instantly even
  // on the first open of a new session — validation still happens once.
  const [result, setResult] = useState<BeauAssessmentResult | null>(() => peekBeauAssessmentResult());
  const [loading, setLoading] = useState(false);
  const [reassessing, setReassessing] = useState(false);
  const [phase, setPhase] = useState('Beau is pulling out his notes\u2026');
  const [error, setError] = useState<string | null>(null);

  const seqRef = useRef(0);
  const requestedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  // A pass of either kind is running. The queue re-arms rather than starting
  // a second one, so a save during a pass costs no extra model call.
  const runningRef = useRef(false);

  // Latest inputs, readable from stable callbacks without re-creating them
  // (a new callback identity on every wardrobe render would defeat the point).
  const inputsRef = useRef({ profile, pieces, budgets, prefs });
  inputsRef.current = { profile, pieces, budgets, prefs };

  /**
   * Run a pass. `background` is the queued kind: it never sets `loading`, so
   * nothing on the screen is replaced by a skeleton and no control is held
   * open — it raises the job status instead, and the result swaps in place.
   */
  const load = useCallback((forceRefresh: boolean, background = false) => {
    const { profile: p, pieces: pc, budgets: b, prefs: pf } = inputsRef.current;
    const seq = ++seqRef.current;
    runningRef.current = true;
    if (background) {
      setReassessing(true);
      setReassessStatus('reassessing');
    } else {
      setLoading(true);
    }
    setError(null);
    void getBeauAssessment({
      profile: p,
      pieces: pc.filter((piece) => piece.id > 0),
      budgets: b,
      prefs: pf,
      forceRefresh,
      onPhase: (ph) => {
        if (seq === seqRef.current) setPhase(ph);
      },
    })
      .then((res) => {
        if (seq === seqRef.current) setResult(res);
      })
      .catch((e: unknown) => {
        if (seq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : 'Beau couldn\u2019t reach his desk just now — try again in a moment.');
      })
      .finally(() => {
        runningRef.current = false;
        if (seq === seqRef.current) {
          if (background) setReassessing(false);
          else setLoading(false);
        }
        if (background) setReassessStatus('idle');
      });
  }, []);

  const ensure = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    load(false);
  }, [load]);

  const reassess = useCallback(() => {
    requestedRef.current = true;
    load(true);
  }, [load]);

  /**
   * THE BACKGROUND WORKER — debounced, so a burst of saves produces ONE
   * pass, and re-armed rather than doubled when a pass is already running.
   * Every queued trigger (a save, a dismissal, fresh semantic tags, a
   * profile edit) arrives here, and none of them is ever awaited by the
   * action that caused it.
   */
  // Annotated because the body re-arms itself: without a declared type the
  // self-reference would make its own type circular.
  const queueReload: (delayMs: number) => void = useCallback((delayMs: number) => {
    // No silent spend: only re-run for wardrobes that have used The Edit.
    if (!requestedRef.current && !hasBeauAssessment()) return;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      if (runningRef.current) {
        // A pass is mid-flight; let it finish and re-read after it.
        queueReload(5000);
        return;
      }
      requestedRef.current = true;
      load(false, true);
    }, delayMs);
  }, [load]);

  // The invalidation signature — VALUES, not identities. Unrelated renders
  // (optimistic overlays, tab switches, photo sweeps) leave it unchanged.
  const signature = useMemo(() => {
    if (!profile?.onboarding_complete) return '';
    const wardrobe = pieces
      .filter((p) => p.id > 0)
      .map((p) => `${p.id}:${p.name}:${p.category}:${p.slot || ''}`)
      .sort()
      .join('|');
    const prof = [
      (profile.archetypes || []).slice().sort().join(','),
      profile.height_range || '',
      profile.build || '',
      profile.skin_tone || '',
      profile.materials || '',
      (profile.occasions || []).slice().sort().join(','),
      profile.lifestyle?.setting || '',
      profile.lifestyle?.travel || '',
      profile.lifestyle?.city || '',
    ].join('~');
    const budget = Object.entries(budgets || {})
      .map(([k, b]) => `${k}:${b?.min_price ?? ''}-${b?.max_price ?? ''}`)
      .sort()
      .join('|');
    const pf = prefs ? `${prefs.secondhand || ''}~${prefs.free_text || ''}` : '';
    return [wardrobe, prof, budget, pf].join('\u241f');
  }, [profile, pieces, budgets, prefs]);

  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!signature) return;
    if (lastSignature.current === null) {
      // First computation of the session — record it, never reload for it.
      lastSignature.current = signature;
      return;
    }
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    // A real change: piece added/removed, archetypes updated, profile or
    // budget data changed. The delay lets Layer 1 tag fresh pieces first.
    queueReload(8000);
  }, [signature, queueReload]);

  // A SAVE asked for a fresh read (reassess-queue.ts). The save itself
  // already returned — this is the fire-and-forget half of it.
  useEffect(() => {
    const onRequested = () => queueReload(8000);
    window.addEventListener(REASSESS_REQUESTED_EVENT, onRequested);
    return () => window.removeEventListener(REASSESS_REQUESTED_EVENT, onRequested);
  }, [queueReload]);

  // Taste memory changes (dismiss / restore, from any surface incl. chat)
  // move the assessment fingerprint — re-reason with the gap re-opened.
  useEffect(() => {
    const onTasteMemory = () => queueReload(1500);
    window.addEventListener(TASTE_MEMORY_EVENT, onTasteMemory);
    return () => window.removeEventListener(TASTE_MEMORY_EVENT, onTasteMemory);
  }, [queueReload]);

  // City/climate, hair colour, palette notes and named style references live
  // in Dossier companion rows rather than StyleProfile. They now participate
  // in the assessment fingerprint, so a Dossier save queues the same quiet
  // background refresh as a wardrobe or profile change.
  useEffect(() => {
    const onDossier = () => queueReload(1500);
    window.addEventListener(DOSSIER_DETAILS_EVENT, onDossier);
    return () => window.removeEventListener(DOSSIER_DETAILS_EVENT, onDossier);
  }, [queueReload]);

  // Exact measurements and avatar/body figures also live outside
  // StyleProfile. Both save paths publish this event, so changes to height,
  // weight, build, skin tone or sizes cannot leave a cached read stale.
  useEffect(() => {
    const onMeasurements = () => queueReload(1500);
    window.addEventListener('ethaion:measurements', onMeasurements);
    return () => window.removeEventListener('ethaion:measurements', onMeasurements);
  }, [queueReload]);

  // Fresh Layer 1 tags landing sharpen the read — one pass per sweep.
  useEffect(() => {
    const onSemantics = () => queueReload(10000);
    window.addEventListener('ethaion:semantics-updated', onSemantics);
    return () => window.removeEventListener('ethaion:semantics-updated', onSemantics);
  }, [queueReload]);

  // Any other writer of the shared cache (e.g. a background refresh kicked
  // from chat flows) syncs this state without an extra call.
  useEffect(() => {
    const onUpdated = () => {
      const fresh = peekBeauAssessmentResult();
      if (fresh) setResult((current) => (current && current.generatedAt >= fresh.generatedAt ? current : fresh));
    };
    window.addEventListener('ethaion:assessment-updated', onUpdated);
    return () => window.removeEventListener('ethaion:assessment-updated', onUpdated);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
  }, []);

  const store = useMemo<BeauAssessmentStore>(
    () => ({ result, loading, reassessing, busy: loading || reassessing, phase, error, ensure, reassess }),
    [result, loading, reassessing, phase, error, ensure, reassess],
  );

  return <BeauAssessmentContext.Provider value={store}>{children}</BeauAssessmentContext.Provider>;
}
