/**
 * THE EDIT · THE MAP — categories × temperature bands, to the founder's
 * reference design.
 *
 * Every day of his year sits in one of the eight bands. Down the side are
 * the eight categories a temperature can ask a question of; each cell says
 * how many of HIS OWN pieces answer that category in that band, and it is
 * shaded by how well: solid walnut where he is deep, the mid ink where he is
 * covered, the pale ink where one piece is doing all the work, and the
 * hatched gold where the page goes blank. A cell the category has no
 * business in (a sweatshirt at 30°) is left empty and is not a control.
 *
 * Clicking a cell opens the panel beneath the map: what the blank actually
 * costs him, what he reaches for instead, and the way straight into that
 * sub-category in The Hunt — with The Index one step further on.
 *
 * Under the map runs the YEAR ITSELF: one bar, each band as wide as the days
 * it holds, hatched where a critical layer is missing. It is the same
 * arithmetic as the headline percentage, drawn.
 */
import { useState } from 'react';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  INK,
  PAPER,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { type WardrobePiece } from './profile-data';
import { type PieceWarmth } from './warmth-model';
import {
  HATCH_GAP,
  HATCH_GAP_ON_PAGE,
  SHADE_COVERED,
  SHADE_DEEP,
  SHADE_THIN,
  pieceTemperatureLabel,
  piecesInCell,
  type CellState,
  type RulerCell,
  type RulerModel,
} from './edit-model';
import { fallbackCellNote, type EditReading } from './edit-coverage-ai';
import { openInBeausPicks, openInTheIndex } from './edit-links';

/** The design's own rules, at the two weights the map uses. */
const CELL_RULE = '1px solid rgba(59,43,29,0.12)';
const COL_RULE = '1px solid rgba(59,43,29,0.16)';

const CELL_BG: Record<CellState, string> = {
  deep: SHADE_DEEP,
  ok: SHADE_COVERED,
  thin: SHADE_THIN,
  gap: HATCH_GAP,
  na: 'transparent',
};

const CELL_FG: Record<CellState, string> = {
  deep: '#f6f0e5',
  ok: PAPER,
  thin: INK,
  gap: ACCENT_DEEP,
  na: '#cfc2ab',
};

function cellMark(cell: RulerCell): string {
  if (cell.state === 'na') return '\u00b7';
  if (cell.state === 'gap') return '\u2014';
  return String(cell.count);
}

function cellSub(cell: RulerCell): string {
  if (cell.state === 'gap') return 'gap';
  if (cell.state === 'thin') return 'thin';
  return '';
}

// ---------------------------------------------------------------------------
// The legend — four swatches, the same four the map is shaded with.
// ---------------------------------------------------------------------------

