/**
 * THE INDEX · READING · THE FIELD (28a) — weather against occasion.
 * Replaces the retired quadrant (27c). The same two fields every type page
 * already carries — temperature band and register — crossed. Every morning
 * is one cell on this grid: a temperature and an occasion. Your banded
 * pieces sit where they answer, printed BY NAME, because at your scale
 * names fit; the small figure is how many types the Index holds there.
 *
 * An empty cell you meet often is a gap (dashed). An empty cell in a
 * register you've muted is not — a muted register is a greyed row that
 * CANNOT raise a gap: the product visibly declining to nag you.
 *
 * Copy columns: register names, band names and the cell counts are FIX;
 * day counts, placed names, dashed cells and the muted row are FIT; the
 * three footer readings and Beau's line are GEN (G8, G9 — shipped absent).
 */
import { useMemo } from 'react';
import { promoteToScout } from './profile-data';
import { findGarmentType, INDEX_GARMENT_TYPES, type GarmentType } from './garment-types';
import { TEMPERATURE_BANDS, type TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTERS,
  FIELD_REGISTER_LABELS,
  isBandedCategory,
  primaryRegister,
  useMutedRegisters,
  useRegisterDays,
  type IndexModel,
} from './index-model';
import {
  ACCENT,
  ACCENT_DEEP,
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

interface FieldCell {
  register: string;
  band: TemperatureBand;
  /** How many types the Index holds here — FIX. */
  holds: number;
  /** The reader's own placed pieces — names, their words. FIT. */
  placed: Array<{ typeId: string; label: string }>;
  /** The category most likely to answer an empty cell — the dashed door. */
  door: GarmentType | null;
}

export function IndexField({ model, nav }: { model: IndexModel; nav: IndexNav }) {
  usePlexMono();
  const muted = useMutedRegisters();
  const registerDays = useRegisterDays();

  const { cells, placedTotal } = useMemo(() => {
    const banded = INDEX_GARMENT_TYPES.filter((t) => isBandedCategory(t.category));
    const map = new Map<string, FieldCell>();
    for (const reg of FIELD_REGISTERS) {
      for (const def of TEMPERATURE_BANDS) {
        const here = banded.filter((t) => t.band === def.id && t.reach.includes(reg));
        map.set(`${reg}\u241f${def.id}`, { register: reg, band: def.id, holds: here.length, placed: [], door: here[0] || null });
      }
    }
    let placedTotal = 0;
    for (const [typeId, names] of model.ownership.names) {
      const type = findGarmentType(typeId);
      if (!type || !isBandedCategory(type.category)) continue;
      const cell = map.get(`${primaryRegister(type)}\u241f${type.band}`);
      if (!cell) continue;
      if (cell.placed.length < 2) cell.placed.push({ typeId, label: names[0] || type.name });
      placedTotal += 1;
    }
    return { cells: map, placedTotal };
  }, [model]);

  const gapCells = useMemo(() => {
    const out = new Set<string>();
    if (!model.climate.bands) return out;
    for (const reg of FIELD_REGISTERS) {
      if (muted.has(reg)) continue;
      const regDays = registerDays[reg];
      if (regDays != null && regDays === 0) continue;
      for (const def of TEMPERATURE_BANDS) {
        const cell = cells.get(`${reg}\u241f${def.id}`)!;
        const days = model.climate.bands[TEMPERATURE_BANDS.indexOf(def)] || 0;
        // Empty, unmuted and above the day-count threshold — the dashed rule.
        if (cell.placed.length === 0 && cell.holds > 0 && days >= 26) out.add(`${reg}\u241f${def.id}`);
      }
    }
    return out;
  }, [cells, model, muted, registerDays]);

  const maxDays = Math.max(1, ...(model.climate.bands || [1]));

  return (
    <div>
      <BackLink label="the Index" onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: 'Reading · as a field' }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]" style={{ gap: '16px 40px', marginTop: '16px', paddingBottom: '18px', borderBottom: `1px solid ${INK}`, alignItems: 'end' }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.1, margin: 0 }}>How cold it is, against how dressed you are</h3>
          <p style={{ ...body(14.5), margin: '10px 0 0', maxWidth: '70ch' }}>
            Every morning is one cell on this grid: a temperature and an occasion. Your banded pieces sit where they
            answer; the small figure is how many types the Index holds there. An empty cell you meet often is a gap. An
            empty cell in a register you've muted is not.
          </p>
        </div>
        <ReadingSwitch active="field" onChange={(r) => { if (r === 'list') nav.goPlate('outerwear'); if (r === 'ruler') nav.goRuler('outerwear'); if (r === 'matrix') nav.goMatrix(); }} />
      </div>

      <div className="overflow-x-auto" style={{ marginTop: '18px' }}>
        <table className="w-full border-collapse" style={{ minWidth: '860px', tableLayout: 'fixed' }}>
          <thead>
            {/* Days weight the columns — the bar along the top is your city's year. */}
            <tr>
              <th style={{ ...mono(8, FAINT), textAlign: 'left', padding: '4px 6px', width: '168px' }}>
                {model.climate.city ? `${model.climate.city} · days a year` : model.climate.weighted ? 'Days a year' : 'Days a year · set a city'}
              </th>
              {TEMPERATURE_BANDS.map((def, i) => (
                <th key={def.id} style={{ padding: '4px 6px', verticalAlign: 'bottom' }}>
                  {model.climate.bands ? (
                    <div>
                      <div style={{ height: '30px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ width: '16px', height: `${Math.max(2, (28 * (model.climate.bands[i] || 0)) / maxDays)}px`, background: 'rgba(59,43,29,0.35)' }} />
                      </div>
                      <div style={{ ...mono(7.5, FAINT), textAlign: 'center', marginTop: '2px' }}>{model.climate.bands[i]}</div>
                    </div>
                  ) : (
                    <div style={{ ...mono(7.5, FAINTER), textAlign: 'center' }}>—</div>
                  )}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ ...mono(8.5, FAINT), textAlign: 'left', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>Register ↓ · Weather →</th>
              {BAND_HEADS.map((h) => (
                <th key={h} style={{ ...mono(8.5, FAINT), textAlign: 'center', padding: '8px 6px', borderBottom: `1px solid ${RULE}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_REGISTERS.map((reg) => {
              const isMuted = muted.has(reg);
              const days = registerDays[reg];
              return (
                <tr key={reg} style={{ opacity: isMuted ? 0.45 : 1 }}>
                  <td style={{ padding: '10px 6px', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' }}>
                    <div style={serif(15)}>{FIELD_REGISTER_LABELS[reg]}</div>
                    <div style={{ ...mono(7.5, FAINT), marginTop: '3px' }}>
                      {isMuted ? 'Muted · cannot raise a gap' : days != null ? `${days} days` : '—'}
                    </div>
                  </td>
                  {TEMPERATURE_BANDS.map((def) => {
                    const key = `${reg}\u241f${def.id}`;
                    const cell = cells.get(key)!;
                    const dashed = gapCells.has(key);
                    return (
                      <td
                        key={def.id}
                        style={{
                          padding: '8px 6px',
                          borderBottom: `1px solid ${HAIRLINE}`,
                          borderLeft: `1px solid rgba(59,43,29,0.10)`,
                          verticalAlign: 'top',
                          outline: dashed ? `1.5px dashed ${ACCENT}` : 'none',
                          outlineOffset: '-3px',
                          background: dashed ? 'rgba(168,113,44,0.06)' : 'transparent',
                        }}
                      >
                        <div style={{ ...mono(8, cell.holds > 0 ? SECONDARY : FAINTER), textAlign: 'left' }}>{cell.holds > 0 ? cell.holds : '·'}</div>
                        {cell.placed.map((p) => (
                          <div key={p.typeId} style={{ marginTop: '3px' }}>
                            <NameLink onClick={() => nav.goType(p.typeId)} size={12.5}>{p.label}</NameLink>
                          </div>
                        ))}
                        {dashed && cell.door && (
                          <button
                            type="button"
                            onClick={() => nav.goRuler(cell.door!.category, def.id)}
                            className="hover:underline text-left"
                            title={`Nothing here — open the ${cell.door.category} ruler at this band`}
                            style={{ ...mono(7.5, ACCENT_DEEP), background: 'transparent', padding: 0, marginTop: '4px', display: 'block' }}
                          >
                            Nothing →
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ——— the legend */}
      <div className="flex flex-wrap" style={{ gap: '8px 26px', marginTop: '12px' }}>
        <span style={mono(8, SECONDARY)}>You own it · {placedTotal} banded</span>
        <span style={mono(8, ACCENT_DEEP)}>Dashed · empty and you meet it often</span>
        <span style={mono(8, FAINT)}>Small figure · types the Index holds there</span>
        <span style={mono(8, FAINTER)}>Greyed row · muted — it cannot raise a gap</span>
      </div>

      {/* GEN · G8 (three readings) and G9 (Beau's line) — shipped absent. */}
      <GenSlot slot="G8" scope="field" style={{ marginTop: '16px' }} />
      <GenSlot slot="G9" scope="field" />

      <UpDownOut
        up={<>The Index root — the breadcrumb, always top left.</>}
        down={<>A piece you own, or a named gap → the type page. A gap is a type you don't own. A dashed cell → the ruler most likely to answer it.</>}
        out={<><ControlLink onClick={() => promoteToScout('the register I dress in most')}>Ask Beau for a row →</ControlLink></>}
      />
    </div>
  );
}
