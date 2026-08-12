/**
 * THE INDEX · READING · THE QUADRANT (corrections pass · screenshot 8) —
 * the scatter reading. Two axes, four corners, one dot per piece or per
 * maker depending on which FACE is active.
 *
 * Three axis PAIRS, selectable by a control (across — the selector changes
 * how the set is plotted, never what you are looking at):
 *   · Formality × Versatility (the default)
 *   · Warmth × Rain
 *   · Essentialness × Cost
 *
 * The annotation column on the left updates with the pair: the FIX blurb
 * of what the pairing reveals, the FIT corner counts, and ONE generated
 * sentence (G13) that abstains like every other GEN slot. Corner labels
 * update with the axes. Every dot is a door — a piece dot opens its type
 * page (24a), a maker dot the maker page (26d).
 */
import { useMemo, useState } from 'react';
import { categoryName, type IndexModel } from './index-model';
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
  PAPER,
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
import {
  QUADRANT_MODES,
  quadrantDots,
  quadrantMode,
  quadrantStats,
  type QuadrantFace,
  type QuadrantMode,
} from './index-quadrant-model';
import { usePlexMono } from './mono-type';

const CORNER_KEYS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

function AxisModeSwitch({ active, onChange }: { active: QuadrantMode; onChange: (m: QuadrantMode) => void }) {
  return (
    <div className="flex flex-wrap" role="group" aria-label="Which axes the quadrant plots">
      {QUADRANT_MODES.map((m, i) => {
        const on = m.id === active;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={on}
            className="transition-colors"
            style={{
              ...mono(8.5, on ? '#5c3413' : SECONDARY),
              background: on ? 'rgba(168,113,44,0.12)' : 'transparent',
              border: `1px solid ${on ? ACCENT : HAIRLINE}`,
              borderLeftWidth: i > 0 ? 0 : 1,
              padding: '7px 12px',
              minHeight: '32px',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function IndexQuadrant({
  model,
  nav,
  face = 'pieces',
  /** True when the quadrant renders inline under the root's own tabs —
   * the root keeps its header, breadcrumb and footer. */
  embedded = false,
}: {
  model: IndexModel;
  nav: IndexNav;
  face?: QuadrantFace;
  embedded?: boolean;
}) {
  usePlexMono();
  const [mode, setMode] = useState<QuadrantMode>('formality-versatility');
  const def = quadrantMode(mode);
  const dots = useMemo(() => quadrantDots(model, face, mode), [model, face, mode]);
  const stats = useMemo(() => quadrantStats(dots, model.climate.weighted), [dots, model.climate.weighted]);
  const hasLedger = model.ownedTotal > 0;

  const plot = (
    <div>
      {/* ——— the axis selector — a control, across, never a drill-down */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: '10px 24px', padding: '14px 0' }}>
        <AxisModeSwitch active={mode} onChange={setMode} />
        <span style={mono(8, FAINT)}>
          {stats.total} {face === 'makers' ? 'makers' : 'types'} plotted{face === 'pieces' && mode === 'warmth-rain' ? ' · unbanded categories sit out' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]" style={{ gap: '22px 40px' }}>
        {/* ——— the annotation column — updates with the axis pair */}
        <div>
          <div style={mono(8.5, ACCENT_DEEP)}>{def.yAxis} × {def.xAxis}</div>
          <p style={{ ...body(13.5, INK), margin: '8px 0 0' }}>{def.blurb}</p>
          {mode === 'essential-cost' && !stats.weighted && (
            <p style={{ ...body(12.5, SECONDARY), margin: '10px 0 0' }}>
              No city set — essentialness orders by register breadth only. Set your city in the Dossier and the axis
              weights itself by your actual days.
            </p>
          )}
          <div style={{ marginTop: '14px', borderTop: `1px solid ${HAIRLINE}` }}>
            {def.corners.map((label, i) => (
              <div key={CORNER_KEYS[i]} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline" style={{ gap: '12px', padding: '7px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
                <span style={{ ...body(12.5, SECONDARY) }}>{label}</span>
                <span style={{ ...mono(9, WALNUT), textAlign: 'right' }}>{stats.corners[i]}</span>
                <span style={{ ...mono(8, hasLedger ? SECONDARY : FAINTER), minWidth: '38px', textAlign: 'right' }}>
                  {hasLedger ? `you ${stats.ownedCorners[i]}` : '—'}
                </span>
              </div>
            ))}
          </div>
          {/* GEN · G13 — what this pairing reveals about the reader's own
              set; ships absent, like every slot. */}
          <GenSlot slot="G13" scope={`quadrant:${face}:${mode}`} style={{ marginTop: '14px' }} />
          <div className="flex flex-col items-start" style={{ gap: '6px', marginTop: '16px' }}>
            <span style={mono(8, WALNUT)}>● You own it</span>
            <span style={mono(8, ACCENT_DEEP)}>○ A gap your board names</span>
            <span style={mono(8, FAINT)}>· In the Index — tap any dot to open it</span>
          </div>
        </div>

        {/* ——— the plot — four corners, two hairline axes, every dot a door */}
        <div>
          <div
            role="group"
            aria-label={`${def.yAxis} against ${def.xAxis} — ${stats.total} dots`}
            style={{ position: 'relative', width: '100%', height: 'min(560px, 72vw)', border: `1px solid ${RULE}`, background: PAPER }}
          >
            {/* midlines */}
            <div aria-hidden style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: HAIRLINE }} />
            <div aria-hidden style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: HAIRLINE }} />
            {/* corner labels — they update with the axes */}
            <span style={{ ...mono(7.5, FAINT), position: 'absolute', top: '8px', left: '10px' }}>{def.corners[0]}</span>
            <span style={{ ...mono(7.5, FAINT), position: 'absolute', top: '8px', right: '10px', textAlign: 'right' }}>{def.corners[1]}</span>
            <span style={{ ...mono(7.5, FAINT), position: 'absolute', bottom: '8px', left: '10px' }}>{def.corners[2]}</span>
            <span style={{ ...mono(7.5, FAINT), position: 'absolute', bottom: '8px', right: '10px', textAlign: 'right' }}>{def.corners[3]}</span>
            {/* axis labels */}
            <span style={{ ...mono(8, SECONDARY), position: 'absolute', top: '50%', left: '-8px', transform: 'rotate(-90deg) translateX(50%)', transformOrigin: 'left center', whiteSpace: 'nowrap' }}>
              {def.yAxis} ↑
            </span>
            <span style={{ ...mono(8, SECONDARY), position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
              {def.xAxis} →
            </span>
            {/* the dots */}
            {dots.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => (d.kind === 'makers' ? nav.goMaker(d.id) : nav.goType(d.id))}
                title={`${d.label}${d.note ? ` · ${d.kind === 'pieces' ? categoryName(d.note) : d.note}` : ''}${d.owned ? ' · you own it' : ''}`}
                aria-label={`${d.label} — open its page`}
                className="hover:opacity-80"
                style={{
                  position: 'absolute',
                  left: `${(d.x * 100).toFixed(2)}%`,
                  top: `${((1 - d.y) * 100).toFixed(2)}%`,
                  transform: 'translate(-50%, -50%)',
                  width: d.kind === 'makers' ? '9px' : d.owned ? '8px' : '6px',
                  height: d.kind === 'makers' ? '9px' : d.owned ? '8px' : '6px',
                  borderRadius: '50%',
                  padding: 0,
                  background: d.owned ? WALNUT : d.gap ? 'rgba(168,113,44,0.14)' : 'rgba(59,43,29,0.34)',
                  border: d.gap ? `1.5px solid ${ACCENT_DEEP}` : d.owned ? `1px solid ${WALNUT}` : '1px solid rgba(59,43,29,0.2)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <div style={{ ...mono(8, FAINT), marginTop: '28px' }}>
            Every dot is a {face === 'makers' ? 'maker — tap one for its page' : 'type — tap one for its page'} · the axes are drawn from the record, never judged
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) return plot;

  return (
    <div>
      <BackLink label={nav.backLabel} onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: `Reading · the quadrant · ${face}` }]} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]" style={{ gap: '16px 40px', marginTop: '16px', paddingBottom: '18px', borderBottom: `1px solid ${INK}`, alignItems: 'end' }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.1, margin: 0 }}>
            {face === 'makers' ? 'The makers, plotted' : 'The Index, plotted'}
          </h3>
          <p style={{ ...body(14.5), margin: '10px 0 0', maxWidth: '66ch' }}>
            Two axes, four corners, one dot per {face === 'makers' ? 'maker' : 'type'}. The selector changes which two
            facts the plot is drawn from — it never changes what the dots are.
          </p>
        </div>
        <ReadingSwitch
          active="quadrant"
          onChange={(r) => {
            if (r === 'list') (face === 'makers' ? nav.goMakers() : nav.goRoot());
            if (r === 'ruler') nav.goRuler('outerwear');
            if (r === 'matrix') nav.goMatrix();
            if (r === 'field') nav.goField();
          }}
        />
      </div>
      <div style={{ marginTop: '4px' }}>{plot}</div>
      <UpDownOut
        up={<>The {face === 'makers' ? 'makers root' : 'Index root'} — the breadcrumb, always top left.</>}
        down={<>Any dot — a {face === 'makers' ? 'maker dot opens the maker page' : 'piece dot opens the type page'}. The plot is all doors.</>}
        out={
          <>
            <ControlLink onClick={() => nav.goField()}>Read the year as a field instead →</ControlLink>
          </>
        }
      />
    </div>
  );
}
