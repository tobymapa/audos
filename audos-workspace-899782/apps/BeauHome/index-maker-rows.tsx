/**
 * THE INDEX · MAKERS · THE FURNITURE — the small controls and the reads the
 * Makers face is assembled from, kept beside the table rather than inside it
 * so the face itself stays readable.
 *
 * Also holds THE PER-TYPE BENCH (makersForCategory): the founder's rule that
 * a piece row's arrow must always land on a real list — AT LEAST TEN quality
 * makers for the kind of piece it is. The canon's own type→maker links are
 * read first, then the catalog's per-brand category map, and if the two
 * together still name fewer than ten the bench is topped up with the
 * best-rated houses whose registers and materials serve that category. The
 * count is never faked: when the whole file genuinely holds fewer, the face
 * says how many it found.
 */
import { useState } from 'react';
import type React from 'react';
import {
  BRAND_DIRECTORY,
  brandCategoryIds,
  verifiedBrandWebsiteUrl,
  type BrandProfile,
  type DirectoryEntry,
} from './brands';
import { INDEX_GARMENT_TYPES, type GarmentCategoryId, type GarmentType } from './garment-types';
import { FIELD_REGISTER_LABELS, matchGarmentTypeId } from './index-model';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  PAPER,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';

export const DEEP = '#5c3413';
export const ROW_RULE = '1px solid rgba(59,43,29,0.12)';
const MIDDOT = ' \u00b7 ';

// ---------------------------------------------------------------------------
// Beau's five reads of a house
// ---------------------------------------------------------------------------

export type MakerRead = 'buy-first' | 'sound' | 'special-case' | 'not-for-you' | 'unread';

export const READ_ORDER: MakerRead[] = ['buy-first', 'sound', 'special-case', 'not-for-you', 'unread'];

export const READ_LABELS: Record<MakerRead, string> = {
  'buy-first': 'Buy first',
  sound: 'Sound',
  'special-case': 'Special case',
  'not-for-you': 'Not for you',
  unread: 'Unread',
};

export const READ_BLURBS: Record<MakerRead, string> = {
  'buy-first': 'The house to go to before the others',
  sound: 'Will not disappoint; not the sharpest answer for you',
  'special-case': 'Right for one piece or one occasion only',
  'not-for-you': 'Wrong price, cut or climate for your wardrobe',
  unread: 'Added but not yet read',
};

export const READ_COLORS: Record<MakerRead, string> = {
  'buy-first': ACCENT_DEEP,
  sound: SECONDARY,
  'special-case': '#96631f',
  'not-for-you': '#8a3a2e',
  unread: FAINT,
};

/** A stub row — named but Beau has not pulled the file on it yet. */
export function isStubProfile(p: BrandProfile): boolean {
  return (p.priceRangeLabel === '\u2014' || !p.priceRangeLabel) && (p.materials || []).length === 0;
}

export function readOf(entry: DirectoryEntry): MakerRead {
  if (isStubProfile(entry.profile)) return 'unread';
  if (entry.rating === 'Excellent') return 'buy-first';
  if (entry.rating === 'Reliable') return 'sound';
  if (entry.rating === 'Inconsistent') return 'special-case';
  if (entry.rating === 'Avoid') return 'not-for-you';
  return 'unread';
}

/** “Mid (£150–400)” becomes “£150–400”; a bespoke label passes through. */
export function priceNewOf(p: BrandProfile): string {
  const label = (p.priceRangeLabel || '').trim();
  if (!label || label === '\u2014') return '\u2014';
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : label;
}

export type Stocked = 'ships-online' | 'travel';

export function stockedOf(p: BrandProfile): Stocked {
  return p.websiteUrl || verifiedBrandWebsiteUrl(p.brand) ? 'ships-online' : 'travel';
}

export const STOCKED_LABELS: Record<Stocked, string> = {
  'ships-online': 'Ships online',
  travel: 'Travel to buy',
};

// ---------------------------------------------------------------------------
// What a house makes
// ---------------------------------------------------------------------------

/** maker name (lowercased) to the categories on file: the canon's own
 * type→maker links merged with the catalog's per-brand category map. */
const MAKER_CATEGORIES: Map<string, Set<GarmentCategoryId>> = (() => {
  const map = new Map<string, Set<GarmentCategoryId>>();
  const add = (name: string, cat: GarmentCategoryId) => {
    const key = name.toLowerCase();
    const set = map.get(key) || new Set<GarmentCategoryId>();
    set.add(cat);
    map.set(key, set);
  };
  for (const t of INDEX_GARMENT_TYPES) {
    for (const m of t.makers) add(m, t.category);
  }
  for (const b of BRAND_DIRECTORY) {
    for (const id of brandCategoryIds(b.brand)) add(b.brand, id as GarmentCategoryId);
  }
  return map;
})();

