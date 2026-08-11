/**
 * THE INDEX · CHROME — the shared furniture of the eleven screens
 * (Ethaion Ledger Corrected): breadcrumb, back link, the four-up READING
 * SWITCH, the PIECES · MAKERS face toggle, the three-slot UP · DOWN · OUT
 * footer every level carries, and the GEN slot element.
 *
 * THE THREE RULES (29a): down is always a name (serif, a proper noun);
 * across is always a control (mono, uppercase, small); out is only ever
 * two screens. You can tell what a click will do from the typeface alone.
 *
 * GEN SLOTS (29b): three states and no fourth — pending draws a hairline
 * at the sentence's own measure, ready draws the text, absent removes the
 * element. Every layout must read correctly with all twelve slots absent.
 * The slots ship ABSENT here — the model wiring is Task 3; only G12
 * carries the one fallback string the spec allows.
 */
import type React from 'react';
import { MONO } from './mono-type';
import type { GarmentCategoryId } from './garment-types';

/** The tab's whole navigation surface — one object every screen receives.
 * Down by name, across by control, out only to the Ledger and Beau (29a). */
export interface IndexNav {
  goRoot(): void;
  goPlate(cat: GarmentCategoryId): void;
  goType(id: string): void;
  goCut(typeId: string, cut: string): void;
  goRuler(cat: GarmentCategoryId, band?: string): void;
  goMatrix(): void;
  goField(): void;
  goMakers(): void;
  goMaker(name: string): void;
  back(): void;
  backLabel: string;
  openJump(): void;
}

export const SERIF = 'var(--space-font-heading)';
export const BODY = 'var(--space-font-family)';
export const WALNUT = '#241a12';
export const INK = '#3b2b1d';
export const SECONDARY = '#634e38';
export const MUTED = '#856c51';
export const FAINT = '#a68e70';
export const FAINTER = '#bfae96';
export const ACCENT = '#a8712c';
export const ACCENT_DEEP = '#7c4a17';
export const PAPER = '#fbf8f1';
export const HAIRLINE = 'rgba(59,43,29,0.18)';
export const RULE = 'rgba(59,43,29,0.34)';

export function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.07em', textTransform: 'uppercase', color };
}

export function serif(size = 17, color = WALNUT): React.CSSProperties {
  return { fontFamily: SERIF, fontSize: `${size}px`, fontWeight: 400, color };
}

export function body(size = 14, color = INK): React.CSSProperties {
  return { fontFamily: BODY, fontSize: `${size}px`, lineHeight: 1.6, color };
}

// ---------------------------------------------------------------------------
// Down is always a name — the serif link.
// ---------------------------------------------------------------------------

export function NameLink({ children, onClick, size = 14, color = WALNUT, title }: { children: React.ReactNode; onClick: () => void; size?: number; color?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="hover:underline text-left"
      style={{ background: 'transparent', padding: 0, fontFamily: SERIF, fontSize: `${size}px`, fontWeight: 400, lineHeight: 1.3, color }}
    >
      {children}
    </button>
  );
}

// Across is always a control — the mono button.
export function ControlLink({ children, onClick, color = ACCENT_DEEP, size = 9 }: { children: React.ReactNode; onClick: () => void; color?: string; size?: number }) {
  return (
    <button type="button" onClick={onClick} className="hover:underline text-left" style={{ ...mono(size, color), background: 'transparent', padding: 0 }}>
      {children}
    </button>
  );
}

