/**
 * THE INDEX · READING · THE COVERAGE MATRIX (27b) — above category scope
 * the Index stops printing names and prints counts. The banded categories
 * across eight bands, and the two that carry no band at all — all of it,
 * one screen. A cell is a door: click a count and you land on that
 * category's ruler, already scrolled to the band.
 *
 * The one rule: never more than about 75 names on a screen — past that,
 * counts. Cells carry a faint warm wash in proportion to their count so
 * the distribution reads before the numbers do — a table with weather,
 * not a chart. Both totals rows are SUMMED AT RENDER, never typed (29b).
 */
import { useMemo } from 'react';
import { findGarmentType, type GarmentType } from './garment-types';
import { TEMPERATURE_BANDS, temperatureBandRank, type TemperatureBand } from './temperature-bands';
import { FIELD_REGISTERS, FIELD_REGISTER_LABELS, daysInBand, primaryRegister, type IndexModel } from './index-model';
import {
  BackLink,
  Breadcrumb,
  ControlLink,
  FAINT,
  FAINTER,
  GenSlot,
  HAIRLINE,
  INK,
  NameLink,
  ReadingSwitch,
  RULE,
  SECONDARY,
  UpDownOut,
  WALNUT,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

const BAND_HEADS = ['≤ 0°', '0–5°', '5–10°', '10–15°', '15–20°', '20–25°', '25–30°', '30°+'];

export function IndexMatrix({ model, nav }: { model: IndexModel; nav: IndexNav }) {
  usePlexMono();

  const grid = useMemo(() => {
    const rows = model.categories.map((cat) => {
      const types = cat.runs.flatMap((r) => r.typeIds).map((id) => findGarmentType(id)).filter(Boolean) as GarmentType[];
      if (!cat.banded) {
        return { cat, banded: false as const, cells: [], total: types.length, owned: types.filter((t) => model.ownership.swatches.has(t.id)).length };
      }
      const cells = TEMPERATURE_BANDS.map((def) => {
        const here = types.filter((t) => t.band === def.id);
        return { band: def.id, count: here.length, owned: here.filter((t) => model.ownership.swatches.has(t.id)).length };
      });
      return { cat, banded: true as const, cells, total: types.length, owned: types.filter((t) => model.ownership.swatches.has(t.id)).length };
    });
    // Both totals rows — summed at render, never typed.
    const bandTotals = TEMPERATURE_BANDS.map((def) =>
      rows.filter((r) => r.banded).reduce((n, r) => n + (r.cells.find((c) => c.band === def.id)?.count || 0), 0),
    );
    const bandOwned = TEMPERATURE_BANDS.map((def) =>
      rows.filter((r) => r.banded).reduce((n, r) => n + (r.cells.find((c) => c.band === def.id)?.owned || 0), 0),
    );
    const bandedTotal = bandTotals.reduce((a, b) => a + b, 0);
    const bandedOwned = bandOwned.reduce((a, b) => a + b, 0);
    const unbandedOwned = rows.filter((r) => !r.banded).reduce((n, r) => n + r.owned, 0);
    const maxCell = Math.max(1, ...rows.filter((r) => r.banded).flatMap((r) => r.cells.map((c) => c.count)));
    return { rows, bandTotals, bandOwned, bandedTotal, bandedOwned, unbandedOwned, maxCell };
  }, [model]);

  const hasLedger = model.ownership.swatches.size > 0;

  // The register-by-band proof — the SAME banded types partitioned a second
  // way (each type once: its primary register against its band). Row totals
  // and column totals are both summed at render; the column totals must
  // reproduce the band totals of the table above, or the data is wrong —
  // which is the point of printing it.
  const regGrid = useMemo(() => {
    const types = model.categories
      .filter((c) => c.banded)
      .flatMap((c) => c.runs.flatMap((r) => r.typeIds))
      .map((id) => findGarmentType(id))
      .filter(Boolean) as GarmentType[];
    const rows = FIELD_REGISTERS.map((reg) => {
      const cells = TEMPERATURE_BANDS.map((def) => types.filter((t) => t.band === def.id && primaryRegister(t) === reg).length);
      return { reg, cells, total: cells.reduce((a, b) => a + b, 0) };
    });
    const colTotals = TEMPERATURE_BANDS.map((_, i) => rows.reduce((n, r) => n + r.cells[i], 0));
    const grand = colTotals.reduce((a, b) => a + b, 0);
    const maxCell = Math.max(1, ...rows.flatMap((r) => r.cells));
    return { rows, colTotals, grand, maxCell };
  }, [model]);

  return (
    <div>
      <BackLink label="the Index" onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: 'Reading · by temperature · all categories' }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]" style={{ gap: '16px 40px', marginTop: '16px', paddingBottom: '18px', borderBottom: `1px solid ${INK}`, alignItems: 'end' }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.1, margin: 0 }}>The whole Index, counted</h3>
          <p style={{ ...body(14.5), margin: '10px 0 0', maxWidth: '68ch' }}>
            Every type sits in exactly one cell. The number is how many types the cell holds; the small figure beside it
            is how many of them you own. An empty cell is either a hole in your wardrobe or a fact about the category —
            the by-nature rows say which.
          </p>
        </div>
        <ReadingSwitch active="matrix" onChange={(r) => { if (r === 'list') nav.goRoot(); if (r === 'quadrant') nav.goQuadrant('pieces'); if (r === 'ruler') nav.goRuler('outerwear'); if (r === 'field') nav.goField(); }} />
      </div>

      <div className="overflow-x-auto" style={{ marginTop: '18px' }}>
        <table className="w-full border-collapse" style={{ minWidth: '760px' }}>
          <thead>
            <tr>
              <th style={{ ...mono(8.5, FAINT), textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>Category</th>
              {BAND_HEADS.map((h, i) => (
                <th key={h} style={{ ...mono(8.5, FAINT), textAlign: 'right', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>
                  {h}
                  {model.climate.bands && <div style={{ ...mono(7, FAINTER), marginTop: '2px' }}>{model.climate.bands[i]}d</div>}
                </th>
              ))}
              <th style={{ ...mono(8.5, FAINT), textAlign: 'right', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>Types</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.cat.id}>
                <td style={{ padding: '8px 6px', borderBottom: `1px solid ${HAIRLINE}` }}>
                  <NameLink onClick={() => nav.goPlate(row.cat.id)} size={14.5}>{row.cat.name}</NameLink>
                </td>
                {row.banded ? (
                  row.cells.map((cell) => (
                    <td
                      key={cell.band}
                      style={{
                        padding: '8px 6px',
                        textAlign: 'right',
                        borderBottom: `1px solid ${HAIRLINE}`,
                        background: cell.count > 0 ? `rgba(168,113,44,${(0.16 * cell.count) / grid.maxCell})` : 'transparent',
                      }}
                    >
                      {cell.count > 0 ? (
                        <button
                          type="button"
                          onClick={() => nav.goRuler(row.cat.id, cell.band)}
                          className="hover:underline"
                          title={`Open ${row.cat.name.toLowerCase()} · ${BAND_HEADS[temperatureBandRank(cell.band)]}`}
                          style={{ ...mono(10, WALNUT), background: 'transparent', padding: 0 }}
                        >
                          {cell.count}
                          {cell.owned > 0 && <span style={{ ...mono(7.5, SECONDARY), marginLeft: '4px' }}>{cell.owned}</span>}
                        </button>
                      ) : (
                        <span style={mono(9, FAINTER)}>·</span>
                      )}
                    </td>
                  ))
                ) : (
                  <td colSpan={8} style={{ ...body(12, FAINT), padding: '8px 6px', borderBottom: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
                    No temperature band — judged by material and place
                  </td>
                )}
                <td style={{ ...mono(9.5, WALNUT), padding: '8px 6px', textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}` }}>
                  {row.total} · {hasLedger ? row.owned : '—'}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...mono(8.5, SECONDARY), padding: '9px 6px', borderTop: `1px solid ${RULE}` }}>Banded types in band</td>
              {grid.bandTotals.map((n, i) => (
                <td key={BAND_HEADS[i]} style={{ ...mono(9.5, WALNUT), padding: '9px 6px', textAlign: 'right', borderTop: `1px solid ${RULE}` }}>{n}</td>
              ))}
              <td style={{ ...mono(9.5, WALNUT), padding: '9px 6px', textAlign: 'right', borderTop: `1px solid ${RULE}` }}>{grid.bandedTotal}</td>
            </tr>
            <tr>
              <td style={{ ...mono(8.5, SECONDARY), padding: '7px 6px' }}>You own, in band</td>
              {grid.bandOwned.map((n, i) => (
                <td key={BAND_HEADS[i]} style={{ ...mono(9.5, hasLedger ? WALNUT : FAINTER), padding: '7px 6px', textAlign: 'right' }}>{hasLedger ? n : '—'}</td>
              ))}
              <td style={{ ...mono(9.5, hasLedger ? WALNUT : FAINTER), padding: '7px 6px', textAlign: 'right' }}>
                {hasLedger ? `${grid.bandedOwned}${grid.unbandedOwned > 0 ? ` + ${grid.unbandedOwned}` : ''}` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ——— the register-by-band proof — the same types, partitioned the
          other way; totals summed at render, never typed */}
      <div style={{ marginTop: '30px' }}>
        <div className="flex items-baseline flex-wrap" style={{ gap: '4px 14px' }}>
          <span style={serif(19)}>The same types, register against band</span>
          <span style={mono(8, FAINT)}>
            each type once · its first register × its band · rows and columns each sum to {regGrid.grand}
            {regGrid.grand === grid.bandedTotal ? ' — the same total as above, so the two readings agree' : ' — which DISAGREES with the table above'}
          </span>
        </div>
        <div className="overflow-x-auto" style={{ marginTop: '12px' }}>
          <table className="w-full border-collapse" style={{ minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={{ ...mono(8.5, FAINT), textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>Register</th>
                {BAND_HEADS.map((h) => (
                  <th key={h} style={{ ...mono(8.5, FAINT), textAlign: 'right', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>{h}</th>
                ))}
                <th style={{ ...mono(8.5, FAINT), textAlign: 'right', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {regGrid.rows.map((row) => (
                <tr key={row.reg}>
                  <td style={{ ...body(13, INK), padding: '8px 6px', borderBottom: `1px solid ${HAIRLINE}` }}>{FIELD_REGISTER_LABELS[row.reg]}</td>
                  {row.cells.map((n, i) => (
                    <td
                      key={BAND_HEADS[i]}
                      style={{
                        ...mono(10, n > 0 ? WALNUT : FAINTER),
                        padding: '8px 6px',
                        textAlign: 'right',
                        borderBottom: `1px solid ${HAIRLINE}`,
                        background: n > 0 ? `rgba(168,113,44,${(0.16 * n) / regGrid.maxCell})` : 'transparent',
                      }}
                    >
                      {n > 0 ? n : '·'}
                    </td>
                  ))}
                  <td style={{ ...mono(9.5, WALNUT), padding: '8px 6px', textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}` }}>{row.total}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...mono(8.5, SECONDARY), padding: '9px 6px', borderTop: `1px solid ${RULE}` }}>In band</td>
                {regGrid.colTotals.map((n, i) => (
                  <td key={BAND_HEADS[i]} style={{ ...mono(9.5, WALNUT), padding: '9px 6px', textAlign: 'right', borderTop: `1px solid ${RULE}` }}>{n}</td>
                ))}
                <td style={{ ...mono(9.5, WALNUT), padding: '9px 6px', textAlign: 'right', borderTop: `1px solid ${RULE}` }}>{regGrid.grand}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ——— the footer — the by-nature note is FIX; the readings are GEN (G7, absent) */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '18px 40px', marginTop: '22px' }}>
        <div>
          <div style={mono(8.5, SECONDARY)}>Empty by nature, not by neglect</div>
          <p style={{ ...body(13.5, SECONDARY), margin: '8px 0 0' }}>
            Cells where a category simply ends are empty because the category ends. Accessories and bags have no band at
            all: a belt is chosen by material and place, never by weather, so the Index declines to give them a column
            rather than inventing one.
          </p>
        </div>
        <div>
          <div style={mono(8.5, SECONDARY)}>A cell is a door</div>
          <p style={{ ...body(13.5, SECONDARY), margin: '8px 0 0' }}>
            Names never appear at this scope. Click a number and you land on the ruler for that category, already
            scrolled to the band.
          </p>
          <div style={{ marginTop: '10px' }}>
            <ControlLink onClick={() => nav.goRuler('outerwear', '5-10')}>Open outerwear · 5–10° →</ControlLink>
          </div>
        </div>
      </div>
      <GenSlot slot="G7" scope="matrix" style={{ marginTop: '16px' }} />

      <UpDownOut
        up={<>The Index root — the breadcrumb, always top left.</>}
        down={<>Any count in a cell → that category's ruler, that band. The count-to-name door.</>}
        out={<><ControlLink onClick={() => nav.goField()}>Read this against your occasions →</ControlLink></>}
      />
    </div>
  );
}
