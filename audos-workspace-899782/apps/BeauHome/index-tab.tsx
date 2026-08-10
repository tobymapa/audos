/**
 * THE INDEX — the fifth primary tab (design handoff §Navigation, screens
 * 13a · 9a · 5a): the reference wing of the app, two indexes under one roof.
 *
 *   · PIECES — the full garment-type taxonomy (world-of-menswear.tsx),
 *     searchable and browsable, with Beau's note per entry. Was housed as
 *     The Rail's second sub-tab; reference is not a shortlist, so it lives
 *     here now.
 *   · MAKERS — the FULL maker directory (maker-views.tsx): the verified
 *     catalog plus every maker you or Beau added, with your favourites and
 *     notes folded in — as a list, on a map (price × tier) and as a
 *     quadrant (price × fit-to-you). The list that steers Beau's
 *     recommendations.
 *
 * The Index never says "buy": picks live in The Hunt, where you went
 * looking for them — an entry's "see options" hands the type to The Hunt's
 * search instead of opening a shop.
 */
import { useState } from 'react';
import { typography } from '../../lib/colors';
import { promoteToScout, type StyleProfile, type WardrobePiece } from './profile-data';
import { WorldOfMenswear } from './world-of-menswear';
import { MakersIndex } from './maker-views';
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
        {view === 'pieces' && (
          <WorldOfMenswear
            pieces={pieces}
            profile={profile}
            // A gap leads to The Hunt, pre-filled — the corrected IA's route
            // (7a): reference never sells, it points at the funnel.
            onSeeForYou={(sub) => promoteToScout(sub.label)}
          />
        )}
        {view === 'makers' && <MakersIndex profile={profile} />}
      </div>
    </div>
  );
}
