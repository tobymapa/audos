/**
 * THE FITTING · LAYOUT FURNITURE — the small components the rebuilt Fitting
 * tab is drawn from, in the reference design's own register.
 *
 * NOTE — the tab's MASTHEAD is no longer here: The Fitting carries the
 * shared one (tab-header.tsx) with the other five primary tabs, so the six
 * headers are identical. `FittingMasthead` below is kept only so nothing
 * that still imports it breaks; do not use it on a new surface.
 *
 * What this file draws:
 *
 *   · the CONTEXT BAR under the masthead (location + weather at the left,
 *     “Change location” and the tab + day at the right);
 *   · the SEGMENTED control at the masthead's right edge (how the board is
 *     made: Today · By hand · Trip · Saved);
 *   · the DAY RAIL down the left of the three-column band;
 *   · the centre panel's COLOUR HARMONY strip;
 *   · the right column's three sections (Style notes · Swap alternatives ·
 *     What not to do) and their row treatments;
 *   · the SHELF headers beneath the band, and the page's closing LEGEND.
 *
 * Nothing here holds state about the board: every component takes what it
 * draws. The fitting engine, the flat-lay composition and every handoff stay
 * in fitting-room.tsx / fitting-room-state.ts — this file is presentation.
 *
 * Every colour and type helper comes from index-style.tsx (the shared warm-
 * editorial tokens); nothing sets a palette of its own.
 */
import { useState } from 'react';
import type React from 'react';
import { ChevronDown, ChevronRight, Loader2, LocateFixed, X } from 'lucide-react';
import {
  ACCENT,
  ACCENT_DEEP,
  CANVAS,
  HAIRLINE,
  INK,
  MUTED,
  PAPER,
  SERIF,
  WALNUT,
  body,
  mono,
} from './index-style';
import { detectSharedLocation, getStoredSharedCity, setSharedCity, useSharedWeather } from './weather-context';
import { matchColorOption, swatchFor } from './profile-data';

/** The reference's small-caps register — the shared mono helper at the wider
 * tracking every label on this screen carries. */
export function label(size = 9, color = MUTED, tracking = '0.16em'): React.CSSProperties {
  return { ...mono(size, color), letterSpacing: tracking };
}

// ---------------------------------------------------------------------------
// COLOUR — the harmony strip and the legend read the wardrobe's OWN colour
// vocabulary (profile-data's palette), never an invented one. A piece's
// stored colours come first; a piece with none (a Reserve row, one of Beau's
// picks) falls back to the colour named in its own title.
// ---------------------------------------------------------------------------

/** The colour a piece reads as — its first logged colour, else the colour
 * named in its own title. null when neither names one. */
export function colourNameForPiece(name: string, colors?: string[] | null): string | null {
  const stored = (colors || []).map((c) => (c || '').trim()).filter(Boolean);
  if (stored.length > 0) return stored[0];
  return matchColorOption(name || '');
}

/** The swatch hex for a piece, or null when it names no colour at all. */
export function swatchForPiece(name: string, colors?: string[] | null): string | null {
  const colour = colourNameForPiece(name, colors);
  return colour ? swatchFor(colour) : null;
}

// ---------------------------------------------------------------------------
// THE CONTEXT BAR — the strip directly under the shared masthead: the
// SHARED location + weather (weather-context.tsx, the same reading The
// Ledger shows), “Change location”, and the tab · day at the right edge.
// Changing the city here changes it everywhere, exactly as before.
// ---------------------------------------------------------------------------

