/**
 * THE HUNT · BEAU'S PICKS — the first sub-tab.
 *
 * The SAME categories The Index's Pieces face carries, in the SAME order: what
 * runs left to right across The Index runs top to bottom here (main categories
 * only — hunt-model.ts derives both from category-order.ts, so they cannot
 * drift). Every category arrives COLLAPSED behind its own unfold control;
 * unfolding one is what asks Beau to draw its picks, so nothing is generated
 * for a category the reader never opens.
 *
 * The collapsed list is not a list of nouns: each category carries Beau's own
 * line on where this man stands in it (hunt-picks-ai.ts `getHuntCategoryReads`
 * — one call for all eleven, written from his ledger) and what he has logged
 * in it.
 *
 * Unfolded, a category shows THREE specific pieces — the three Beau would have
 * him acquire NEXT in it, drawn live against his whole record: his frame,
 * colouring and palette, his sizes, his directions, his climate, every piece
 * on his ledger (in this category and in the rest of the wardrobe, so a pick
 * complements what he owns) and the calls he has already made. Each card
 * carries Save · Favourite · Pass · Replace. Save and Favourite file a call on
 * Your Calls; PASS files the no, takes the card off the shelf and asks Beau
 * for a different answer in its place; Replace does the same without recording
 * an opinion.
 *
 * WHAT THE READER NEVER SEES: an error, an excuse, or a placeholder
 * recommendation. While a draw is in flight the shelf holds the card
 * skeletons; a draw that does not land is simply asked again, quietly, until
 * it does. There is no "try again" to press, because there is nothing for the
 * reader to fix.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  INK,
  RULE,
  SECONDARY,
  WALNUT,
  WASH,
  body,
  mono,
  serif,
} from './index-style';
import { capWord, numberWord } from './mono-type';
import { pieceIndexCategory } from './index-model';
import {
  HUNT_CATEGORIES,
  huntCardKey,
  retireInCategory,
  type HuntCategory,
  type HuntTag,
  type HuntTaggable,
} from './hunt-model';
import {
  PICKS_PER_CATEGORY,
  drawCategoryPicks,
  drawCategoryReplacement,
  getHuntCategoryReads,
  type HuntPick,
} from './hunt-picks-ai';
import type { HuntReader } from './hunt-reader';
import { HuntCard, HuntPicksSkeleton, type HuntCallsState } from './hunt-cards';

interface CategoryState {
  /** Null until the category has been drawn. */
  picks: HuntPick[] | null;
  loading: boolean;
  /** Piece names with a replacement draw in flight. */
  busy: string[];
}

const EMPTY_STATE: CategoryState = { picks: null, loading: false, busy: [] };

/** How long to wait before asking Beau again when a draw does not land. The
 * reader is never told — the skeletons simply stay up. */
const RETRY_DELAYS = [1400, 3500, 8000];
/** And how long between the quiet re-attempts after those, while the category
 * is still unfolded in front of him. */
const REVISIT_DELAY = 14000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// One category — collapsed by default, its unfold the trigger for the draw.
// ---------------------------------------------------------------------------