/** An outlined control — 26a's “All 71 on one ruler →” buttons. */
export function OutlinedControl({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:bg-[rgba(168,113,44,0.08)]"
      style={{ ...mono(8.5, ACCENT_DEEP), background: 'transparent', border: `1px solid ${RULE}`, padding: '7px 12px', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb + back — present on every level below the root.
// ---------------------------------------------------------------------------

export interface CrumbSeg {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ segs }: { segs: CrumbSeg[] }) {
  return (
    <div className="flex items-baseline flex-wrap" style={{ gap: '4px 8px' }}>
      {segs.map((seg, i) => (
        <span key={`${seg.label}-${i}`} className="inline-flex items-baseline" style={{ gap: '8px' }}>
          {i > 0 && <span style={mono(8.5, FAINTER)}>/</span>}
          {seg.onClick ? (
            <button type="button" onClick={seg.onClick} className="hover:underline" style={{ ...mono(8.5, SECONDARY), background: 'transparent', padding: 0 }}>
              {seg.label}
            </button>
          ) : (
            <span style={mono(8.5, WALNUT)}>{seg.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hover:underline" style={{ ...mono(9, ACCENT_DEEP), background: 'transparent', padding: 0 }}>
      ← Back · {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// THE READING SWITCH — List · Ruler · Matrix · Field. One segmented control,
// on every screen that shows a set. It never changes what you are looking
// at — only how it is ordered. (The quadrant is retired · 27c.)
// ---------------------------------------------------------------------------

export type IndexReading = 'list' | 'ruler' | 'matrix' | 'field';

const READINGS: Array<{ id: IndexReading; label: string }> = [
  { id: 'list', label: 'List' },
  { id: 'ruler', label: 'Ruler' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'field', label: 'Field' },
];

export function ReadingSwitch({ active, onChange }: { active: IndexReading; onChange: (r: IndexReading) => void }) {
  return (
    <div className="flex" role="group" aria-label="How the set is ordered">
      {READINGS.map((r, i) => {
        const on = r.id === active;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            aria-pressed={on}
            className="transition-colors"
            style={{
              ...mono(9, on ? '#5c3413' : SECONDARY),
              background: on ? 'rgba(168,113,44,0.12)' : 'transparent',
              border: `1px solid ${on ? ACCENT : HAIRLINE}`,
              borderLeftWidth: i > 0 ? 0 : 1,
              padding: '7px 14px',
              minHeight: '34px',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UP · DOWN · OUT — the three-slot footer every screen carries, so no level
// is ever a dead end (26a).
// ---------------------------------------------------------------------------

export function UpDownOut({ up, down, out }: { up: React.ReactNode; down: React.ReactNode; out: React.ReactNode }) {
  const slots: Array<[string, React.ReactNode]> = [
    ['Up from here', up],
    ['Down from here', down],
    ['Out from here', out],
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: '18px 32px', marginTop: '34px', paddingTop: '18px', borderTop: `1px solid ${RULE}` }}>
      {slots.map(([label, node]) => (
        <div key={label}>
          <div style={mono(8.5, ACCENT_DEEP)}>{label}</div>
          <div style={{ ...body(13, SECONDARY), marginTop: '6px' }}>{node}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marks — verdicts, bands, gaps, swatches. FIT renders; never prose.
// ---------------------------------------------------------------------------

export function VerdictMark({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span style={mono(8.5, FAINTER)}>—</span>;
  const accent = verdict === 'essential';
  const wrong = verdict === 'wrong tool';
  return <span style={mono(8.5, accent ? ACCENT_DEEP : wrong ? FAINTER : SECONDARY)}>{verdict}</span>;
}

export function GapTag() {
  return (
    <span style={{ ...mono(7.5, '#5c3413'), background: 'rgba(168,113,44,0.16)', border: `1px solid ${ACCENT}`, padding: '1.5px 5px', marginRight: '7px' }}>
      Gap
    </span>
  );
}

export function SwatchRow({ colours }: { colours: string[] | undefined }) {
  if (!colours || colours.length === 0) return null;
  return (
    <span className="inline-flex items-center" style={{ gap: '3px', marginLeft: '8px' }}>
      {colours.map((c) => (
        <span key={c} style={{ width: '9px', height: '9px', borderRadius: '50%', background: c, border: '1px solid rgba(59,43,29,0.35)', display: 'inline-block' }} />
      ))}
    </span>
  );
}

/** “—” wherever a reader figure is WITHHELD rather than zero (29e: zero is
 * a claim about the reader; an em dash says the Index hasn't asked yet). */
export function Withheld() {
  return <span style={mono(9, FAINTER)}>—</span>;
}

// ---------------------------------------------------------------------------
// THE GEN SLOT — 29b. Ships absent; Task 3 wires the twelve calls. Only G12
// may carry a fallback string.
// ---------------------------------------------------------------------------

export function GenSlot({ slot, scope, fallback, style }: { slot: string; scope?: string; fallback?: string; style?: React.CSSProperties }) {
  // Absent removes the element — unless this is the one slot with a
  // fallback (G12). No other slot may ship a string (29b).
  if (!fallback) return null;
  return (
    <p data-ai-slot={slot} data-ai-scope={scope} data-ai-state="ready" style={{ ...body(15, INK), margin: 0, ...style }}>
      {fallback}
    </p>
  );
}
