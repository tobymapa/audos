/**
 * THE INDEX · SHARED STYLE — the small furniture both faces of the rebuilt
 * Index share: the warm-editorial palette (the same inks every other tab
 * sets), the three type helpers, the filter chip, the tier label and the
 * Reset control. Nothing here navigates — the rebuilt Index is a pure
 * reference surface with no drill-down.
 */
import type React from 'react';
import { MONO } from './mono-type';

export const SERIF = 'var(--space-font-heading)';
export const BODY = 'var(--space-font-family)';
export const WALNUT = '#241a12';
export const INK = '#3b2b1d';
export const SECONDARY = '#634e38';
export const MUTED = '#856c51';
export const FAINT = '#a68e70';
export const FAINTER = '#bfae96';
export const ACCENT = '#a8712c';
export const ACCENT_DEEP = '#7c4a17';
export const PAPER = '#fbf8f1';
/** The page ground every tab sits on. */
export const PAGE = '#efe7d9';
/** The wash under a working canvas — a shade between the page and the paper
 * (The Fitting's centre panel). */
export const CANVAS = '#f4eee3';
export const HAIRLINE = 'rgba(59,43,29,0.18)';
export const RULE = 'rgba(59,43,29,0.34)';

// The washes and the two inks that only appear ON the walnut band. Kept here
// with the rest of the palette so no surface has to spell a colour of its own.
/** The accent wash behind an active chip, pill or tag. */
export const TINT = 'rgba(168,113,44,0.12)';
/** The lighter accent wash a control takes on hover. */
export const TINT_SOFT = 'rgba(168,113,44,0.06)';
/** The oatmeal ground an opened row sits on, a shade under the page. */
export const WASH = 'rgba(59,43,29,0.05)';
/** Body copy on the walnut band. */
export const ON_WALNUT = '#fbf1de';
/** The small-caps label on the walnut band. */
export const ON_WALNUT_GOLD = '#e3c184';

// THE PHONE READING FLOOR. Every tab sets its type through these three
// helpers, so the mobile legibility floor belongs here rather than at the
// hundreds of call sites. Each size is written as a max() against a variable
// declared in Desktop.tsx: --eth-* is 0px above the phone breakpoint, so the
// size the caller asked for is used exactly as written and no desktop screen
// can move; inside the query the variable becomes the smallest size that tab
// is allowed to set. Retuning the whole app is therefore one edit there.
export function mono(size = 9, color = FAINT): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: `max(var(--eth-micro, 0px), ${size}px)`,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color,
  };
}

export function serif(size = 17, color = WALNUT): React.CSSProperties {
  // Cormorant Garamond has a small x-height for its point size, so it needs a
  // higher floor than the sans body face to read at the same distance.
  return { fontFamily: SERIF, fontSize: `max(var(--eth-serif, 0px), ${size}px)`, fontWeight: 400, color };
}

export function body(size = 14, color = INK): React.CSSProperties {
  return { fontFamily: BODY, fontSize: `max(var(--eth-body, 0px), ${size}px)`, lineHeight: 1.6, color };
}

// ---------------------------------------------------------------------------
// The temperature colouring — warm at the hot end, cool at the cold end,
// both kept muted so the bars stay quiet against the paper.
// ---------------------------------------------------------------------------

const WARM_POLE: [number, number, number] = [168, 113, 44]; // the accent amber
const COOL_POLE: [number, number, number] = [92, 122, 138]; // a slate blue

/** The muted colour one temperature reads as, between the two poles. */
export function tempColor(celsius: number, lo: number, hi: number, alpha = 0.72): string {
  const t = Math.min(1, Math.max(0, (celsius - lo) / (hi - lo)));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgba(${mix(COOL_POLE[0], WARM_POLE[0])}, ${mix(COOL_POLE[1], WARM_POLE[1])}, ${mix(COOL_POLE[2], WARM_POLE[2])}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// The filter chip — one pill treatment for every row on both faces.
// ---------------------------------------------------------------------------

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      // hab-tap grows the chip to the 44px minimum touch target on a phone and
      // is inert on desktop, where it keeps its compact editorial height.
      className="transition-colors flex-shrink-0 hab-tap"
      style={{
        ...mono(9, active ? '#5c3413' : SECONDARY),
        background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
        border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
        borderRadius: '999px',
        padding: '7px 14px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/** The small left-hand label each filter row carries. On a phone the fixed
 * 76px column is more than a fifth of the screen and leaves the chips beside
 * it squeezed into a ragged strip, so hab-tier-label gives the label the line
 * above them instead and the chips wrap under it at full width. */
export function TierLabel({ children }: { children: string }) {
  return (
    <span className="hab-tier-label" style={{ ...mono(8, FAINT), flexShrink: 0, width: '76px', paddingTop: '9px' }}>
      {children}
    </span>
  );
}

/** The one Reset — clears every filter row at once; top right of the bar. */
export function ResetButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clear every active filter"
      className="transition-colors flex-shrink-0 hab-tap hover:bg-[rgba(168,113,44,0.06)]"
      style={{
        ...mono(8.5, active ? ACCENT_DEEP : FAINTER),
        background: 'transparent',
        border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
        borderRadius: '999px',
        padding: '7px 14px',
        whiteSpace: 'nowrap',
      }}
    >
      Reset ×
    </button>
  );
}
