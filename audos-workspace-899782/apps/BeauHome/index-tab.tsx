/**
 * THE INDEX — rebuilt to the corrected design (Ethaion Ledger Corrected ·
 * 29a, “The Index tab, mapped”): four levels, two faces, four readings.
 *
 * ONE RULE governs the whole tab: you go DOWN a level by clicking a NAME,
 * never a button. Buttons and chips move you SIDEWAYS — to another reading
 * of the same set. Only two screens lead out of the tab at all (the type
 * page and the field → the Ledger, the Hunt/Beau).
 *
 *   The pieces face · down by name        The makers face
 *   L0  · the root         (index-root)   L0′ · makers root (index-makers)
 *   L1  · category plate   (index-plate)  L1′ · maker page  (index-makers)
 *   L2  · the type page    (index-type-page) — the two faces meet here
 *   L3  · the cut page     (index-cut-page)
 *
 *   Across · the reading switch: List · Ruler (index-ruler) · Matrix
 *   (index-matrix) · Field (index-field). The QUADRANT IS RETIRED (27c).
 *   Plus: the jump (index-jump · ⌘K anywhere in the tab) and the first-run
 *   state (index-first-run — what the Index is before it knows anything).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { findGarmentType, type GarmentCategoryId } from './garment-types';
import { categoryName, useIndexModel } from './index-model';
import type { IndexNav } from './index-chrome';
import { IndexRoot } from './index-root';
import { IndexPlate } from './index-plate';
import { IndexTypePage } from './index-type-page';
import { IndexCutPage } from './index-cut-page';
import { IndexRuler } from './index-ruler';
import { IndexMatrix } from './index-matrix';
import { IndexField } from './index-field';
import { MakersRoot, MakerPage } from './index-makers';
import { IndexJump } from './index-jump';
import { IndexFirstRun } from './index-first-run';
import { usePlexMono } from './mono-type';

type Screen =
  | { s: 'root' }
  | { s: 'plate'; cat: GarmentCategoryId }
  | { s: 'type'; id: string }
  | { s: 'cut'; typeId: string; cut: string }
  | { s: 'ruler'; cat: GarmentCategoryId; band?: string }
  | { s: 'matrix' }
  | { s: 'field' }
  | { s: 'makers' }
  | { s: 'maker'; name: string };

function labelOf(screen: Screen | undefined): string {
  if (!screen) return 'the Index';
  switch (screen.s) {
    case 'root':
      return 'the Index';
    case 'plate':
      return categoryName(screen.cat).toLowerCase();
    case 'type':
      return findGarmentType(screen.id)?.name.toLowerCase() || 'the piece';
    case 'cut':
      return screen.cut.toLowerCase();
    case 'ruler':
      return 'the ruler';
    case 'matrix':
      return 'the matrix';
    case 'field':
      return 'the field';
    case 'makers':
      return 'makers';
    case 'maker':
      return screen.name;
  }
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
  const [stack, setStack] = useState<Screen[]>([{ s: 'root' }]);
  const [jumpOpen, setJumpOpen] = useState(false);
  // 29e — the Index before it knows anything. “Read it anyway” dismisses.
  const [readAnyway, setReadAnyway] = useState(false);
  const topRef = useRef<HTMLDivElement | null>(null);

  const screen = stack[stack.length - 1];
  const previous = stack[stack.length - 2];

  const push = (next: Screen) =>
    setStack((cur) => {
      const top = cur[cur.length - 1];
      if (JSON.stringify(top) === JSON.stringify(next)) return cur;
      return [...cur.slice(-11), next];
    });

  const nav = useMemo<IndexNav>(
    () => ({
      goRoot: () => setStack([{ s: 'root' }]),
      goPlate: (cat) => push({ s: 'plate', cat }),
      goType: (id) => push({ s: 'type', id }),
      goCut: (typeId, cut) => push({ s: 'cut', typeId, cut }),
      goRuler: (cat, band) => push({ s: 'ruler', cat, band }),
      goMatrix: () => push({ s: 'matrix' }),
      goField: () => push({ s: 'field' }),
      goMakers: () => push({ s: 'makers' }),
      goMaker: (name) => push({ s: 'maker', name }),
      back: () => setStack((cur) => (cur.length > 1 ? cur.slice(0, -1) : cur)),
      backLabel: labelOf(previous),
      openJump: () => setJumpOpen(true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previous?.s, (previous as any)?.cat, (previous as any)?.id, (previous as any)?.name],
  );

  // ⌘K anywhere in the tab (29d).
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

  // Every screen change lands the reader at its top.
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [screen]);

  const firstRun = pieces.length === 0 && !readAnyway && screen.s === 'root';

  return (
    <div ref={topRef} className="pb-24" style={{ scrollMarginTop: '72px' }}>
      <div className="px-6 sm:px-10 pt-[44px] max-w-[1180px] mx-auto w-full">
        {firstRun ? (
          <IndexFirstRun model={model} nav={nav} onReadAnyway={() => setReadAnyway(true)} />
        ) : (
          <>
            {screen.s === 'root' && <IndexRoot model={model} pieces={pieces} nav={nav} />}
            {screen.s === 'plate' && <IndexPlate model={model} catId={screen.cat} nav={nav} />}
            {screen.s === 'type' && <IndexTypePage model={model} typeId={screen.id} nav={nav} />}
            {screen.s === 'cut' && <IndexCutPage model={model} typeId={screen.typeId} cut={screen.cut} nav={nav} />}
            {screen.s === 'ruler' && <IndexRuler model={model} catId={screen.cat} band={screen.band} nav={nav} />}
            {screen.s === 'matrix' && <IndexMatrix model={model} nav={nav} />}
            {screen.s === 'field' && <IndexField model={model} nav={nav} />}
            {screen.s === 'makers' && <MakersRoot model={model} nav={nav} />}
            {screen.s === 'maker' && <MakerPage model={model} name={screen.name} nav={nav} />}
          </>
        )}
      </div>
      {jumpOpen && <IndexJump nav={nav} onClose={() => setJumpOpen(false)} />}
    </div>
  );
}
