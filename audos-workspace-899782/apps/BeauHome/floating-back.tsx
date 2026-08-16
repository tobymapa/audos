/**
 * FLOATING BACK BUTTON (founder's fix) — a small fixed control pinned to
 * the top-left of the viewport once the user has scrolled down inside a
 * sub-view, so "back" never requires scrolling to the top first.
 *
 * Rules:
 *  · It renders ONLY when a back action exists — the caller (App.tsx)
 *    passes the SAME handler the sub-view's own back button uses, and
 *    passes nothing at all on top-level tab roots.
 *  · It appears ONLY after the page has scrolled past a threshold — at the
 *    top, the sub-view's own back control is already in reach and a
 *    floating twin would just double it.
 *  · The space can scroll on the window OR on an inner container (the
 *    shell decides), so scrolling is observed in the CAPTURE phase and the
 *    deepest scrolled offset wins.
 *
 * Palette (Ethaion): #FBF8F1 card on a #D9CFBE hairline, walnut #241a12
 * text with the oxblood #8B3A3A arrow — small and unobtrusive, never a
 * filled primary button.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

/** How far down the view must be scrolled before the button appears. */
const SHOW_AFTER_PX = 220;

export function FloatingBackButton({ onBack, label = 'Back' }: { onBack: () => void; label?: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const read = (target?: EventTarget | null) => {
      const doc = document.scrollingElement || document.documentElement;
      let top = doc ? doc.scrollTop : 0;
      if (target && target instanceof Element) top = Math.max(top, target.scrollTop);
      setScrolled(top > SHOW_AFTER_PX);
    };
    const onScroll = (e: Event) => read(e.target);
    read();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  if (!scrolled) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={label}
      title={label}
      className="fixed z-40 inline-flex items-center gap-1.5 hover:underline"
      style={{
        // Below the sticky tab bar (47px + a breath), clear of its hit area.
        top: '58px',
        left: '12px',
        fontFamily: 'var(--space-font-family)',
        fontSize: 'max(var(--eth-label, 0px), 12.5px)',
        letterSpacing: '0.04em',
        color: '#241a12',
        background: '#FBF8F1',
        border: '1px solid #D9CFBE',
        borderRadius: '999px',
        padding: '7px 14px 7px 10px',
        boxShadow: '0 2px 10px rgba(36, 26, 18, 0.14)',
        cursor: 'pointer',
      }}
    >
      <ArrowLeft className="w-3.5 h-3.5" style={{ color: '#8B3A3A' }} aria-hidden="true" />
      {label}
    </button>
  );
}
