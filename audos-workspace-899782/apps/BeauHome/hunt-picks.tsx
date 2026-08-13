/**
 * THE HUNT · BEAU'S PICKS — the first sub-tab (August 2026 redesign, to the
 * founder's screens).
 *
 * The SAME categories The Index's Pieces face carries, in the SAME order:
 * what runs left to right across The Index runs top to bottom here (main
 * categories only — hunt-model.ts derives both from category-order.ts, so
 * they cannot drift). Every category arrives COLLAPSED behind its own unfold
 * control, in EXACTLY the row treatment The Ledger's categories carry — the
 * same plus mark, the same Cormorant name, the same line beneath it, the
 * same status word and count against the right edge — so the two tabs read
 * as one product.
 *
 * The collapsed list is not a list of nouns: each category carries Beau's
 * own line on where this man stands in it (hunt-picks-ai.ts
 * `getHuntCategoryReads` — one call for all eleven, written from his
 * ledger), a status word (NOT READ until he has drawn it; then COVERED, or
 * the count of gaps his shortlist found) and its sub-category count.
 *
 * Unfolded, a category shows THREE SUB-CATEGORY ROWS — the three
 * sub-categories Beau says matter most for this man, drawn live against his
 * whole record (hunt-shortlist-ai.ts): his ledger, his frame, colouring,
 * budgets, city, climate and registers. Each row carries a season tag, a
 * status word, Beau's one-line reason, the count he owns in it, and a
 * 10 PICKS → control opening the full ten-pick page for that sub-category
 * (hunt-shortlist.tsx).
 *
 * WHAT THE READER NEVER SEES: an error, an excuse, or a placeholder
 * recommendation. While a draw is in flight the shelf holds hairline row
 * skeletons; a draw that does not land is asked ONCE more, quietly; if that
 * one does not land either the shelf simply reads as empty, in one neutral
 * line. There is no "try again" to press, because folding the category away
 * and back is the reader's own quiet retry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  INK,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { numberWord } from './mono-type';
import { HUNT_CATEGORIES, type HuntCategory } from './hunt-model';
import { getHuntCategoryReads } from './hunt-picks-ai';
import {
  SUB_PICKS_PER_CATEGORY,
  drawCategorySubPicks,
  type HuntSubPick,
} from './hunt-shortlist-ai';
import type { HuntReader } from './hunt-reader';
import { HuntQuietLine, type HuntCallsState } from './hunt-cards';
import { HairlineRowsSkeleton } from './skeleton';
import { HuntSubRows, HuntTenPicksPage } from './hunt-shortlist';
import { HUNT_OPEN_CATEGORY_EVENT, takeHuntTarget, type HuntTarget } from './edit-links';

interface ShelfState {
  /** Null until the category has been drawn. */
  subs: HuntSubPick[] | null;
  loading: boolean;
  /** True when the draw AND its one silent retry both came back with
   * nothing. The shelf then reads as an empty shelf — never as an error. */
  failed: boolean;
}

const EMPTY_STATE: ShelfState = { subs: null, loading: false, failed: false };

/** The pause between a draw that did not land and the ONE silent retry. The
 * reader is never told — the skeletons simply stay up across both. */
const RETRY_DELAY = 1600;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** The status word against the right edge — The Ledger's own tones. */
function badgeFor(state: ShelfState | undefined): { text: string; tone: string } {
  if (!state?.subs || state.subs.length === 0) return { text: 'Not read', tone: FAINT };
  const gaps = state.subs.filter((s) => s.status === 'GAP').length;
  if (gaps > 0) return { text: `${gaps} gap${gaps === 1 ? '' : 's'}`, tone: ACCENT_DEEP };
  return { text: 'Covered', tone: FAINT };
}

// ---------------------------------------------------------------------------
// One category — collapsed by default, its unfold the trigger for the draw.
// The row is THE LEDGER'S row, to the pixel: the same grid, the same plus,
// the same type scale, the same line spacing, the same right-edge pairing.
// ---------------------------------------------------------------------------

