/**
 * THE EDIT — “Your year, and what it is missing” (rebuilt to the founder's
 * reference design; tab id 'beau').
 *
 * THE PAGE IS A YEAR. Every day of the reader's year falls in one of the
 * eight temperature bands the whole app keys on, and his own climate curve
 * says how many days fall in each. The page answers ONE question with
 * arithmetic over his ledger: how much of that year can he actually dress
 * for?
 *
 *  · THE MASTHEAD is the SHARED one (tab-header.tsx) and carries only the
 *    figure — the share of his year with every critical layer present. The
 *    four counts (answered, short, thin, open gaps) sit directly BELOW its
 *    closing rule, in the page's own body: nothing may render inside the
 *    masthead, or this tab's header stops matching the other five.
 *  · THE MAP (edit-map.tsx) is categories × bands: a cell per category per
 *    band, shaded deep · covered · thin · gap, with the blanks the category
 *    has no business in left empty and inert. Clicking a cell opens the panel
 *    beneath it — what the blank costs, what he owns instead, and the way
 *    into that sub-category in The Hunt.
 *  · BY CATEGORY (edit-sections.tsx) reads the same wardrobe the other way:
 *    the eleven categories, each unfolding into its sub-categories with
 *    Covered · Thin · Gap against them.
 *  · THE GAP TABLE closes the page: the gaps in the order Beau would close
 *    them, what each costs in days, and two ways on — his picks, and the
 *    piece's own entry in The Index.
 *
 * The numbers are arithmetic (edit-model.ts) over the wardrobe_pieces ledger,
 * each piece's real temperature range and the dossier's climate curve. The
 * WORDS are Beau's, from ONE model call cached for the session
 * (edit-coverage-ai.ts), with a deterministic fallback for every one of them
 * — the page is complete and honest whether or not a call lands.
 *
 * Design register is the reference's own, drawn from the shared Index tokens
 * (index-style.tsx): oatmeal ground, paper panels, hairline rules, walnut and
 * tobacco-gold ink, Cormorant headings, Lora body, IBM Plex Mono small-caps
 * labels, square corners, no shadows. The masthead is the shared one
 * (tab-header.tsx), so the indentation, type scale and closing rule are
 * identical to every other primary tab.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlexMono } from './mono-type';
import { ACCENT, ACCENT_DEEP, FAINT, INK, SECONDARY, WALNUT, body, mono, serif } from './index-style';
import { TabHeader } from './tab-header';
import { CrumbPublisher } from './crumb-trail';
import { fetchMaterials, type CategoryBudget, type StylePrefs, type StyleProfile, type WardrobePiece } from './profile-data';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { useIndexClimate } from './index-model';
import { DOSSIER_DETAILS_EVENT } from './dossier-details';
import { COVERAGE_PREFS_EVENT } from './coverage-prefs';
import { loadHuntCallsMirror } from './hunt-model';
import { loadHuntReader } from './hunt-reader';
import { useBeauAssessment } from './beau-assessment-context';
import {
  CRITICAL_CATEGORY_IDS,
  buildCategoryRows,
  buildRuler,
  computeGapRows,
  readLedger,
  type EditCategoryRow,
  type EditSubRow,
  type RulerModel,
} from './edit-model';
import { emptyReading, readEditCoverage, type EditReading } from './edit-coverage-ai';
import { EditRuler, MapLegend } from './edit-map';
import { CategoryList, GapTable } from './edit-sections';

type EditView = 'ruler' | 'cats';

/** How many gap rows the table opens with — the rest sit behind its one
 * control. */
const GAPS_SHOWN = 8;

