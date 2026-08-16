/**
 * THE INDEX · THE CATEGORY PLATE (design screens 26b / L1 — “the category
 * plate”) — the page a category name opens from the Index root: ALL of one
 * category's types on one temperature ruler, with the wearer's own coverage
 * drawn over it.
 *
 *   · BREADCRUMB — [← BACK · THE INDEX] · THE INDEX / CATEGORY · count,
 *     with #position and ← → arrows walking the plates without leaving.
 *   · HEADER — the big serif category name; Beau's 2–3 line reading of the
 *     category against THIS wearer (index-beau-copy.ts — generated, cached,
 *     never a fixed string). Top right: “X of Y owned” and Beau's note on
 *     the coverage.
 *   · THE COVERAGE STRIP — what you can already put on, on the same ruler:
 *     each owned type drawn as a labelled band, and the widest bare stretch
 *     boxed dashed (“NOTHING AT ALL · a–b°”).
 *   · THE RUNS — each tailor's run as its own section: serif header with
 *     its count, Beau's one-line read of the run, then the rows — name ·
 *     band · verdict. Owned rows draw filled with OWNED; gaps ride a tinted
 *     row with a dashed band. Long runs fold behind “N more — … ↓”.
 *   · THE FOOT — the three-slot UP · DOWN · OUT annotations (generated).
 *
 * The row primitives (PlateRow · BandCell · the shared grid) are exported —
 * the Index root list draws its rows with the SAME pieces, so the two
 * levels never drift apart.
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import type { StyleProfile } from './profile-data';
import { PIECE_INDEX_CATEGORIES, type PieceIndexCategory, type PieceIndexType } from './piece-index-data';
import { bandLabel, VERDICT_LABEL, type CityCurve, type TempBand, type Verdict } from './index-lenses';
import { MONO, usePlexMono } from './mono-type';
import { useIsNarrow } from './plot-zoom';
import { useCategoryPlateCopy, type PlateFacts } from './index-beau-copy';

// ---------------------------------------------------------------------------
// The plate palette — the same inks the index root sets.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const ACCENT = '#a8712c';
const ACCENT_DEEP = '#7c4a17';
const BAND_GREY = 'rgba(59,43,29,0.35)';
const GAP_TINT = 'rgba(168,113,44,0.08)';
const HAIR = 'rgba(59,43,29,0.14)';
const HAIR_MID = 'rgba(59,43,29,0.24)';

function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', textTransform: 'uppercase', color };
}

/** “Flight jacket (B-3)” → “Flight jacket” — the plate's clean label. */
export function cleanTypeName(name: string): string {
  return name.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// The shared row model — the root list and the plate draw the same rows.
// ---------------------------------------------------------------------------

export interface IndexRow {
  type: PieceIndexType;
  group: string;
  /** Position on the category's own shelf — the 8a panel's ← → walk it. */
  shelfIndex: number;
  key: string;
  band: TempBand | null;
  verdict: Verdict;
  /** Swatches of the colours owned — present only when the ledger holds one. */
  owned: string[] | undefined;
  /** The maker of the owned piece, when the ledger knows it. */
  ownedBrand: string | null;
  gapRank: number | undefined;
}

export interface RulerScale {
  lo: number;
  hi: number;
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  essential: ACCENT_DEEP,
  works: MUTED,
  'wrong tool': FAINT,
};

/** The rows' shared scale — snapped to fives, never narrower than 0–30°. */
export function scaleFor(rows: IndexRow[]): RulerScale {
  let lo = 0;
  let hi = 30;
  for (const r of rows) {
    if (!r.band) continue;
    lo = Math.min(lo, r.band.lo);
    hi = Math.max(hi, r.band.hi);
  }
  return { lo: Math.floor(lo / 5) * 5, hi: Math.ceil(hi / 5) * 5 };
}

/** Owned first, then the flagged gaps, then the core, then written-up — the
 * order the short run of a folded group shows. */
export function rankRows(rows: IndexRow[]): IndexRow[] {
  const tier = (r: IndexRow) => (r.owned ? 0 : r.gapRank ? 1 : r.type.core ? 2 : r.type.entry ? 3 : 4);
  return [...rows].sort((a, b) => tier(a) - tier(b) || a.shelfIndex - b.shelfIndex);
}

// The one grid every row-level surface shares.
const ROW_GRID = 'minmax(150px,0.9fr) minmax(160px,1.6fr) 96px';

/** The band drawn against the shared ruler — filled walnut when owned,
 * dashed on the gap tint when the board names it, grey otherwise. */
export function BandCell({ row, scale }: { row: IndexRow; scale: RulerScale }) {
  const span = Math.max(1, scale.hi - scale.lo);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - scale.lo) / span) * 100));
  const band = row.band;
  const style: React.CSSProperties = row.owned
    ? { background: WALNUT }
    : row.gapRank
      ? { background: GAP_TINT, border: `1px dashed ${ACCENT_DEEP}` }
      : { background: BAND_GREY };
  return (
    <div style={{ position: 'relative', height: '9px' }} aria-hidden="true" title={bandLabel(band)}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '4px', height: '1px', background: HAIR }} />
      {band && (
        <div
          style={{
            position: 'absolute',
            left: `${pct(band.lo)}%`,
            width: `${Math.max(2, pct(band.hi) - pct(band.lo))}%`,
            top: '1px',
            height: '7px',
            ...style,
          }}
        />
      )}
    </div>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex items-center" style={{ gap: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>
      {colors.slice(0, 4).map((c) => (
        <span
          key={c}
          style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, border: '1px solid rgba(59,43,29,0.35)', display: 'inline-block' }}
        />
      ))}
    </span>
  );
}

