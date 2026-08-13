/**
 * THE CRUMB TRAIL — the app's ONE back-button + breadcrumb treatment, used
 * on every drill-down surface (founder's correction, August 2026):
 *
 *   ← BACK · [PARENT]     ETHAION / THE INDEX / COATS / WOOL OVERCOAT
 *
 * · BackPill — the bordered “← BACK” control, optionally carrying the
 *   parent's label after a middot.
 * · CrumbTrail — the small-caps path. Every segment with an onClick is a
 *   link back up the path; the current page (the last segment) renders
 *   plain in walnut. The first segment is usually “Ethaion”.
 *
 * Both are drawn entirely from the shared warm-editorial tokens
 * (index-style.tsx) — nothing here sets a colour of its own.
 */
import type React from 'react';
import {
  ACCENT_DEEP,
  FAINTER,
  RULE,
  SECONDARY,
  WALNUT,
  mono,
} from './index-style';

export interface CrumbSegment {
  label: string;
  /** Present on every segment that links back up the path. */
  onClick?: () => void;
}

/** Deep link to another primary tab — used by trails whose first segment
 * is the wordmark (it lands on The Ledger, the app's first tab). */
export function goToEthaionTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab } }));
}

export function BackPill({
  label,
  onClick,
}: {
  /** The parent surface's name — “The Index”, “Beau's Picks”. Omit for a
   * bare “← BACK”. */
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:bg-[rgba(168,113,44,0.08)]"
      style={{
        ...mono(8.5, ACCENT_DEEP),
        border: `1px solid ${RULE}`,
        background: 'transparent',
        padding: '7px 13px',
        whiteSpace: 'nowrap',
        borderRadius: 0,
      }}
    >
      ← Back{label ? ` · ${label}` : ''}
    </button>
  );
}

export function CrumbTrail({ segs, style }: { segs: CrumbSegment[]; style?: React.CSSProperties }) {
  return (
    <nav aria-label="Where you are" className="flex items-baseline flex-wrap" style={{ gap: '4px 9px', minWidth: 0, ...style }}>
      {segs.map((seg, i) => {
        const last = i === segs.length - 1;
        return (
          <span key={`${seg.label}-${i}`} className="inline-flex items-baseline" style={{ gap: '9px', minWidth: 0 }}>
            {i > 0 && (
              <span aria-hidden="true" style={mono(8.5, FAINTER)}>
                /
              </span>
            )}
            {seg.onClick && !last ? (
              <button
                type="button"
                onClick={seg.onClick}
                className="hover:underline text-left"
                style={{ ...mono(8.5, SECONDARY), background: 'transparent', padding: 0, border: 'none' }}
              >
                {seg.label}
              </button>
            ) : (
              <span aria-current={last ? 'page' : undefined} style={mono(8.5, last ? WALNUT : SECONDARY)}>
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** The full header row most drill-downs open with — the pill at the left,
 * the trail beside it, wrapping on a phone. */
export function CrumbHeader({
  backLabel,
  onBack,
  segs,
  right,
}: {
  backLabel?: string;
  onBack: () => void;
  segs: CrumbSegment[];
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap" style={{ gap: '10px 18px' }}>
      <div className="flex items-center flex-wrap" style={{ gap: '10px 16px', minWidth: 0 }}>
        <BackPill label={backLabel} onClick={onBack} />
        <CrumbTrail segs={segs} />
      </div>
      {right != null && <div className="flex items-center">{right}</div>}
    </div>
  );
}
