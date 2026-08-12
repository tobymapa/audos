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
 *  · TYPE — the title is `hab-page-title` (Cormorant 52px / 38px on a
 *    phone); the standfirst is `hab-standfirst` (Lora 16px, capped at 54ch
 *    so every tab wraps to the same TWO lines at most — keep the copy to
 *    ONE short sentence).
 *  · RULE — the same hairline closes every tab's masthead, edge to edge.
 *
 * TWO slots, so a tab's own furniture never becomes a second header:
 *  · `aside` — the right-hand column, bottom-aligned with the standfirst on
 *    a desktop and stacked beneath it on a phone. THE FACE CHIPS LIVE HERE
 *    (The Index's Pieces · Makers and The Hunt's three), as does The
 *    Fitting's weather line and The Dossier's Save control.
 *  · `children` — anything that belongs INSIDE the masthead block, below
 *    the title row (The Fitting's day carousel, The Ledger's re-assess
 *    mark).
 *
 * Nothing here sets a colour of its own — the ink comes from the shared
 * typography tokens and the rule from --color-divider.
 */
import type React from 'react';
import { typography } from '../../lib/colors';

export function TabHeader({
  title,
  standfirst,
  aside,
  children,
}: {
  /** The tab's name — one short line, never a sentence. */
  title: React.ReactNode;
  /** ONE short sentence. Two lines at most, at every width. */
  standfirst: React.ReactNode;
  /** The right-hand column: face chips, a weather line, a save control. */
  aside?: React.ReactNode;
  /** Anything that sits inside the masthead below the title row. */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
      <div className="max-w-[1180px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 md:gap-10 md:items-end">
          <div className="min-w-0">
            <h2 className={`hab-page-title ${typography.color.primary}`} style={{ margin: '0 0 10px' }}>
              {title}
            </h2>
            <p className={`hab-standfirst ${typography.color.secondary}`} style={{ margin: 0 }}>
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