const MAKER_CATS_CACHE = new Map<string, Set<GarmentCategoryId>>();

/** The categories ONE maker is on file for. A house outside the merged map
 * (a reader's own addition, a Beau discovery) is read from its own dossier:
 * its reference piece and signature pieces matched to the garment canon. */
export function makerCategorySet(p: BrandProfile): Set<GarmentCategoryId> {
  const key = p.brand.toLowerCase();
  const cached = MAKER_CATS_CACHE.get(key);
  if (cached) return cached;
  const set = new Set<GarmentCategoryId>(MAKER_CATEGORIES.get(key) || []);
  if (set.size === 0) {
    for (const text of [p.referenceFor || '', ...(p.signaturePieces || [])]) {
      if (!text) continue;
      const typeId = matchGarmentTypeId({ name: text });
      const t = typeId ? INDEX_GARMENT_TYPES.find((x) => x.id === typeId) : null;
      if (t && t.category !== 'other') set.add(t.category);
    }
  }
  // An empty read is never cached — a stub gains its dossier later, and
  // should gain its categories with it.
  if (set.size > 0) MAKER_CATS_CACHE.set(key, set);
  return set;
}

/** How many quality makers a piece type's arrow must land on. */
export const MIN_MAKERS_PER_TYPE = 10;

const RATING_RANK: Record<string, number> = { Excellent: 0, Reliable: 1, Inconsistent: 2, Avoid: 3 };

function qualityRank(e: DirectoryEntry): number {
  const score = Number.isFinite(e.profile.qualityScore) ? e.profile.qualityScore : 5;
  return (RATING_RANK[e.rating] ?? 2) * 10 - score;
}

export interface TypeBench {
  entries: DirectoryEntry[];
  /** Named on the type's own record, or on the catalog's category map. */
  onFile: number;
  /** True when the bench had to be widened to reach the minimum. */
  widened: boolean;
}

/**
 * THE BENCH ONE PIECE TYPE POINTS AT. The type's own verified makers and the
 * whole category's houses come first, best-rated leading; if together they
 * name fewer than ten, the bench widens to the best-rated houses that serve
 * the same registers, so the arrow never lands on a two-row list.
 */
export function makersForCategory(
  entries: DirectoryEntry[],
  category: GarmentCategoryId | null,
  type: GarmentType | null,
): TypeBench {
  if (!category) return { entries: [], onFile: 0, widened: false };
  const named = new Set((type ? type.makers : []).map((m) => m.toLowerCase()));
  const onFile: DirectoryEntry[] = [];
  const rest: DirectoryEntry[] = [];
  for (const e of entries) {
    const key = e.profile.brand.toLowerCase();
    if (named.has(key) || makerCategorySet(e.profile).has(category)) onFile.push(e);
    else rest.push(e);
  }
  onFile.sort((a, b) => {
    const aNamed = named.has(a.profile.brand.toLowerCase()) ? 0 : 1;
    const bNamed = named.has(b.profile.brand.toLowerCase()) ? 0 : 1;
    if (aNamed !== bNamed) return aNamed - bNamed;
    return qualityRank(a) - qualityRank(b) || a.profile.brand.localeCompare(b.profile.brand);
  });
  if (onFile.length >= MIN_MAKERS_PER_TYPE) return { entries: onFile, onFile: onFile.length, widened: false };
  // Widen by register overlap, still best-rated first — never by price alone.
  const reach = new Set((type ? type.reach : []).map((r) => String(r)));
  const near = rest
    .filter((e) => !isStubProfile(e.profile))
    .filter((e) => (reach.size === 0 ? true : (e.profile.registers || []).some((r) => reach.has(String(r)))))
    .sort((a, b) => qualityRank(a) - qualityRank(b) || a.profile.brand.localeCompare(b.profile.brand));
  const topped = [...onFile];
  for (const e of near) {
    if (topped.length >= MIN_MAKERS_PER_TYPE) break;
    topped.push(e);
  }
  return { entries: topped, onFile: onFile.length, widened: topped.length > onFile.length };
}

// ---------------------------------------------------------------------------
// The controls
// ---------------------------------------------------------------------------