/** ONE row of the plate (and of the root list) — name · band · verdict.
 * Owned rows carry the dot, the maker and OWNED; gap rows ride the tint. */
export function PlateRow({
  row,
  scale,
  narrow,
  onOpen,
}: {
  row: IndexRow;
  scale: RulerScale;
  narrow: boolean;
  onOpen: () => void;
}) {
  const verdictText = row.owned ? 'OWNED' : VERDICT_LABEL[row.verdict];
  const verdictColor = row.owned ? WALNUT : VERDICT_COLOR[row.verdict];
  const name = (
    <button
      type="button"
      onClick={onOpen}
      className="hover:underline text-left"
      aria-label={`${row.type.name} — open the entry`}
      style={{ background: 'transparent', fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 13.5px)', lineHeight: 1.35, color: row.owned ? WALNUT : INK, padding: 0 }}
    >
      {row.type.name}
      {row.ownedBrand && <span style={{ color: MUTED }}> · {row.ownedBrand}</span>}
      {row.owned && (
        <span aria-hidden="true" style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: WALNUT, marginLeft: '8px', verticalAlign: 'middle' }} />
      )}
      {row.owned && <Swatches colors={row.owned} />}
    </button>
  );
  const verdict = (
    <span style={{ ...mono(8, verdictColor), letterSpacing: '0.07em', textAlign: 'right', whiteSpace: 'nowrap' }}>{verdictText}</span>
  );
  const rowBackground = row.gapRank ? GAP_TINT : 'transparent';

  if (narrow) {
    return (
      <div style={{ padding: '8px 6px', borderBottom: `1px solid ${HAIR}`, background: rowBackground }}>
        <div className="grid items-center" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', gap: '10px' }}>
          {name}
          {verdict}
        </div>
        <div style={{ marginTop: '6px' }}>
          <BandCell row={row} scale={scale} />
        </div>
      </div>
    );
  }
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: ROW_GRID, gap: '14px', padding: '9px 6px', borderBottom: `1px solid ${HAIR}`, background: rowBackground }}
    >
      {name}
      <BandCell row={row} scale={scale} />
      <span className="text-right">{verdict}</span>
    </div>
  );
}

