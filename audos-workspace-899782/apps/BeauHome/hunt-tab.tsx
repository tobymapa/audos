/**
 * THE HUNT — the tab, reinstated (August 2026) and sitting immediately LEFT
 * of The Index.
 *
 * THREE sub-tabs on the app's shared chip bar (sub-tabs.tsx), left to right:
 *
 *  1. BEAU'S PICKS — the same categories The Index's Pieces face carries, in
 *     the same order (its left-to-right is this tab's top-to-bottom), each
 *     collapsed behind its own unfold. Unfolding one asks Beau, live, for the
 *     three pieces he would have this man acquire next in it, read against his
 *     whole record. Save · Favourite · Pass · Replace on every card.
 *  2. ASK BEAU — one box for a question, a brief or a product link, his
 *     verdict and recommendation beneath it, and a bench holding up to four
 *     products for a proper side-by-side.
 *  3. YOUR CALLS — everything tagged on either of the two above, in one
 *     sortable table, with the call changeable or removable in place.
 *
 * The chip bar carries THE INDEX'S OWN FACE-TOGGLE TREATMENT (the variant its
 * Pieces · Makers chips use, shared through sub-tabs.tsx), so the two tabs read
 * as one product rather than two.
 *
 * The whole tab reads ONE picture of the man (hunt-reader.ts), loaded once
 * here and shared down, so his picks and his verdicts can never be reasoned
 * from different facts. It re-loads when his wardrobe or his dossier changes;
 * a tag is folded in without a re-read, and both are what move the
 * recommendation caches.
 *
 * The three faces stay MOUNTED once visited (the same treatment the app's
 * own tabs get): switching to Ask Beau and back must not throw away the
 * categories the reader unfolded, and switching away from Ask Beau must not
 * empty the bench he was comparing on.
 *
 * Design register is The Index's (index-style.ts): oatmeal ground, paper
 * cards, hairline rules, Cormorant headings, Lora body, IBM Plex Mono
 * small-caps labels, square corners, no shadows. Nothing here sets a colour
 * of its own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { typography } from '../../lib/colors';
import { usePlexMono } from './mono-type';
import { DOSSIER_DETAILS_EVENT } from './dossier-details';
import { COVERAGE_PREFS_EVENT } from './coverage-prefs';
import { SubTabs, type SubTabItem } from './sub-tabs';
import { ACCENT_DEEP, mono } from './index-style';
import type { CategoryBudget, StylePrefs, StyleProfile, WardrobePiece } from './profile-data';
import { loadHuntReader, type HuntReader } from './hunt-reader';
import { useHuntCalls } from './hunt-cards';
import { HuntPicks } from './hunt-picks';
import { HuntAsk } from './hunt-ask';
import { HuntCalls } from './hunt-calls';

type HuntFace = 'picks' | 'ask' | 'calls';

/** The masthead changes with the face — the reader is always told which of
 * the three he is looking at, in the same words the chip bar uses. */
const FACE_HEAD: Record<HuntFace, { title: string; standfirst: string }> = {
  picks: {
    title: "Beau's picks",
    standfirst:
      'Read down the categories. Unfold one and Beau names the three pieces he would have you acquire next in it — chosen against your dossier, your climate and everything already on your ledger.',
  },
  ask: {
    title: 'Ask Beau',
    standfirst:
      'One box for a question or a link. Ask him something and he answers against your profile; paste a link and he gives a verdict. Queue up to four and he compares them.',
  },
  calls: {
    title: 'Your calls',
    standfirst:
      'Every piece you have wanted, put by or passed — with the reason you gave. This is the record Beau reads you from, and you can change any of it.',
  },
};

/** Mounted on first visit, then hidden rather than unmounted — so a face
 * keeps its state (unfolded categories, the bench, a sort order). */
function KeepFace({ active, children }: { active: boolean; children: React.ReactNode }) {
  const everActive = useRef(false);
  if (active) everActive.current = true;
  if (!everActive.current) return null;
  return <div style={active ? undefined : { display: 'none' }}>{children}</div>;
}

