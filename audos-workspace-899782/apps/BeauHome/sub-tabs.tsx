/**
 * THE SHARED SUB-TAB BAR (Recommendation Engine overhaul, Part 4).
 *
 * ONE component behind every sub-tab row in the app — The Rail's
 * "For You / World of Menswear" and The Hunt's "Find / Discover / Compare /
 * Matrix / Your Hunt History" — so the two can never drift apart again.
 *
 * TWO STYLE VARIANTS are kept side by side so the founder can compare them
 * with a ONE-LINE change (ACTIVE_SUB_TAB_VARIANT below):
 *
 *  · `sub-tab--style-a` — the underline register The Rail used to carry:
 *    Lora 12px small-caps, walnut when active over a hairline underline
 *    indicator, muted walnut when not, on a hairline baseline rule.
 *  · `sub-tab--style-b` — The Hunt's chip register (THE ACTIVE ONE):
 *    Cormorant 12px small-caps in a hairline-outlined chip, the active chip
 *    filled accent-100 with a tobacco-gold border and accent-800 text; the
 *    row scrolls horizontally on narrow screens.
 *
 * Design system untouched: no new colours, no shadows, hairlines only. The
 * variant name is also emitted as a className on the row and on each button,
 * so the active variant is visible in the DOM and can be targeted in CSS.
 */
import type React from 'react';

export type SubTabVariant = 'sub-tab--style-a' | 'sub-tab--style-b';

/**
 * THE ONE-LINE SWITCH. Both variants stay in the code; flip this to
 * 'sub-tab--style-a' to put The Rail AND The Hunt back on the underline
 * treatment. Style B matches The Hunt's existing chips, so it is active.
 */
export const ACTIVE_SUB_TAB_VARIANT: SubTabVariant = 'sub-tab--style-b';

export interface SubTabItem<T extends string> {
  id: T;
  label: string;
  /** Appended to the label — e.g. The Hunt's Compare queue count. */
  suffix?: string;
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
// Variant B — The Hunt's hairline chips (active).
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
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className={`${variant} ${styleA ? STYLE_A_ROW : STYLE_B_ROW} ${className}`}
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', ...style }}
    >
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            onClick={() => onChange(item.id)}
            className={`${variant}__tab ${styleA ? STYLE_A_BUTTON : styleBClass(isActive)}`}
            style={styleA ? styleAButton(isActive) : styleBButton(isActive)}
          >
            {item.label}
            {item.suffix || ''}
          </button>
        );
      })}
    </nav>
  );
}
