/**
 * THE INDEX · THE PIECE CARD — what a piece's NAME opens on the Pieces face.
 *
 * The founder's reference sets one detail treatment for the tab: a centred
 * sheet on a dimmed ground, paper, hairline-bordered, square-cornered — a
 * kicker, the name in Cormorant, a meta line, then Beau's read boxed in
 * tobacco-gold, the temperature band drawn on the same ruler the rows use,
 * and the piece's own facts under static labels. The ARROW on the row does
 * something else entirely (it crosses to the Makers face); the name opens
 * THIS.
 *
 * Everything on the card is the reader's own record: the piece as they
 * logged it, the cloth from piece_materials, the comfortable range read
 * from its stored warmth row or inferred from the piece itself, and the
 * day-count that range earns in their Dossier city. Beau's read at the top
 * is written for this piece and this wearer (index-tab-copy
 * useLedgerPieceRead), with a deterministic per-piece line until it lands.
 * No field is invented: a fact the record does not hold is shown as not
 * recorded, never guessed.
 */
import { useEffect } from 'react';
import {
  BAND_LABELS,
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  categoryName,
  daysInSpan,
  type IndexModel,
  type LedgerPieceRead,
} from './index-model';
import { AXIS_MARKS, rulerPct } from './index-spectrum';
import { useLedgerPieceRead } from './index-tab-copy';
import { runOfType } from './garment-type-runs';
import type { PieceDetails, StyleProfile } from './profile-data';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  MUTED,
  PAPER,
  RULE,
  SECONDARY,
  TINT,
  WALNUT,
  body,
  mono,
  serif,
  tempColor,
} from './index-style';

const MIDDOT = ' \u00b7 ';
const HATCH = 'repeating-linear-gradient(45deg,rgba(59,43,29,0.07) 0 5px,rgba(59,43,29,0) 5px 10px)';

/** A recorded list, or the honest absence of one. */
function listOrNone(values: string[] | null | undefined): string {
  const kept = (values || []).map((v) => (v || '').trim()).filter(Boolean);
  return kept.length > 0 ? kept.join(MIDDOT) : 'Not recorded';
}

