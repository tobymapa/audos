/**
 * BEAU'S PROGRESS BAR — the one loading treatment for every wait where Beau
 * is putting something together: reading the rail, drawing picks, composing
 * a fitting, weighing a link (founder's request, August 2026).
 *
 * The bar advances on a clock — quickly at first, easing as the wait goes
 * on — and never quite reaches the end on its own: completion is the moment
 * the work actually lands, when the bar's owner unmounts it and the finished
 * content takes its place. It is drawn purely from the shared tokens
 * (index-style.tsx); nothing here sets a colour of its own.
 */
import { useEffect, useState } from 'react';
import { ACCENT, FAINT, mono } from './index-style';

export function BeauProgressBar({
  label,
  height = 3,
  maxWidth = '340px',
}: {
  /** The line under the bar — what Beau is doing. Omit for the bare bar. */
  label?: string | null;
  height?: number;
  maxWidth?: string;
}) {
  const [pct, setPct] = useState(4);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      // Asymptotic ease toward 92%: fast to sixty, patient after — the last
      // stretch belongs to the real work, not the clock.
      const next = 92 * (1 - Math.exp(-seconds / 6));
      setPct((cur) => Math.max(cur, Math.min(92, next)));
    }, 180);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label || 'Beau is working'} style={{ width: '100%', maxWidth }}>
      <div style={{ height: `${height}px`, background: 'rgba(59,43,29,0.14)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: ACCENT, transition: 'width 240ms ease' }} />
      </div>
      {label ? <p style={{ ...mono(8.5, FAINT), margin: '7px 0 0' }}>{label}</p> : null}
    </div>
  );
}