/** The small square-cornered mono control (Reset filters, Upload a list…). */
export function MonoButton({
  children,
  onClick,
  solid = false,
  dim = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  solid?: boolean;
  dim?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="transition-colors flex-shrink-0"
      style={{
        ...mono(8.5, solid ? '#f6f0e5' : dim ? FAINTER : SECONDARY),
        background: solid ? WALNUT : 'transparent',
        border: '1px solid ' + (solid ? WALNUT : dim ? HAIRLINE : RULE),
        padding: '8px 13px',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** One drop-down filter — a mono button opening a tick list. */
export function FilterMenu({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  active: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const held = active.length > 0;
  if (options.length === 0) return null;
  return (
    <div style={{ position: 'relative' }} className="flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="transition-colors"
        style={{
          ...mono(8.5, held ? DEEP : SECONDARY),
          background: held ? 'rgba(168,113,44,0.12)' : 'transparent',
          border: '1px solid ' + (held ? ACCENT_DEEP : RULE),
          padding: '8px 12px',
          whiteSpace: 'nowrap',
        }}
      >
        {held ? label + ' \u00b7 ' + active.length : label}
        <span style={{ color: FAINTER, letterSpacing: 0 }}> {'\u2304'}</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 41,
              background: PAPER,
              border: '1px solid ' + RULE,
              boxShadow: '0 12px 30px rgba(43,30,20,0.18)',
              minWidth: '204px',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '5px 0',
            }}
          >
            {options.map((o) => {
              const on = active.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onToggle(o.id)}
                  className="w-full text-left hover:bg-[rgba(168,113,44,0.07)] transition-colors"
                  style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7.5px 13px', background: 'transparent' }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: '10px',
                      height: '10px',
                      flexShrink: 0,
                      border: '1px solid ' + (on ? ACCENT_DEEP : RULE),
                      background: on ? ACCENT_DEEP : 'transparent',
                    }}
                  />
                  <span style={mono(8.5, on ? DEEP : SECONDARY)}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The FIND line — a bordered input with the mono prefix. */
export function FindLine({
  value,
  onChange,
  placeholder,
  maxWidth = '320px',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxWidth?: string;
}) {
  return (
    <label className="flex items-center min-w-0 flex-1" style={{ gap: '12px', border: '1px solid ' + RULE, padding: '8px 12px', maxWidth }}>
      <span style={mono(8.5, FAINT)}>Find</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
        style={{ ...body(13.5, INK), lineHeight: 1.3 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear the search" style={{ ...mono(9, FAINT), background: 'transparent' }}>
          {'\u00d7'}
        </button>
      )}
    </label>
  );
}

export type SortCol = 'rank' | 'maker' | 'where' | 'defines' | 'price' | 'stocked' | 'read';

export interface SortState {
  col: SortCol;
  dir: 1 | -1;
}

/** Every column head sorts — ascending, then descending. */
export function SortHead({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (col: SortCol) => void;
}) {
  const active = sort.col === col;
  const arrow = active ? (sort.dir === 1 ? ' \u2191' : ' \u2193') : '';
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      title={'Sort by ' + label.toLowerCase()}
      className="text-left hover:opacity-70 transition-opacity"
      style={{ ...mono(7.5, active ? ACCENT_DEEP : FAINT), background: 'transparent', padding: 0, whiteSpace: 'nowrap' }}
    >
      {label + arrow}
    </button>
  );
}

export function FavStar({ active, onToggle, brand }: { active: boolean; onToggle: () => void; brand: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={(active ? 'Unfavourite ' : 'Favourite ') + brand}
      title={active ? 'A favourite \u2014 tap to release' : 'Mark a favourite'}
      className="transition-opacity hover:opacity-70"
      style={{ background: 'transparent', padding: 0, fontSize: '13px', lineHeight: 1, color: active ? ACCENT_DEEP : FAINTER }}
    >
      {active ? '\u2605' : '\u2606'}
    </button>
  );
}

export function TickBox({ on, disabled, onToggle, brand }: { on: boolean; disabled: boolean; onToggle: () => void; brand: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !on}
      aria-pressed={on}
      aria-label={(on ? 'Drop ' : 'Hold ') + brand + ' for comparison'}
      className="transition-colors"
      style={{
        width: '13px',
        height: '13px',
        border: '1px solid ' + (on ? ACCENT_DEEP : RULE),
        background: on ? ACCENT_DEEP : 'transparent',
        opacity: disabled && !on ? 0.4 : 1,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on && <span style={{ color: '#f6f0e5', fontSize: '9px', lineHeight: 1 }}>{'\u2713'}</span>}
    </button>
  );
}

/** The house's full entry, opened inline by its name. */
export function MakerEntry({
  entry,
  categories,
  why,
  rank,
}: {
  entry: DirectoryEntry;
  categories: string[];
  /** Beau's own justification for THIS reader, when the house is a pick. */
  why: string | null;
  rank: number | null;
}) {
  const p = entry.profile;
  const site = p.websiteUrl || verifiedBrandWebsiteUrl(p.brand);
  const stub = isStubProfile(p);
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Makes', value: categories.length > 0 ? categories.join(MIDDOT) : '\u2014' },
    { label: 'Registers', value: (p.registers || []).map((r) => FIELD_REGISTER_LABELS[r] || r).join(MIDDOT) || '\u2014' },
    { label: 'Materials', value: (p.materials || []).join(MIDDOT) || '\u2014' },
    { label: 'Construction', value: p.construction && p.construction !== '\u2014' ? p.construction + MIDDOT + p.constructionQuality : '\u2014' },
    { label: 'Quality', value: Number.isFinite(p.qualityScore) && !stub ? p.qualityScore + '/10' : '\u2014' },
    { label: 'Signature pieces', value: (p.signaturePieces || []).slice(0, 4).join(MIDDOT) || '\u2014' },
    { label: 'Price, new', value: p.priceRangeLabel && p.priceRangeLabel !== '\u2014' ? p.priceRangeLabel : '\u2014' },
    { label: 'Sizing', value: p.sizingNote || '\u2014' },
  ];
  return (
    <div style={{ padding: '12px 6px 16px', borderBottom: ROW_RULE, background: 'rgba(251,248,241,0.6)' }}>
      {why && (
        <div style={{ margin: '0 0 10px', maxWidth: '70ch' }}>
          <span style={{ ...mono(7, ACCENT_DEEP), display: 'block', marginBottom: '3px' }}>
            {rank != null ? 'Why Beau lists it \u00b7 no. ' + rank : 'Why Beau lists it'}
          </span>
          <p style={{ ...body(13.5, INK), margin: 0 }}>{why}</p>
        </div>
      )}
      {p.description && !stub && <p style={{ ...body(13.5, INK), margin: '0 0 10px', maxWidth: '70ch' }}>{p.description}</p>}
      {entry.ratingNote && <p style={{ ...body(12.5, SECONDARY), margin: '0 0 10px', maxWidth: '70ch' }}>{entry.ratingNote}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: '9px 24px' }}>
        {facts.map((f) => (
          <div key={f.label}>
            <span style={{ ...mono(7.5, FAINT), display: 'block', marginBottom: '2px' }}>{f.label}</span>
            <span style={body(13, INK)}>{f.value}</span>
          </div>
        ))}
      </div>
      {site && (
        <a
          href={site}
          target="_blank"
          rel="noreferrer"
          className="inline-block hover:opacity-70 transition-opacity"
          style={{ ...mono(8, ACCENT_DEEP), marginTop: '11px' }}
        >
          {'The maker\u2019s own site \u2192'}
        </a>
      )}
    </div>
  );
}

/** The held houses, side by side. */
export function CompareSheet({
  entries,
  ledger,
  onClose,
}: {
  entries: DirectoryEntry[];
  ledger: Set<string>;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; of: (e: DirectoryEntry) => string }> = [
    { label: 'Where', of: (e) => [e.profile.city, e.profile.country].filter((v) => v && v !== '\u2014').join(', ') || '\u2014' },
    { label: 'Since', of: (e) => (e.profile.founded ? String(e.profile.founded) : '\u2014') },
    { label: 'What defines them', of: (e) => (isStubProfile(e.profile) ? '\u2014' : e.profile.description || '\u2014') },
    { label: 'Price, new', of: (e) => priceNewOf(e.profile) },
    { label: 'Stocked', of: (e) => STOCKED_LABELS[stockedOf(e.profile)] },
    { label: 'Beau\u2019s read', of: (e) => READ_LABELS[readOf(e)] },
    { label: 'Quality', of: (e) => (Number.isFinite(e.profile.qualityScore) && !isStubProfile(e.profile) ? e.profile.qualityScore + '/10' : '\u2014') },
    { label: 'Signature pieces', of: (e) => (e.profile.signaturePieces || []).slice(0, 3).join(MIDDOT) || '\u2014' },
    { label: 'On your rail', of: (e) => (ledger.has(e.profile.brand.toLowerCase()) ? 'Yes' : '\u2014') },
  ];
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '4px 0 14px' }}>
        <span style={mono(8, FAINT)}>
          {entries.length + ' makers, side by side \u2014 the columns hold still so the rows can disagree'}
        </span>
        <MonoButton onClick={onClose}>{'\u2190 Back to the list'}</MonoButton>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: '118px repeat(' + entries.length + ', minmax(168px, 1fr))',
            minWidth: 118 + entries.length * 168 + 'px',
            borderTop: '1px solid ' + RULE,
          }}
        >
          <span aria-hidden style={{ borderBottom: ROW_RULE, padding: '12px 8px 10px' }} />
          {entries.map((e) => (
            <span key={e.profile.brand} style={{ ...serif(19, WALNUT), borderBottom: ROW_RULE, padding: '12px 10px 10px', lineHeight: 1.2 }}>
              {e.profile.brand}
            </span>
          ))}
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <span style={{ ...mono(7.5, FAINT), borderBottom: ROW_RULE, padding: '10px 8px' }}>{row.label}</span>
              {entries.map((e) => (
                <span key={e.profile.brand} style={{ ...body(13, INK), borderBottom: ROW_RULE, padding: '10px', lineHeight: 1.45 }}>
                  {row.of(e)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