/** The chip the two views are read through — the design's own. */
function ViewChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="transition-colors hover:border-[#a8712c] hab-tap"
      style={{
        ...mono(9.5, active ? WALNUT : SECONDARY),
        border: `1px solid ${active ? ACCENT : 'rgba(59,43,29,0.28)'}`,
        background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
        padding: '6px 14px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export function BeauTab(props: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  /** Accepted for parity with the other tabs; this page reads its budgets
   * from the dossier itself, so nothing here consumes it. */
  budgets?: Record<string, CategoryBudget>;
}) {
  const { profile, pieces, prefs } = props;
  usePlexMono();

  // The Layer 2 assessment paints nothing on this page, but it is still the
  // app's shared read — The Index's own Gap marks come from the last stored
  // one, and the app-level re-assess pipeline only runs for a wardrobe that
  // has asked for it once. Opening The Edit is still that ask.
  const { ensure } = useBeauAssessment();
  useEffect(() => {
    ensure();
  }, [ensure]);

  const [view, setView] = useState<EditView>('ruler');
  const [cell, setCell] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [shown, setShown] = useState(GAPS_SHOWN);

  // Tapping The Edit's tab label returns the page to its own home: the
  // temperature face, the opening gap count, nothing drilled into.
  useEffect(() => {
    const onTabHome = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'beau') return;
      setView('ruler');
      setShown(GAPS_SHOWN);
    };
    window.addEventListener('ethaion:tab-home', onTabHome);
    return () => window.removeEventListener('ethaion:tab-home', onTabHome);
  }, []);

  // Each piece's real temperature range and its cloth — the same two reads
  // The Index's band strip runs on, so the two tabs cannot disagree.
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  const [materials, setMaterials] = useState<Record<number, string>>({});
  useEffect(() => {
    let alive = true;
    fetchPieceWarmth()
      .then((rows) => {
        if (alive) setWarmth(rows);
      })
      .catch(() => undefined);
    fetchMaterials()
      .then((rows) => {
        if (alive) setMaterials(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pieces]);

  const climate = useIndexClimate();

  // ---- the arithmetic -----------------------------------------------------
  const ruler = useMemo<RulerModel>(
    () => buildRuler(pieces, warmth, materials, climate),
    [pieces, warmth, materials, climate],
  );
  const ledger = useMemo(() => readLedger(pieces), [pieces]);
  const categories = useMemo<EditCategoryRow[]>(
    () => buildCategoryRows(ledger, climate),
    [ledger, climate],
  );
  const gapRows = useMemo<EditSubRow[]>(() => computeGapRows(categories), [categories]);
  const ownedByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    ledger.byCategory.forEach((list, id) => {
      out[id] = list.length;
    });
    return out;
  }, [ledger]);

  // ---- Beau's reading -----------------------------------------------------
  const ledgerKey = useMemo(
    () => pieces.map((p) => `${p.id}:${p.category}:${p.slot || ''}`).sort().join('|'),
    [pieces],
  );
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

  const computed = useRef({ ruler, categories, gapRows });
  computed.current = { ruler, categories, gapRows };

  const [reading, setReading] = useState<EditReading | null>(null);
  const [thinking, setThinking] = useState(false);
  useEffect(() => {
    if (pieces.length === 0) return undefined;
    let alive = true;
    setThinking(true);
    loadHuntReader({ profile, pieces, prefs, calls: loadHuntCallsMirror() })
      .then((reader) =>
        readEditCoverage({
          reader,
          ruler: computed.current.ruler,
          categories: computed.current.categories,
          gapRows: computed.current.gapRows,
        }),
      )
      .then((next) => {
        if (!alive) return;
        setReading(next);
        setThinking(false);
      })
      .catch(() => {
        if (alive) setThinking(false);
      });
    return () => {
      alive = false;
    };
    // The record's identity stands in for the facts themselves — a re-render
    // with the same ledger and the same dossier never re-reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerKey, dossierBump, profile, prefs]);

  // The arithmetic's own reading — what the page shows until (or instead of)
  // Beau's. Held stable so a paint never rebuilds it.
  const fallback = useMemo(() => emptyReading(gapRows), [gapRows]);
  const read = reading || fallback;
  const gaps = read.gaps;

  // The page opens on the gap that costs the most — the panel is never empty
  // and the reader lands on the thing that matters.
  const firstGapCell = useMemo(() => {
    const cells = ruler.rows.flatMap((row) =>
      row.cells
        .filter((c) => c.state === 'gap')
        .map((c) => ({
          key: c.key,
          score: (CRITICAL_CATEGORY_IDS.has(row.id) ? 2 : 1) * (c.days == null ? 45 : c.days),
        })),
    );
    if (cells.length > 0) return cells.sort((a, b) => b.score - a.score)[0].key;
    const filled = ruler.rows.flatMap((row) => row.cells.filter((c) => c.state !== 'na'));
    return filled.length > 0 ? filled[0].key : null;
  }, [ruler]);
  useEffect(() => {
    setCell((cur) => cur || firstGapCell);
  }, [firstGapCell]);
  useEffect(() => {
    setOpenCategory((cur) => cur || categories.find((c) => c.gap > 0)?.id || categories[0]?.id || null);
  }, [categories]);

  // ---- the masthead figures ----------------------------------------------
  const answeredBands = ruler.bands.filter((b) => b.short === 0).length;
  const shortBands = ruler.bands.length - answeredBands;
  const thinBands = ruler.rows.length === 0
    ? 0
    : ruler.bands.filter((_, i) =>
        ruler.rows.some((r) => CRITICAL_CATEGORY_IDS.has(r.id) && r.cells[i].state === 'thin'),
      ).length;
  const pct = ruler.hasDays
    ? ruler.pct
    : Math.round((answeredBands / Math.max(1, ruler.bands.length)) * 100);

  const figures: Array<{ label: string; value: string; note: string; fg: string }> = [
    {
      label: 'Fully answered',
      value: ruler.hasDays ? `${ruler.answeredDays} days` : `${answeredBands} bands`,
      note: 'Every critical layer exists in these bands.',
      fg: WALNUT,
    },
    {
      label: 'Short',
      value: ruler.hasDays ? `${ruler.shortDays} days` : `${shortBands} bands`,
      note: 'At least one layer missing — the gaps below.',
      fg: ACCENT_DEEP,
    },
    {
      label: 'Thin',
      value: ruler.hasDays ? `${ruler.thinDays} days` : `${thinBands} bands`,
      note: 'A layer carried by one piece doing all the work.',
      fg: '#856c51',
    },
    {
      label: 'Open gaps',
      value: String(gaps.length),
      note: 'Each one has Beau\u2019s picks waiting in The Search.',
      fg: WALNUT,
    },
  ];

  // The design's own headline, carried by the shared masthead's standfirst so
  // the tab title, indentation and closing rule stay uniform with the others.
  const city = climate.city;
  const standfirst = `Your ${city ? `${city} ` : ''}year, and what it is missing.`;

  const selectedCell = useMemo(
    () => ruler.rows.flatMap((r) => r.cells).find((c) => c.key === cell) || null,
    [ruler, cell],
  );
  // The shared trail — ETHAION / THE EDIT / BY TEMPERATURE / [the cell] —
  // each parent segment a link back up the read. It is DRAWN once, by the
  // floating chrome row; this page only publishes to it.
  const crumbSegs = [
    { label: 'Ethaion' },
    { label: 'The Edit', onClick: () => setCell(null) },
    {
      label: view === 'ruler' ? 'By temperature' : 'By category',
      onClick: view === 'ruler' ? () => setCell(null) : () => setOpenCategory(null),
    },
    ...(view === 'ruler'
      ? selectedCell
        ? [{ label: `${selectedCell.categoryName} \u00b7 ${selectedCell.bandLabel}` }]
        : []
      : openCategory
        ? [{ label: categories.find((c) => c.id === openCategory)?.name || '' }].filter((s) => s.label)
        : []),
  ];

  const gapMeta = [
    `${gaps.length} gap${gaps.length === 1 ? '' : 's'}`,
    ruler.hasDays ? `${ruler.shortDays} days short` : null,
    read.fromBeau ? 'ranked by what changes most' : 'ranked by what they hold back',
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  return (
    <div>
      <TabHeader
        title="The Edit"
        standfirst={standfirst}
        aside={
          <>
            <span style={{ ...serif(44, WALNUT), lineHeight: 1 }}>{pct}%</span>
            <span style={mono(9.5, '#856c51')}>of your year fully answered</span>
            <span style={mono(9.5, ACCENT_DEEP)}>
              {ruler.hasDays
                ? `${ruler.shortDays} days of the year still go wrong`
                : `${shortBands} of ${ruler.bands.length} bands still go wrong`}
            </span>
          </>
        }
      />

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
        {/* The four figures — the page's own furniture, BELOW the masthead's
            closing rule, so this tab's header is exactly the height of the
            other five. */}
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ marginBottom: '26px', borderTop: `1px solid ${INK}` }}
        >
          {figures.map((figure, i) => (
            <div
              key={figure.label}
              style={{
                padding: '16px 22px 17px 0',
                borderRight: i === figures.length - 1 ? 'none' : '1px solid rgba(59,43,29,0.14)',
              }}
            >
              <div style={mono(9, FAINT)}>{figure.label}</div>
              <div style={{ ...serif(27, figure.fg), marginTop: '6px', lineHeight: 1 }}>{figure.value}</div>
              <div style={{ ...body(12.5, SECONDARY), marginTop: '6px', lineHeight: 1.45 }}>{figure.note}</div>
            </div>
          ))}
        </div>

        {pieces.length === 0 ? (
          <p style={{ ...body(14.5, SECONDARY), margin: 0, maxWidth: '70ch' }}>
            Log your first piece on The Rail and this page fills in — every day of your year against what you own,
            band by band, with the gaps named in the order Beau would close them.
          </p>
        ) : (
          <>
            {/* The wayfinding line lives in the floating chrome row — this
                only tells it where the reader is. */}
            <CrumbPublisher segs={crumbSegs} />

            {/* Read it · the two faces, and the legend the map is shaded by. */}
            <div
              className="flex items-center justify-between flex-wrap"
              style={{ gap: '14px 24px', paddingBottom: '12px' }}
            >
              <div className="flex items-center flex-wrap" style={{ gap: '8px' }}>
                <span style={mono(9, FAINT)}>Read it</span>
                <ViewChip label="By temperature" active={view === 'ruler'} onClick={() => setView('ruler')} />
                <ViewChip label="By category" active={view === 'cats'} onClick={() => setView('cats')} />
                <span aria-live="polite" style={mono(9, FAINT)}>
                  {thinking && !reading ? 'Beau is reading your year\u2026' : ''}
                </span>
              </div>
              <MapLegend />
            </div>

            {/* The wardrobe map — anchored for the first-run tour. */}
            <div data-tour="tour-edit-map">
              {view === 'ruler' ? (
                <EditRuler
                  ruler={ruler}
                  reading={read}
                  pieces={pieces}
                  materials={materials}
                  warmth={warmth}
                  selected={cell}
                  onSelect={setCell}
                  ownedByCategory={ownedByCategory}
                />
              ) : (
                <CategoryList
                  categories={categories}
                  subLines={read.subs}
                  open={openCategory}
                  onToggle={(id) => setOpenCategory((cur) => (cur === id ? null : id))}
                />
              )}
            </div>

            <GapTable
              gaps={gaps}
              meta={gapMeta}
              foot={read.foot}
              shown={shown}
              onShowAll={() => setShown(gaps.length)}
            />
          </>
        )}
      </div>
    </div>
  );
}
