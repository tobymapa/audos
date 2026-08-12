/**
 * THE PROGRESSIVE REVEAL — ONE rule for "this list is too long to render in
 * one go", used by every long list in the app rather than re-invented per
 * surface.
 *
 * The problem it solves is not the network, which lazy images already handle
 * (illustrations.tsx, product-photo.tsx): it is the RENDER. The maker
 * directory is a table of every brand Beau names, each row carrying archetype
 * chips, a price indicator, a rating tag and two action buttons — a couple of
 * thousand elements built and laid out before the customer has scrolled past
 * the first ten. The Rail's Tier 1 navigation is the same shape of cost
 * across its category sections.
 *
 * So a list renders its first page, drops a sentinel at the end of it, and
 * appends the next page when that sentinel comes near the viewport. Scrolling
 * feels the same as rendering everything — the reveal happens a viewport
 * ahead of the eye — and the first paint pays for one page instead of all of
 * them.
 *
 * THREE THINGS TO KNOW when using it:
 *   · `count` is what to slice the list to, and it never exceeds `total`.
 *   · `sentinelRef` goes on a small element AFTER the rendered rows. Render
 *     it only while `done` is false — an observed node that never leaves the
 *     viewport would keep firing.
 *   · `resetKey` is the list's IDENTITY, not its length: change it when the
 *     rows are a different set (a filter, a search, a tab), and the reveal
 *     starts from the first page again. Appending to the same list must NOT
 *     move it, or the reveal would collapse back on every append.
 *
 * No IntersectionObserver (old browser, test environment) means no reveal to
 * manage: everything renders at once, exactly as it did before this existed.
 *
 * THE ONE SUBTLETY, and it is the thing that breaks every hand-rolled version
 * of this: an IntersectionObserver only reports a CHANGE. A sentinel that is
 * still inside the margin after a page is appended never crosses a threshold
 * again, so it never fires again and the reveal stalls halfway down a long
 * list. The observer is therefore rebuilt after every reveal — a fresh
 * observation always delivers one callback — so a sentinel that is still in
 * view simply reveals the next page, and the next, until it is genuinely
 * below the margin or the list is exhausted and the caller unmounts it.
 */
import { useCallback, useEffect, useState } from 'react';

export interface ProgressiveReveal {
  /** Slice the list to this. Never more than `total`. */
  count: number;
  /** Attach to a small element rendered after the rows — only while `done`
   * is false. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Everything is on screen; the sentinel is no longer needed. */
  done: boolean;
}

export function useProgressiveReveal(
  total: number,
  options?: {
    /** Rows in the first page. Enough to fill a tall viewport. */
    initial?: number;
    /** Rows added each time the sentinel is reached. */
    step?: number;
    /** How far ahead of the viewport to reveal. A whole viewport by default,
     * so a page is always ready before it is looked at. */
    rootMargin?: string;
    /** The list's identity — changing it restarts the reveal. */
    resetKey?: string;
  },
): ProgressiveReveal {
  const initial = Math.max(1, options?.initial ?? 24);
  const step = Math.max(1, options?.step ?? initial);
  const rootMargin = options?.rootMargin ?? '100% 0px';
  const resetKey = options?.resetKey ?? '';

  const [revealed, setRevealed] = useState(initial);

  // A different SET of rows starts over; a longer version of the same set
  // does not.
  useEffect(() => {
    setRevealed(initial);
  }, [resetKey, initial]);

  // The sentinel node as STATE rather than a ref, so mounting it (or the
  // caller unmounting it once done) re-runs the effect below.
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  // An explicit ref callback rather than the setter itself: a state setter
  // treats a function argument as an updater, and a ref callback must never
  // be able to be read that way.
  const sentinelRef = useCallback((node: HTMLElement | null) => setSentinel(node), []);

  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setRevealed((current) => current + step);
      },
      { rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // `revealed` is a dependency ON PURPOSE: it rebuilds the observer after
    // each page so a still-visible sentinel reveals the next one.
  }, [sentinel, revealed, step, rootMargin]);

  // Without an observer nothing would ever reveal the rest, so the whole list
  // renders — slower, but never truncated.
  const supported = typeof IntersectionObserver !== 'undefined';
  const count = supported ? Math.min(total, revealed) : total;
  return { count, sentinelRef, done: count >= total };
}