/** The column labels over the rows — RUN · TYPE | BAND | VERDICT. */
export function PlateColumnsHeader({ narrow }: { narrow: boolean }) {
  if (narrow) {
    return (
      <div className="flex items-baseline justify-between" style={{ padding: '4px 6px', borderBottom: `1px solid ${HAIR_MID}` }}>
        <span style={mono(8, FAINT)}>Run · type</span>
        <span style={mono(8, FAINT)}>Verdict</span>
      </div>
    );
  }
  return (
    <div
      className="grid items-baseline"
      style={{ gridTemplateColumns: ROW_GRID, gap: '14px', padding: '4px 6px', borderBottom: `1px solid ${HAIR_MID}` }}
    >
      <span style={mono(8, FAINT)}>Run · type</span>
      <span style={mono(8, FAINT)}>Band</span>
      <span className="text-right" style={mono(8, FAINT)}>Verdict</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage arithmetic — the merged owned bands and the widest bare stretch.
// ---------------------------------------------------------------------------

function mergeBands(bands: TempBand[]): TempBand[] {
  const sorted = [...bands].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const merged: TempBand[] = [];
  for (const band of sorted) {
    const last = merged[merged.length - 1];
    if (last && band.lo <= last.hi + 1) last.hi = Math.max(last.hi, band.hi);
    else merged.push({ ...band });
  }
  return merged;
}

export function largestHole(ownedBands: TempBand[], scale: RulerScale): TempBand | null {
  const merged = mergeBands(ownedBands);
  let best: TempBand | null = null;
  let cursor = scale.lo;
  for (const band of merged) {
    if (band.lo - cursor >= 3 && (!best || band.lo - cursor > best.hi - best.lo)) best = { lo: cursor, hi: band.lo };
    cursor = Math.max(cursor, band.hi);
  }
  if (scale.hi - cursor >= 3 && (!best || scale.hi - cursor > best.hi - best.lo)) best = { lo: cursor, hi: scale.hi };
  return best;
}

/** The coverage strip's ruler — owned types as labelled bands in lanes,
 * the widest bare stretch boxed dashed, degree ticks along the floor. */
function CoverageRuler({ ownedRows, hole, scale }: { ownedRows: IndexRow[]; hole: TempBand | null; scale: RulerScale }) {
  const span = Math.max(1, scale.hi - scale.lo);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - scale.lo) / span) * 100));

  // Lane the chips so neighbouring bands never overprint their labels.
  const chips = ownedRows
    .filter((r) => r.band)
    .sort((a, b) => (a.band as TempBand).lo - (b.band as TempBand).lo)
    .slice(0, 6);
  const laneEnds: number[] = [];
  const laned = chips.map((row) => {
    const band = row.band as TempBand;
    let lane = laneEnds.findIndex((end) => band.lo > end + span * 0.14);
    if (lane === -1) {
      lane = Math.min(laneEnds.length, 2);
      if (laneEnds.length <= lane) laneEnds.push(band.hi);
    }
    laneEnds[lane] = Math.max(laneEnds[lane] ?? band.hi, band.hi);
    return { row, band, lane };
  });
  const laneCount = Math.max(1, ...laned.map((c) => c.lane + 1));
  const laneH = 27;
  const bodyH = laneCount * laneH;

  const ticks: number[] = [];
  for (let t = Math.ceil(scale.lo / 10) * 10; t <= scale.hi; t += 10) ticks.push(t);

  return (
    <div>
      <div style={{ position: 'relative', height: `${bodyH + 12}px` }}>
        {/* The bare stretch — boxed dashed across every lane. */}
        {hole && (
          <div
            style={{
              position: 'absolute',
              left: `${pct(hole.lo)}%`,
              width: `${Math.max(2, pct(hole.hi) - pct(hole.lo))}%`,
              top: 0,
              height: `${bodyH + 4}px`,
              background: GAP_TINT,
              border: `1px dashed ${ACCENT_DEEP}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <span style={{ ...mono(7.5, ACCENT_DEEP), whiteSpace: 'nowrap' }}>
              Nothing at all · {hole.lo}–{hole.hi}°
            </span>
          </div>
        )}
        {/* The owned bands, labelled in their own lanes. */}
        {laned.map(({ row, band, lane }) => (
          <div
            key={row.key}
            style={{ position: 'absolute', left: `${pct(band.lo)}%`, width: `${Math.max(2.5, pct(band.hi) - pct(band.lo))}%`, top: `${lane * laneH}px` }}
          >
            <div style={{ ...mono(7.5, WALNUT), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '3px' }}>
              {cleanTypeName(row.type.name)} {band.lo}–{band.hi}
            </div>
            <div style={{ height: '8px', background: WALNUT }} />
          </div>
        ))}
        {/* The ruler floor. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '1px', background: HAIR_MID }} />
      </div>
      <div style={{ position: 'relative', height: '16px', marginTop: '4px' }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ position: 'absolute', left: `${pct(t)}%`, transform: 'translateX(-50%)', ...mono(8, FAINT) }}>
            {t}°
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The three-slot annotation foot — UP · DOWN · OUT.
// ---------------------------------------------------------------------------

export function AnnotationFoot({
  slots,
}: {
  slots: Array<{ label: string; text: string; action?: React.ReactNode }>;
}) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3"
      style={{ gap: '16px 40px', marginTop: '30px', paddingTop: '14px', borderTop: `1px solid ${INK}` }}
    >
      {slots.map((slot) => (
        <div key={slot.label}>
          <div style={mono(8.5, FAINT)}>{slot.label}</div>
          <p style={{ margin: '6px 0 0', fontFamily: BODY, fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.55, color: INK }}>{slot.text}</p>
          {slot.action && <div style={{ marginTop: '7px' }}>{slot.action}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE PLATE.
// ---------------------------------------------------------------------------

const FOLDED_ROWS = 4;

export function CategoryPlate({
  cat,
  rows,
  curve,
  profile,
  onBack,
  onGoCategory,
  onOpenType,
}: {
  cat: PieceIndexCategory;
  /** Every row of this category, in shelf order (piece-index-list builds them). */
  rows: IndexRow[];
  curve: CityCurve;
  profile: StyleProfile | null;
  onBack: () => void;
  onGoCategory: (id: string) => void;
  /** Opens the 8a entry panel on a shelf position. */
  onOpenType: (shelfIndex: number) => void;
}) {
  usePlexMono();
  const narrow = useIsNarrow();
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());

  const catIndex = PIECE_INDEX_CATEGORIES.findIndex((c) => c.id === cat.id);
  const catCount = PIECE_INDEX_CATEGORIES.length;
  const prevCat = PIECE_INDEX_CATEGORIES[(catIndex - 1 + catCount) % catCount];
  const nextCat = PIECE_INDEX_CATEGORIES[(catIndex + 1) % catCount];

  const scale = useMemo(() => scaleFor(rows), [rows]);
  const ownedRows = useMemo(() => rows.filter((r) => r.owned), [rows]);
  const hole = useMemo(
    () => largestHole(ownedRows.map((r) => r.band).filter(Boolean) as TempBand[], scale),
    [ownedRows, scale],
  );

  // Everything Beau writes on this plate reads from these facts — and only
  // re-writes itself when they change.
  const facts = useMemo<PlateFacts>(
    () => ({
      categoryId: cat.id,
      categoryName: cat.name,
      total: rows.length,
      owned: ownedRows.length,
      ownedNames: ownedRows.slice(0, 8).map((r) => cleanTypeName(r.type.name)),
      gapNames: rows.filter((r) => r.gapRank).slice(0, 6).map((r) => cleanTypeName(r.type.name)),
      holeLo: hole ? hole.lo : null,
      holeHi: hole ? hole.hi : null,
      city: curve.city,
      groups: cat.groups.map((group) => {
        const groupRows = rows.filter((r) => r.group === group.label);
        const groupOwned = groupRows.filter((r) => r.owned);
        return {
          label: group.label,
          total: groupRows.length,
          owned: groupOwned.length,
          ownedNames: groupOwned.slice(0, 4).map((r) => cleanTypeName(r.type.name)),
          gapNames: groupRows.filter((r) => r.gapRank).slice(0, 3).map((r) => cleanTypeName(r.type.name)),
        };
      }),
      position: catIndex + 1,
      count: catCount,
    }),
    [cat, rows, ownedRows, hole, curve.city, catIndex, catCount],
  );
  const copy = useCategoryPlateCopy(profile, facts);

  const toggleGroup = (label: string) => {
    setUnfolded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const holeLabel = hole ? `${hole.lo}–${hole.hi}°` : null;

  return (
    <div>
      {/* ------------------------------------------------- the breadcrumb */}
      <div className="flex items-center flex-wrap" style={{ gap: '10px 16px', paddingBottom: '18px' }}>
        <button
          type="button"
          onClick={onBack}
          className="hover:opacity-80 transition-opacity"
          style={{ ...mono(8.5, SECONDARY), padding: '7px 11px', border: `1px solid ${HAIR_MID}`, background: 'transparent', whiteSpace: 'nowrap' }}
        >
          ← Back · The Index
        </button>
        <span style={{ ...mono(8.5, MUTED), whiteSpace: 'nowrap' }}>
          The Index / <span style={{ color: WALNUT }}>{cat.name}</span> · {rows.length}
        </span>
        <span className="ml-auto inline-flex items-center" style={{ gap: '10px' }}>
          <span style={{ ...mono(8.5, FAINT), whiteSpace: 'nowrap' }}>#{catIndex + 1} of {catCount}</span>
          <button
            type="button"
            onClick={() => onGoCategory(prevCat.id)}
            aria-label={`Previous category — ${prevCat.name}`}
            title={`← ${prevCat.name}`}
            className="hover:opacity-80 transition-opacity"
            style={{ ...mono(10, ACCENT_DEEP), padding: '6px 10px', border: `1px solid ${HAIR_MID}`, background: 'transparent' }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onGoCategory(nextCat.id)}
            aria-label={`Next category — ${nextCat.name}`}
            title={`${nextCat.name} →`}
            className="hover:opacity-80 transition-opacity"
            style={{ ...mono(10, ACCENT_DEEP), padding: '6px 10px', border: `1px solid ${HAIR_MID}`, background: 'transparent' }}
          >
            →
          </button>
        </span>
      </div>

      {/* ----------------------------------------------------- the header */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]" style={{ gap: '18px 56px' }}>
        <div>
          <h2
            style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(36px, 5.5vw, 52px)', fontWeight: 400, lineHeight: 1.04, letterSpacing: '-0.012em', color: WALNUT }}
          >
            {cat.name}
          </h2>
          <p style={{ margin: '12px 0 0', fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 14.5px)', lineHeight: 1.6, color: INK, maxWidth: '58ch' }}>
            {copy.description}
          </p>
        </div>
        <div style={{ borderLeft: `1px solid ${HAIR_MID}`, paddingLeft: '18px' }} className="md:justify-self-end md:w-full">
          <div style={mono(8, ACCENT_DEEP)}>This category, against your rail</div>
          <div style={{ marginTop: '8px', fontFamily: SERIF, fontSize: '23px', lineHeight: 1.1, color: WALNUT }}>
            {ownedRows.length} of {rows.length} owned
          </div>
          <p style={{ margin: '7px 0 0', fontFamily: BODY, fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.55, color: SECONDARY }}>{copy.statNote}</p>
        </div>
      </div>

      {/* -------------------------------------------- the coverage strip */}
      <div style={{ marginTop: '26px', paddingTop: '14px', borderTop: `1px solid ${HAIR_MID}` }}>
        <div style={mono(8, MUTED)}>What you can already put on, on the same ruler</div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]" style={{ gap: '14px 40px', marginTop: '12px' }}>
          <p style={{ margin: 0, fontFamily: BODY, fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.55, color: SECONDARY }}>{copy.coverageNote}</p>
          <CoverageRuler ownedRows={ownedRows} hole={hole} scale={scale} />
        </div>
      </div>

      {/* -------------------------------------------------------- the runs */}
      <div style={{ marginTop: '26px' }}>
        <PlateColumnsHeader narrow={narrow} />
        {cat.groups.map((group) => {
          const groupRows = rows.filter((r) => r.group === group.label);
          if (groupRows.length === 0) return null;
          const open = unfolded.has(group.label);
          const ranked = rankRows(groupRows);
          const shown = open || groupRows.length <= FOLDED_ROWS + 2 ? ranked : ranked.slice(0, FOLDED_ROWS);
          const hidden = ranked.slice(shown.length);
          return (
            <section key={group.label} aria-label={`${group.label} — ${cat.name}`} style={{ padding: '22px 0 6px' }}>
              <div className="flex items-baseline" style={{ gap: '9px' }}>
                <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: '22px', fontWeight: 400, lineHeight: 1.15, color: WALNUT }}>
                  {group.label} —
                </h3>
                <span style={mono(8.5, FAINT)}>{groupRows.length}</span>
              </div>
              <p style={{ margin: '5px 0 10px', fontFamily: BODY, fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.5, color: SECONDARY, maxWidth: '44ch' }}>
                {copy.groupNotes[group.label]}
              </p>
              <div style={{ borderTop: `1px solid ${HAIR_MID}` }}>
                {shown.map((row) => (
                  <PlateRow key={row.key} row={row} scale={scale} narrow={narrow} onOpen={() => onOpenType(row.shelfIndex)} />
                ))}
              </div>
              {(hidden.length > 0 || (open && groupRows.length > FOLDED_ROWS + 2)) && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="hover:underline text-left"
                  style={{ background: 'transparent', padding: '8px 6px 0', ...mono(8, ACCENT_DEEP), letterSpacing: '0.07em' }}
                >
                  {open
                    ? 'Fold the run ↑'
                    : `${hidden.length} more — ${hidden
                        .slice(0, 5)
                        .map((r) => cleanTypeName(r.type.name))
                        .join(', ')}${hidden.length > 5 ? ', …' : ''} ↓`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {/* ------------------------------------------------------- the foot */}
      <AnnotationFoot
        slots={[
          { label: 'Up', text: copy.annotations.up },
          { label: 'Down', text: copy.annotations.down },
          { label: 'Out', text: copy.annotations.out },
        ]}
      />
    </div>
  );
}
