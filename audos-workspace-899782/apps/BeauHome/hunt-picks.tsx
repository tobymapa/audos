/**
 * THE HUNT · BEAU'S PICKS — the first sub-tab.
 *
 * The SAME categories The Index carries, in the SAME order: what runs left to
 * right across The Index's category strip runs top to bottom here (main
 * categories only — hunt-model.ts derives both from category-order.ts, so
 * they cannot drift). Every category arrives COLLAPSED behind its own unfold
 * control; unfolding one is what asks Beau to draw its picks, so nothing is
 * generated for a category the reader never opens.
 *
 * The collapsed list is not a list of nouns: each category carries Beau's own
 * line on where this man stands in it (hunt-picks-ai.ts `getHuntCategoryReads`
 * — one call for all eleven, written from his ledger), and its standing on the
 * right — not read yet, covered, or the number of runs with a gap in them.
 *
 * Unfolded, a category shows its SUB-CATEGORIES — the specific piece types
 * within it, grouped as The Index groups them ("Coats", "Rain & wind",
 * "Loafers & monks"), each with the stretch of the year it answers and how
 * many of his own pieces sit in it — and under each, the pieces Beau
 * recommends for THIS man. Nothing on this screen is authored copy or an
 * example number.
 *
 * Each card carries Save · Favourite · Pass · Replace. Save and Favourite
 * file a call on Your Calls; PASS files the no and takes the card off the
 * shelf (it is still changeable on Your Calls); Replace clears that one card
 * away and asks Beau for a different answer to the same sub-category, leaving
 * the rest of the shelf where it is.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  RULE,
  SECONDARY,
  WALNUT,
  WASH,
  body,
  mono,
  serif,
} from './index-style';
import { numberWord } from './mono-type';
import { RULER_HI, RULER_LO, findGarmentType, matchGarmentTypeId, pieceIndexCategory, spanOf } from './index-model';
import {
  HUNT_CATEGORIES,
  huntCardKey,
  retirePieceName,
  type HuntCategory,
  type HuntSubCategory,
  type HuntTaggable,
} from './hunt-model';
import { drawReplacementPick, getHuntCategoryPicks, getHuntCategoryReads, type HuntPick } from './hunt-picks-ai';
import type { HuntReader } from './hunt-reader';
import { HuntButton, HuntCard, HuntQuietLine, HuntWorkingLine, type HuntCallsState } from './hunt-cards';

/** One sub-category's shelf: Beau's line on the run, and his picks in it. */
interface Shelf {
  read: string;
  picks: HuntPick[];
}

interface CategoryState {
  /** sub-category label → its shelf. Null until the category is drawn. */
  shelves: Record<string, Shelf> | null;
  loading: boolean;
  error: string | null;
  /** The card being replaced, as `<sub-category>\u241f<piece name>`. */
  replacing: string | null;
}

const EMPTY_STATE: CategoryState = { shelves: null, loading: false, error: null, replacing: null };

// ---------------------------------------------------------------------------
// FIX facts about a run — arithmetic over the taxonomy, never a model call.
// ---------------------------------------------------------------------------

/** The stretch of the year one sub-category answers, from the spans of the
 * classic types it covers. Null for the runs the Index declines to band. */
function runSpanLabel(sub: HuntSubCategory): string | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const id of sub.typeIds) {
    const type = findGarmentType(id);
    const span = type ? spanOf(type) : null;
    if (!span) continue;
    lo = Math.min(lo, span.lo);
    hi = Math.max(hi, span.hi);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  // A run that reaches nearly the whole ruler is not a temperature fact worth
  // stating as one — it is simply worn all year.
  if (hi - lo >= (RULER_HI - RULER_LO) * 0.62) return 'all year';
  return `${lo}\u2013${hi}\u00b0`;
}

// ---------------------------------------------------------------------------
// One sub-category — the run, Beau's line on it, and his picks under it.
// ---------------------------------------------------------------------------

