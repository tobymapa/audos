/**
 * THE COVERAGE MAP — registers × foundation categories (design handoff 6a,
 * rebuilt from the Milestones overhaul Part 3b version).
 *
 * Columns are the three REGISTERS — Casual | Smart-Casual | Formal.
 * Rows are the foundation categories in the app's canonical menswear order.
 * FOUR cell states (6a — up from covered-or-gap):
 *   · COVERED — names the pieces that cover it, in the user's own words.
 *   · GAP — NAMES WHAT'S MISSING (“No smart-casual shoe”, never “Gap ›”),
 *     the top three carry their rank, and the FIRST gets the page's one
 *     solid accent border. Tapping a gap leads to THE HUNT, pre-filled —
 *     under the corrected IA the Rail is gone.
 *   · DOESN'T APPLY — a sweatshirt is not a formal gap. Sensible defaults
 *     plus a per-cell toggle, so the map never scores a category against a
 *     register it has no business in.
 *   · MUTED — a whole register can be muted (“you don't dress formal”):
 *     the column dims, its rows drop from the counts, and it reads
 *     “none · muted” — never “0 of 12”. Beau holds no opinion about it.
 *
 * GAP RANKING — register weight (how much of the wardrobe lives there — the
 * lived-frequency proxy) × category centrality (a missing shoe holds more
 * outfits back than a missing sweatshirt).
 *
 * MOBILE (Mobile spec M4): the three-column matrix cannot be a phone
 * screen — below 640px the map renders ONE REGISTER AT A TIME behind a
 * segmented control, each category a row carrying its own state and note.
 *
 * Built from LAYER 1's semantic tags — no extra model call. THE USER'S
 * LABELS ARE SACRED: every covered cell quotes his own words for the piece.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { typography } from '../../lib/colors';
import { label, promoteToScout, type StyleProfile, type WardrobePiece } from './profile-data';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';
import { SAGE, TicketFrame, coveredBoxStyle, dashedBoxStyle } from './ticket-frame';
import { sortByCategoryOrder } from './category-order';
import {
  MUTED_STORE_KEY,
  NA_STORE_KEY,
  fetchCoveragePrefs,
  loadLocalJson,
  writeMutedPref,
  writeNaPref,
} from './coverage-prefs';

// Rows, in the app's canonical menswear order — worn garments first, then
// shoes, then accessories (which carries bags and headwear too).
const COVERAGE_ROWS: Array<{ canonical: string; label: string; categoryIds: string[] }> = sortByCategoryOrder(
  [
    { canonical: 'Tops', label: 'Tops', categoryIds: ['tops', 'base-layers'] },
    { canonical: 'Bottoms', label: 'Bottoms', categoryIds: ['bottoms'] },
    { canonical: 'Shoes', label: 'Shoes', categoryIds: ['shoes'] },
    { canonical: 'Outerwear', label: 'Outerwear', categoryIds: ['outerwear'] },
    { canonical: 'Knitwear', label: 'Knitwear', categoryIds: ['knitwear'] },
    { canonical: 'Sweatshirts', label: 'Sweatshirts', categoryIds: ['sweatshirts'] },
    { canonical: 'Formalwear', label: 'Formalwear', categoryIds: ['formalwear'] },
    { canonical: 'Accessories', label: 'Accessories', categoryIds: ['accessories', 'bags', 'hats'] },
  ],
  (row) => row.categoryIds[0],
);

const REGISTERS = [
  { id: 'casual', label: 'Casual' },
  { id: 'smart-casual', label: 'Smart-Casual' },
  { id: 'formal', label: 'Formal' },
] as const;

export type RegisterId = (typeof REGISTERS)[number]['id'];

const ARCHETYPE_PROMPT_NAMES: Record<string, string> = {
  ivy: 'Classic Ivy',
  country: 'British Country',
  continental: 'Continental',
  relaxed: 'Smart Casual',
  sportsman: 'American Outdoors',
  workwear: 'Workwear',
  military: 'Military/Utility',
  nautical: 'Coastal/Nautical',
  riviera: 'Mediterranean/Riviera',
};

function archetypeName(id: string): string {
  return ARCHETYPE_PROMPT_NAMES[(id || '').toLowerCase()] || label.archetype(id) || id;
}

/** The register an owned piece serves — from its Layer 1 formality tag,
 * with the piece's own occasion tags as the fallback for untagged rows. */
