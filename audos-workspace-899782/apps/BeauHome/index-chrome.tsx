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
 * The model wiring lives in index-gen.tsx (Task 3): one Haiku call per
 * scope, cached on a fingerprint of the reader's facts, deterministic
 * abstention when the facts cannot support a slot. Only G12 carries the
 * one fallback string the spec allows.
 */
import { useRef, useState } from 'react';
import type React from 'react';
import { MONO } from './mono-type';
import type { GarmentCategoryId } from './garment-types';
import { useIndexGenText } from './index-gen';

/** The tab's whole navigation surface — one object every screen receives.
 * Down by name, across by control, out only to the Ledger and Beau (29a). */
export interface IndexNav {
  goRoot(): void;
  goPlate(cat: GarmentCategoryId): void;
  goType(id: string): void;
  goCut(typeId: string, cut: string): void;
  goRuler(cat: GarmentCategoryId, band?: string): void;
  goQuadrant(face?: 'pieces' | 'makers'): void;
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

// Carries the phone reading floor: --eth-micro is declared in Desktop.tsx and is 0px above the phone breakpoint, so the size asked for is used exactly as written.
export function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `max(var(--eth-micro, 0px), ${size}px)`, letterSpacing: '0.07em', textTransform: 'uppercase', color };
}

// Carries the phone reading floor: --eth-serif is declared in Desktop.tsx and is 0px above the phone breakpoint, so no desktop screen moves.
export function serif(size = 17, color = WALNUT): React.CSSProperties {
  return { fontFamily: SERIF, fontSize: `max(var(--eth-serif, 0px), ${size}px)`, fontWeight: 400, color };
}

// Carries the phone reading floor: --eth-body is declared in Desktop.tsx and is 0px above the phone breakpoint, so no desktop screen moves.
export function body(size = 14, color = INK): React.CSSProperties {
  return { fontFamily: BODY, fontSize: `max(var(--eth-body, 0px), ${size}px)`, lineHeight: 1.6, color };
}

// ---------------------------------------------------------------------------
// Down is always a name — the serif link.
// ---------------------------------------------------------------------------