export function MapLegend() {
  const items: Array<{ label: string; bg: string; border?: string }> = [
    { label: 'Deep', bg: SHADE_DEEP },
    { label: 'Covered', bg: SHADE_COVERED },
    { label: 'Thin', bg: SHADE_THIN },
    { label: 'Gap', bg: HATCH_GAP_ON_PAGE, border: `1px solid ${ACCENT}` },
  ];
  return (
    <div className="flex items-center flex-wrap" style={{ gap: '16px' }}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center" style={{ ...mono(9, '#856c51'), gap: '7px' }}>
          <span
            aria-hidden="true"
            style={{ width: '13px', height: '13px', background: item.bg, border: item.border || 'none' }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel under the map.
// ---------------------------------------------------------------------------

function DetailPanel({
  cell,
  categoryNote,
  reading,
  pieces,
  materials,
  warmth,
  ownedInCategory,
}: {
  cell: RulerCell;
  categoryNote: string;
  reading: EditReading;
  pieces: WardrobePiece[];
  materials: Record<number, string>;
  warmth: Record<number, PieceWarmth>;
  ownedInCategory: number;
}) {
  const isGap = cell.state === 'gap';
  const owned = piecesInCell(pieces, cell.categoryId, cell.band, warmth, materials);
  const note =
    reading.cells[cell.key]
    || fallbackCellNote({
      categoryName: cell.categoryName,
      bandLabel: cell.bandLabel,
      days: cell.days,
      count: cell.count,
      state: cell.state,
      ownedNames: owned.map((p) => p.name).filter(Boolean),
    });

  const list: Array<{ name: string; meta: string; open: boolean }> = isGap
    ? [
        { name: 'Nothing owned', meta: '0 pieces', open: true },
        {
          name: 'Days affected',
          meta: cell.days == null ? 'climate not on file' : `${cell.days} a year`,
          open: cell.days == null,
        },
        {
          name: `In ${cell.categoryName.toLowerCase()} overall`,
          meta: `${ownedInCategory} piece${ownedInCategory === 1 ? '' : 's'}`,
          open: ownedInCategory === 0,
        },
      ]
    : owned.slice(0, 5).map((piece) => ({
        name: piece.name,
        meta: pieceTemperatureLabel(piece, materials, warmth),
        open: false,
      }));

  return (
    <div
      style={{
        marginTop: '22px',
        border: `1px solid ${isGap ? ACCENT : 'rgba(59,43,29,0.3)'}`,
        background: PAPER,
      }}
    >
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        style={{ gap: '24px 36px', padding: '20px 24px 22px', alignItems: 'start' }}
      >
        <div className="min-w-0">
          <div style={mono(9, isGap ? ACCENT_DEEP : FAINT)}>
            {isGap ? 'Gap' : cell.state === 'thin' ? 'Thin' : cell.state === 'deep' ? 'Deep' : 'Covered'}
            {` \u00b7 ${cell.categoryName} \u00b7 ${cell.bandLabel}`}
          </div>
          <div style={{ ...serif(29, WALNUT), marginTop: '7px', lineHeight: 1.1 }}>{note.title}</div>
          <p style={{ ...body(14, INK), margin: '11px 0 0', maxWidth: '74ch' }}>{note.body}</p>
          {/* The two ways on hold ONE row on every width (founder's
              correction, August 2026) — Beau's picks and In the Index sit
              side by side on a phone exactly as they do on a desktop. */}
          <div className="flex items-center flex-nowrap" style={{ gap: '10px', marginTop: '14px' }}>
            <button
              type="button"
              onClick={() =>
                openInBeausPicks({ categoryId: cell.categoryId, subCategory: cell.subCategory })
              }
              className="transition-colors hover:bg-[#3b2b1d] hab-tap"
              // The SAME box as “In the Index” beside it (founder's
              // correction, August 2026): the same mono size and 9×16
              // padding so the two buttons stand at ONE height, and nowrap
              // so “Beau's picks” never breaks over two lines on a phone.
              style={{
                ...mono(9, '#f6f0e5'),
                background: WALNUT,
                border: `1px solid ${WALNUT}`,
                padding: '9px 16px',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
            >
              {'Beau\u2019s picks'}
            </button>
            {cell.typeId && (
              <button
                type="button"
                onClick={() => openInTheIndex({ typeId: cell.typeId as string })}
                title={`Open this in The Index`}
                className="transition-colors hover:border-[#a8712c] hab-tap"
                style={{
                  ...mono(9, SECONDARY),
                  border: '1px solid rgba(59,43,29,0.35)',
                  background: 'transparent',
                  padding: '9px 16px',
                  whiteSpace: 'nowrap',
                }}
              >
                In the Index →
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0 md:border-l md:border-[rgba(59,43,29,0.22)] md:pl-6">
          <div style={mono(9, FAINT)}>{isGap ? 'The band' : 'What you own here'}</div>
          {list.length === 0 ? (
            <p style={{ ...body(13, SECONDARY), margin: '9px 0 0' }}>Nothing of yours reaches this band.</p>
          ) : (
            list.map((entry) => (
              <div
                key={entry.name}
                className="grid grid-cols-[minmax(0,1fr)_auto]"
                style={{
                  gap: '12px',
                  alignItems: 'baseline',
                  marginTop: '9px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid rgba(59,43,29,0.12)',
                }}
              >
                <span style={{ ...body(13.5, INK), lineHeight: 1.4 }}>{entry.name}</span>
                <span style={{ ...mono(9, entry.open ? ACCENT_DEEP : '#856c51'), whiteSpace: 'nowrap' }}>
                  {entry.meta}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export function EditRuler({
  ruler,
  reading,
  pieces,
  materials,
  warmth,
  selected,
  onSelect,
  ownedByCategory,
}: {
  ruler: RulerModel;
  reading: EditReading;
  pieces: WardrobePiece[];
  materials: Record<number, string>;
  warmth: Record<number, PieceWarmth>;
  selected: string | null;
  onSelect: (key: string) => void;
  ownedByCategory: Record<string, number>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  // A matrix is the one layout that cannot become a stack — nine columns of
  // categories against temperature bands only mean anything side by side. On a
  // phone it therefore keeps scrolling sideways, but three things make that
  // readable rather than a guess: the label column narrows (--eth-map-label),
  // the whole grid asks for less width so more bands are on screen at once
  // (--eth-map-min), and each row's own label is pinned to the left edge
  // (hab-map-rowhead) so the reader can always see which category the cell
  // under their thumb belongs to. All three variables are unset on a desktop,
  // where the fallbacks are the values this map has always used.
  const columns = `var(--eth-map-label, 186px) repeat(${ruler.bands.length}, minmax(0, 1fr))`;
  const openCell =
    ruler.rows.flatMap((r) => r.cells).find((c) => c.key === selected && c.state !== 'na') || null;
  const openRow = openCell ? ruler.rows.find((r) => r.id === openCell.categoryId) || null : null;

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 'var(--eth-map-min, 860px)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: columns,
              border: `1px solid ${INK}`,
              background: PAPER,
            }}
          >
            <div
              className="hab-map-rowhead"
              style={{ ...mono(9, FAINT), padding: '11px 12px', borderBottom: `1px solid ${INK}`, background: PAPER }}
            >
              Category · band
            </div>
            {ruler.bands.map((band) => (
              <div
                key={band.id}
                style={{
                  padding: '11px 10px',
                  borderLeft: COL_RULE,
                  borderBottom: `1px solid ${INK}`,
                  background: band.short > 0 ? 'rgba(168,113,44,0.09)' : 'transparent',
                }}
              >
                <div
                  style={{
                    ...mono(10, band.short > 0 ? ACCENT_DEEP : WALNUT),
                    textTransform: 'none',
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {band.label}
                </div>
                <div style={{ ...mono(8.5, FAINT), marginTop: '4px' }}>
                  {band.days == null ? '\u2014' : `${band.days} days`}
                </div>
              </div>
            ))}

            {ruler.rows.map((row) => (
              <div key={row.id} style={{ display: 'contents' }}>
                <div
                  className="hab-map-rowhead"
                  // The sub-category line is PARKED, not deleted (founder's
                  // correction, August 2026): it now shows on HOVER over the
                  // category name via this title. To put it back on screen,
                  // restore the commented span below.
                  title={row.note ? `${row.name} \u2014 ${row.note}` : row.name}
                  style={{
                    padding: '13px 12px',
                    borderBottom: CELL_RULE,
                    background: PAPER,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                >
                  <span style={{ ...body(14, WALNUT), lineHeight: 1.25 }}>{row.name}</span>
                  {/* <span style={mono(8.5, row.hasGap ? ACCENT_DEEP : '#856c51')}>{row.note}</span> */}
                </div>
                {row.cells.map((cell) => {
                  const on = cell.key === selected;
                  const isNa = cell.state === 'na';
                  const hover = hovered === cell.key && !isNa;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={isNa}
                      aria-pressed={on}
                      onMouseEnter={() => setHovered(cell.key)}
                      onMouseLeave={() => setHovered((cur) => (cur === cell.key ? null : cur))}
                      onClick={() => {
                        if (!isNa) onSelect(cell.key);
                      }}
                      title={`${row.name} \u00b7 ${cell.bandLabel} \u00b7 ${
                        isNa
                          ? 'not applicable'
                          : cell.state === 'gap'
                            ? 'nothing owned'
                            : `${cell.count} piece${cell.count === 1 ? '' : 's'}`
                      }`}
                      style={{
                        borderLeft: COL_RULE,
                        borderBottom: CELL_RULE,
                        borderTop: 'none',
                        borderRight: 'none',
                        padding: '9px 8px',
                        minHeight: '56px',
                        cursor: isNa ? 'default' : 'pointer',
                        background: hover ? 'rgba(168,113,44,0.22)' : CELL_BG[cell.state],
                        outline: on ? `2px solid ${ACCENT}` : 'none',
                        outlineOffset: '-2px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <span
                        style={{
                          ...mono(13, CELL_FG[cell.state]),
                          textTransform: 'none',
                          fontFeatureSettings: "'tnum'",
                        }}
                      >
                        {cellMark(cell)}
                      </span>
                      <span style={mono(7.5, cell.state === 'gap' ? ACCENT_DEEP : '#856c51')}>
                        {cellSub(cell)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* The year itself, drawn: each band as wide as the days it holds. */}
          {ruler.hasDays && (
            <div style={{ display: 'grid', gridTemplateColumns: 'var(--eth-map-label, 186px) minmax(0,1fr)', marginTop: '14px' }}>
              <div style={{ ...mono(9, FAINT), paddingTop: '4px' }}>Days of your year</div>
              <div>
                <div style={{ display: 'flex', height: '26px', border: '1px solid rgba(59,43,29,0.3)' }}>
                  {ruler.bands.map((band) => (
                    <div
                      key={band.id}
                      title={`${band.label} \u00b7 ${band.days} days \u00b7 ${
                        band.short > 0 ? `${band.short} layers missing` : 'answered'
                      }`}
                      style={{
                        flex: band.days || 1,
                        background: band.short > 0 ? HATCH_GAP_ON_PAGE : SHADE_COVERED,
                        borderRight: '1px solid rgba(59,43,29,0.2)',
                      }}
                    />
                  ))}
                </div>
                <div style={{ ...mono(9, '#856c51'), marginTop: '6px' }}>
                  {`${ruler.answeredDays} answered \u00b7 ${ruler.shortDays} short \u00b7 ${ruler.totalDays} days in the year`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {openCell && openRow && (
        <DetailPanel
          cell={openCell}
          categoryNote={openRow.note}
          reading={reading}
          pieces={pieces}
          materials={materials}
          warmth={warmth}
          ownedInCategory={ownedByCategory[openCell.categoryId] || 0}
        />
      )}

      {!openCell && (
        <p style={{ ...mono(9, FAINTER), margin: '14px 0 0' }}>
          Click any filled cell for what it means — the empty ones are bands the category has no business in.
        </p>
      )}
    </div>
  );
}
