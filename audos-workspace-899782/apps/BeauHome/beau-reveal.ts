/**
 * BEAU "TYPING" — progressive text reveal (Performance overhaul, Part 3.2).
 *
 * Beau's chat already streams token-by-token over SSE (the platform agent
 * runtime). His OTHER voices — the reasoning strip in The Fitting, the
 * verdict band in The Edit, brand-dossier verdicts and the Compare verdict
 * — arrive through the BYOK secrets proxy, which returns the whole response
 * in one wrapped JSON envelope (no SSE pass-through exists on that path).
 * This hook gives those surfaces the same perceived behaviour: when a NEW
 * piece of Beau text lands, it types on progressively instead of snapping
 * in after a spinner.
 *
 * CACHE-AWARE BY CONSTRUCTION: text present at FIRST RENDER (a cached
 * assessment, a restored Fitting canvas, a history row) shows instantly —
 * only text that CHANGES while the surface is mounted (a fresh model
 * response, a quick-adjust result) animates. Callers can also force either
 * behaviour with the `animate` option (e.g. a result view that mounts
 * fresh with a brand-new answer passes `animate: true`).
 */
import { useEffect, useRef, useState } from 'react';

const TICK_MS = 45;
const WORDS_PER_TICK = 3;

export function useBeauReveal(
  text: string | null | undefined,
  options?: {
    /** true — always animate (fresh-answer views that mount with the new
     * text); false — never animate (history / stored views); undefined —
     * animate only when the text changes while mounted. */
    animate?: boolean;
  },
): string {
  const target = text || '';
  const mode = options?.animate;
  const firstRender = useRef(true);
  const [shown, setShown] = useState(() => (mode === true ? '' : target));
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const isFirst = firstRender.current;
    firstRender.current = false;
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const shouldAnimate = mode === true || (mode === undefined && !isFirst);
    if (!shouldAnimate || !target) {
      setShown(target);
      return;
    }
    const words = target.split(/(\s+)/); // keep the whitespace tokens
    let cursor = 0;
    setShown('');
    timerRef.current = window.setInterval(() => {
      // Reveal in word groups — reads like typing without per-letter churn.
      let advanced = 0;
      while (cursor < words.length && advanced < WORDS_PER_TICK) {
        if (words[cursor].trim()) advanced += 1;
        cursor += 1;
      }
      setShown(words.slice(0, cursor).join(''));
      if (cursor >= words.length && timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, TICK_MS);
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return shown;
}