function loggedOn(iso: string | undefined): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function IndexPieceCard({
  read,
  model,
  profile,
  detail,
  siblings,
  onClose,
  onMakers,
  onOpenLedger,
}: {
  read: LedgerPieceRead;
  model: IndexModel;
  profile: StyleProfile | null;
  /** The companion row holding size and the reader's own note. */
  detail: PieceDetails | null;
  /** How many other pieces the same category holds — Beau reads against it. */
  siblings: number;
  onClose: () => void;
  onMakers: () => void;
  onOpenLedger: () => void;
}) {
  const piece = read.piece;
  const beau = useLedgerPieceRead(read, model, profile, siblings);
  const days = read.span ? daysInSpan(model.climate, read.span) : null;
  const city = model.climate.city;
  const run = read.type ? runOfType(read.type.id) : null;

  // Escape closes it, as every sheet in the app does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bandLine = read.bands.length > 0 ? read.bands.map((b) => BAND_LABELS[b]).join(MIDDOT) : 'None \u2014 judged by material and place';
  const dayNote = days != null ? 'about ' + days + ' days a year' + (city ? ' in ' + city : '') : city ? 'day count unread' : 'set your city in the Dossier for the day count';

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Maker', value: read.brand || 'Not recorded' },
    { label: 'Cloth', value: read.material || 'Not recorded' },
    { label: 'Colour', value: listOrNone(piece.colors) },
    { label: 'Category', value: read.category ? categoryName(read.category) : 'Unplaced' },
    { label: 'Garment type', value: read.type ? read.type.name : 'Not matched to the canon' },
    { label: 'Run', value: run ? run.run.label : 'Not recorded' },
    { label: 'Seasons', value: listOrNone(piece.seasons) },
    { label: 'Occasions', value: listOrNone(piece.occasions) },
    { label: 'Registers it reaches', value: read.type ? read.type.reach.map((r) => FIELD_REGISTER_LABELS[r] || r).join(MIDDOT) : 'Not recorded' },
    { label: 'Size', value: (detail && detail.size) || 'Not recorded' },
    { label: 'Bands it answers', value: bandLine },
    { label: 'Logged', value: loggedOn(piece.created_at) },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={piece.name}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto"
      style={{ background: 'rgba(36,26,18,0.42)', padding: '48px 16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '720px', maxWidth: '100%', background: PAPER, border: '1px solid ' + WALNUT, boxShadow: '0 24px 60px rgba(36,26,18,0.28)' }}
      >
        {/* ——— the head: kicker, name, meta, the piece's own photograph */}
        <div
          className="flex items-start justify-between"
          style={{ gap: '20px', padding: '24px 26px 18px', borderBottom: '1px solid ' + WALNUT }}
        >
          <div className="min-w-0">
            <span style={{ ...mono(8, FAINT), display: 'block' }}>
              {'Your piece \u00b7 ' + (read.category ? categoryName(read.category) : 'unplaced')}
            </span>
            <h2 style={{ ...serif(34, WALNUT), margin: '7px 0 0', lineHeight: 1.06 }}>{piece.name}</h2>
            <span style={{ ...mono(8.5, ACCENT_DEEP), display: 'block', marginTop: '8px' }}>
              {[read.brand, read.material, (detail && detail.size) || null].filter(Boolean).join(MIDDOT) || 'No maker or cloth recorded yet'}
            </span>
          </div>
          <div className="flex items-start" style={{ gap: '14px' }}>
            <div
              className="hidden sm:flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ width: '84px', height: '84px', border: '1px solid ' + HAIRLINE, background: piece.photo_url ? PAPER : HATCH }}
            >
              {piece.photo_url ? (
                <img src={piece.photo_url} alt={piece.name} className="w-full h-full" style={{ objectFit: 'contain' }} loading="lazy" />
              ) : (
                <span style={mono(6.5, FAINTER)}>No photo</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the card"
              className="hover:opacity-70 transition-opacity flex-shrink-0"
              style={{ ...mono(15, MUTED), background: 'transparent', lineHeight: 1, padding: '2px 4px' }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: '22px 26px 24px' }}>
          {/* ——— Beau's read, boxed */}
          {beau && (
            <div style={{ border: '1px solid rgba(168,113,44,0.5)', background: TINT, padding: '14px 16px' }}>
              <span style={{ ...mono(8, ACCENT_DEEP), display: 'block' }}>{'Beau\u2019s read'}</span>
              <p style={{ ...body(14, INK), margin: '7px 0 0' }}>{beau}</p>
            </div>
          )}

          {/* ——— the temperature band, on the ruler the rows share */}
          <div style={{ marginTop: '22px' }}>
            <span style={{ ...mono(8, FAINT), display: 'block' }}>Temperature band</span>
            <div className="flex items-baseline flex-wrap" style={{ gap: '6px 16px', marginTop: '7px' }}>
              <span style={{ ...serif(38, WALNUT), lineHeight: 1, fontFeatureSettings: "'tnum' 1" }}>
                {read.span ? read.span.lo + '\u2013' + read.span.hi + '\u00b0C' : 'Any weather'}
              </span>
              <span style={body(13.5, SECONDARY)}>{dayNote}</span>
            </div>
            <div style={{ position: 'relative', height: '26px', marginTop: '16px' }}>
              <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '13px', height: '1px', background: HAIRLINE }} />
              {read.span && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: Math.max(0, rulerPct(read.span.lo)) + '%',
                    width: Math.max(2, Math.min(100, rulerPct(read.span.hi)) - Math.max(0, rulerPct(read.span.lo))) + '%',
                    top: '5px',
                    height: '17px',
                    border: '1px solid ' + ACCENT,
                    background: tempColor((read.span.lo + read.span.hi) / 2, RULER_LO, RULER_HI, 0.32),
                  }}
                />
              )}
            </div>
            <div style={{ position: 'relative', height: '16px' }} aria-hidden>
              {AXIS_MARKS.map((deg) => (
                <span
                  key={deg}
                  style={{ ...mono(8, FAINT), position: 'absolute', left: rulerPct(deg) + '%', top: 0, transform: 'translateX(-50%)', fontFeatureSettings: "'tnum' 1" }}
                >
                  {deg + '\u00b0'}
                </span>
              ))}
            </div>
          </div>

          {/* ——— the piece's own facts */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3"
            style={{ gap: '14px 22px', marginTop: '22px', paddingTop: '16px', borderTop: '1px solid ' + RULE }}
          >
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <span style={{ ...mono(7.5, FAINT), display: 'block', marginBottom: '3px' }}>{f.label}</span>
                <span style={body(13.5, INK)}>{f.value}</span>
              </div>
            ))}
          </div>

          {/* ——— the reader's own note, when they have written one */}
          {detail && detail.notes && (
            <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid ' + HAIRLINE }}>
              <span style={{ ...mono(7.5, FAINT), display: 'block', marginBottom: '4px' }}>Your note</span>
              <p style={{ ...body(13.5, SECONDARY), margin: 0 }}>{detail.notes}</p>
            </div>
          )}

          {/* ——— the two ways on */}
          <div className="flex flex-wrap" style={{ gap: '9px', marginTop: '22px' }}>
            <button
              type="button"
              onClick={onMakers}
              className="transition-colors hover:opacity-85"
              style={{
                fontFamily: 'var(--space-font-heading)',
                fontSize: 'max(var(--eth-serif, 0px), 13px)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '9px 16px',
                background: WALNUT,
                color: '#f6f0e5',
                whiteSpace: 'nowrap',
              }}
            >
              {'Who makes it \u2192'}
            </button>
            <button
              type="button"
              onClick={onOpenLedger}
              className="transition-colors hover:border-[#a8712c]"
              style={{
                fontFamily: 'var(--space-font-heading)',
                fontSize: 'max(var(--eth-serif, 0px), 13px)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '9px 16px',
                border: '1px solid rgba(59,43,29,0.4)',
                color: SECONDARY,
                background: 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              Correct it in the Rail
            </button>
            <button
              type="button"
              onClick={onClose}
              className="transition-opacity hover:opacity-70"
              style={{ ...mono(8.5, MUTED), background: 'transparent', border: '1px solid ' + HAIRLINE, padding: '9px 14px', whiteSpace: 'nowrap' }}
            >
              Back to the list
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