export function FittingContextBar({ right }: { right: React.ReactNode }) {
  const { weather, status } = useSharedWeather();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    setDraft(weather?.city || getStoredSharedCity() || '');
    setError(null);
    setEditing(true);
  };

  const applyCity = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await setSharedCity(draft);
    setBusy(false);
    if (ok) setEditing(false);
    else setError(`Couldn\u2019t find \u201c${draft.trim()}\u201d \u2014 check the spelling and try again.`);
  };

  const applyDetect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await detectSharedLocation();
    setBusy(false);
    if (ok) setEditing(false);
    else setError('Couldn\u2019t read your device location \u2014 type a city instead.');
  };

  const reading = weather
    ? `${weather.city} \u00b7 ${weather.tempC}\u00b0C \u00b7 ${weather.label}${
        weather.feelsLike != null && Math.abs(weather.feelsLike - weather.tempC) >= 2 ? ` \u00b7 feels like ${weather.feelsLike}\u00b0C` : ''
      }`
    : status === 'loading'
      ? 'Reading today\u2019s weather\u2026'
      : 'No location set \u2014 Beau checks the weather';

  return (
    <div style={{ background: PAPER, borderBottom: `1px solid ${HAIRLINE}` }}>
      <div className="px-6 sm:px-10">
        <div className="max-w-[1180px] mx-auto flex items-center justify-between gap-5 flex-wrap" style={{ padding: '9px 0' }}>
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="inline-block flex-shrink-0"
              style={{ width: '9px', height: '9px', borderRadius: '50%', border: `1.5px solid ${ACCENT}` }}
            />
            {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: MUTED }} aria-hidden="true" />}
            <span className="truncate" style={label(9.5, MUTED, '0.1em')} aria-live="polite">
              {reading}
            </span>
          </span>
          <span className="inline-flex items-center gap-5 flex-wrap">
            <button
              type="button"
              onClick={editing ? () => setEditing(false) : openEditor}
              className="hover:underline"
              style={{ ...label(9.5, ACCENT_DEEP, '0.1em'), background: 'transparent', border: 'none' }}
              aria-expanded={editing}
              title="Set the city Beau dresses you for — it changes everywhere"
            >
              Change location
            </button>
            <span style={label(9.5, MUTED, '0.1em')}>{right}</span>
          </span>
        </div>
        {editing && (
          <div className="max-w-[1180px] mx-auto flex items-center gap-2 flex-wrap" style={{ paddingBottom: '10px' }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void applyCity();
              }}
              placeholder="e.g. Barcelona"
              aria-label="Your location"
              autoFocus
              disabled={busy}
              className="px-2.5 min-h-[36px] focus:outline-none disabled:opacity-50"
              style={{ ...body(13, INK), borderRadius: 0, border: `1px solid ${HAIRLINE}`, background: CANVAS, maxWidth: '220px' }}
            />
            <button
              type="button"
              onClick={() => void applyCity()}
              disabled={busy}
              className="min-h-[36px] px-2.5 inline-flex items-center gap-1.5 hover:underline disabled:opacity-50"
              style={{ ...label(8.5, ACCENT_DEEP, '0.1em'), background: 'transparent', border: 'none' }}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Use this city
            </button>
            <button
              type="button"
              onClick={() => void applyDetect()}
              disabled={busy}
              className="min-h-[36px] px-2 inline-flex items-center gap-1 hover:underline disabled:opacity-50"
              style={{ ...label(8.5, MUTED, '0.1em'), background: 'transparent', border: 'none' }}
              title="Detect my location"
            >
              <LocateFixed className="w-3 h-3" />
              Detect
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={busy}
              aria-label="Close the location editor"
              className="min-h-[36px] w-8 inline-flex items-center justify-center hover:opacity-70 disabled:opacity-50"
              style={{ color: MUTED, background: 'transparent', border: 'none' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {error && <span style={body(12, MUTED)}>{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE MASTHEAD — RETIRED. The Fitting now carries the shared tab masthead
// (tab-header.tsx) with the other five primary tabs; this is kept only for
// compatibility and must not be used on a new surface.
// ---------------------------------------------------------------------------

export function FittingMasthead({
  lead,
  emphasis,
  standfirst,
  aside,
}: {
  /** The plain first word — “The”. */
  lead: string;
  /** The italic word that follows — “Fitting”. */
  emphasis: string;
  standfirst: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="px-6 sm:px-10" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
      <header
        className="max-w-[1180px] mx-auto flex items-start md:items-end justify-between gap-6 md:gap-9 flex-wrap"
        style={{ paddingTop: '30px', paddingBottom: '22px' }}
      >
        <div className="min-w-0">
          <h2
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontWeight: 300,
              fontSize: 'clamp(34px, 5vw, 46px)',
              lineHeight: 1,
              letterSpacing: '0.01em',
              color: INK,
            }}
          >
            {lead} <em style={{ fontStyle: 'italic' }}>{emphasis}</em>
          </h2>
          <p style={{ ...label(9.5, MUTED, '0.16em'), margin: '8px 0 0' }}>{standfirst}</p>
        </div>
        {aside}
      </header>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE SEGMENTED CONTROL — one hairline box, the active face filled walnut.
// ---------------------------------------------------------------------------

export interface SegmentedItem {
  key: string;
  label: string;
  title?: string;
  onSelect: () => void;
}

export function SegmentedTabs({ items, activeKey }: { items: SegmentedItem[]; activeKey: string }) {
  return (
    <div className="flex flex-wrap" style={{ border: `1px solid rgba(59,43,29,0.22)` }} role="group" aria-label="How this board is made">
      {items.map((item, i) => {
        const on = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            aria-pressed={on}
            title={item.title}
            className="transition-colors whitespace-nowrap"
            style={{
              ...label(9.5, on ? '#f4eee3' : MUTED, '0.16em'),
              padding: '11px 19px',
              border: 'none',
              borderRight: i === items.length - 1 ? 'none' : `1px solid ${HAIRLINE}`,
              background: on ? WALNUT : 'transparent',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE DAY RAIL — a column of days down the left of the band (a row on a
// phone). The active day carries the canvas wash and the gold tick.
//
// The seven days SHARE the column's full height (each cell flex: 1), so the
// rail's last day ends exactly where the canvas beside it ends — the band
// closes on one line rather than leaving the canvas running on below the
// days (founder's correction).
// ---------------------------------------------------------------------------

export interface RailDay {
  key: string;
  abbr: string;
  num: string;
  active: boolean;
  /** Dimmed — still tappable, with its own explanation in `title`. */
  quiet?: boolean;
  title?: string;
  onSelect: () => void;
}

export function DayRail({ days, extra }: { days: RailDay[]; extra?: React.ReactNode }) {
  return (
    <div
      className="flex lg:flex-col gap-[2px] overflow-x-auto lg:overflow-visible border-b lg:border-b-0 lg:border-r border-[rgba(59,43,29,0.18)]"
      style={{ padding: '22px 0' }}
      role="tablist"
      aria-label="Days"
    >
      {days.map((day) => (
        <button
          key={day.key}
          type="button"
          role="tab"
          aria-selected={day.active}
          onClick={day.onSelect}
          title={day.title}
          className="flex-shrink-0 lg:flex-1 lg:w-full transition-colors"
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            padding: '14px 12px',
            minWidth: '62px',
            minHeight: '62px',
            border: 'none',
            cursor: 'pointer',
            opacity: day.quiet && !day.active ? 0.55 : 1,
            background: day.active ? CANVAS : 'transparent',
          }}
        >
          <span style={label(8.5, MUTED, '0.16em')}>{day.abbr}</span>
          <span style={{ fontFamily: SERIF, fontSize: '22px', lineHeight: 1, color: day.active ? WALNUT : '#8d7c66' }}>{day.num}</span>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: '2px',
              height: '30px',
              background: day.active ? ACCENT : 'transparent',
            }}
          />
        </button>
      ))}
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PANEL FURNITURE — the labelled rule, the harmony strip, the note lists.
// ---------------------------------------------------------------------------

/** The small-caps rule every section on this screen opens with. */
export function SectionRule({
  children,
  right,
  tone = MUTED,
  className = '',
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${className}`}
      style={{ paddingBottom: '8px', borderBottom: `1px solid ${HAIRLINE}` }}
    >
      <span style={label(9, tone, '0.18em')}>{children}</span>
      {right != null && <span style={label(9, MUTED, '0.18em')}>{right}</span>}
    </div>
  );
}

/** The board's colours, read off the pieces on it. */
export function HarmonyBars({ colors }: { colors: string[] }) {
  if (colors.length === 0) {
    return (
      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }} aria-hidden="true">
        <span style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(59,43,29,0.12)' }} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }} aria-hidden="true">
      {colors.map((c, i) => (
        <span key={`${c}-${i}`} style={{ flex: 1, height: '5px', borderRadius: '3px', background: c }} />
      ))}
    </div>
  );
}

/** “Style notes” — em-dash bullets in the accent. */
export function NoteList({ notes }: { notes: string[] }) {
  return (
    <div className="flex flex-col gap-2.5" style={{ marginTop: '12px' }}>
      {notes.map((text, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr)', gap: '8px', ...body(13.5, INK) }}>
          <span style={{ color: ACCENT }} aria-hidden="true">
            —
          </span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

/** “What not to do” — the same list at a quieter weight, marked ×. */
export function AvoidList({ notes }: { notes: string[] }) {
  return (
    <div className="flex flex-col gap-2.5" style={{ marginTop: '12px' }}>
      {notes.map((text, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr)', gap: '8px', ...body(12.5, MUTED) }}>
          <span style={{ color: '#8c3a2b' }} aria-hidden="true">
            ×
          </span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

/** One “Swap alternatives” row — the piece's own colour chip, its name, and
 * the one line saying why it is offered. */
export function SwapRow({
  swatch,
  name,
  why,
  onClick,
  title,
}: {
  swatch: string | null;
  name: string;
  why: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-full text-left group"
      style={{
        display: 'grid',
        gridTemplateColumns: '16px minmax(0,1fr)',
        gap: '12px',
        padding: '13px 0',
        borderBottom: '1px solid rgba(59,43,29,0.12)',
        background: 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '16px',
          height: '16px',
          marginTop: '5px',
          background: swatch || 'transparent',
          border: swatch ? '1px solid rgba(0,0,0,0.12)' : `1px solid ${HAIRLINE}`,
        }}
      />
      <span style={{ minWidth: 0 }}>
        {/* The piece's name — two sizes down from the board's own type, so
            the narrowed notes column reads as a margin note, not a heading. */}
        <span className="block group-hover:underline" style={{ fontFamily: SERIF, fontSize: '14px', lineHeight: 1.3, color: WALNUT }}>
          {name}
        </span>
        <span className="block" style={{ ...body(12.5, MUTED), marginTop: '2px' }}>
          {why}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// THE SHELF — one labelled run per source, in the reference's tile grid.
// Each one FOLDS: the chevron beside its label collapses the run of tiles
// (open by default), so the reader can put a whole source away.
// ---------------------------------------------------------------------------

export function Shelf({
  title,
  note,
  children,
  tone = MUTED,
  id,
  defaultOpen = true,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  tone?: string;
  id?: string;
  /** Every shelf opens UNFOLDED; the chevron folds away the ones the reader
   * is done with, so the board itself stays in view. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} aria-label={title} style={{ marginTop: '26px', scrollMarginTop: '80px' }}>
      <div
        className="flex items-baseline justify-between gap-4"
        style={{ paddingBottom: '8px', borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? `Fold ${title}` : `Unfold ${title}`}
          className="inline-flex items-center gap-2 text-left transition-opacity hover:opacity-70"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span aria-hidden="true" className="inline-flex self-center" style={{ color: ACCENT }}>
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span style={label(9, tone, '0.18em')}>{title}</span>
        </button>
        <span style={label(9, MUTED, '0.18em')}>{note}</span>
      </div>
      {open && (
        <div className="flex flex-wrap gap-x-6 gap-y-7" style={{ paddingTop: '18px' }}>
          {children}
        </div>
      )}
    </section>
  );
}

/** The line a shelf shows instead of its tiles when it has none. */
export function ShelfEmpty({ children }: { children: React.ReactNode }) {
  return <p style={{ ...body(13, MUTED), margin: 0, paddingTop: '4px' }}>{children}</p>;
}

// ---------------------------------------------------------------------------
// THE CLOSING LEGEND — what the board's colours mean, and the one line that
// says how the screen answers a tap.
// ---------------------------------------------------------------------------

export function FooterLegend({ items, note }: { items: Array<{ dot: string; label: string }>; note: string }) {
  return (
    <div style={{ background: PAPER, borderTop: `1px solid ${HAIRLINE}` }}>
      <div className="px-6 sm:px-10">
        <div className="max-w-[1180px] mx-auto flex items-center justify-between gap-6 flex-wrap" style={{ padding: '13px 0' }}>
          <div className="flex gap-5 flex-wrap">
            {items.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2" style={label(9, MUTED, '0.16em')}>
                <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.dot, display: 'inline-block' }} />
                {item.label}
              </span>
            ))}
          </div>
          <span style={label(9, MUTED, '0.16em')}>{note}</span>
        </div>
      </div>
    </div>
  );
}
