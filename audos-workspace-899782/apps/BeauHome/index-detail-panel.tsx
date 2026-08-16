/**
 * THE INDEX · DETAIL PANEL — design handoff screen 8a ("a piece entry
 * beside a maker entry"): the reference work's leaf page, opened IN PLACE
 * as a panel over the index rather than as a separate screen.
 *
 *  · ONE panel pattern for BOTH directories — a piece type opens the piece
 *    entry (The Derby), a maker opens the maker entry (Loake 1880 rated ·
 *    Anglo-Italian unrated). Same chrome, entity-appropriate fields.
 *  · FORWARD / BACK — the footer walks the entry's own shelf ("← Oxford ·
 *    ALL SHOES · 7 · Loafer →"; "← Le Tricoteur · ALL ENGLAND MAKERS · 19 ·
 *    Mackintosh →") without closing the panel. Arrow keys work too.
 *  · DISMISSAL — backdrop tap, the × in the top bar, or Escape.
 *
 * Every field says what it is: the rated maker carries WHY THE TIER and
 * the spec facts; the unrated one carries YOUR NOTE, dashed known-for
 * chips and WHAT A RATING WOULD NEED — unrated is a resting state, not an
 * error (8a).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Loader2, X } from 'lucide-react';
import { MONO, numberWord, capWord, usePlexMono } from './mono-type';
import type { PieceIndexCategory, PieceIndexType } from './piece-index-data';
import { worldEntry } from './world-taxonomy';
import type { WorldEntry } from './world-types';
import {
  PRICE_BAND_SYMBOL,
  PRICE_TIER_LABELS,
  catalogDirectoryEntries,
  normalizeBeauRating,
  verifiedBrandWebsiteUrl,
  type BeauRating,
  type DirectoryBrandRow,
  type DirectoryEntry,
} from './brands';
import { addUserDirectoryBrand, removeDirectoryBrand } from './hunt-ai';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { PieceBrandPicks } from './piece-recommendations';

// ---------------------------------------------------------------------------
// The 8a palette and registers — the same inks the index list sets.
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
const PAPER = '#fbf8f1';
const PAGE = '#efe7d9';
const HAIR = 'rgba(59,43,29,0.18)';
const HAIR_STRONG = 'rgba(59,43,29,0.3)';

// Carries the phone reading floor: --eth-micro is declared in Desktop.tsx and is 0px above the phone breakpoint, so the size asked for is used exactly as written.
function mono(size = 9, color = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `max(var(--eth-micro, 0px), ${size}px)`, letterSpacing: '0.06em', textTransform: 'uppercase', color };
}

const bodyText: React.CSSProperties = { fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 13.5px)', lineHeight: 1.62, color: INK };

function SectionRule() {
  return <div style={{ borderTop: `1px solid ${HAIR_STRONG}`, margin: '20px 0 0' }} />;
}

function SectionHead({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4" style={{ margin: '16px 0 0' }}>
      <span style={{ fontFamily: MONO, fontSize: 'max(var(--eth-micro, 0px), 9.5px)', letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED }}>{children}</span>
      {right}
    </div>
  );
}

/** "READ 41 SECONDS" — the entry states its own weight (8a). */
function readSeconds(words: number): number {
  return Math.max(8, Math.round(words / 3.8));
}

