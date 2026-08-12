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
import { usePlexMono } from './mono-type';
import { DOSSIER_DETAILS_EVENT } from './dossier-details';
import { COVERAGE_PREFS_EVENT } from './coverage-prefs';
import { SubTabs, type SubTabItem } from './sub-tabs';
import { TabHeader } from './tab-header';
import type { CategoryBudget, StylePrefs, StyleProfile, WardrobePiece } from './profile-data';
import { loadHuntReader, type HuntReader } from './hunt-reader';
import { useHuntCalls } from './hunt-cards';
import { HuntPicks } from './hunt-picks';
import { HuntAsk } from './hunt-ask';
import { HuntCalls } from './hunt-calls';

type HuntFace = 'picks' | 'ask' | 'calls';

/** The standfirst changes with the face; the title never does. ONE short
 * sentence each, so the masthead wraps exactly as the other five tabs do. */
const FACE_STANDFIRST: Record<HuntFace, string> = {
  picks: 'Unfold a category and Beau names the three pieces to acquire next.',
  ask: 'Ask him anything, or paste a link — he answers against your dossier.',
  calls: 'Every piece you have saved, favourited or passed — and why.',
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

  return (
    <div>
      {/* The shared tab masthead (tab-header.tsx) — the same block every
          other primary tab carries. The three face chips sit in its aside,
          in the same place and the same treatment as The Index's
          Pieces · Makers toggle. */}
      <TabHeader
        title="The Hunt"
        standfirst={FACE_STANDFIRST[face]}
        aside={
          <SubTabs
            items={items}
            active={face}
            onChange={setFace}
            ariaLabel="The Hunt"
            variant="sub-tab--index-face"
            className="max-w-full"
          />
        }
      />

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
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