export function registerOf(piece: WardrobePiece, tag: SemanticTags | undefined): RegisterId {
  const level = (tag?.formalityLevel || '').toLowerCase();
  if (level === 'formal') return 'formal';
  if (level === 'smart-casual') return 'smart-casual';
  if (level === 'casual' || level === 'rugged') return 'casual';
  const occ = (piece.occasions || []).map((o) => o.toLowerCase());
  if (occ.includes('formal') || occ.includes('business')) return 'formal';
  if (occ.includes('smart-casual')) return 'smart-casual';
  return 'casual';
}

export function rowFor(piece: WardrobePiece, tag: SemanticTags | undefined): string | null {
  const canonical = tag?.canonicalCategory || '';
  for (const row of COVERAGE_ROWS) {
    const belongs = canonical
      ? canonical.toLowerCase() === row.canonical.toLowerCase() ||
        (row.canonical === 'Tops' && /base layer/i.test(canonical)) ||
        (row.canonical === 'Accessories' && /(bag|hat|headwear)/i.test(canonical))
      : row.categoryIds.includes(piece.category);
    if (belongs) return row.canonical;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gap language + ranking (6a): every open cell NAMES what's missing, and
// the top three carry a rank.
// ---------------------------------------------------------------------------

/** The noun each row's gap names — “No smart-casual shoe”, “No casual
 * trousers”. Singular where a single piece closes the gap. */
const GAP_NOUNS: Record<string, string> = {
  Tops: 'shirt or top',
  Bottoms: 'trousers',
  Shoes: 'shoe',
  Outerwear: 'outer layer',
  Knitwear: 'knit',
  Sweatshirts: 'sweatshirt',
  Formalwear: 'formalwear',
  Accessories: 'accessories',
};

/** How central a category is — a missing shoe holds more outfits back than
 * a missing sweatshirt. Half of the ranking product. */
const ROW_CENTRALITY: Record<string, number> = {
  Shoes: 6,
  Bottoms: 5,
  Tops: 4,
  Knitwear: 3,
  Outerwear: 3,
  Formalwear: 2,
  Sweatshirts: 1,
  Accessories: 1,
};

export function gapLabel(rowId: string, register: RegisterId): string {
  const reg = REGISTERS.find((r) => r.id === register);
  return `No ${(reg?.label || register).toLowerCase()} ${GAP_NOUNS[rowId] || rowId.toLowerCase()}`;
}

/** DOESN'T-APPLY defaults (6a): pairs where the register has no claim on
 * the category. The per-cell toggle below overrides either way. */
const DEFAULT_NA: Record<string, RegisterId[]> = {
  Sweatshirts: ['smart-casual', 'formal'],
  Formalwear: ['casual', 'smart-casual'],
};

function cellKey(rowId: string, register: string): string {
  return `${rowId}\u241f${register}`;
}

/** A GAP LEADS TO THE HUNT, pre-filled (7a — the Rail is gone from the IA):
 * the priority carries straight into the funnel's search. */
export function openHuntForGap(rowId: string, register?: RegisterId): void {
  const reg = register ? REGISTERS.find((r) => r.id === register) : null;
  const query = reg ? `${reg.label.toLowerCase()} ${GAP_NOUNS[rowId] || rowId.toLowerCase()}` : (GAP_NOUNS[rowId] || rowId.toLowerCase());
  promoteToScout(query);
}

/** Legacy name kept for compatibility — the destination is The Hunt now. */
export const openRailForGap = (category: string, register?: string): void =>
  openHuntForGap(category, register as RegisterId | undefined);

const cellHead: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  fontWeight: 400,
  padding: '10px 10px',
};

interface CellPieces {
  labels: string[];
  archetypes: string[];
}

type CellState =
  | { kind: 'covered'; labels: string[]; archetypes: string[] }
  | { kind: 'gap'; label: string; rank: number | null }
  | { kind: 'na' }
  | { kind: 'muted' };

/** Narrow-viewport check — the matrix becomes register-sequential below
 * 640px (Mobile spec M4). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, []);
  return narrow;
}

export function CoverageMap({
  profile,
  pieces,
}: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
}) {
  const [tags, setTags] = useState<Record<number, SemanticTags>>({});
  const [view, setView] = useState<'register' | 'archetype'>('register');
  /** "row␟column" of the filled cell whose archetype detail is open. */
  const [openCell, setOpenCell] = useState<string | null>(null);
  /** Per-cell doesn't-apply overrides — true forces N/A, false un-marks a
   * default. Seeded from the localStorage mirror instantly; the
   * coverage_prefs WorkspaceDB read reconciles below, so the marks follow
   * the customer ACROSS DEVICES (the founder's persistence fix). */
  const [naOverrides, setNaOverrides] = useState<Record<string, boolean>>(() => loadLocalJson(NA_STORE_KEY, {}));
  /** MUTED registers — columns Beau holds no opinion about. Same store. */
  const [muted, setMuted] = useState<RegisterId[]>(() => loadLocalJson(MUTED_STORE_KEY, []));

  // The cross-device truth — one read on mount; the local mirror already
  // painted, so this only ever corrects it.
  useEffect(() => {
    let live = true;
    void fetchCoveragePrefs().then(({ na, muted: mutedIds }) => {
      if (!live) return;
      setNaOverrides(na);
      setMuted(mutedIds.filter((id): id is RegisterId => REGISTERS.some((r) => r.id === id)));
    });
    return () => {
      live = false;
    };
  }, []);
  const narrow = useIsNarrow();
  const [mobileRegister, setMobileRegister] = useState<RegisterId>('casual');

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetchSemanticTags().then((next) => {
        if (live) setTags(next);
      });
    };
    load();
    window.addEventListener('ethaion:semantics-updated', load);
    return () => {
      live = false;
      window.removeEventListener('ethaion:semantics-updated', load);
    };
  }, [pieces.length]);

  const toggleNa = (rowId: string, register: RegisterId) => {
    const key = cellKey(rowId, register);
    setNaOverrides((cur) => {
      const isNaNow = key in cur ? cur[key] : (DEFAULT_NA[rowId] || []).includes(register);
      const next = { ...cur, [key]: !isNaNow };
      // Local mirror + the coverage_prefs DB row — survives across devices.
      writeNaPref(key, !isNaNow, next);
      return next;
    });
  };

  const toggleMuted = (register: RegisterId) => {
    setMuted((cur) => {
      const isMutedNow = cur.includes(register);
      const next = isMutedNow ? cur.filter((r) => r !== register) : [...cur, register];
      // Local mirror + the DB row — and Beau's assessment reads the muted
      // list from the same store, so he stops holding an opinion on it.
      writeMutedPref(register, !isMutedNow, next);
      return next;
    });
  };

  const archetypes = useMemo(
    () => (profile?.archetypes || []).filter(Boolean).map(archetypeName),
    [profile],
  );

  // rows × registers, and rows × archetypes, in one pass.
  const { byRegister, byArchetype, registerCounts } = useMemo(() => {
    const byRegister: Record<string, Record<RegisterId, CellPieces>> = {};
    const byArchetype: Record<string, Record<string, CellPieces>> = {};
    const registerCounts: Record<RegisterId, number> = { casual: 0, 'smart-casual': 0, formal: 0 };
    for (const row of COVERAGE_ROWS) {
      byRegister[row.canonical] = {
        casual: { labels: [], archetypes: [] },
        'smart-casual': { labels: [], archetypes: [] },
        formal: { labels: [], archetypes: [] },
      };
      byArchetype[row.canonical] = {};
      for (const name of archetypes) byArchetype[row.canonical][name] = { labels: [], archetypes: [] };
    }
    for (const piece of pieces) {
      const tag = tags[piece.id];
      const rowId = rowFor(piece, tag);
      if (!rowId) continue;
      const reg = registerOf(piece, tag);
      registerCounts[reg] += 1;
      const served = (tag?.archetypesServed || []).filter(Boolean);
      const cell = byRegister[rowId][reg];
      cell.labels.push(piece.name);
      for (const a of served) if (!cell.archetypes.includes(a)) cell.archetypes.push(a);
      for (const name of archetypes) {
        if (served.some((a) => a.toLowerCase() === name.toLowerCase())) {
          byArchetype[rowId][name].labels.push(piece.name);
        }
      }
    }
    return { byRegister, byArchetype, registerCounts };
  }, [pieces, tags, archetypes]);

  /** Whether a cell reads doesn't-apply — the override wins over the default. */
  const isNa = (rowId: string, register: RegisterId): boolean => {
    const key = cellKey(rowId, register);
    if (key in naOverrides) return naOverrides[key];
    return (DEFAULT_NA[rowId] || []).includes(register);
  };

  // THE GAP RANKING (6a): register weight (share of the wardrobe that lives
  // there — the lived-frequency proxy) × category centrality. Muted and
  // doesn't-apply cells never rank.
  const rankedGaps = useMemo(() => {
    const gaps: Array<{ rowId: string; register: RegisterId; score: number }> = [];
    for (const row of COVERAGE_ROWS) {
      for (const reg of REGISTERS) {
        if (muted.includes(reg.id)) continue;
        if (isNa(row.canonical, reg.id)) continue;
        if (byRegister[row.canonical][reg.id].labels.length > 0) continue;
        const registerWeight = 1 + (registerCounts[reg.id] || 0);
        const centrality = ROW_CENTRALITY[row.canonical] || 1;
        gaps.push({ rowId: row.canonical, register: reg.id, score: registerWeight * centrality });
      }
    }
    return gaps.sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byRegister, registerCounts, muted, naOverrides]);

  const rankOf = (rowId: string, register: RegisterId): number | null => {
    const i = rankedGaps.findIndex((g) => g.rowId === rowId && g.register === register);
    return i >= 0 && i < 3 ? i + 1 : null;
  };

  const cellState = (rowId: string, register: RegisterId): CellState => {
    if (muted.includes(register)) return { kind: 'muted' };
    if (isNa(rowId, register)) return { kind: 'na' };
    const cell = byRegister[rowId][register];
    if (cell.labels.length > 0) return { kind: 'covered', labels: cell.labels, archetypes: cell.archetypes };
    return { kind: 'gap', label: gapLabel(rowId, register), rank: rankOf(rowId, register) };
  };

  if (pieces.length === 0) return null;

  const RANK_WORDS = ['1st', '2nd', '3rd'];

  // ------------------------------------------------------------------
  // One cell's CONTENT — shared by the desktop matrix and the mobile
  // register-sequential rows.
  // ------------------------------------------------------------------
  const renderCell = (rowId: string, register: RegisterId, key: string) => {
    const state = cellState(rowId, register);
    if (state.kind === 'muted') {
      return (
        <span
          className="block px-2.5 py-2 text-[var(--color-neutral-500,#a68e70)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', fontStyle: 'italic' }}
        >
          none · muted
        </span>
      );
    }
    if (state.kind === 'na') {
      return (
        <button
          type="button"
          onClick={() => toggleNa(rowId, register)}
          className="block w-full text-left min-h-[44px] px-2.5 py-2 text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', fontStyle: 'italic' }}
          title="Marked as not applying — tap to track it again"
        >
          Doesn’t apply
        </button>
      );
    }
    if (state.kind === 'covered') {
      return (
        <button
          type="button"
          onClick={() => setOpenCell(openCell === key ? null : key)}
          className="block w-full text-left min-h-[44px]"
          style={{ ...coveredBoxStyle, padding: '8px 10px' }}
          title={view === 'register' ? 'Tap to see which of your style directions these pieces serve' : undefined}
        >
          <span className="flex items-start gap-1.5">
            <Check className="w-3 h-3 flex-shrink-0" style={{ color: SAGE, marginTop: '3px' }} aria-hidden="true" />
            <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.45 }}>
              {state.labels.join(' · ')}
            </span>
          </span>
          {openCell === key && view === 'register' && (
            <span
              className="block text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}
            >
              {state.archetypes.length > 0
                ? `Serves: ${state.archetypes.join(', ')}`
                : 'Still being catalogued — direction read to follow.'}
            </span>
          )}
        </button>
      );
    }
    // GAP — named, ranked, and it leads to The Hunt pre-filled. The FIRST
    // gap carries the page's one solid accent border (6a).
    const first = state.rank === 1;
    return (
      <div
        style={
          first
            ? { border: '1.5px solid var(--color-accent,#a8712c)', padding: '8px 10px', background: 'var(--color-accent-100,#fbf1de)' }
            : { ...dashedBoxStyle, padding: '8px 10px', background: 'transparent' }
        }
      >
        <button
          type="button"
          onClick={() => openHuntForGap(rowId, register)}
          className="block w-full text-left group"
          title={`${state.label} — see candidates in The Hunt`}
        >
          <span className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`${first ? 'text-[var(--color-accent-800,#5c3413)]' : 'text-[var(--color-neutral-700,#634e38)]'} group-hover:underline`}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.4 }}
            >
              {state.label}
            </span>
            {state.rank != null && (
              <span
                className="uppercase text-[var(--color-accent-700,#7c4a17)]"
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '9.5px', letterSpacing: '0.14em' }}
              >
                {RANK_WORDS[state.rank - 1]}
              </span>
            )}
          </span>
          <span
            className="block uppercase text-[var(--color-neutral-500,#a68e70)] group-hover:text-[var(--color-accent-700,#7c4a17)] transition-colors"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '9.5px', letterSpacing: '0.14em', marginTop: '3px' }}
          >
            See The Hunt ›
          </span>
        </button>
        <button
          type="button"
          onClick={() => toggleNa(rowId, register)}
          className="block text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-neutral-700,#634e38)] mt-0.5"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '10.5px', fontStyle: 'italic' }}
          title="Not part of how you dress? Mark it and this stops counting as a gap"
        >
          Doesn’t apply to me ›
        </button>
      </div>
    );
  };

  const columns: Array<{ id: string; label: string }> =
    view === 'register' ? REGISTERS.map((r) => ({ id: r.id, label: r.label })) : archetypes.map((a) => ({ id: a, label: a }));

  const archetypeCellFor = (rowId: string, colId: string): CellPieces =>
    byArchetype[rowId][colId] || { labels: [], archetypes: [] };

  const coveredCount = (register: RegisterId): number =>
    COVERAGE_ROWS.filter((row) => byRegister[row.canonical][register].labels.length > 0).length;

  return (
    <section aria-label="Coverage map" className="mt-10">
      <div className="flex items-end justify-between gap-3 flex-wrap pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <div>
          <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '6px' }}>The coverage map</h3>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}>
            Rows are parts of the wardrobe; columns are registers. A filled cell names what covers it — in your
            words. An open cell names exactly what’s missing, the top three carry their rank, and tapping one opens
            The Hunt on that gap. Where a register doesn’t claim a category, the cell says so instead of counting
            against you.
          </p>
        </div>
        {/* Register view · Archetype view — the secondary layer's toggle. */}
        <div className="flex" role="group" aria-label="Coverage map views">
          {([
            { id: 'register', label: 'Register view' },
            { id: 'archetype', label: 'Archetype view' },
          ] as const).map(({ id, label: viewLabel }, i) => {
            const active = view === id;
            const disabled = id === 'archetype' && archetypes.length === 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setView(id);
                  setOpenCell(null);
                }}
                disabled={disabled}
                aria-pressed={active}
                className={`uppercase min-h-[44px] px-4 grid place-items-center whitespace-nowrap transition-colors disabled:opacity-40 ${
                  active
                    ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                    : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
                } ${i > 0 ? 'border-l-0' : ''}`}
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em' }}
                title={disabled ? 'Choose your style directions in The Dossier to unlock this view' : undefined}
              >
                {viewLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* MOBILE (register view only): ONE REGISTER AT A TIME — a segmented
          control, then the categories as rows (Mobile spec M4). */}
      {narrow && view === 'register' ? (
        <div className="mt-6">
          <div className="flex" role="tablist" aria-label="Registers">
            {REGISTERS.map((reg, i) => {
              const active = mobileRegister === reg.id;
              const isMuted = muted.includes(reg.id);
              return (
                <button
                  key={reg.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileRegister(reg.id)}
                  className={`flex-1 uppercase min-h-[52px] px-2 grid place-items-center transition-colors ${
                    active
                      ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                      : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)]'
                  } ${i > 0 ? 'border-l-0' : ''} ${isMuted ? 'opacity-50' : ''}`}
                  style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.1em' }}
                >
                  {reg.label}
                </button>
              );
            })}
          </div>
          {/* The frequency line replaces the column head (M4). */}
          <p className="mt-2.5 text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}>
            {muted.includes(mobileRegister)
              ? 'Muted — you don’t dress here, so nothing counts as a gap.'
              : `${registerCounts[mobileRegister]} piece${registerCounts[mobileRegister] === 1 ? '' : 's'} in this register · ${coveredCount(mobileRegister)} of ${COVERAGE_ROWS.length} categories covered`}
            {' · '}
            <button
              type="button"
              onClick={() => toggleMuted(mobileRegister)}
              className="underline underline-offset-2 hover:text-[var(--space-text-primary)]"
            >
              {muted.includes(mobileRegister) ? 'Un-mute' : 'Mute this register'}
            </button>
          </p>
          <div className="mt-3 divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-t border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
            {COVERAGE_ROWS.map((row) => (
              <div key={row.canonical} className="py-2.5">
                <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', marginBottom: '4px' }}>
                  {row.label}
                </p>
                {renderCell(row.canonical, mobileRegister, cellKey(row.canonical, mobileRegister))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <TicketFrame className="mt-6" padding="18px">
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ tableLayout: 'fixed', minWidth: `${130 + columns.length * 140}px` }}
            >
              {/* The Category column hugs its labels (a fixed 130px) instead of
                  claiming a share of the width — the data columns split the
                  rest evenly, so no single column dominates in either view. */}
              <colgroup>
                <col style={{ width: '130px' }} />
                {columns.map((col) => (
                  <col key={col.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="text-left uppercase text-[var(--color-neutral-600,#856c51)] sticky top-0 bg-[var(--color-paper,#fbf8f1)] z-10"
                    style={{ ...cellHead, paddingLeft: 0, border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', borderLeft: 'none', borderTop: 'none' }}
                  >
                    Category
                  </th>
                  {columns.map((col) => {
                    const regId = col.id as RegisterId;
                    const isRegisterCol = view === 'register';
                    const isMuted = isRegisterCol && muted.includes(regId);
                    return (
                      <th
                        key={col.id}
                        scope="col"
                        className="text-left uppercase text-[var(--color-neutral-600,#856c51)] sticky top-0 bg-[var(--color-paper,#fbf8f1)] z-10"
                        style={{ ...cellHead, border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', borderTop: 'none', opacity: isMuted ? 0.55 : 1 }}
                      >
                        {col.label}
                        {isRegisterCol && (
                          <span className="block normal-case" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px', letterSpacing: '0.02em', marginTop: '2px' }}>
                            {isMuted
                              ? 'Muted · you don’t dress here · '
                              : `${registerCounts[regId]} piece${registerCounts[regId] === 1 ? '' : 's'} · ${coveredCount(regId)} covered · `}
                            <button
                              type="button"
                              onClick={() => toggleMuted(regId)}
                              className="underline underline-offset-2 hover:text-[var(--space-text-primary)]"
                            >
                              {isMuted ? 'Un-mute' : 'Mute'}
                            </button>
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {COVERAGE_ROWS.map((row) => (
                  <tr key={row.canonical}>
                    <th
                      scope="row"
                      className={`text-left ${typography.color.primary}`}
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', fontWeight: 400, padding: '12px 10px 12px 0', verticalAlign: 'top', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', borderLeft: 'none' }}
                    >
                      {row.label}
                    </th>
                    {columns.map((col) => {
                      const key = cellKey(row.canonical, col.id);
                      if (view === 'archetype') {
                        const cell = archetypeCellFor(row.canonical, col.id);
                        const filled = cell.labels.length > 0;
                        return (
                          <td key={col.id} style={{ padding: '6px', verticalAlign: 'top', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
                            {filled ? (
                              <span className="flex items-start gap-1.5" style={{ ...coveredBoxStyle, padding: '8px 10px', display: 'flex' }}>
                                <Check className="w-3 h-3 flex-shrink-0" style={{ color: SAGE, marginTop: '3px' }} aria-hidden="true" />
                                <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.45 }}>
                                  {cell.labels.join(' · ')}
                                </span>
                              </span>
                            ) : (
                              <span className="block px-2.5 py-2 text-[var(--color-neutral-500,#a68e70)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', fontStyle: 'italic' }}>
                                Nothing here yet
                              </span>
                            )}
                          </td>
                        );
                      }
                      const regId = col.id as RegisterId;
                      return (
                        <td
                          key={col.id}
                          style={{ padding: '6px', verticalAlign: 'top', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', opacity: muted.includes(regId) ? 0.55 : 1 }}
                        >
                          {renderCell(row.canonical, regId, key)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TicketFrame>
      )}

      {/* THE PRIORITY — the top three gaps, open, ranked, each leading into
          The Hunt (6a: never an accordion, never “Gap ›”). */}
      {view === 'register' && rankedGaps.length > 0 && (
        <div className="mt-5">
          <p className="uppercase text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', marginBottom: '8px' }}>
            The priority — ranked by how much of your life each gap holds back
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {rankedGaps.slice(0, 3).map((gap, i) => (
              <button
                key={`${gap.rowId}-${gap.register}`}
                type="button"
                onClick={() => openHuntForGap(gap.rowId, gap.register)}
                className="text-left px-3 py-2.5 min-h-[52px] transition-colors hover:bg-[var(--color-accent-100,#fbf1de)]"
                style={i === 0 ? { border: '1.5px solid var(--color-accent,#a8712c)' } : { border: '1px dashed var(--color-divider,rgba(59,43,29,0.4))' }}
              >
                <span className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10px', letterSpacing: '0.14em' }}>
                  {RANK_WORDS[i]}
                </span>
                <span className={`block ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.4 }}>
                  {gapLabel(gap.rowId, gap.register)}
                </span>
                <span className="block text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px' }}>
                  See candidates in The Hunt ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'archetype' && archetypes.length === 0 && (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-3`}>
          Choose your style directions in The Dossier and this view gains a column for each one.
        </p>
      )}

      <p className={`${typography.size.xs} ${typography.color.muted} mt-4`} style={{ fontSize: '10px' }}>
        Built from the classification Beau runs quietly behind each piece when you log it — no extra thinking, no
        renaming. Your pieces keep the names you gave them everywhere in the app. Mute a register you never dress
        for and Beau stops holding an opinion about it; mark a cell “doesn’t apply” and it stops counting as a gap.
      </p>
    </section>
  );
}
