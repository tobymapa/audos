/**
 * THE SHARED SUB-TAB BAR (Recommendation Engine overhaul, Part 4).
 *
 * ONE component behind every sub-tab row in the app — e.g. The Rail's
 * "For You / World of Menswear" — so sub-tab rows can never drift apart.
 *
 * THREE STYLE VARIANTS are kept side by side so the founder can compare them
 * with a ONE-LINE change (ACTIVE_SUB_TAB_VARIANT below, or a `variant` prop on
 * a single row):
 *
 *  · `sub-tab--style-a` — the underline register The Rail used to carry:
 *    Lora 12px small-caps, walnut when active over a hairline underline
 *    indicator, muted walnut when not, on a hairline baseline rule.
 *  · `sub-tab--style-b` — the chip register (THE DEFAULT):
 *    Cormorant 12px small-caps in a hairline-outlined chip, the active chip
 *    filled accent-100 with a tobacco-gold border and accent-800 text; the
 *    row scrolls horizontally on narrow screens.
 *  · `sub-tab--index-face` — THE INDEX'S OWN FACE TOGGLE, the treatment its
 *    Pieces · Makers chips carry (index-tab.tsx): IBM Plex Mono 8.5px
 *    small-caps, paper ground with a walnut rule when off, filled walnut with
 *    cream type when on, square corners, 9×16px padding, and the chips butted
 *    together on a shared hairline. Every value is pulled from the same
 *    index-style tokens the Index reads, so the two rows cannot drift.
 *
 * Design system untouched: no new colours, no shadows, hairlines only. The
 * variant name is also emitted as a className on the row and on each button,
 * so the active variant is visible in the DOM and can be targeted in CSS.
 */
import type React from 'react';
import { PAPER, RULE, SECONDARY, WALNUT, mono } from './index-style';

export type SubTabVariant = 'sub-tab--style-a' | 'sub-tab--style-b' | 'sub-tab--index-face';

/**
 * THE ONE-LINE SWITCH — the DEFAULT for a row that does not name a variant.
 * Every variant stays in the code; flip this to 'sub-tab--style-a' to put the
 * rows back on the underline treatment. Style B is the chip treatment. The
 * Hunt asks for 'sub-tab--index-face' by name, so its chips read exactly as
 * The Index's Pieces · Makers toggle does.
 */
export const ACTIVE_SUB_TAB_VARIANT: SubTabVariant = 'sub-tab--style-b';

export interface SubTabItem<T extends string> {
  id: T;
  label: string;
  /** Appended to the label — e.g. a queue count. */
  suffix?: string;
  /** Emitted as data-tour on the button — lets the first-run walkthrough
   * (onboarding-tour.tsx) ring individual sub-tabs. */
  tourAnchor?: string;
}

// ---------------------------------------------------------------------------
// Variant A — hairline underline indicator.
// ---------------------------------------------------------------------------

const STYLE_A_ROW = 'flex items-end gap-7 overflow-x-auto border-b border-[var(--color-divider,rgba(59,43,29,0.18))]';

function styleAButton(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--space-font-family)',
    fontSize: '12px',
    letterSpacing: '0.12em',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-text,#3b2b1d)' : 'var(--color-neutral-600,#856c51)',
    padding: '10px 2px 11px',
    marginBottom: '-1px',
    borderBottom: active ? '1px solid var(--color-text,#3b2b1d)' : '1px solid transparent',
    minHeight: '44px',
    whiteSpace: 'nowrap',
  };
}

const STYLE_A_BUTTON = 'uppercase flex-shrink-0 transition-colors hover:text-[var(--space-text-primary)]';

// ---------------------------------------------------------------------------
// Variant B — the hairline chips (active).
// ---------------------------------------------------------------------------

const STYLE_B_ROW = 'flex items-center gap-1.5 overflow-x-auto';

function styleBButton(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--space-font-heading)',
    fontSize: '12px',
    letterSpacing: '0.1em',
    fontWeight: active ? 500 : 400,
  };
}

function styleBClass(active: boolean): string {
  return `uppercase whitespace-nowrap min-h-[40px] px-4 rounded border transition-colors flex-shrink-0 ${
    active
      ? 'border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
      : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)] hover:border-[var(--space-border-strong)]'
  }`;
}

// ---------------------------------------------------------------------------
// Variant — the Index's face toggle, value for value.
// ---------------------------------------------------------------------------

const INDEX_FACE_ROW = 'flex overflow-x-auto';

/** The cream the Index sets its active chip's type in. */
const ON_WALNUT_CHIP = '#f6f0e5';

function indexFaceButton(active: boolean, first: boolean): React.CSSProperties {
  return {
    ...mono(8.5, active ? ON_WALNUT_CHIP : SECONDARY),
    background: active ? WALNUT : PAPER,
    border: `1px solid ${active ? WALNUT : RULE}`,
    padding: '9px 16px',
    whiteSpace: 'nowrap',
    marginLeft: first ? 0 : '-1px',
  };
}

// ---------------------------------------------------------------------------
// The bar itself.
// ---------------------------------------------------------------------------

export function SubTabs<T extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  variant = ACTIVE_SUB_TAB_VARIANT,
  className = '',
  style,
}: {
  items: Array<SubTabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Defaults to ACTIVE_SUB_TAB_VARIANT — pass explicitly only to preview. */
  variant?: SubTabVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  const styleA = variant === 'sub-tab--style-a';
  const indexFace = variant === 'sub-tab--index-face';
  const row = styleA ? STYLE_A_ROW : indexFace ? INDEX_FACE_ROW : STYLE_B_ROW;
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className={`${variant} ${row} ${className}`}
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', ...style }}
    >
      {items.map((item, i) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tour={item.tourAnchor}
            aria-selected={isActive}
            aria-pressed={isActive}
            onClick={() => onChange(item.id)}
            // hab-tap holds every variant of the chip to the 44px touch
            // minimum on a phone (style B sat at 40px and the Index face
            // variant at about 33px) and does nothing above the breakpoint.
            className={`${variant}__tab hab-tap ${styleA ? STYLE_A_BUTTON : indexFace ? 'transition-colors flex-shrink-0' : styleBClass(isActive)}`}
            style={
              styleA
                ? styleAButton(isActive)
                : indexFace
                  ? indexFaceButton(isActive, i === 0)
                  : styleBButton(isActive)
            }
          >
            {item.label}
            {item.suffix || ''}
          </button>
        );
      })}
    </nav>
  );
}