function countWords(parts: Array<string | null | undefined>): number {
  return parts
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// The overlay shell — backdrop tap, ×, Escape; ← → walk the shelf.
// ---------------------------------------------------------------------------

export function IndexDetailOverlay({
  onClose,
  onPrev,
  onNext,
  ariaLabel,
  children,
}: {
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: 'rgba(36,26,18,0.44)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full outline-none"
        style={{
          maxWidth: '720px',
          margin: '4vh 12px 6vh',
          background: PAGE,
          border: `1px solid ${HAIR_STRONG}`,
          boxShadow: '0 18px 60px rgba(36,26,18,0.35)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The panel's top strip — "PIECES · 377  MAKERS · 61" left, the shelf
 * position right, the × at the edge (the one addition a panel needs). */
function PanelTopBar({
  active,
  pieceCount,
  makerCount,
  positionLabel,
  onClose,
}: {
  active: 'pieces' | 'makers';
  pieceCount: number;
  makerCount: number;
  positionLabel: string;
  onClose: () => void;
}) {
  const item = (label: string, isActive: boolean) => (
    <span
      style={{
        ...mono(9.5, isActive ? WALNUT : FAINT),
        letterSpacing: '0.1em',
        paddingBottom: '3px',
        borderBottom: isActive ? `1px solid ${ACCENT}` : '1px solid transparent',
      }}
    >
      {label}
    </span>
  );
  return (
    <div
      className="flex items-center justify-between gap-3"
      style={{ padding: '12px 18px 10px', borderBottom: `1px solid ${HAIR}`, background: PAPER }}
    >
      <span className="inline-flex items-baseline" style={{ gap: '18px' }}>
        {item(`Pieces · ${pieceCount}`, active === 'pieces')}
        {item(`Makers · ${makerCount}`, active === 'makers')}
      </span>
      <span className="inline-flex items-center" style={{ gap: '14px' }}>
        <span style={{ ...mono(9.5, SECONDARY), letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{positionLabel}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the entry"
          className="hab-touch-icon flex items-center justify-center hover:opacity-70"
          style={{ width: '26px', height: '26px', border: `1px solid ${HAIR_STRONG}`, background: 'transparent', color: SECONDARY }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    </div>
  );
}

/** The forward/back footer — "← Oxford · ALL SHOES · 7 · Loafer →" (8a). */
function PanelFooterNav({
  prevName,
  nextName,
  centreLabel,
  onPrev,
  onNext,
}: {
  prevName: string | null;
  nextName: string | null;
  centreLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const navBtn: React.CSSProperties = { fontFamily: SERIF, fontSize: '15px', color: ACCENT_DEEP, background: 'transparent' };
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
      style={{ padding: '14px 18px 16px', borderTop: `1px solid ${HAIR_STRONG}`, marginTop: '22px' }}
    >
      <span className="justify-self-start">
        {prevName && (
          <button type="button" onClick={onPrev} className="hover:underline text-left" style={navBtn} aria-label={`Previous — ${prevName}`}>
            ← {prevName}
          </button>
        )}
      </span>
      <span style={{ ...mono(9, FAINT), letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{centreLabel}</span>
      <span className="justify-self-end text-right">
        {nextName && (
          <button type="button" onClick={onNext} className="hover:underline text-right" style={navBtn} aria-label={`Next — ${nextName}`}>
            {nextName} →
          </button>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits — the facts table, chips.
// ---------------------------------------------------------------------------

function FactCell({ label, value, source }: { label: string; value: string; source?: string | null }) {
  return (
    <div style={{ padding: '10px 14px 12px' }}>
      <div style={{ ...mono(8.5, MUTED), letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ marginTop: '5px', fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 13.5px)', lineHeight: 1.4, color: WALNUT }}>{value}</div>
      {source && <div style={{ marginTop: '4px', ...mono(7.5, FAINT), letterSpacing: '0.08em' }}>{source}</div>}
    </div>
  );
}

function FactsTable({ cells }: { cells: Array<{ label: string; value: string; source?: string | null }> }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2"
      style={{ marginTop: '14px', border: `1px solid ${HAIR_STRONG}`, background: PAPER }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          style={{
            borderTop: i >= 2 ? `1px solid ${HAIR}` : 'none',
            borderLeft: i % 2 === 1 ? `1px solid ${HAIR}` : 'none',
          }}
          className={i % 2 === 1 ? 'sm:border-l' : ''}
        >
          <FactCell {...cell} />
        </div>
      ))}
    </div>
  );
}

function Chip({ name, suffix, dashed }: { name: string; suffix?: string | null; dashed?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline"
      style={{
        gap: '7px',
        padding: '7px 12px',
        border: dashed ? `1px dashed ${HAIR_STRONG}` : `1px solid ${HAIR_STRONG}`,
        background: dashed ? 'transparent' : PAPER,
      }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 14.5px)', color: WALNUT }}>{name}</span>
      {suffix && <span style={{ ...mono(7.5, ACCENT_DEEP), letterSpacing: '0.08em' }}>{suffix}</span>}
    </span>
  );
}

/** "In your Ledger · none logged" — with the swatches when something is. */
function LedgerRow({ logged, swatches, right }: { logged: boolean; swatches?: string[]; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4" style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${HAIR}` }}>
      <span style={{ fontFamily: SERIF, fontSize: '15px', color: WALNUT }}>
        On your Rail ·{' '}
        <span style={{ fontFamily: BODY, fontSize: 'max(var(--eth-body, 0px), 13.5px)', color: logged ? INK : SECONDARY }}>
          {logged ? 'logged' : 'none logged'}
        </span>
        {logged && swatches && swatches.length > 0 && (
          <span className="inline-flex" style={{ gap: '3px', marginLeft: '8px', verticalAlign: '1px' }}>
            {swatches.map((c, i) => (
              <span key={`${c}-${i}`} style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, border: '1px solid rgba(59,43,29,0.4)', display: 'inline-block' }} />
            ))}
          </span>
        )}
      </span>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE PIECE ENTRY (8a, left panel — "The Derby").
// ---------------------------------------------------------------------------

const TIER_RANK: Record<BeauRating, number> = { Excellent: 3, Reliable: 2, Inconsistent: 1, Avoid: 0 };

/** Makers the catalog rates for this type — keyword match on the entry's
 * own vocabulary, best tiers first. */
function makersForType(typeName: string, entry: WorldEntry | null): DirectoryEntry[] {
  const clean = typeName.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const kws = new Set<string>([clean]);
  const paren = typeName.toLowerCase().match(/\(([^)]+)\)/)?.[1]?.trim();
  if (paren) kws.add(paren);
  if (entry) {
    kws.add(entry.name.toLowerCase());
    for (const k of entry.keywords) kws.add(k.toLowerCase());
  }
  const keywords = [...kws].filter((k) => k.length >= 4);
  if (keywords.length === 0) return [];
  return catalogDirectoryEntries()
    .filter((e) => {
      const text = `${e.profile.description} ${e.profile.signaturePieces.join(' ')}`.toLowerCase();
      return keywords.some((k) => text.includes(k));
    })
    .sort((a, b) => (TIER_RANK[b.rating] ?? 0) - (TIER_RANK[a.rating] ?? 0) || a.profile.brand.localeCompare(b.profile.brand));
}

/** The three registers, read from the type's occasions (the same read the
 * index list filters on). */
function registerCells(occasions: string[]): Array<{ title: string; note: string; muted: boolean }> {
  const has = (o: string) => occasions.includes(o);
  const casualHits = ['Everyday', 'Outdoors', 'Travel'].filter(has);
  const smartHits = ['Work', 'Dinner'].filter(has);
  const formal = has('Formal');
  const scores: Array<[string, number]> = [
    ['Smart-casual', smartHits.length],
    ['Casual', casualHits.length],
    ['Formal', formal ? 1 : 0],
  ];
  const home = scores.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  const cell = (title: string, hits: string[], serves: boolean) => {
    if (serves && title === home && hits.length > 0) return { title, note: 'Its home register.', muted: false };
    if (serves) return { title, note: `Yes — ${hits.map((h) => h.toLowerCase()).join(' and ')}.`, muted: false };
    return { title, note: 'No — not its register.', muted: true };
  };
  return [
    cell('Smart-casual', smartHits, smartHits.length > 0),
    cell('Casual', casualHits, casualHits.length > 0),
    formal ? cell('Formal', ['Formal'], true) : { title: 'Formal', note: 'No — not its register.', muted: true },
  ];
}

export function PieceDetailPanel({
  category,
  type,
  occasions,
  ownedSwatches,
  position,
  prevName,
  nextName,
  pieceTotal,
  makerTotal,
  profile = null,
  pieces = [],
  onPrev,
  onNext,
  onClose,
}: {
  category: PieceIndexCategory;
  type: PieceIndexType & { group: string };
  /** The occasion reads the index list already derives for this type. */
  occasions: string[];
  ownedSwatches: string[] | undefined;
  position: { index: number; total: number };
  prevName: string | null;
  nextName: string | null;
  pieceTotal: number;
  makerTotal: number;
  /** The dossier — the entry's brand recommendation is ranked against it. */
  profile?: StyleProfile | null;
  /** The wardrobe, read for the same ranking. */
  pieces?: WardrobePiece[];
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  usePlexMono();
  const entry = worldEntry(type.entry || null);
  const makers = useMemo(() => makersForType(type.name, entry), [type.name, entry]);
  const registers = useMemo(() => registerCells(occasions), [occasions]);

  const subtitle = entry
    ? `${(entry.what.split(/(?<=\.)\s+/)[0] || entry.what).trim()}`
    : `${type.group} — a reference row in ${category.name.toLowerCase()}; the full entry is being written up.`;
  const bodyPara = entry ? entry.what : null;

  const factRows: Array<{ label: string; value: string }> = entry
    ? [
        { label: 'Origin', value: entry.history },
        { label: 'How to wear it', value: entry.useCase },
        { label: 'Pairs with', value: entry.pairings.join(' · ') },
        {
          label: 'Its place',
          value: entry.essential
            ? 'A wardrobe essential — it fills a foundational gap.'
            : 'A specialist piece — it adds range once the essentials are in place.',
        },
      ]
    : [];

  const seconds = readSeconds(
    countWords([subtitle, bodyPara, ...factRows.map((r) => r.value), ...registers.map((r) => r.note)]),
  );

  return (
    <IndexDetailOverlay onClose={onClose} onPrev={prevName ? onPrev : undefined} onNext={nextName ? onNext : undefined} ariaLabel={`${type.name} — the piece entry`}>
      <PanelTopBar
        active="pieces"
        pieceCount={pieceTotal}
        makerCount={makerTotal}
        positionLabel={`${category.name} · ${position.index + 1} of ${position.total}`}
        onClose={onClose}
      />
      <div style={{ padding: '20px 22px 4px' }}>
        {/* Breadcrumb — PIECES · SHOES · DERBY. */}
        <div style={{ ...mono(8.5, FAINT), letterSpacing: '0.12em' }}>
          Pieces · {category.name} · {type.name.replace(/\(.*?\)/g, '').trim()}
        </div>

        <h2 style={{ margin: '10px 0 0', fontFamily: SERIF, fontSize: 'clamp(30px, 5.5vw, 40px)', fontWeight: 400, lineHeight: 1.06, letterSpacing: '-0.01em', color: WALNUT }}>
          {type.name.replace(/\(.*?\)/g, '').trim()}
        </h2>
        <p style={{ margin: '8px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '16.5px', lineHeight: 1.4, color: SECONDARY, maxWidth: '52ch' }}>
          {subtitle}
        </p>

        {/* WHERE TO GET A GOOD ONE (founder's change 5) — the dashed “it takes
            its photograph from a piece you log” plate is replaced by a real
            recommendation: one maker with a photograph of THEIR version and a
            link straight to it, then the next four. Ranked against the
            dossier when there is one to read. */}
        <PieceBrandPicks
          typeName={type.name}
          categoryName={category.name}
          keywords={entry ? entry.keywords : []}
          profile={profile}
          pieces={pieces}
          fallbackBrands={makers.map((m) => m.profile.brand)}
        />

        {/* The reading — the entry's own paragraph. */}
        <p style={{ margin: '16px 0 0', ...bodyText, fontSize: 'max(var(--eth-body, 0px), 14px)' }}>
          {bodyPara ||
            'The taxonomy lists it so you never need to already know it exists — the obscure ones are being written up entry by entry, and every type is already findable, filterable and mappable.'}
        </p>

        {factRows.length > 0 && (
          <>
            <SectionRule />
            <SectionHead>What separates a good one</SectionHead>
            <div style={{ marginTop: '4px' }}>
              {factRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)]"
                  style={{ gap: '2px 18px', padding: '10px 0', borderBottom: `1px solid rgba(59,43,29,0.1)` }}
                >
                  <span style={{ fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 14px)', color: WALNUT }}>{row.label}</span>
                  <span style={bodyText}>{row.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <SectionRule />
        <SectionHead>Registers it serves</SectionHead>
        <div className="grid grid-cols-1 sm:grid-cols-3" style={{ marginTop: '10px', border: `1px solid ${HAIR_STRONG}`, background: PAPER }}>
          {registers.map((reg, i) => (
            <div key={reg.title} style={{ padding: '12px 14px 14px', borderLeft: i > 0 ? `1px solid ${HAIR}` : 'none' }}>
              <div style={{ fontFamily: SERIF, fontSize: '15.5px', color: reg.muted ? FAINT : WALNUT }}>{reg.title}</div>
              <div style={{ marginTop: '6px', fontFamily: BODY, fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.5, color: reg.muted ? MUTED : INK }}>{reg.note}</div>
            </div>
          ))}
        </div>

        <SectionRule />
        <SectionHead
          right={
            makers.length > 0 ? (
              <span style={{ ...mono(8.5, FAINT), letterSpacing: '0.1em' }}>
                {makers.length} of {makerTotal}
              </span>
            ) : undefined
          }
        >
          Makers Beau rates for it
        </SectionHead>
        {makers.length > 0 ? (
          <>
            <div className="flex flex-wrap" style={{ marginTop: '10px', gap: '8px' }}>
              {makers.slice(0, 5).map((m) => (
                <Chip key={m.profile.brand} name={m.profile.brand} suffix={m.rating} />
              ))}
              {makers.length > 5 && (
                <span className="inline-flex items-center" style={{ padding: '7px 4px', fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 14.5px)', color: ACCENT_DEEP }}>
                  All {numberWord(makers.length)} →
                </span>
              )}
            </div>
            <p style={{ margin: '10px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY, maxWidth: '64ch' }}>
              It stays a list of who makes it well, not a recommendation to buy one — for a pick ranked against
              your dossier, ask Beau in the chat.
            </p>
          </>
        ) : (
          <p style={{ margin: '10px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY }}>
            No maker in the directory is rated for it yet — add one in the makers index and Beau reads it.
          </p>
        )}

        <LedgerRow
          logged={!!ownedSwatches}
          swatches={ownedSwatches}
          right={<span style={{ ...mono(8.5, FAINT), letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Read {seconds} seconds</span>}
        />
      </div>
      <PanelFooterNav
        prevName={prevName}
        nextName={nextName}
        centreLabel={`All ${category.name.toLowerCase()} · ${position.total}`}
        onPrev={onPrev}
        onNext={onNext}
      />
    </IndexDetailOverlay>
  );
}

// ---------------------------------------------------------------------------
// THE MAKER ENTRY (8a, middle + right panels — rated and unrated).
// ---------------------------------------------------------------------------

function TierBadge({ rating }: { rating: BeauRating | null }) {
  return (
    <span
      className="flex-shrink-0"
      style={{
        ...mono(8.5, rating ? SECONDARY : MUTED),
        letterSpacing: '0.12em',
        padding: '7px 12px',
        border: rating ? `1px solid ${HAIR_STRONG}` : '1px dashed rgba(59,43,29,0.4)',
        background: rating ? PAPER : 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      {rating || 'Unrated'}
    </span>
  );
}

/** The accent-ruled statement box — WHY THE TIER / YOUR NOTE (8a). */
function StatementBox({ label, children, footer }: { label: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div style={{ marginTop: '16px', background: PAPER, borderLeft: `3px solid ${ACCENT}`, padding: '13px 16px 14px' }}>
      <div style={{ ...mono(8.5, ACCENT_DEEP), letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ marginTop: '7px', ...bodyText, fontSize: 'max(var(--eth-body, 0px), 14px)' }}>{children}</div>
      {footer && <div style={{ marginTop: '9px' }}>{footer}</div>}
    </div>
  );
}

export function MakerDetailPanel({
  entry,
  rawRow,
  userNote,
  scopeLabel,
  position,
  prevName,
  nextName,
  pieceTotal,
  makerTotal,
  pieces,
  onPrev,
  onNext,
  onClose,
  onReRead,
  onRemoved,
}: {
  entry: DirectoryEntry;
  /** The stored directory row, when this maker is an addition. */
  rawRow: DirectoryBrandRow | null;
  /** The wearer's own note off the brand ledger, when one exists. */
  userNote: string | null;
  /** "England" for a catalog maker · "Added by you" for an addition. */
  scopeLabel: string;
  position: { index: number; total: number };
  prevName: string | null;
  nextName: string | null;
  pieceTotal: number;
  makerTotal: number;
  pieces: WardrobePiece[];
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Refresh hook after "Ask Beau to read it" files a fresh dossier. */
  onReRead?: () => void;
  /** Called once the maker has left the index — the panel's caller closes
   * itself and re-reads the directory. */
  onRemoved?: () => void;
}) {
  usePlexMono();
  const p = entry.profile;
  const isAddition = entry.source !== 'catalog';
  // UNRATED IS A RESTING STATE (8a): a user addition whose row carries no
  // stored rating and whose dossier is still the stub reads as unrated.
  const unrated = isAddition && !normalizeBeauRating(rawRow?.rating) && (p.generated === true && p.construction === '—');
  const [askBusy, setAskBusy] = useState(false);
  const [askDone, setAskDone] = useState(false);
  const [leftUnrated, setLeftUnrated] = useState(false);
  // REMOVE THE MAKER (founder's per-row delete, also here): one tap arms it,
  // the second removes — in place, never a dialog over the panel.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const ownedFromMaker = useMemo(
    () => pieces.filter((piece) => (piece.brand || '').trim().toLowerCase() === p.brand.trim().toLowerCase()),
    [pieces, p.brand],
  );

  const shopUrl = p.websiteUrl || verifiedBrandWebsiteUrl(p.brand);
  const notStated = (v: string | null | undefined) => {
    const t = (v || '').trim();
    return t && t !== '—' ? t : '';
  };

  const origin = notStated(p.country) ? `${p.country}${p.founded ? ` · since ${p.founded}` : ''}` : 'Not stated';
  const priceTier = `${PRICE_TIER_LABELS[p.priceBand] || 'Mid'} · ${PRICE_BAND_SYMBOL[p.priceBand] || '££'}`;
  const construction = notStated(p.construction) || 'Not stated';
  const material = p.materials.length > 0 ? p.materials.slice(0, 2).join(' · ') : 'Not stated';

  const factCells = unrated
    ? [
        { label: 'Origin', value: origin, source: origin === 'Not stated' ? 'Nowhere on the site' : 'Read off their site' },
        { label: 'Price tier', value: priceTier, source: 'Read off their site' },
        { label: 'Construction', value: construction, source: construction === 'Not stated' ? 'Nowhere on the site' : 'Read off their site' },
        { label: 'Material signal', value: material, source: material === 'Not stated' ? 'Nowhere on the site' : 'From your file' },
      ]
    : [
        { label: 'Origin', value: origin },
        { label: 'Price tier', value: priceTier },
        { label: 'Construction', value: construction },
        { label: 'Material signal', value: material },
      ];

  const knownFor = p.signaturePieces.slice(0, 4);
  const howTheyRun = notStated(p.sizingNote);
  const caveat = notStated(p.longevity?.note) || notStated(p.constructionNote);

  const subtitle = unrated
    ? 'Yours. Beau hasn’t read this one yet, so he says nothing about it.'
    : notStated(p.description) || 'A maker in the directory — the file below is Beau’s read.';

  const noteDate = rawRow?.created_at
    ? new Date(rawRow.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  const removeMaker = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await removeDirectoryBrand(p.brand);
      onRemoved?.();
    } catch (e) {
      console.warn('[Ethaion] could not remove the maker:', e);
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const askBeau = async () => {
    if (askBusy || askDone) return;
    setAskBusy(true);
    try {
      await addUserDirectoryBrand(p.brand);
      setAskDone(true);
      onReRead?.();
    } catch {
      /* the resting state stands */
    } finally {
      setAskBusy(false);
    }
  };

  return (
    <IndexDetailOverlay onClose={onClose} onPrev={prevName ? onPrev : undefined} onNext={nextName ? onNext : undefined} ariaLabel={`${p.brand} — the maker entry`}>
      <PanelTopBar
        active="makers"
        pieceCount={pieceTotal}
        makerCount={makerTotal}
        positionLabel={`${scopeLabel} · ${position.index + 1} of ${position.total}`}
        onClose={onClose}
      />
      <div style={{ padding: '20px 22px 4px' }}>
        <div style={{ ...mono(8.5, FAINT), letterSpacing: '0.12em' }}>
          Makers · {scopeLabel} · {p.brand}
        </div>

        <div className="flex items-start justify-between gap-4" style={{ marginTop: '10px' }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px, 5.5vw, 40px)', fontWeight: 400, lineHeight: 1.06, letterSpacing: '-0.01em', color: WALNUT }}>
            {p.brand}
          </h2>
          <span style={{ paddingTop: '10px' }}>
            <TierBadge rating={unrated ? null : entry.rating} />
          </span>
        </div>
        <p style={{ margin: '8px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '16.5px', lineHeight: 1.4, color: SECONDARY, maxWidth: '52ch' }}>
          {subtitle}
        </p>

        {/* WHY THE TIER (rated) · YOUR NOTE (unrated). */}
        {unrated ? (
          <StatementBox
            label="Your note"
            footer={
              <span className="inline-flex items-baseline" style={{ gap: '14px' }}>
                <span style={{ ...mono(8, ACCENT_DEEP), letterSpacing: '0.1em' }}>Added by you{noteDate ? ` · ${noteDate}` : ''}</span>
              </span>
            }
          >
            {userNote ? `“${userNote}”` : 'No note on file — add one from the directory row and it travels with the maker.'}
          </StatementBox>
        ) : (
          <StatementBox label="Why the tier">{entry.ratingNote || 'No rationale recorded.'}</StatementBox>
        )}

        <FactsTable cells={factCells} />
        {unrated && (
          <p style={{ margin: '10px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY, maxWidth: '66ch' }}>
            Every field says where it came from — your file, their site, or nowhere. An unrated entry is only
            trustworthy if it’s clear which parts nobody has checked.
          </p>
        )}

        <SectionRule />
        <SectionHead
          right={!unrated ? <span style={{ ...mono(8.5, ACCENT_DEEP), letterSpacing: '0.1em' }}>Piece types →</span> : undefined}
        >
          {unrated ? 'They say they’re known for' : 'Known for'}
        </SectionHead>
        {knownFor.length > 0 ? (
          <>
            <div className="flex flex-wrap" style={{ marginTop: '10px', gap: '8px' }}>
              {knownFor.map((piece) => (
                <Chip key={piece} name={piece} dashed={unrated} />
              ))}
            </div>
            <p style={{ margin: '10px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY, maxWidth: '66ch' }}>
              {unrated
                ? 'Dashed, because this came from their own copy. A rated maker’s chips are solid — Beau agreed with them.'
                : 'Each one is a type in the piece index — the index lists this maker back under it.'}
            </p>
          </>
        ) : (
          <p style={{ margin: '10px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY }}>
            Nothing on file yet{unrated ? ' — their own copy names no specialities.' : '.'}
          </p>
        )}

        {unrated ? (
          <>
            <SectionRule />
            <SectionHead>What a rating would need</SectionHead>
            <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
              {[
                'How their pieces are made — nothing on file says, and it’s the difference between two tiers.',
                'Whether what you noted holds across seasons, or was one run.',
              ].map((line, i) => (
                <li key={line} className="grid grid-cols-[22px_minmax(0,1fr)]" style={{ gap: '10px', padding: '5px 0' }}>
                  <span style={{ ...mono(9, ACCENT_DEEP) }}>{i + 1}</span>
                  <span style={bodyText}>{line}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center flex-wrap" style={{ marginTop: '12px', gap: '14px' }}>
              {!leftUnrated && (
                <button
                  type="button"
                  onClick={() => void askBeau()}
                  disabled={askBusy || askDone}
                  className="inline-flex items-center gap-2 hover:opacity-85 disabled:opacity-50"
                  style={{ padding: '9px 16px', border: `1px solid ${ACCENT}`, background: 'transparent', fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 14.5px)', color: ACCENT_DEEP }}
                >
                  {askBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {askDone ? 'Beau is reading it' : 'Ask Beau to read it'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setLeftUnrated(true)}
                className="hover:underline"
                style={{ background: 'transparent', fontFamily: SERIF, fontSize: 'max(var(--eth-serif, 0px), 14.5px)', color: MUTED }}
              >
                {leftUnrated ? 'Left unrated' : 'Leave it unrated'}
              </button>
            </div>
            <p style={{ margin: '12px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY, maxWidth: '66ch' }}>
              Unrated is a resting state, not an error. Leaving it is a real choice — the maker still surfaces when
              it answers a gap, carrying your note instead of his tier.
            </p>
          </>
        ) : (
          <>
            <SectionRule />
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: '4px 28px' }}>
              <div>
                <SectionHead>How they run</SectionHead>
                <p style={{ margin: '8px 0 0', ...bodyText }}>
                  {howTheyRun || 'No fit read on file yet — tell Beau how they ran for you and it lands here.'}
                </p>
              </div>
              <div>
                <SectionHead>Where Beau doesn’t follow</SectionHead>
                <p style={{ margin: '8px 0 0', ...bodyText }}>
                  {caveat || 'No caveat on file — the tier covers the range as a whole.'}
                </p>
              </div>
            </div>
          </>
        )}

        <LedgerRow
          logged={ownedFromMaker.length > 0}
          right={
            shopUrl ? (
              <a
                href={shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ ...mono(8.5, ACCENT_DEEP), letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
              >
                Their own shop →
              </a>
            ) : undefined
          }
        />
        {ownedFromMaker.length > 0 && (
          <p style={{ margin: '4px 0 0', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: SECONDARY }}>
            {capWord(numberWord(ownedFromMaker.length))} piece{ownedFromMaker.length === 1 ? '' : 's'} of theirs in your
            Ledger — {ownedFromMaker.slice(0, 3).map((piece) => piece.name).join(' · ')}
            {ownedFromMaker.length > 3 ? ' · …' : ''}.
          </p>
        )}

        {/* REMOVE FROM THE INDEX — the same act as the trash on the directory
            row, said quietly at the foot of the entry. A catalog maker is
            held out of the wearer's index, never deleted from the catalog,
            and re-adding it brings it straight back. */}
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${HAIR}` }}>
          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="hover:underline"
              style={{ background: 'transparent', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: MUTED }}
            >
              Remove {p.brand} from my index ›
            </button>
          ) : (
            <span className="inline-flex items-baseline flex-wrap" style={{ gap: '14px' }}>
              <span style={{ ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: INK }}>
                {isAddition ? 'Remove it for good?' : 'Hold it out of your index?'}
              </span>
              <button
                type="button"
                onClick={() => void removeMaker()}
                disabled={removing}
                className="hover:underline disabled:opacity-50"
                style={{ background: 'transparent', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: ACCENT_DEEP }}
              >
                {removing ? 'Removing…' : 'Yes, remove it'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={removing}
                className="hover:underline disabled:opacity-50"
                style={{ background: 'transparent', ...bodyText, fontSize: 'max(var(--eth-label, 0px), 12.5px)', color: MUTED }}
              >
                Keep
              </button>
            </span>
          )}
        </div>
      </div>
      <PanelFooterNav
        prevName={prevName}
        nextName={nextName}
        centreLabel={`${scopeLabel === 'Added by you' ? 'Added by you' : `All ${scopeLabel} makers`} · ${position.total}`}
        onPrev={onPrev}
        onNext={onNext}
      />
    </IndexDetailOverlay>
  );
}
