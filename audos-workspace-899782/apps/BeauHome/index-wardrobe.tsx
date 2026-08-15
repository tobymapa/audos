/**
 * THE INDEX · PIECES — the reader's own ledger, read by temperature.
 *
 * Rebuilt from the founder's reference, top to bottom:
 *
 *  1. THE SPECTRUM (index-spectrum.tsx) — the eight bands with the
 *     temperatures above them, the reader's own piece count below each one,
 *     coldest at the left and warmest at the right, and their Dossier city
 *     over the top. Clicking a band HOLDS it and the categories narrow to
 *     the pieces that answer it.
 *  2. THE STATE LINE — what is being held, and the one Reset.
 *  3. THE ELEVEN CATEGORIES — the same sequence, in the same order, as The
 *     Hunt's Beau's Picks (INDEX_CATEGORY_IDS): Tops, Knitwear, Sweatshirts,
 *     Outerwear, Trousers & bottoms, Formalwear, Base layers, Shoes,
 *     Accessories, Bags, Hats & headwear. Each is ONE line — the name and
 *     the count of pieces the reader has logged in it, never a scroll — and
 *     each unfolds.
 *  4. UNFOLDED: Beau's verdict for that category, written for THIS reader
 *     against their ledger, profile and named gaps (index-tab-copy
 *     useCategoryVerdicts — never a stock line), then their ACTUAL pieces:
 *     one row each, with its colours, its comfortable range drawn on the
 *     shared ruler, its cloth and maker, and the range in figures.
 *       · the NAME opens the piece's card (index-piece-card.tsx)
 *       · the ARROW crosses to the Makers face, filtered to the houses
 *         known for that piece's type
 *
 * EVERY figure on this face is arithmetic over the reader's own record — the
 * pieces on their ledger, each read from its stored warmth row or the same
 * deterministic inference the Today pre-filter runs (index-model
 * readLedgerPieces). There is no hard-coded count, no sample piece and no
 * placeholder verdict anywhere on it: an empty category says so plainly and
 * offers the way to fill it.
 */
import { useMemo, useState } from 'react';
import type { TemperatureBand } from './temperature-bands';
import {
  BAND_LABELS,
  bandCountsOfReads,
  categoryName,
  groupReadsByCategory,
  readsInBand,
  type IndexModel,
  type LedgerPieceRead,
} from './index-model';
import { INDEX_CATEGORY_IDS, type GarmentCategoryId } from './garment-types';
import { useCategoryVerdicts } from './index-tab-copy';
import { IndexSpectrum, RangeBar, rulerPct } from './index-spectrum';
import { IndexPieceCard } from './index-piece-card';
import type { PieceDetails, StyleProfile, WardrobePiece } from './profile-data';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  MUTED,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';

const MIDDOT = ' \u00b7 ';
const ROW_RULE = '1px solid rgba(59,43,29,0.12)';

/** The row grid: name, colours, the range bar, the cloth, the figures, the
 * arrow. On a phone the middle three stand down and the row keeps its three
 * load-bearing columns — the line never scrolls sideways. */
const PIECE_GRID =
  'grid grid-cols-[minmax(0,1fr)_56px_30px] md:grid-cols-[minmax(130px,1fr)_46px_minmax(80px,1.1fr)_minmax(90px,150px)_58px_30px]';

const AXIS = [0, 10, 20, 30];

