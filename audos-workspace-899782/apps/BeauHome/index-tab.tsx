/**
 * THE INDEX — wiped and restarted (temperature-anchored reference pass).
 *
 * The old four-level screen hierarchy (root · plates · type pages · cut
 * pages, plus the quadrant/ruler/matrix/field readings of the pieces face)
 * is gone. What remains is deliberately flat:
 *
 *   · PIECES (index-pieces.tsx) — the default face: three filter tiers
 *     (category · sub-category runs · formality register) over ONE
 *     temperature-anchored reference table. No deeper navigation.
 *   · MAKERS (index-makers.tsx) — the other face, untouched: the makers
 *     root and the maker page. A type name on a maker page lands back on
 *     the pieces table, scrolled to that row.
 *
 * All data and AI stay in place: garment-types.ts, garment-type-runs.ts,
 * temperature-bands.ts, index-model.ts (climate curve, ownership, spans)
 * and index-gen.tsx (the generated notes the makers face still carries).
 * The ⌘K jump (index-jump.tsx) still searches types, cuts and makers.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { useIndexModel } from './index-model';
import type { IndexNav } from './index-chrome';
import { IndexGenProvider } from './index-gen';
import { IndexPieces } from './index-pieces';
import { MakersRoot, MakerPage } from './index-makers';
import { IndexJump } from './index-jump';
import { usePlexMono } from './mono-type';

type Screen = { s: 'pieces' } | { s: 'makers' } | { s: 'maker'; name: string };

function labelOf(screen: Screen | undefined): string {
  if (!screen) return 'the Index';
  if (screen.s === 'makers') return 'makers';
  if (screen.s === 'maker') return screen.name;
  return 'the Index';
}

export function IndexTab({
  pieces,
  profile,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
}) {
  usePlexMono();
  const model = useIndexModel(pieces);
  const [stack, setStack] = useState<Screen[]>([{ s: 'pieces' }]);
  const [jumpOpen, setJumpOpen] = useState(false);
  // A row another surface asked the pieces table to land on.
  const [focusTypeId, setFocusTypeId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const screen = stack[stack.length - 1];
  const previous = stack[stack.length - 2];

  const push = (next: Screen) =>
    setStack((cur) => {
      const top = cur[cur.length - 1];
      if (JSON.stringify(top) === JSON.stringify(next)) return cur;
      return [...cur.slice(-7), next];
    });

  const nav = useMemo<IndexNav>(() => {
    const toPieces = (typeId?: string) => {
      setStack([{ s: 'pieces' }]);
      if (typeId) setFocusTypeId(typeId);
    };
    return {
      goRoot: () => toPieces(),
      // The flat view has no plates, rulers, quadrants, matrices or fields
      // any more — every old “down” or “across” lands on the one table.
      goPlate: () => toPieces(),
      goType: (id) => toPieces(id),
      goCut: (typeId) => toPieces(typeId),
      goRuler: () => toPieces(),
      goQuadrant: () => toPieces(),
      goMatrix: () => toPieces(),
      goField: () => toPieces(),
      goMakers: () => push({ s: 'makers' }),
      goMaker: (name) => push({ s: 'maker', name }),
      back: () => setStack((cur) => (cur.length > 1 ? cur.slice(0, -1) : cur)),
      backLabel: labelOf(previous),
      openJump: () => setJumpOpen(true),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previous?.s, (previous as any)?.name]);

  // ⌘K anywhere in the tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setJumpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A face change lands the reader at the top — unless the pieces table is
  // about to scroll itself to a requested row.
  useEffect(() => {
    if (focusTypeId) return;
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.s, (screen as any).name]);

  return (
    <IndexGenProvider model={model} profile={profile}>
      <div ref={topRef} className="pb-24" style={{ scrollMarginTop: '72px' }}>
        <div className="px-6 sm:px-10 pt-[44px] max-w-[1180px] mx-auto w-full">
          {screen.s === 'pieces' && (
            <IndexPieces model={model} nav={nav} focusTypeId={focusTypeId} onFocusHandled={() => setFocusTypeId(null)} />
          )}
          {screen.s === 'makers' && <MakersRoot model={model} nav={nav} />}
          {screen.s === 'maker' && <MakerPage model={model} name={screen.name} nav={nav} />}
        </div>
        {jumpOpen && <IndexJump nav={nav} onClose={() => setJumpOpen(false)} />}
      </div>
    </IndexGenProvider>
  );
}
