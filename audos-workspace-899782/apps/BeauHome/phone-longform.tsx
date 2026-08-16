/**
 * THE PHONE DISCLOSURE — one control for the copy a phone cannot carry whole.
 *
 * Several screens open with a paragraph written for a 66-character desktop
 * column: three or four sentences that set the page up. At 375px, and at the
 * phone type floor, the same paragraph runs to eight or nine lines and the
 * screen reads as a wall of text before the reader reaches anything they can
 * act on.
 *
 * PhoneMore holds that copy to its first few lines ON A PHONE ONLY, with a
 * quiet underlined control to read the rest in place. Above the breakpoint it
 * renders its children and nothing else — no wrapper of its own, no control,
 * no clamp — so no desktop screen changes by a pixel.
 *
 * NOTHING IS EVER LOST: the copy is clamped, never cut. The control is the
 * house's mono small-caps in tobacco gold and carries hab-tap, so it is a real
 * 44px target.
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import { ACCENT_DEEP, mono } from './index-style';

/** The phone breakpoint the mobile type floor and touch rules use. */
const PHONE_QUERY = '(max-width: 639.98px)';

/** True while the viewport is a phone. Re-reads on resize and rotation. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(PHONE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches);
    setPhone(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return phone;
}

export function PhoneMore({
  children,
  /** How many lines stand before the control on a phone. */
  lines = 4,
  moreLabel = 'Read the rest',
  lessLabel = 'Less',
}: {
  children: React.ReactNode;
  lines?: number;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);

  if (!phone) return <>{children}</>;

  return (
    <>
      <div
        style={
          open
            ? undefined
            : {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: lines,
                overflow: 'hidden',
              }
        }
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hab-tap transition-opacity hover:opacity-70"
        style={{
          ...mono(8.5, ACCENT_DEEP),
          background: 'transparent',
          border: 'none',
          padding: '2px 0',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          cursor: 'pointer',
        }}
      >
        {open ? lessLabel : moreLabel}
      </button>
    </>
  );
}

/**
 * A whole BLOCK a phone opens closed — a legend, a key, a set of definitions:
 * useful to have, not what the reader came for, and several inches of copy on
 * a 375px screen. On a desktop the block renders exactly as it always did,
 * with no control in front of it.
 */
export function PhoneReveal({
  children,
  /** What the block is, named in the control: "what the five reads mean". */
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);

  if (!phone) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hab-tap transition-opacity hover:opacity-70"
        style={{
          ...mono(8.5, ACCENT_DEEP),
          background: 'transparent',
          border: 'none',
          padding: '4px 0',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {(open ? 'Hide ' : 'Show ') + label}
      </button>
      {open ? children : null}
    </>
  );
}