/** The degree ruler the bars hang from — the same scale the spectrum runs. */
function AxisHeader() {
  return (
    <div className={PIECE_GRID + ' items-end'} style={{ gap: '0 12px' }}>
      <span aria-hidden />
      <span aria-hidden className="hidden md:block" />
      <div aria-hidden className="hidden md:block" style={{ position: 'relative', height: '18px' }}>
        {AXIS.map((deg) => (
          <span
            key={deg}
            style={{
              ...mono(7.5, FAINT),
              position: 'absolute',
              left: rulerPct(deg) + '%',
              bottom: '2px',
              transform: 'translateX(-50%)',
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {deg + '\u00b0'}
          </span>
        ))}
      </div>
      <span aria-hidden className="hidden md:block" />
      <span aria-hidden />
      <span aria-hidden />
    </div>
  );
}

/** One piece the reader owns, as a row. */
function PieceRow({
  read,
  held,
  onOpen,
  onMakers,
}: {
  read: LedgerPieceRead;
  held: TemperatureBand | null;
  onOpen: () => void;
  onMakers: () => void;
}) {
  const inHeld = !!held && read.bands.includes(held);
  const detailLine = [read.brand, read.material].filter(Boolean).join(MIDDOT);
  const makersLabel = read.type ? 'Makers of the ' + read.type.name.toLowerCase() : 'Makers of this kind of piece';
  return (
    <div
      className={PIECE_GRID + ' items-center'}
      style={{ gap: '4px 12px', padding: '9px 0', borderBottom: ROW_RULE, background: inHeld ? 'rgba(168,113,44,0.07)' : 'transparent' }}
    >
      <span className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          title="Open the piece"
          className="text-left hover:opacity-70 transition-opacity max-w-full"
          style={{
            ...serif(16, WALNUT),
            background: 'transparent',
            padding: 0,
            lineHeight: 1.25,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: 'underline',
            textDecorationColor: 'rgba(168,113,44,0.45)',
            textUnderlineOffset: '3.5px',
          }}
        >
          {read.piece.name}
        </button>
        <span className="md:hidden block" style={{ ...mono(7, MUTED), marginTop: '3px' }}>
          {detailLine || 'No cloth recorded'}
        </span>
      </span>

      <span className="hidden md:flex items-center" style={{ gap: '3px' }} aria-hidden>
        {read.swatches.map((hex, i) => (
          <span
            key={hex + i}
            style={{ width: '7px', height: '7px', borderRadius: '50%', background: hex, border: '1px solid rgba(59,43,29,0.4)' }}
          />
        ))}
      </span>

      <span className="hidden md:block min-w-0">
        {read.span ? <RangeBar lo={read.span.lo} hi={read.span.hi} held={inHeld} /> : <span style={mono(7, FAINTER)}>Any weather</span>}
      </span>

      <span className="hidden md:block min-w-0" style={{ ...mono(7.5, SECONDARY), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detailLine || 'No cloth recorded'}
      </span>

      <span style={{ ...mono(8, inHeld ? ACCENT_DEEP : SECONDARY), textAlign: 'right', whiteSpace: 'nowrap', fontFeatureSettings: "'tnum' 1" }}>
        {read.span ? read.span.lo + '\u2013' + read.span.hi + '\u00b0' : '\u2014'}
      </span>

      <button
        type="button"
        onClick={onMakers}
        aria-label={makersLabel}
        title={makersLabel + ' \u2192'}
        className="justify-self-end transition-colors hover:border-[#a8712c]"
        style={{
          width: '24px',
          height: '23px',
          border: '1px solid ' + HAIRLINE,
          background: 'transparent',
          color: SECONDARY,
          fontSize: 'max(var(--eth-label, 0px), 12px)',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {'\u2192'}
      </button>
    </div>
  );
}

/** One category — a single line that unfolds into the reader's own pieces. */
function CategoryBlock({
  id,
  reads,
  total,
  held,
  verdict,
  open,
  onToggle,
  onOpenPiece,
  onMakers,
  onLogPiece,
}: {
  id: GarmentCategoryId;
  /** The pieces shown — after the held band and the find line. */
  reads: LedgerPieceRead[];
  /** Every piece the category holds on the ledger, whatever is held. */
  total: number;
  held: TemperatureBand | null;
  verdict: string;
  open: boolean;
  onToggle: () => void;
  onOpenPiece: (read: LedgerPieceRead) => void;
  onMakers: (read: LedgerPieceRead) => void;
  onLogPiece: () => void;
}) {
  const name = categoryName(id);
  const countLabel = held
    ? reads.length + ' of ' + total
    : total === 0
      ? 'none logged'
      : total + (total === 1 ? ' piece' : ' pieces');
  return (
    <div style={{ borderTop: '1px solid ' + HAIRLINE }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left grid grid-cols-[22px_minmax(0,1fr)_auto] items-baseline transition-colors hover:bg-[rgba(168,113,44,0.05)]"
        style={{ gap: '12px', padding: '13px 4px 13px 0', background: open ? 'rgba(168,113,44,0.04)' : 'transparent' }}
      >
        <span aria-hidden style={{ ...mono(13, ACCENT), letterSpacing: 0 }}>{open ? '\u2212' : '+'}</span>
        <span
          className="min-w-0 block"
          style={{ ...serif(21, WALNUT), lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {name}
        </span>
        <span style={{ ...mono(8.5, total > 0 ? SECONDARY : FAINTER), whiteSpace: 'nowrap', fontFeatureSettings: "'tnum' 1" }}>
          {countLabel}
        </span>
      </button>

      {open && (
        <div
          className="grid grid-cols-1 lg:grid-cols-[196px_minmax(0,1fr)]"
          style={{ gap: '16px 32px', padding: '4px 0 24px' }}
        >
          {/* ——— the rail: Beau's verdict on this category, for this reader */}
          <aside className="min-w-0">
            <span style={{ ...mono(7.5, ACCENT_DEEP), display: 'block' }}>{'Beau\u2019s verdict'}</span>
            <h4 style={{ ...serif(22, WALNUT), margin: '7px 0 0', lineHeight: 1.12 }}>{name}</h4>
            <p style={{ ...body(13, SECONDARY), margin: '8px 0 0' }}>{verdict}</p>
            <p
              style={{
                ...body(12, FAINT),
                margin: '12px 0 0',
                paddingTop: '10px',
                borderTop: '1px solid ' + HAIRLINE,
              }}
            >
              {'Each bar is that piece\u2019s own comfortable range, drawn on the ruler above. The dots are its colours.'}
            </p>
          </aside>

          {/* ——— the reader's own pieces */}
          <div className="min-w-0">
            {total === 0 ? (
              <div style={{ padding: '6px 0 0' }}>
                <p style={{ ...body(13.5, SECONDARY), margin: 0 }}>
                  {'Nothing of ' + name.toLowerCase() + ' on your rail yet.'}
                </p>
                <button
                  type="button"
                  onClick={onLogPiece}
                  className="hover:opacity-70 transition-opacity"
                  style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', marginTop: '9px', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  {'Log a piece in the Ledger \u2192'}
                </button>
              </div>
            ) : reads.length === 0 ? (
              <p style={{ ...body(13.5, SECONDARY), padding: '6px 0 0', margin: 0 }}>
                {'None of your ' + name.toLowerCase() + ' answer ' + (held ? BAND_LABELS[held] : 'that') + ' \u2014 release the band to see all ' + total + '.'}
              </p>
            ) : (
              <>
                <AxisHeader />
                <div style={{ borderTop: '1px solid ' + RULE }}>
                  {reads.map((read) => (
                    <PieceRow
                      key={read.piece.id}
                      read={read}
                      held={held}
                      onOpen={() => onOpenPiece(read)}
                      onMakers={() => onMakers(read)}
                    />
                  ))}
                </div>
                <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 14px', paddingTop: '9px' }}>
                  <span style={mono(7.5, FAINT)}>
                    {reads.length + ' of your ' + total + ' ' + name.toLowerCase() + ' shown'}
                  </span>
                  <span className="hidden sm:inline" style={mono(7.5, FAINTER)}>
                    A name opens the piece · the arrow lists its makers
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function IndexPiecesFace({
  model,
  reads,
  profile,
  pieces,
  details,
  onMakersForPiece,
  onOpenLedger,
  onSetCity,
}: {
  model: IndexModel;
  /** Every piece on the ledger, already read (index-model). */
  reads: LedgerPieceRead[];
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  details: Record<number, PieceDetails>;
  onMakersForPiece: (read: LedgerPieceRead) => void;
  onOpenLedger: () => void;
  onSetCity: () => void;
}) {
  const [heldBand, setHeldBand] = useState<TemperatureBand | null>(null);
  const [find, setFind] = useState('');
  const [openCats, setOpenCats] = useState<string[] | null>(null);
  const [openPieceId, setOpenPieceId] = useState<number | null>(null);

  // Beau's verdict for every category — written against THIS reader's ledger,
  // profile and named gaps; a per-reader computed line until the call lands.
  const verdicts = useCategoryVerdicts(profile, model, pieces);

  // The spectrum reads the WHOLE ledger — it is the record, not a view of a
  // search, so a held find never makes a band lie about what is owned.
  const bandCounts = useMemo(() => bandCountsOfReads(reads), [reads]);

  const q = find.trim().toLowerCase();
  const matching = useMemo(() => {
    if (!q) return reads;
    return reads.filter((r) => {
      const hay = [r.piece.name, r.brand || '', r.material || '', (r.piece.colors || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [reads, q]);

  const shownByCategory = useMemo(() => groupReadsByCategory(readsInBand(matching, heldBand)), [matching, heldBand]);
  const totalsByCategory = useMemo(() => groupReadsByCategory(reads), [reads]);

  const shownTotal = useMemo(
    () => INDEX_CATEGORY_IDS.reduce((n, id) => n + (shownByCategory[id] || []).length, 0),
    [shownByCategory],
  );

  // The first unfold is never an empty one: the page opens on the category
  // the reader has most of. With nothing logged at all, everything stays
  // closed and each line says so.
  const defaultOpen = useMemo(() => {
    const best = [...INDEX_CATEGORY_IDS]
      .map((id) => ({ id, n: (totalsByCategory[id] || []).length }))
      .sort((a, b) => b.n - a.n)[0];
    return best && best.n > 0 ? [best.id as string] : [];
  }, [totalsByCategory]);

  // A SEARCH opens whatever it found, so nothing hides behind a closed rule.
  // A held BAND does not: it re-counts every category line in place (“four of
  // twelve”), which is the reading the reference asks for, and the reader
  // keeps control of what is unfolded.
  const open = openCats ?? defaultOpen;
  const openNow = q
    ? INDEX_CATEGORY_IDS.filter((id) => (shownByCategory[id] || []).length > 0).map((id) => id as string)
    : open;

  const filtersHeld = (heldBand ? 1 : 0) + (q ? 1 : 0);
  const stateLine = heldBand
    ? BAND_LABELS[heldBand] + ' held \u2014 ' + shownTotal + ' of your ' + reads.length + ' pieces answer it'
    : q
      ? shownTotal + ' of your ' + reads.length + ' pieces match'
      : reads.length === 0
        ? 'Nothing on your rail yet \u2014 log a piece and it lands here'
        : 'No band held \u2014 every piece on your rail, category by category';

  const openRead = openPieceId != null ? reads.find((r) => r.piece.id === openPieceId) || null : null;
  const openSiblings = openRead && openRead.category ? (totalsByCategory[openRead.category] || []).length : 0;

  return (
    <div>
      <IndexSpectrum
        counts={bandCounts}
        total={reads.length}
        held={heldBand}
        onHold={setHeldBand}
        city={model.climate.city}
        onSetCity={onSetCity}
      />

      {/* ——— what is held, and the one Reset */}
      <div
        className="flex items-center justify-between flex-wrap"
        style={{ gap: '10px 16px', padding: '12px 0', borderTop: '1px solid ' + HAIRLINE, borderBottom: '1px solid ' + HAIRLINE }}
      >
        <span style={mono(8, filtersHeld > 0 ? ACCENT_DEEP : FAINT)}>{stateLine}</span>
        <div className="flex items-center flex-wrap" style={{ gap: '10px' }}>
          <label
            className="flex items-center min-w-0"
            style={{ gap: '10px', border: '1px solid ' + RULE, padding: '7px 11px', maxWidth: '300px' }}
          >
            <span style={mono(8, FAINT)}>Find</span>
            <input
              type="text"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={'one of your pieces \u2014 a name, a maker, a cloth'}
              aria-label="Find one of your pieces"
              className="min-w-0 flex-1 bg-transparent outline-none"
              style={{ ...body(13.5, INK), lineHeight: 1.3 }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setHeldBand(null);
              setFind('');
              setOpenCats(null);
            }}
            className="transition-colors hover:bg-[rgba(168,113,44,0.06)]"
            style={{
              ...mono(8.5, filtersHeld > 0 ? ACCENT_DEEP : FAINTER),
              border: '1px solid ' + (filtersHeld > 0 ? ACCENT_DEEP : HAIRLINE),
              background: 'transparent',
              padding: '7px 13px',
              whiteSpace: 'nowrap',
            }}
          >
            Reset filters
          </button>
        </div>
      </div>

      {/* ——— the eleven categories, in the app's one canonical order */}
      <section aria-label="Your pieces by category" style={{ paddingTop: '4px' }}>
        {INDEX_CATEGORY_IDS.map((id) => (
          <CategoryBlock
            key={id}
            id={id}
            reads={shownByCategory[id] || []}
            total={(totalsByCategory[id] || []).length}
            held={heldBand}
            verdict={verdicts.verdicts[id] || ''}
            open={openNow.includes(id)}
            onToggle={() =>
              setOpenCats(open.includes(id) ? open.filter((x) => x !== id) : [...open, id as string])
            }
            onOpenPiece={(read) => setOpenPieceId(read.piece.id)}
            onMakers={onMakersForPiece}
            onLogPiece={onOpenLedger}
          />
        ))}
        <div style={{ borderTop: '1px solid ' + HAIRLINE }} />
      </section>

      {/* ——— the foot: the whole ledger in one line */}
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', padding: '13px 0 0' }}>
        <span style={mono(7.5, FAINT)}>
          {reads.length + (reads.length === 1 ? ' piece' : ' pieces') + ' on your rail \u00b7 ' + INDEX_CATEGORY_IDS.length + ' categories'}
        </span>
        <span style={mono(7.5, FAINTER)}>
          {verdicts.generated ? 'Verdicts written by Beau for you' : 'Beau is writing your verdicts'}
        </span>
      </div>

      {openRead && (
        <IndexPieceCard
          read={openRead}
          model={model}
          profile={profile}
          detail={details[openRead.piece.id] || null}
          siblings={Math.max(0, openSiblings - 1)}
          onClose={() => setOpenPieceId(null)}
          onMakers={() => {
            setOpenPieceId(null);
            onMakersForPiece(openRead);
          }}
          onOpenLedger={onOpenLedger}
        />
      )}
    </div>
  );
}
