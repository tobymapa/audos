/**
 * THE INDEX · THE TEMPERATURE SPECTRUM — the band the Pieces face opens on,
 * drawn exactly as the founder's reference sets it out:
 *
 *   TEMPERATURE · CLICK A BAND TO HOLD IT              BARCELONA
 *   ≤ 0°    0–5°   5–10°  10–15°  15–20°  20–25°  25–30°  30°+     ← above
 *   █████ the spectrum itself, coolest ink at the left, warmest at the right
 *   three   seven  twelve   ...                                    ← below
 *   coldest                                            warmest
 *
 * THE FIGURES ARE THE READER'S OWN. Each band carries the number of pieces
 * ON THEIR LEDGER whose comfortable range reaches into it — read from the
 * piece's stored warmth row, or the same deterministic inference the Today
 * pre-filter runs (index-model readLedgerPieces). Nothing here is authored:
 * log a coat and the cold bands move that second.
 *
 * The city is the one set in The Dossier. Without it the label becomes the
 * way to set it, rather than a fabricated place.
 *
 * Clicking a band HOLDS it: the categories below narrow to the pieces that
 * answer it. Clicking it again releases it.
 */
import type React from 'react';
import { TEMPERATURE_BAND_ORDER, temperatureBandLabel, type TemperatureBand } from './temperature-bands';
import { BAND_LABELS, RULER_HI, RULER_LO, bandBounds } from './index-model';
import { ACCENT_DEEP, FAINT, FAINTER, HAIRLINE, MUTED, PAPER, RULE, SECONDARY, WALNUT, mono, serif, tempColor } from './index-style';

/** The ink one band reads in — the shared cool→warm mix, taken at the middle
 * of the band so neighbouring cells step evenly. */
function bandInk(band: TemperatureBand, strong: boolean): string {
  const { lo, hi } = bandBounds(band);
  const middle = (Math.max(RULER_LO, lo) + Math.min(RULER_HI, hi)) / 2;
  return tempColor(middle, RULER_LO, RULER_HI, strong ? 0.92 : 0.5);
}

export function IndexSpectrum({
  counts,
  total,
  held,
  onHold,
  city,
  onSetCity,
}: {
  /** Pieces on the ledger answering each band — live, never authored. */
  counts: Record<TemperatureBand, number>;
  /** Every piece on the ledger, the denominator under the bar. */
  total: number;
  held: TemperatureBand | null;
  onHold: (band: TemperatureBand | null) => void;
  /** The city from The Dossier, or null when it has not been set. */
  city: string | null;
  onSetCity: () => void;
}) {
  const max = Math.max(1, ...TEMPERATURE_BAND_ORDER.map((b) => counts[b] || 0));
  return (
    <section aria-label="Your pieces by temperature" style={{ paddingBottom: '18px' }}>
      {/* ——— the caption line, with the reader's city on the right */}
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', paddingBottom: '8px' }}>
        <span style={mono(8, ACCENT_DEEP)}>Temperature · click a band to hold it</span>
        {city ? (
          <span style={mono(8, ACCENT_DEEP)} title="The city your Dossier holds — every band is read against its year">
            {city}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetCity}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Set your city in the Dossier →
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: '620px' }}>
          {/* ——— the temperatures, ABOVE the spectrum */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${TEMPERATURE_BAND_ORDER.length}, minmax(0, 1fr))`, gap: '0 1px' }}>
            {TEMPERATURE_BAND_ORDER.map((band) => (
              <span
                key={band}
                style={{
                  ...mono(8, held === band ? ACCENT_DEEP : SECONDARY),
                  textAlign: 'center',
                  paddingBottom: '5px',
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {BAND_LABELS[band]}
              </span>
            ))}
          </div>

          {/* ——— the spectrum, and the count under each band */}
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${TEMPERATURE_BAND_ORDER.length}, minmax(0, 1fr))`, border: `1px solid ${RULE}`, background: PAPER }}
          >
            {TEMPERATURE_BAND_ORDER.map((band, i) => {
              const count = counts[band] || 0;
              const isHeld = held === band;
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => onHold(isHeld ? null : band)}
                  aria-pressed={isHeld}
                  title={
                    count > 0
                      ? `${count} of your ${total} pieces reach into ${BAND_LABELS[band]} — ${temperatureBandLabel(band).toLowerCase()}`
                      : `Nothing on your ledger reaches into ${BAND_LABELS[band]}`
                  }
                  className="text-center transition-colors hover:bg-[rgba(168,113,44,0.06)]"
                  style={{
                    borderLeft: i === 0 ? 'none' : `1px solid ${HAIRLINE}`,
                    background: isHeld ? 'rgba(168,113,44,0.14)' : 'transparent',
                    padding: '0 0 10px',
                  }}
                >
                  {/* the spectrum block itself */}
                  <span
                    aria-hidden
                    style={{
                      display: 'block',
                      height: '16px',
                      background: bandInk(band, isHeld || count > 0),
                      borderBottom: isHeld ? `2px solid ${ACCENT_DEEP}` : '2px solid transparent',
                    }}
                  />
                  {/* the reader's own count, below the band */}
                  <span
                    style={{
                      ...serif(25, count > 0 ? WALNUT : FAINTER),
                      display: 'block',
                      lineHeight: 1.1,
                      marginTop: '9px',
                      fontFeatureSettings: "'onum' 1, 'tnum' 1",
                    }}
                  >
                    {count}
                  </span>
                  <span style={{ ...mono(6.5, count > 0 ? MUTED : FAINTER), display: 'block', marginTop: '2px' }}>
                    {count === 1 ? 'piece' : 'pieces'}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      display: 'block',
                      height: '2px',
                      marginTop: '7px',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                      width: count > 0 ? `${Math.max(14, (count / max) * 78)}%` : '0%',
                      background: isHeld ? ACCENT_DEEP : 'rgba(168,113,44,0.45)',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* ——— the poles */}
          <div className="flex items-baseline justify-between" style={{ paddingTop: '7px' }}>
            <span style={mono(8, FAINT)}>coldest</span>
            <span style={mono(8, FAINT)}>warmest</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The degree ruler the piece rows hang their range bars from — the same
 * scale the spectrum runs on, so a row lines up with the band above it. */
export const AXIS_MARKS = [0, 10, 20, 30];

export const rulerPct = (celsius: number): number => ((celsius - RULER_LO) / (RULER_HI - RULER_LO)) * 100;

/** One piece's comfortable range, drawn on the shared ruler. The figures a
 * row prints are the piece's own; only the BAR is clamped to the ruler, so a
 * piece comfortable to 45° runs to the warm end rather than off the page. */
export function RangeBar({ lo, hi, held }: { lo: number; hi: number; held: boolean }): React.ReactElement {
  const left = Math.max(0, rulerPct(lo));
  const width = Math.max(2, Math.min(100, rulerPct(hi)) - left);
  return (
    <span aria-hidden style={{ position: 'relative', display: 'block', height: '14px', minWidth: 0 }}>
      {AXIS_MARKS.map((deg) => (
        <span
          key={deg}
          style={{ position: 'absolute', left: `${rulerPct(deg)}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(59,43,29,0.09)' }}
        />
      ))}
      <span
        style={{
          position: 'absolute',
          left: `${left}%`,
          width: `${width}%`,
          top: '4px',
          height: '6px',
          background: tempColor((lo + hi) / 2, RULER_LO, RULER_HI, held ? 0.95 : 0.78),
          border: held ? `1px solid ${ACCENT_DEEP}` : 'none',
        }}
      />
    </span>
  );
}