function SubCategoryBlock({
  categoryId,
  sub,
  shelf,
  ownedCount,
  calls,
  replacingKey,
  onReplace,
  photos,
}: {
  categoryId: string;
  sub: HuntSubCategory;
  shelf: Shelf | null;
  ownedCount: number;
  calls: HuntCallsState;
  replacingKey: string | null;
  onReplace: (subCategory: string, pick: HuntPick) => void;
  photos: React.MutableRefObject<Map<string, string>>;
}) {
  const span = runSpanLabel(sub);
  /** A pass takes the piece off the shelf — here, and on every later visit,
   * because the shelf is filtered by the calls themselves rather than by a
   * one-off removal. Un-pass it on Your Calls and it comes back. */
  const picks = (shelf?.picks || []).filter(
    (pick) =>
      calls.tagOf({
        pieceName: pick.pieceName,
        categoryId,
        subCategory: sub.label,
        source: 'picks',
      }) !== 'passed',
  );
  return (
    <section aria-label={sub.label} style={{ paddingTop: '24px' }}>
      <div
        className="flex items-start justify-between gap-4"
        style={{ borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}
      >
        <div className="min-w-0">
          <h4 className="flex items-baseline gap-2.5 flex-wrap" style={{ margin: 0 }}>
            <span style={{ ...serif(18, WALNUT), lineHeight: 1.25 }}>{sub.label}</span>
            {span && <span style={{ ...mono(8, FAINT) }}>{span}</span>}
          </h4>
          <p style={{ ...body(12.5, FAINT), margin: '4px 0 0', maxWidth: '64ch' }}>{sub.note}</p>
        </div>
        <span style={{ ...mono(8, FAINT), flexShrink: 0, textAlign: 'right', paddingTop: '4px' }}>
          {ownedCount > 0 ? `You own ${numberWord(ownedCount)}` : 'None of your own'}
        </span>
      </div>

      {shelf?.read && (
        <p className="flex gap-3" style={{ margin: '11px 0 0' }}>
          <span style={{ ...mono(8, FAINT), flexShrink: 0, paddingTop: '3px', width: '58px' }}>Why now</span>
          <span style={{ ...body(13, SECONDARY), maxWidth: '62ch' }}>{shelf.read}</span>
        </p>
      )}

      {picks.length === 0 ? (
        <HuntQuietLine>
          Beau holds nothing here for you at the moment — on your record this run is either answered or the wrong
          tool where you live.
        </HuntQuietLine>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '15px', paddingTop: '15px' }}>
          {picks.map((pick) => {
            const key = `${sub.label}\u241f${pick.pieceName}`;
            const taggable: HuntTaggable = {
              pieceName: pick.pieceName,
              categoryId,
              subCategory: sub.label,
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
                  onTag: (tag) => {
                    void calls.toggleTag(
                      { ...taggable, imageUrl: photos.current.get(key) || null },
                      tag,
                    );
                  },
                  onReplace: () => onReplace(sub.label, pick),
                  busy: replacingKey === key || calls.writingKey === huntCardKey(taggable),
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// One category — collapsed by default, its unfold the trigger for the draw.
// ---------------------------------------------------------------------------

function CategoryRow({
  category,
  read,
  ownedCount,
  ownedInRun,
  open,
  state,
  reader,
  calls,
  photos,
  onToggle,
  onRedraw,
  onReplace,
}: {
  category: HuntCategory;
  read: string | null;
  ownedCount: number;
  ownedInRun: (sub: HuntSubCategory) => number;
  open: boolean;
  state: CategoryState;
  reader: HuntReader | null;
  calls: HuntCallsState;
  photos: React.MutableRefObject<Map<string, string>>;
  onToggle: () => void;
  onRedraw: () => void;
  onReplace: (subCategory: string, pick: HuntPick) => void;
}) {
  const drawn = !!state.shelves;
  const gaps = state.shelves
    ? Object.values(state.shelves).filter((shelf) => shelf.picks.length > 0).length
    : 0;
  const standing = !drawn
    ? 'Not read'
    : gaps === 0
      ? 'Covered'
      : `${numberWord(gaps)} gap${gaps === 1 ? '' : 's'}`;

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
          <span style={{ ...mono(8, drawn && gaps > 0 ? ACCENT_DEEP : FAINT), textAlign: 'right' }}>
            <span style={{ display: 'block' }}>{standing}</span>
            <span style={{ display: 'block', color: FAINTER, marginTop: '3px' }}>
              {`${numberWord(category.subCategories.length)} sub-categories`}
              {ownedCount > 0 ? ` · you own ${numberWord(ownedCount)}` : ''}
            </span>
          </span>
          {open && !state.loading && (
            <button
              type="button"
              onClick={onRedraw}
              title="Ask Beau to draw this category again from scratch"
              className="transition-colors flex items-center gap-1.5 hover:bg-[rgba(168,113,44,0.06)]"
              style={{
                ...mono(8.5, SECONDARY),
                border: `1px solid ${HAIRLINE}`,
                padding: '8px 12px',
                minHeight: '40px',
                background: 'transparent',
              }}
            >
              <RefreshCw className="w-3 h-3" strokeWidth={1.6} aria-hidden="true" />
              Draw again
            </button>
          )}
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
              {state.loading && (
                <HuntWorkingLine phase={`Beau is choosing your ${category.name.toLowerCase()}\u2026`} />
              )}
              {!state.loading && state.error && (
                <div style={{ padding: '18px 0' }}>
                  <p aria-live="polite" style={{ ...body(13.5, INK), margin: '0 0 11px', maxWidth: '58ch' }}>
                    {state.error}
                  </p>
                  <HuntButton onClick={onRedraw}>Try again</HuntButton>
                </div>
              )}
              {!state.loading && !state.error && !reader && (
                <HuntWorkingLine phase="Reading your dossier\u2026" />
              )}
              {!state.loading && !state.error && state.shelves &&
                category.subCategories.map((sub) => (
                  <SubCategoryBlock
                    key={sub.label}
                    categoryId={category.id}
                    sub={sub}
                    shelf={state.shelves?.[sub.label] || null}
                    ownedCount={ownedInRun(sub)}
                    calls={calls}
                    replacingKey={state.replacing}
                    onReplace={onReplace}
                    photos={photos}
                  />
                ))}
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

  /** The garment type each of his pieces answers to — what a run counts by. */
  const ownedTypeIds = useMemo(() => {
    const ids: string[] = [];
    for (const piece of reader?.pieces || []) {
      const id = matchGarmentTypeId(piece);
      if (id) ids.push(id);
    }
    return ids;
  }, [reader]);

  const ownedInRun = useCallback(
    (sub: HuntSubCategory) => ownedTypeIds.filter((id) => sub.typeIds.includes(id)).length,
    [ownedTypeIds],
  );

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

  const draw = useCallback(
    async (categoryId: string, forceRefresh = false) => {
      if (!reader) return;
      patch(categoryId, { loading: true, error: null });
      try {
        const result = await getHuntCategoryPicks(reader, categoryId, { forceRefresh });
        if (!result) {
          patch(categoryId, {
            loading: false,
            error: 'Beau is away from his desk this minute — nothing here is worth showing you until he is back.',
          });
          return;
        }
        const shelves: Record<string, Shelf> = {};
        for (const entry of result.subCategories) {
          shelves[entry.subCategory] = { read: entry.read, picks: entry.picks };
        }
        patch(categoryId, { loading: false, error: null, shelves });
      } catch {
        patch(categoryId, { loading: false, error: 'That draw did not land. Try it again in a moment.' });
      }
    },
    [patch, reader],
  );

  // Unfolding a category is the trigger: the draw runs on the first open and
  // the shelf is kept afterwards, so closing and reopening costs nothing.
  const toggle = useCallback(
    (categoryId: string) => {
      const nextOpen = !open[categoryId];
      setOpen((cur) => ({ ...cur, [categoryId]: nextOpen }));
      const held = states[categoryId];
      if (nextOpen && !held?.shelves && !held?.loading) void draw(categoryId);
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

  const replace = useCallback(
    async (categoryId: string, subCategory: string, pick: HuntPick) => {
      if (!reader) return;
      const key = `${subCategory}\u241f${pick.pieceName}`;
      patch(categoryId, { replacing: key });
      // Cleared away for good: the name joins the retired list for this
      // sub-category so neither this draw nor a later one repeats it.
      retirePieceName(categoryId, subCategory, pick.pieceName);
      const held = states[categoryId]?.shelves?.[subCategory]?.picks || [];
      try {
        const replacement = await drawReplacementPick({
          reader,
          categoryId,
          subCategory,
          exclude: held.map((p) => p.pieceName),
        });
        setStates((cur) => {
          const state = cur[categoryId] || EMPTY_STATE;
          const shelves = { ...(state.shelves || {}) };
          const shelf = shelves[subCategory] || { read: '', picks: [] };
          const current = shelf.picks;
          // A replacement that happens to name a piece already on the shelf
          // would collide with its sibling, so the card simply goes.
          const collides =
            !!replacement
            && current.some(
              (p) =>
                p.pieceName !== pick.pieceName
                && p.pieceName.toLowerCase() === replacement.pieceName.toLowerCase(),
            );
          shelves[subCategory] = {
            ...shelf,
            picks: replacement && !collides
              ? current.map((p) => (p.pieceName === pick.pieceName ? replacement : p))
              : current.filter((p) => p.pieceName !== pick.pieceName),
          };
          return {
            ...cur,
            [categoryId]: {
              ...state,
              shelves,
              replacing: null,
              error: replacement && !collides
                ? null
                : 'Beau could not draw a replacement this minute — the card is cleared away; “Draw again” when he is back.',
            },
          };
        });
      } catch {
        patch(categoryId, { replacing: null, error: 'That replacement did not land. Try it again in a moment.' });
      }
    },
    [patch, reader, states],
  );

  const anyOpen = Object.values(open).some(Boolean);
  const totalGaps = useMemo(
    () =>
      Object.values(states).reduce(
        (total, state) =>
          total
          + (state.shelves
            ? Object.values(state.shelves).filter((shelf) => shelf.picks.length > 0).length
            : 0),
        0,
      ),
    [states],
  );

  return (
    <div>
      <p style={{ ...body(14, INK), margin: '0 0 4px', maxWidth: '64ch' }}>
        The same categories The Index reads across, read down. Unfold one and Beau chooses within each of its
        sub-categories — against your frame, your colouring, the climate you dress for, what is already on your
        ledger and the calls you have made.
      </p>

      <div
        className="flex items-end justify-between gap-4 flex-wrap"
        style={{ marginTop: '26px', paddingBottom: '9px' }}
      >
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>
          By category · open one to see where the gaps are
        </h3>
        <span style={{ ...mono(8, FAINT) }}>
          {anyOpen
            ? `${numberWord(totalGaps)} gap${totalGaps === 1 ? '' : 's'} across ${numberWord(HUNT_CATEGORIES.length)} categories`
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
            ownedInRun={ownedInRun}
            open={!!open[category.id]}
            state={states[category.id] || EMPTY_STATE}
            reader={reader}
            calls={calls}
            photos={photos}
            onToggle={() => toggle(category.id)}
            onRedraw={() => void draw(category.id, true)}
            onReplace={(subCategory, pick) => void replace(category.id, subCategory, pick)}
          />
        ))}
      </div>
    </div>
  );
}