function CategoryRow({
  category,
  read,
  ownedCount,
  open,
  state,
  visible,
  calls,
  photos,
  onToggle,
  onTag,
  onReplace,
}: {
  category: HuntCategory;
  read: string | null;
  ownedCount: number;
  open: boolean;
  state: CategoryState;
  /** The picks still on the shelf — a pass takes one off it. */
  visible: HuntPick[];
  calls: HuntCallsState;
  photos: React.MutableRefObject<Map<string, string>>;
  onToggle: () => void;
  onTag: (pick: HuntPick, taggable: HuntTaggable, tag: HuntTag) => void;
  onReplace: (pick: HuntPick) => void;
}) {
  const waiting = state.loading || !state.picks || visible.length === 0;

  return (
    <div style={{ borderBottom: `1px solid ${RULE}`, background: open ? WASH : 'transparent' }}>
      <div className="flex items-start justify-between gap-4" style={{ padding: open ? '4px 16px' : '4px 0' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`hunt-picks-${category.id}`}
          className="flex items-start gap-3.5 text-left flex-1 min-w-0"
          style={{ minHeight: '62px', background: 'transparent', border: 'none', padding: '14px 0', cursor: 'pointer' }}
        >
          {/* The unfold mark — a plus that becomes a minus, the design's own. */}
          <span
            aria-hidden="true"
            style={{ ...mono(13, ACCENT_DEEP), flexShrink: 0, lineHeight: 1, paddingTop: '9px', width: '12px' }}
          >
            {open ? '\u2212' : '+'}
          </span>
          <span className="min-w-0">
            <span style={{ ...serif(23, WALNUT), display: 'block', lineHeight: 1.18 }}>{category.name}</span>
            {read && (
              <span style={{ ...body(13, SECONDARY), display: 'block', marginTop: '5px', maxWidth: '62ch' }}>
                {read}
              </span>
            )}
          </span>
        </button>

        <div className="flex items-center gap-3 flex-shrink-0" style={{ paddingTop: '18px' }}>
          <span style={{ textAlign: 'right' }}>
            {visible.length > 0 && (
              <span style={{ ...mono(8, ACCENT_DEEP), display: 'block' }}>
                {capWord(numberWord(visible.length))} to consider
              </span>
            )}
            <span style={{ ...mono(8, visible.length > 0 ? FAINTER : FAINT), display: 'block', marginTop: visible.length > 0 ? '3px' : 0 }}>
              {ownedCount > 0 ? `You own ${numberWord(ownedCount)}` : 'None logged yet'}
            </span>
          </span>
        </div>
      </div>

      <div
        id={`hunt-picks-${category.id}`}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          {open && (
            <div style={{ padding: '0 16px 28px' }}>
              {waiting ? (
                <HuntPicksSkeleton count={PICKS_PER_CATEGORY} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: '15px' }}>
                  {visible.map((pick) => {
                    const key = `${category.id}\u241f${pick.pieceName}`;
                    const taggable: HuntTaggable = {
                      pieceName: pick.pieceName,
                      categoryId: category.id,
                      subCategory: pick.garmentType || null,
                      source: 'picks',
                      maker: pick.maker || null,
                      priceGuide: pick.priceGuide || null,
                      note: pick.whyYou || null,
                      imageUrl: photos.current.get(key) || null,
                    };
                    return (
                      <HuntCard
                        key={key}
                        pieceName={pick.pieceName}
                        garmentType={pick.garmentType}
                        maker={pick.maker}
                        priceGuide={pick.priceGuide}
                        whyYou={pick.whyYou}
                        colourNote={pick.colourNote}
                        qualitySignals={pick.qualitySignals}
                        onPhoto={(url) => photos.current.set(key, url)}
                        actions={{
                          tag: calls.tagOf(taggable),
                          onTag: (tag) =>
                            onTag(pick, { ...taggable, imageUrl: photos.current.get(key) || null }, tag),
                          onReplace: () => onReplace(pick),
                          busy:
                            state.busy.includes(pick.pieceName)
                            || calls.writingKey === huntCardKey(taggable),
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sub-tab
// ---------------------------------------------------------------------------

export function HuntPicks({
  reader,
  calls,
  /** Changes only when his RECORD changes (a piece logged, the dossier
   * edited) — never when a tag is set. See the note in hunt-tab.tsx. */
  recordKey,
}: {
  reader: HuntReader | null;
  calls: HuntCallsState;
  recordKey: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [states, setStates] = useState<Record<string, CategoryState>>({});
  const [reads, setReads] = useState<Record<string, string>>({});
  // The photograph each card actually painted, so the tag written from it
  // carries the picture onto Your Calls. A ref, not state: a photograph
  // landing must not re-render the shelf under the reader's finger.
  const photos = useRef<Map<string, string>>(new Map());

  // Which categories are unfolded right now, readable from inside a draw that
  // started several seconds ago — a closed category is never re-attempted.
  const openRef = useRef(open);
  openRef.current = open;
  const timers = useRef<Record<string, number>>({});
  const drawRef = useRef<((categoryId: string, force?: boolean) => Promise<void>) | null>(null);

  useEffect(
    () => () => {
      for (const timer of Object.values(timers.current)) window.clearTimeout(timer);
    },
    [],
  );

  /** How many of his own pieces sit in each category — the same read The
   * Index counts with, so the two never disagree. */
  const ownedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const piece of reader?.pieces || []) {
      const cat = pieceIndexCategory(piece);
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [reader]);

  const patch = useCallback((categoryId: string, next: Partial<CategoryState>) => {
    setStates((cur) => ({ ...cur, [categoryId]: { ...(cur[categoryId] || EMPTY_STATE), ...next } }));
  }, []);

  // Beau's line on every category, written once when the list first paints
  // and again when his record moves. Silent on failure — the list reads
  // without the lines rather than with invented ones.
  useEffect(() => {
    if (!reader) return;
    let alive = true;
    getHuntCategoryReads(reader)
      .then((next) => {
        if (alive) setReads(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey, reader ? 'ready' : 'waiting']);

  /**
   * Ask Beau for a category's three. A draw that does not land is retried on
   * a widening delay and then, while the category is still open, quietly
   * re-attempted — the shelf keeps its skeletons throughout, so a slow or
   * busy model reads as "still working", which is what it is.
   */
  const draw = useCallback(
    async (categoryId: string, force = false) => {
      if (!reader) return;
      const held = timers.current[categoryId];
      if (held) {
        window.clearTimeout(held);
        delete timers.current[categoryId];
      }
      patch(categoryId, { loading: true });
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
        let picks: HuntPick[] | null = null;
        try {
          picks = await drawCategoryPicks(reader, categoryId, { forceRefresh: force || attempt > 0 });
        } catch {
          picks = null;
        }
        if (picks && picks.length > 0) {
          patch(categoryId, { picks, loading: false });
          return;
        }
        const delay = RETRY_DELAYS[attempt];
        if (delay == null) break;
        await wait(delay);
        if (!openRef.current[categoryId]) {
          patch(categoryId, { loading: false });
          return;
        }
      }
      if (openRef.current[categoryId]) {
        timers.current[categoryId] = window.setTimeout(() => {
          void drawRef.current?.(categoryId, true);
        }, REVISIT_DELAY);
      } else {
        patch(categoryId, { loading: false });
      }
    },
    [patch, reader],
  );

  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Unfolding a category is the trigger: the draw runs on the first open and
  // the shelf is kept afterwards, so closing and reopening costs nothing.
  const toggle = useCallback(
    (categoryId: string) => {
      const nextOpen = !open[categoryId];
      setOpen((cur) => ({ ...cur, [categoryId]: nextOpen }));
      const held = states[categoryId];
      if (nextOpen && !held?.picks && !held?.loading) void draw(categoryId);
    },
    [draw, open, states],
  );

  // A category already unfolded when his RECORD changes re-draws itself — the
  // engine's cache key moved with the facts, so this reads the new ones
  // rather than spending again on the old. A tag deliberately does not
  // trigger this: it reaches the next draw through the same cache key.
  useEffect(() => {
    if (!reader) return;
    for (const [categoryId, isOpen] of Object.entries(open)) {
      if (isOpen && !states[categoryId]?.loading) void draw(categoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey, reader ? 'ready' : 'waiting']);

  /**
   * Clear one card away and put another in its place. The name joins the
   * retired list for this category so neither this draw nor a later one
   * repeats it. When Beau cannot answer, the card simply goes and the shelf
   * stands a piece short — unless that empties it, in which case the whole
   * category is drawn again.
   */
  const replace = useCallback(
    async (categoryId: string, pick: HuntPick) => {
      if (!reader) return;
      const shelf = states[categoryId]?.picks || [];
      setStates((cur) => {
        const state = cur[categoryId] || EMPTY_STATE;
        return { ...cur, [categoryId]: { ...state, busy: [...state.busy, pick.pieceName] } };
      });
      retireInCategory(categoryId, pick.pieceName);
      let replacement: HuntPick | null = null;
      try {
        replacement = await drawCategoryReplacement({
          reader,
          categoryId,
          exclude: shelf.map((p) => p.pieceName),
        });
      } catch {
        replacement = null;
      }
      setStates((cur) => {
        const state = cur[categoryId] || EMPTY_STATE;
        const list = state.picks || [];
        // A replacement that happens to name a piece already on the shelf
        // would collide with its sibling, so the card simply goes.
        const collides =
          !!replacement
          && list.some(
            (p) =>
              p.pieceName !== pick.pieceName
              && p.pieceName.toLowerCase() === replacement!.pieceName.toLowerCase(),
          );
        return {
          ...cur,
          [categoryId]: {
            ...state,
            picks:
              replacement && !collides
                ? list.map((p) => (p.pieceName === pick.pieceName ? replacement! : p))
                : list.filter((p) => p.pieceName !== pick.pieceName),
            busy: state.busy.filter((name) => name !== pick.pieceName),
          },
        };
      });
    },
    [reader, states],
  );

  /** Save and Favourite file the call and leave the shelf as it is. A PASS
   * files the no AND asks Beau for a different answer in its place, so the
   * shelf never thins out as the reader works down it. */
  const handleTag = useCallback(
    async (categoryId: string, pick: HuntPick, taggable: HuntTaggable, tag: HuntTag) => {
      const before = calls.tagOf(taggable);
      await calls.toggleTag(taggable, tag);
      if (tag === 'passed' && before !== 'passed') void replace(categoryId, pick);
    },
    [calls, replace],
  );

  /** A pass takes the piece off the shelf — here and on every later visit,
   * because the shelf is filtered by the calls themselves. */
  const visibleFor = useCallback(
    (category: HuntCategory): HuntPick[] =>
      (states[category.id]?.picks || []).filter(
        (pick) =>
          calls.tagOf({
            pieceName: pick.pieceName,
            categoryId: category.id,
            subCategory: pick.garmentType || null,
            source: 'picks',
          }) !== 'passed',
      ),
    [calls, states],
  );

  // A shelf can empty on the reader: he passes on all three, or a replacement
  // draw could not land. An open category is never left with nothing on it —
  // it is drawn again, with the passes now part of what Beau is reasoning
  // from. Bounded, so an unreachable model cannot turn into a loop.
  const refills = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!reader) return;
    for (const category of HUNT_CATEGORIES) {
      if (!open[category.id]) continue;
      const state = states[category.id];
      if (!state || state.loading || !state.picks || state.busy.length > 0) continue;
      if (visibleFor(category).length > 0) {
        refills.current[category.id] = 0;
        continue;
      }
      if ((refills.current[category.id] || 0) >= 2) continue;
      refills.current[category.id] = (refills.current[category.id] || 0) + 1;
      void draw(category.id, true);
    }
  }, [draw, open, reader, states, visibleFor]);

  const anyOpen = Object.values(open).some(Boolean);
  const onTheShelf = useMemo(
    () => HUNT_CATEGORIES.reduce((total, category) => total + visibleFor(category).length, 0),
    [visibleFor],
  );

  return (
    <div>
      <p style={{ ...body(14, INK), margin: '0 0 4px', maxWidth: '64ch' }}>
        The same categories The Index reads across, read down. Unfold one and Beau names the{' '}
        {numberWord(PICKS_PER_CATEGORY)} pieces he would have you acquire next in it — chosen against your frame,
        your colouring, the climate you dress for, everything already on your ledger and the calls you have made.
      </p>

      <div
        className="flex items-end justify-between gap-4 flex-wrap"
        style={{ marginTop: '26px', paddingBottom: '9px' }}
      >
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>By category · open one and he chooses</h3>
        <span style={{ ...mono(8, FAINT) }}>
          {anyOpen && onTheShelf > 0
            ? `${numberWord(onTheShelf)} piece${onTheShelf === 1 ? '' : 's'} in front of you`
            : `${numberWord(HUNT_CATEGORIES.length)} categories · unfold one to set him going`}
        </span>
      </div>

      <div style={{ borderTop: `1px solid ${RULE}` }}>
        {HUNT_CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            read={reads[category.id] || null}
            ownedCount={ownedCounts[category.id] || 0}
            open={!!open[category.id]}
            state={states[category.id] || EMPTY_STATE}
            visible={visibleFor(category)}
            calls={calls}
            photos={photos}
            onToggle={() => toggle(category.id)}
            onTag={(pick, taggable, tag) => void handleTag(category.id, pick, taggable, tag)}
            onReplace={(pick) => void replace(category.id, pick)}
          />
        ))}
      </div>
    </div>
  );
}
