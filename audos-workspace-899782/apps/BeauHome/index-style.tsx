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
export const HAIRLINE = 'rgba(59,43,29,0.18)';
export const RULE = 'rgba(59,43,29,0.34)';

export function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.07em', textTransform: 'uppercase', color };
}

export function serif(size = 17, color = WALNUT): React.CSSProperties {
  return { fontFamily: SERIF, fontSize: `${size}px`, fontWeight: 400, color };
}

export function body(size = 14, color = INK): React.CSSProperties {
  return { fontFamily: BODY, fontSize: `${size}px`, lineHeight: 1.6, color };
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
      className="transition-colors flex-shrink-0"
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

/** The small left-hand label each filter row carries. */
export function TierLabel({ children }: { children: string }) {
  return <span style={{ ...mono(8, FAINT), flexShrink: 0, width: '76px', paddingTop: '9px' }}>{children}</span>;
}

/** The one Reset — clears every filter row at once; top right of the bar. */
export function ResetButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clear every active filter"
      className="transition-colors flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)]"
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