function CategoryRow({
  category,
  read,
  open,
  state,
  onToggle,
  onTenPicks,
}: {
  category: HuntCategory;
  read: string | null;
  open: boolean;
  state: ShelfState;
  onToggle: () => void;
  onTenPicks: (sub: HuntSubPick) => void;
}) {
  // Skeletons while a draw is in flight and before the first one lands;
  // rows when they come; one quiet neutral line when they do not.
  const waiting = state.loading || (!state.subs && !state.failed);
  const badge = badgeFor(state);

  return (
    <div
      id={`hunt-category-${category.id}`}
      style={{
        borderTop: '1px solid rgba(59,43,29,0.24)',
        background: open ? 'rgba(168,113,44,0.04)' : 'transparent',
        scrollMarginTop: '80px',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`hunt-picks-${category.id}`}
        className="w-full text-left grid grid-cols-[34px_minmax(0,1fr)_auto] items-baseline transition-colors hover:bg-[rgba(168,113,44,0.06)]"
        style={{ gap: '18px', padding: '17px 8px 17px 0', background: 'transparent', borderRadius: 0 }}
      >
        <span style={{ ...mono(15, ACCENT), letterSpacing: 0 }}>{open ? '\u2212' : '+'}</span>
        <span className="min-w-0 block">
          <span className="block" style={{ ...serif(27, WALNUT), lineHeight: 1.1 }}>
            {category.name}
          </span>
          {read && (
            <span className="block" style={{ ...body(13, SECONDARY), marginTop: '5px', lineHeight: 1.5 }}>
              {read}
            </span>
          )}
        </span>
        <span className="flex items-center whitespace-nowrap" style={{ gap: '14px' }}>
          <span style={mono(9.5, badge.tone)}>{badge.text}</span>
          <span style={{ ...mono(11, SECONDARY), letterSpacing: 0 }}>
            {category.subCategories.length} sub-categories
          </span>
        </span>
      </button>

      {open && (
        <div id={`hunt-picks-${category.id}`} className="md:pl-[52px]" style={{ paddingBottom: '22px' }}>
          {waiting ? (
            <div role="status" aria-label="Beau is choosing">
              <HairlineRowsSkeleton rows={SUB_PICKS_PER_CATEGORY} />
            </div>
          ) : !state.subs || state.subs.length === 0 ? (
            <HuntQuietLine>Nothing on this shelf just now.</HuntQuietLine>
          ) : (
            <HuntSubRows subs={state.subs} onTenPicks={onTenPicks} />
          )}
        </div>
      )}
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
  const [states, setStates] = useState<Record<string, ShelfState>>({});
  const [reads, setReads] = useState<Record<string, string>>({});
  /** The ten-pick page in front of the list, when a 10 PICKS → is open. */
  const [detail, setDetail] = useState<{ category: HuntCategory; sub: HuntSubPick } | null>(null);

  // Which categories are unfolded right now, readable from inside a draw
  // that started several seconds ago — a closed category is never
  // re-attempted.
  const openRef = useRef(open);
  openRef.current = open;

  const patch = useCallback((categoryId: string, next: Partial<ShelfState>) => {
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
   * Ask Beau for a category's three sub-categories. The engine itself
   * already tries every transport it has (hunt-shortlist-ai.ts → claude.ts
   * `callModel`); on top of that ONE silent retry here covers a draw that
   * came back empty. The shelf keeps its skeletons across both, and if the
   * second does not land either the category reads as an empty shelf —
   * never as an error, and never as a skeleton that stays up forever.
   */
  const draw = useCallback(
    async (categoryId: string, force = false) => {
      if (!reader) return;
      patch(categoryId, { loading: true, failed: false });

      const ask = async (forceRefresh: boolean): Promise<HuntSubPick[] | null> => {
        try {
          return await drawCategorySubPicks(reader, categoryId, { forceRefresh });
        } catch {
          return null;
        }
      };

      let subs = await ask(force);
      if (!subs || subs.length === 0) {
        await wait(RETRY_DELAY);
        // He folded it away while Beau was thinking — leave it as it was.
        if (!openRef.current[categoryId]) {
          patch(categoryId, { loading: false });
          return;
        }
        subs = await ask(true);
      }

      if (subs && subs.length > 0) patch(categoryId, { subs, loading: false, failed: false });
      else patch(categoryId, { subs: [], loading: false, failed: true });
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
      // Draw on the first unfold, and again if the last one came back with
      // nothing — folding it away and back is the reader's own quiet retry,
      // which is why this surface needs no "try again" control.
      if (nextOpen && !held?.loading && (!held?.subs || held.failed)) void draw(categoryId);
    },
    [draw, open, states],
  );

  /**
   * THE EDIT'S WAY IN. A Gap row on The Edit asks for one category by name:
   * it is unfolded (which is what asks Beau to draw its shortlist), and
   * scrolled to, so the reader lands on the shelf he came for. The request
   * arrives either as an event — when the tab is already mounted — or
   * parked, for a tab being loaded for the first time; both land here. The
   * handler is kept on a ref so the listener is registered once and still
   * sees the current shelves.
   */
  const openTargetRef = useRef<(target: HuntTarget | null) => void>(() => undefined);
  openTargetRef.current = (target) => {
    if (!target) return;
    const category = HUNT_CATEGORIES.find((c) => c.id === target.categoryId);
    if (!category) return;
    setDetail(null);
    if (!open[category.id]) {
      setOpen((cur) => ({ ...cur, [category.id]: true }));
      const held = states[category.id];
      if (!held?.loading && (!held?.subs || held.failed)) void draw(category.id);
    }
    window.setTimeout(() => {
      document
        .getElementById(`hunt-category-${category.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 140);
  };

  useEffect(() => {
    openTargetRef.current(takeHuntTarget());
    const onOpen = (e: Event) => openTargetRef.current(((e as CustomEvent).detail || null) as HuntTarget | null);
    window.addEventListener(HUNT_OPEN_CATEGORY_EVENT, onOpen);
    return () => window.removeEventListener(HUNT_OPEN_CATEGORY_EVENT, onOpen);
  }, []);

  // EVERY category starts FOLDED when the reader comes back to The Hunt
  // (founder's correction, August 2026). The tab is kept mounted, so the
  // shell's activation event is what says "he navigated back" — the drawn
  // shelves are kept (states), only the unfolds reset. A deep link from The
  // Edit re-opens its own category through the event above, which fires
  // again after activation.
  useEffect(() => {
    const onActivated = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'hunt') return;
      setOpen({});
      setDetail(null);
    };
    window.addEventListener('ethaion:tab-activated', onActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onActivated);
  }, []);

  // A category already unfolded when his RECORD changes re-draws itself —
  // the engine's cache key moved with the facts, so this reads the new ones
  // rather than spending again on the old. A tag deliberately does not
  // trigger this: it reaches the next draw through the same cache key.
  useEffect(() => {
    if (!reader) return;
    for (const [categoryId, isOpen] of Object.entries(open)) {
      if (isOpen && !states[categoryId]?.loading) void draw(categoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey, reader ? 'ready' : 'waiting']);

  const drawnCount = useMemo(
    () =>
      HUNT_CATEGORIES.reduce(
        (total, category) => total + (open[category.id] ? (states[category.id]?.subs || []).length : 0),
        0,
      ),
    [open, states],
  );

  // The ten-pick page stands in front of the list while it is open — the
  // list (and everything unfolded on it) is exactly as he left it beneath.
  if (detail && reader) {
    return (
      <HuntTenPicksPage
        reader={reader}
        calls={calls}
        category={detail.category}
        sub={detail.sub}
        onBack={() => setDetail(null)}
      />
    );
  }

  return (
    <div>
      <p style={{ ...body(14, INK), margin: '0 0 4px', maxWidth: '64ch' }}>
        The same categories The Index reads across, read down. Unfold one and Beau names the{' '}
        {numberWord(SUB_PICKS_PER_CATEGORY)} sub-categories that matter most for you right now — what each is
        doing for you, what you own in it, and ten researched picks behind every one.
      </p>

      <div
        className="flex items-end justify-between gap-4 flex-wrap"
        style={{ marginTop: '26px', paddingBottom: '9px' }}
      >
        <h3 style={{ ...serif(20, WALNUT), margin: 0 }}>By category · open one and he chooses</h3>
        <span style={mono(8, FAINT)}>
          {drawnCount > 0
            ? `${numberWord(drawnCount)} shortlist${drawnCount === 1 ? '' : 's'} in front of you`
            : `${numberWord(HUNT_CATEGORIES.length)} categories · unfold one to set him going`}
        </span>
      </div>

      <section aria-label="Beau's picks, by category" data-tour="tour-hunt-picks">
        {HUNT_CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            read={reads[category.id] || null}
            open={!!open[category.id]}
            state={states[category.id] || EMPTY_STATE}
            onToggle={() => toggle(category.id)}
            onTenPicks={(sub) => setDetail({ category, sub })}
          />
        ))}
        <div style={{ borderTop: `1px solid ${INK}` }} />
      </section>
    </div>
  );
}
