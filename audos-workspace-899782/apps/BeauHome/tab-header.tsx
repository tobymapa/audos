/**
 * THE TAB MASTHEAD — ONE header for all six primary tabs (The Ledger · The
 * Edit · The Fitting · The Hunt · The Index · The Dossier).
 *
 * Every tab used to set its own: different indentation, different type
 * sizes, some with a closing hairline and some without, standfirsts running
 * to three lines on one tab and one on the next. This component is the one
 * place that decides all of it, so the six can never drift again:
 *
 *  · INDENT — px-6 (sm:px-10) from the screen edge, the block centred at
 *    max-w-[1180px], exactly as the content beneath it.
 *  · SPACE — 52px above the title (clear of the tab bar), 10px between the
 *    title and the standfirst, 32px below it to the closing hairline.
 *  · HEIGHT — the title row holds a fixed 92px minimum, so the masthead is
 *    the SAME height on all six tabs whatever sits in the aside.
 *  · TYPE — the title is `hab-page-title` (Cormorant 52px / 38px on a
 *    phone); the standfirst is `hab-standfirst` (Lora 16px) held to ONE
 *    line on every tab — keep the copy to one short sentence (about 70
 *    characters), because anything longer is ellipsed rather than wrapped.
 *  · RULE — the same hairline closes every tab's masthead, edge to edge.
 *
 * ONE slot, so a tab's own furniture never becomes a second header:
 *  · `aside` — the right-hand column, bottom-aligned with the standfirst on
 *    a desktop and stacked beneath it on a phone. THE FACE CHIPS LIVE HERE
 *    (The Index's Pieces · Makers, The Hunt's three, The Fitting's five
 *    occasions), as does The Dossier's Save control.
 *
 * `children` is kept for compatibility only and NO primary tab may use it:
 * anything rendered inside the masthead makes that tab taller than the
 * other five, which is the drift this component exists to stop. A tab's own
 * figures, carousels and marks belong under the closing rule, in the tab's
 * own body.
 *
 * Nothing here sets a colour of its own — the ink comes from the shared
 * typography tokens and the rule from --color-divider.
 */
import type React from 'react';
import { typography } from '../../lib/colors';

/** The height the title + standfirst block holds on every tab, so the six
 * mastheads are identical from the tab bar above to the rule below. */
const TITLE_BLOCK_MIN_HEIGHT = '92px';

export function TabHeader({
  title,
  standfirst,
  aside,
  children,
}: {
  /** The tab's name — one short line, never a sentence. */
  title: React.ReactNode;
  /** ONE short sentence, held to ONE line at every width. */
  standfirst: React.ReactNode;
  /** The right-hand column: face chips, a segmented control, a save control. */
  aside?: React.ReactNode;
  /** Deprecated — see the note above; nothing may render inside the masthead. */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
      <div className="max-w-[1180px] mx-auto">
        <div
          className="grid grid-cols-1 md:grid-cols-[minmax(320px,1fr)_auto] gap-4 md:gap-10 md:items-end"
          style={{ minHeight: TITLE_BLOCK_MIN_HEIGHT }}
        >
          <div className="min-w-0">
            <h2 className={`hab-page-title ${typography.color.primary}`} style={{ margin: '0 0 10px' }}>
              {title}
            </h2>
            <p
              className={`hab-standfirst ${typography.color.secondary}`}
              title={typeof standfirst === 'string' ? standfirst : undefined}
              style={{
                margin: 0,
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {standfirst}
            </p>
          </div>
          {aside ? (
            <div className="flex flex-col items-start md:items-end gap-2 min-w-0 md:flex-shrink-0 md:text-right">
              {aside}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
