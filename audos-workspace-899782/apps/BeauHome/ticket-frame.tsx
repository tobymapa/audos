/**
 * TICKET-FRAME — the corner-bracket card language (Milestones overhaul,
 * Part 5). Four hairline corner marks at each corner of a card, like a
 * photographic mount or a tailor's spec-sheet corner brackets.
 *
 * Used across The Edit (coverage map, Complete the Look) and The Rail
 * (spec sheets). Solid-line boxes mark confirmed/owned items; broken
 * (dashed) boxes mark gaps and recommendations. Hairline borders
 * throughout, no box-shadows.
 *
 * WHERE COLOUR IS AND ISN'T ALLOWED (Recommendation Engine overhaul,
 * Part 2). Individual PIECES are never colour-coded anywhere in the app —
 * in The Ledger, on a coverage cell's own labels, on any piece row or icon,
 * solid vs broken box and plain walnut ink carry the whole distinction.
 * The ONE exception, deliberately preserved: the coverage map's
 * CATEGORY-LEVEL owned indicator — the sage ground and tick that mark a
 * category as covered. That reads on the category, never on a piece.
 */
import type { CSSProperties, ReactNode } from 'react';

/** Sage green — the coverage map's CATEGORY-LEVEL "covered" indicator (its
 * hairline and tick), with SAGE_SOFT as the matching ground. Reserved for
 * that one job: never apply it to an individual piece's row, icon or label. */
export const SAGE = '#8a9e7a';
export const SAGE_SOFT = 'rgba(138,158,122,0.22)';

/** Solid box for a COVERED category — the sage hairline over its soft
 * ground. The piece labels inside stay walnut: the indicator is sage, the
 * pieces are not. */
export const coveredBoxStyle: CSSProperties = {
  border: `1px solid ${SAGE}`,
  background: SAGE_SOFT,
};

const MARK = 'var(--color-text,#3b2b1d)';
const MARK_LEN = 14;
const MARK_W = 1;

function CornerMark({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base: CSSProperties = {
    position: 'absolute',
    width: `${MARK_LEN}px`,
    height: `${MARK_LEN}px`,
    pointerEvents: 'none',
  };
  const pos: Record<string, CSSProperties> = {
    tl: { top: 0, left: 0, borderTop: `${MARK_W}px solid ${MARK}`, borderLeft: `${MARK_W}px solid ${MARK}` },
    tr: { top: 0, right: 0, borderTop: `${MARK_W}px solid ${MARK}`, borderRight: `${MARK_W}px solid ${MARK}` },
    bl: { bottom: 0, left: 0, borderBottom: `${MARK_W}px solid ${MARK}`, borderLeft: `${MARK_W}px solid ${MARK}` },
    br: { bottom: 0, right: 0, borderBottom: `${MARK_W}px solid ${MARK}`, borderRight: `${MARK_W}px solid ${MARK}` },
  };
  return <span aria-hidden="true" style={{ ...base, ...pos[corner] }} />;
}

/**
 * The ticket-frame card: paper ground, four corner brackets, generous
 * padding. Content renders inside; the frame never adds shadows or radius.
 */
export function TicketFrame({
  children,
  className = '',
  style,
  padding = '20px',
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: string;
}) {
  return (
    <div
      className={`relative bg-[var(--color-paper,#fbf8f1)] ${className}`}
      style={{ padding, ...style }}
    >
      <CornerMark corner="tl" />
      <CornerMark corner="tr" />
      <CornerMark corner="bl" />
      <CornerMark corner="br" />
      {children}
    </div>
  );
}

/** Solid-line box — a confirmed / owned item. */
export const solidBoxStyle: CSSProperties = {
  border: '1px solid var(--color-divider,rgba(59,43,29,0.34))',
};

/** Broken-line box — a gap or a recommendation. */
export const dashedBoxStyle: CSSProperties = {
  border: '1px dashed var(--color-divider,rgba(59,43,29,0.4))',
};
