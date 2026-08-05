/**
 * THE RE-ASSESSMENT QUEUE — the seam between SAVING a piece and Beau
 * re-reading the wardrobe.
 *
 * They are two operations, not one. A save is a database write: it is fast,
 * and it is the only thing the user ever waits on. Beau's re-assessment is a
 * model call: it takes as long as it takes, and nothing in the interface may
 * be held open for it.
 *
 *   savePiece()  →  await the write        — the user waits on THIS, and
 *                →  queueWardrobeReassessment()   returns immediately
 *                →  return
 *
 *   the worker   →  status 'reassessing'
 *                →  the model call
 *                →  store the assessment
 *                →  status 'idle'
 *
 * `queueWardrobeReassessment` is fire-and-forget by construction: it returns
 * void, it never throws, and it does no work itself — it posts a request and
 * the worker picks it up. The worker is BeauAssessmentProvider
 * (beau-assessment-context.tsx), which owns the debounce (a burst of saves
 * produces ONE pass), the no-silent-spend gate and the result cache.
 *
 * The status is a plain module value plus an event, rather than React state,
 * so ANY surface can subscribe to it — the screen the save happened on, not
 * only the screen the assessment is displayed on — and show a small
 * non-blocking indicator while Beau catches up. Nothing blocks on it, and
 * nothing reloads the page when it clears: the sections that depend on the
 * assessment (the Verdict, the Coverage Map, Complete the Look) re-render in
 * place from the new result.
 */
import { useEffect, useState } from 'react';

export type ReassessStatus = 'idle' | 'reassessing';

/** A save (or any other wardrobe change) asking for a fresh read. */
export const REASSESS_REQUESTED_EVENT = 'ethaion:reassess-requested';

/** The worker announcing where the background pass has got to. */
export const REASSESS_STATUS_EVENT = 'ethaion:reassess-status';

let status: ReassessStatus = 'idle';

/** Synchronous read — for a surface mounting mid-pass. */
export function getReassessStatus(): ReassessStatus {
  return status;
}

/**
 * The worker's only write. Broadcasting is what lets an indicator anywhere in
 * the app follow the job without being wired to the provider.
 */
export function setReassessStatus(next: ReassessStatus): void {
  if (status === next) return;
  status = next;
  try {
    window.dispatchEvent(new CustomEvent(REASSESS_STATUS_EVENT, { detail: { status: next } }));
  } catch { /* no window (SSR / test) — the module value still holds it */ }
}

/**
 * Queue Beau's wardrobe re-assessment and RETURN. Called at the save
 * boundary, immediately after the fast write lands: it must never be
 * awaited, and it deliberately gives the caller nothing to await.
 *
 * `reason` is only for the console trail — which save asked for the pass.
 */
export function queueWardrobeReassessment(reason: string): void {
  try {
    window.dispatchEvent(new CustomEvent(REASSESS_REQUESTED_EVENT, { detail: { reason } }));
  } catch { /* the provider's own invalidation watcher still covers it */ }
}

/**
 * Subscribe to the job's status. Returns the unsubscribe function.
 */
export function subscribeReassessStatus(listener: (next: ReassessStatus) => void): () => void {
  const handler = (event: Event) => {
    const next = (event as CustomEvent<{ status?: ReassessStatus }>).detail?.status;
    listener(next === 'reassessing' ? 'reassessing' : 'idle');
  };
  window.addEventListener(REASSESS_STATUS_EVENT, handler);
  return () => window.removeEventListener(REASSESS_STATUS_EVENT, handler);
}

/**
 * The status as React state, for the small non-blocking indicator. Seeded
 * synchronously so a surface that mounts mid-pass shows it at once.
 */
export function useReassessStatus(): ReassessStatus {
  const [current, setCurrent] = useState<ReassessStatus>(() => getReassessStatus());
  useEffect(() => {
    setCurrent(getReassessStatus());
    return subscribeReassessStatus(setCurrent);
  }, []);
  return current;
}