// The name is set in the display serif, so it carries the same --eth-serif phone floor (Desktop.tsx) the serif() helper does.
export function NameLink({ children, onClick, size = 14, color = WALNUT, title }: { children: React.ReactNode; onClick: () => void; size?: number; color?: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="hover:underline text-left"
      style={{ background: 'transparent', padding: 0, fontFamily: SERIF, fontSize: `max(var(--eth-serif, 0px), ${size}px)`, fontWeight: 400, lineHeight: 1.3, color }}
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
// THE READING SWITCH — List · Quadrant · Ruler · Matrix · Field. One
// segmented control, on every screen that shows a set. It never changes
// what you are looking at — only how it is ordered. At the ROOT only List
// and Quadrant appear (the sub-views belong to their own contexts); the
// full switch lives on the reading screens themselves.
// ---------------------------------------------------------------------------

export type IndexReading = 'list' | 'quadrant' | 'ruler' | 'matrix' | 'field';

const READINGS: Array<{ id: IndexReading; label: string }> = [
  { id: 'list', label: 'List' },
  { id: 'quadrant', label: 'Quadrant' },
  { id: 'ruler', label: 'Ruler' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'field', label: 'Field' },
];

export function ReadingSwitch({
  active,
  onChange,
  only,
}: {
  active: IndexReading;
  onChange: (r: IndexReading) => void;
  /** Restrict the options — the root shows List · Quadrant only. */
  only?: IndexReading[];
}) {
  const readings = only ? READINGS.filter((r) => only.includes(r.id)) : READINGS;
  return (
    <div className="flex" role="group" aria-label="How the set is ordered">
      {readings.map((r, i) => {
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
              minHeight: 'max(var(--eth-field-h, 0px), 34px)',
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
// THE LENS ROW — the one filter treatment both faces share: a small label,
// then the options in TWO columns at a consistent indent. Pieces and makers
// read identically because they are the same kind of control.
// ---------------------------------------------------------------------------

export function LensRow<T extends string>({
  label,
  options,
  active,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline" style={{ gap: '8px 18px' }}>
      <span style={mono(8.5, FAINT)}>{label}</span>
      <div className="grid grid-cols-2" style={{ gap: '7px 30px', maxWidth: '360px' }} role="group" aria-label={label}>
        {options.map((o) => {
          const on = o.id === active;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={on}
              className="text-left"
              style={{
                ...mono(9, on ? WALNUT : SECONDARY),
                background: 'transparent',
                padding: '0 0 2px',
                borderBottom: on ? `1px solid ${ACCENT_DEEP}` : '1px solid transparent',
                justifySelf: 'start',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE DELETABLE ROW — long-press (or right-click) a row in the pieces or
// makers list to remove it from your Index. Hiding, not destruction: the
// taxonomy is FIX; a restore control always exists on the list's footer.
// ---------------------------------------------------------------------------

export function DeletableRow({
  label,
  onDelete,
  children,
  className,
  style,
}: {
  label: string;
  onDelete: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<number | null>(null);
  const justOpened = useRef(false);

  const open = () => {
    justOpened.current = true;
    setConfirm(true);
    window.setTimeout(() => {
      justOpened.current = false;
    }, 350);
  };
  const start = () => {
    if (confirm) return;
    timer.current = window.setTimeout(open, 550);
  };
  const clear = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div
      className={className}
      style={{ position: 'relative', ...style }}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        open();
      }}
      onClickCapture={(e) => {
        if (justOpened.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
      {confirm && (
        <div
          role="alertdialog"
          aria-label={`Remove ${label} from your Index?`}
          className="flex items-center justify-between flex-wrap"
          style={{ position: 'absolute', inset: 0, zIndex: 2, gap: '8px 14px', background: PAPER, border: `1px solid ${RULE}`, padding: '0 10px' }}
        >
          <span style={mono(8, INK)}>Remove “{label}” from your Index?</span>
          <span className="inline-flex items-center" style={{ gap: '14px' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm(false);
                onDelete();
              }}
              className="hover:underline"
              style={{ ...mono(8.5, ACCENT_DEEP), background: 'transparent', padding: 0 }}
            >
              Remove
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirm(false);
              }}
              className="hover:underline"
              style={{ ...mono(8.5, SECONDARY), background: 'transparent', padding: 0 }}
            >
              Keep
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE GEN SLOT — 29b, wired (Task 3 · index-gen.tsx). Three states and no
// fourth: absent removes the element, pending draws a hairline at the
// sentence's own measure, ready draws Beau's text. Only G12 may carry a
// fallback string — rendered when (and only when) generation abstains.
// ---------------------------------------------------------------------------

export function GenSlot({ slot, scope, fallback, style }: { slot: string; scope?: string; fallback?: string; style?: React.CSSProperties }) {
  const gen = useIndexGenText(slot, scope);
  if (gen.state === 'ready' && gen.text) {
    return (
      <p data-ai-slot={slot} data-ai-scope={scope} data-ai-state="ready" style={{ ...body(15, INK), margin: 0, ...style }}>
        <span style={{ ...mono(7.5, ACCENT_DEEP), marginRight: '10px' }}>Beau</span>
        {gen.text}
      </p>
    );
  }
  if (gen.state === 'pending') {
    return (
      <div
        data-ai-slot={slot}
        data-ai-scope={scope}
        data-ai-state="pending"
        aria-hidden
        style={{ width: 'min(46ch, 100%)', height: '1px', background: HAIRLINE, margin: '10px 0', ...style }}
      />
    );
  }
  // Absent removes the element — unless this is the one slot with a
  // fallback (G12). No other slot may ship a string (29b).
  if (!fallback) return null;
  return (
    <p data-ai-slot={slot} data-ai-scope={scope} data-ai-state="ready" style={{ ...body(15, INK), margin: 0, ...style }}>
      {fallback}
    </p>
  );
}