export function HuntTab({
  profile,
  pieces,
  prefs,
}: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  /** Accepted for parity with the other tabs; the reader reads budgets from
   * the dossier itself, so nothing here consumes it. */
  budgets?: Record<string, CategoryBudget>;
}) {
  usePlexMono();
  const [face, setFace] = useState<HuntFace>('picks');
  const calls = useHuntCalls();
  const [loaded, setLoaded] = useState<HuntReader | null>(null);

  // The ledger's identity, so a logged or removed piece re-reads the record
  // without a name edit re-reading it on every keystroke.
  const ledgerKey = useMemo(
    () => pieces.map((p) => `${p.id}:${p.category}:${p.slot || ''}`).sort().join('|'),
    [pieces],
  );
  // The dossier and the register frequencies both live behind their own
  // change events; bumping this re-loads the reader when either fires.
  const [dossierBump, setDossierBump] = useState(0);
  useEffect(() => {
    const bump = () => setDossierBump((n) => n + 1);
    window.addEventListener(DOSSIER_DETAILS_EVENT, bump);
    window.addEventListener(COVERAGE_PREFS_EVENT, bump);
    return () => {
      window.removeEventListener(DOSSIER_DETAILS_EVENT, bump);
      window.removeEventListener(COVERAGE_PREFS_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadHuntReader({ profile, pieces, prefs, calls: calls.calls })
      .then((next) => {
        if (alive) setLoaded(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // The identity keys stand in for the arrays themselves, so a re-render
    // with the same facts never re-reads the dossier. Deliberately NOT keyed
    // on the calls: tagging a card must not cost six reads of the record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, prefs, ledgerKey, dossierBump]);

  // The calls are folded in without a re-read, so the next prompt Beau sees
  // always carries the tag just made.
  const reader = useMemo<HuntReader | null>(
    () => (loaded ? { ...loaded, calls: calls.calls } : null),
    [loaded, calls.calls],
  );

  /**
   * What a re-draw is allowed to depend on. His RECORD moving (a piece
   * logged, the dossier edited) should re-read an open category; a tag being
   * set should not — it would re-shuffle the shelf under the reader's finger
   * and spend a call to do it. The tag still reaches the NEXT draw, because
   * the engine's cache key is built from the calls too.
   */
  const recordKey = useMemo(() => `${ledgerKey}\u241f${dossierBump}`, [ledgerKey, dossierBump]);

  const items = useMemo<Array<SubTabItem<HuntFace>>>(
    () => [
      { id: 'picks', label: "Beau's Picks" },
      { id: 'ask', label: 'Ask Beau' },
      {
        id: 'calls',
        label: 'Your Calls',
        suffix: calls.calls.length > 0 ? ` · ${calls.calls.length}` : '',
      },
    ],
    [calls.calls.length],
  );

  const head = FACE_HEAD[face];

  return (
    <div>
      {/* The standard tab masthead — same height, type and indentation as
          The Ledger, The Edit and The Index: the face's own title and
          standfirst, and nothing else. */}
      <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto">
          <div className="min-w-0">
            <p style={{ ...mono(8.5, ACCENT_DEEP), margin: '0 0 9px' }}>Ethaion · The Hunt · Beau</p>
            <h2 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '10px' }}>
              {head.title}
            </h2>
            <p className={`hab-standfirst ${typography.color.secondary}`} style={{ margin: 0, maxWidth: '62ch' }}>
              {head.standfirst}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
        <SubTabs
          items={items}
          active={face}
          onChange={setFace}
          ariaLabel="The Hunt"
          variant="sub-tab--index-face"
          className="mb-7"
        />

        <KeepFace active={face === 'picks'}>
          <HuntPicks reader={reader} calls={calls} recordKey={recordKey} />
        </KeepFace>
        <KeepFace active={face === 'ask'}>
          <HuntAsk reader={reader} calls={calls} />
        </KeepFace>
        <KeepFace active={face === 'calls'}>
          <HuntCalls calls={calls} onGoToPicks={() => setFace('picks')} />
        </KeepFace>
      </div>
    </div>
  );
}
