/**
 * useOnScreen — the viewport gate for expensive per-card work.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several card components resolve their own product photograph on mount, and
 * `resolveProductImageCandidates` is not cheap: an og:image fetch, then an
 * image search, then a web search to locate the product page and read ITS
 * og:image. Three network round-trips per card.
 *
 * Rendered ungated, a grid of twenty cards fires sixty requests before the
 * customer has scrolled — most of them for cards below the fold, and some for
 * cards in tabs that stay mounted under `display:none` after being visited.
 * A DevTools profile of exactly this pattern measured an 11.8s Interaction to
 * Next Paint.
 *
 * `loading="lazy"` on the `<img>` does NOT solve this. That defers the image
 * DOWNLOAD; it does nothing about the effect that decides which image to
 * download in the first place. The effect has to be gated separately, which is
 * what this hook is for.
 *
 * USAGE
 * -----
 *   const [ref, onScreen] = useOnScreen<HTMLDivElement>();
 *   useEffect(() => {
 *     if (!onScreen) return;      // ← the gate
 *     void resolveProductImageCandidates(subject).then(…);
 *   }, [onScreen, subjectKey]);
 *   return <div ref={ref}>…</div>;
 *
 * The flag LATCHES: once a card has been seen it stays eligible, so scrolling
 * back and forth does not re-arm the work. `rootMargin` starts it slightly
 * before the card arrives, so the image is usually ready by the time it is
 * looked at.
 */
import { useEffect, useRef, useState } from 'react';

/** How far outside the viewport a card starts preparing itself. Roughly one
 * card-height of runway — enough to hide the latency, small enough that a fast
 * scroll past does not trigger a stampede. */
const ROOT_MARGIN = '200px';

export function useOnScreen<T extends HTMLElement = HTMLDivElement>(): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T | null>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    if (onScreen) return; // Latched — nothing left to observe.
    const el = ref.current;
    if (!el) return;

    // No observer (a very old engine): fall back to the previous behaviour
    // rather than never resolving an image at all. Degrading to "slow" is
    // acceptable; degrading to "blank" is not.
    if (typeof IntersectionObserver !== 'function') {
      setOnScreen(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOnScreen(true);
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScreen]);

  return [ref, onScreen];
}
