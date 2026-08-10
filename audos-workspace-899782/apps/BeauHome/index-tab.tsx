/**
 * THE INDEX — the fifth primary tab (design handoff §Navigation, screens
 * 13a · 9a · 20a · 21a): the reference wing of the app, two indexes under
 * one roof.
 *
 *   · PIECES — the full garment-type taxonomy (world-of-menswear.tsx) as a
 *     list, ON A MAP (formality × versatility) and AS A QUADRANT
 *     (Workhorses · The backbone · Weekend specifics · Occasion only) —
 *     the 20a page, toggle at the header's right edge (piece-map.tsx).
 *   · MAKERS — the FULL maker directory (maker-views.tsx): as a list, on a
 *     map (price × Beau's tier, with the dashed value band) and as a
 *     quadrant (price × fit-to-you) — the 21a page.
 *
 * The Index never says "buy": picks live in The Hunt, where you went
 * looking for them — an entry's "see options" hands the type to The Hunt's
 * search instead of opening a shop.
 */
import { useState } from 'react';
import { typography } from '../../lib/colors';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { MakersIndex } from './maker-views';
import { PiecesIndex } from './piece-map';
import { SubTabs } from './sub-tabs';

type IndexView = 'pieces' | 'makers';

export function IndexTab({
  pieces,
  profile,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
}) {
  const [view, setView] = useState<IndexView>('pieces');

  return (
    <div className="pb-24">
      <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto">
          <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>The Index</h3>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '58ch' }}>
            The reference wing — every garment type worth knowing, and the makers on your radar. Nothing here is a
            shortlist and nothing here says buy: the picks live in The Hunt, where you went looking for them.
          </p>
        </div>
      </div>

      <div className="border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <SubTabs
          items={[
            { id: 'pieces' as const, label: 'Pieces' },
            { id: 'makers' as const, label: 'Makers' },
          ]}
          active={view}
          onChange={(id) => setView(id as IndexView)}
          ariaLabel="The Index sections"
          className="max-w-[1180px] mx-auto px-6 sm:px-10 py-3"
        />
      </div>

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
        {view === 'pieces' && <PiecesIndex pieces={pieces} profile={profile} onShowMakers={() => setView('makers')} />}
        {view === 'makers' && <MakersIndex profile={profile} pieces={pieces} />}
      </div>
    </div>
  );
}
