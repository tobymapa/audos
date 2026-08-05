/**
 * THE COVERAGE MAP — registers × foundation categories (Milestones
 * overhaul, Part 3b).
 *
 * Columns are the three REGISTERS — Casual | Smart-Casual | Formal.
 * Rows are the foundation categories in the app's canonical menswear order
 * (category-order.ts) — Tops | Knitwear | Outerwear | Bottoms | Formalwear |
 * Shoes | Accessories.
 * A cell is COVERED when an owned piece covers that register in that
 * category — a sage-hairline box on its soft sage ground, ticked — and a GAP
 * (dashed box) when nothing owned does.
 *
 * The sage/tick is a CATEGORY-LEVEL indicator and the app's one sanctioned
 * use of colour on this map: the piece labels quoted inside a covered cell
 * stay plain walnut, because individual PIECES are never colour-coded
 * anywhere (Recommendation Engine overhaul, Part 2).
 *
 * ARCHETYPE LAYER — a secondary layer within the same map, two ways in:
 *   · tap a filled cell → it names which archetypes those pieces serve;
 *   · the "Register view / Archetype view" toggle at the top swaps the
 *     columns for the user's chosen style directions.
 * Tapping a GAP navigates to The Rail, pre-filtered to that gap.
 *
 * Built from LAYER 1's semantic tags — no extra model call. THE USER'S
 * LABELS ARE SACRED: every covered cell quotes his own words for the piece
 * ("M43", "chore coat"), never the classifier's sub-type.
 *
 * Visual language: corner-bracket ticket frame, sage-ticked boxes for
 * covered categories, dashed boxes for gaps, hairline cell borders —
 * palette and fonts unchanged.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { typography } from '../../lib/colors';
import { goToTab, label, type StyleProfile, type WardrobePiece } from './profile-data';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';
import { SAGE, TicketFrame, coveredBoxStyle, dashedBoxStyle } from './ticket-frame';
import { sortByCategoryOrder } from './category-order';

// Rows, in the app's canonical menswear order — worn garments first, then
// shoes, then accessories (which carries bags and headwear too).
const COVERAGE_ROWS: Array<{ canonical: string; label: string; categoryIds: string[] }> = sortByCategoryOrder(
  [
    { canonical: 'Tops', label: 'Tops', categoryIds: ['tops', 'base-layers'] },
    { canonical: 'Bottoms', label: 'Bottoms', categoryIds: ['bottoms'] },
    { canonical: 'Shoes', label: 'Shoes', categoryIds: ['shoes'] },
    { canonical: 'Outerwear', label: 'Outerwear', categoryIds: ['outerwear'] },
    { canonical: 'Knitwear', label: 'Knitwear', categoryIds: ['knitwear'] },
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

interface CellPieces {
  /** The user's own labels for the covering pieces. */
  labels: string[];
  /** Distinct archetypes those pieces serve — the secondary layer. */
  archetypes: string[];
}

/** Route to The Rail pre-filtered for a specific gap in the map. */
export function openRailForGap(category: string, register?: string): void {
  try {
    sessionStorage.setItem('ethaion_rail_prefilter', JSON.stringify({ category, register: register || null }));
  } catch { /* storage unavailable — The Rail simply opens unfiltered */ }
  window.dispatchEvent(new CustomEvent('ethaion:rail-prefilter', { detail: { category, register: register || null } }));
  goToTab('curated');
}

const cellHead: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  fontWeight: 400,
  padding: '10px 10px',
};

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

  const archetypes = useMemo(
    () => (profile?.archetypes || []).filter(Boolean).map(archetypeName),
    [profile],
  );

  // rows × registers, and rows × archetypes, in one pass.
  const { byRegister, byArchetype } = useMemo(() => {
    const byRegister: Record<string, Record<RegisterId, CellPieces>> = {};
    const byArchetype: Record<string, Record<string, CellPieces>> = {};
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
    return { byRegister, byArchetype };
  }, [pieces, tags, archetypes]);

  if (pieces.length === 0) return null;

  const columns: Array<{ id: string; label: string }> =
    view === 'register' ? REGISTERS.map((r) => ({ id: r.id, label: r.label })) : archetypes.map((a) => ({ id: a, label: a }));

  const cellFor = (rowId: string, colId: string): CellPieces =>
    view === 'register'
      ? byRegister[rowId][colId as RegisterId]
      : byArchetype[rowId][colId] || { labels: [], archetypes: [] };

  return (
    <section aria-label="Coverage map" className="mt-10">
      <div className="flex items-end justify-between gap-3 flex-wrap pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <div>
          <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '6px' }}>The coverage map</h3>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}>
            Every row is a part of the wardrobe; every column a register. A ticked sage box names the piece that covers
            it — in your words. A broken box is a gap: tap it and The Rail opens on Beau’s recommendations for
            exactly that hole.
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

      <TicketFrame className="mt-6" padding="18px">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: columns.length > 2 ? '620px' : undefined }}>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-left uppercase text-[var(--color-neutral-600,#856c51)]"
                  style={{ ...cellHead, paddingLeft: 0, border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', borderLeft: 'none', borderTop: 'none' }}
                >
                  Category
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    scope="col"
                    className="text-left uppercase text-[var(--color-neutral-600,#856c51)]"
                    style={{ ...cellHead, whiteSpace: 'nowrap', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))', borderTop: 'none' }}
                  >
                    {col.label}
                  </th>
                ))}
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
                    const cell = cellFor(row.canonical, col.id);
                    const key = `${row.canonical}\u241f${col.id}`;
                    const filled = cell.labels.length > 0;
                    return (
                      <td
                        key={col.id}
                        style={{ padding: '6px', verticalAlign: 'top', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
                      >
                        {filled ? (
                          /* COVERED — the category-level sage indicator: sage
                             hairline, soft sage ground, a sage tick. The piece
                             labels themselves stay walnut. Tap to see which
                             archetypes these pieces serve (register view). */
                          <button
                            type="button"
                            onClick={() => setOpenCell(openCell === key ? null : key)}
                            className="block w-full text-left min-h-[44px]"
                            style={{ ...coveredBoxStyle, padding: '8px 10px' }}
                            title={view === 'register' ? 'Tap to see which of your style directions these pieces serve' : undefined}
                          >
                            <span className="flex items-start gap-1.5">
                              <Check
                                className="w-3 h-3 flex-shrink-0"
                                style={{ color: SAGE, marginTop: '3px' }}
                                aria-hidden="true"
                              />
                              <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.45 }}>
                                {cell.labels.join(' · ')}
                              </span>
                            </span>
                            {openCell === key && view === 'register' && (
                              <span
                                className="block text-[var(--color-neutral-700,#634e38)]"
                                style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}
                              >
                                {cell.archetypes.length > 0
                                  ? `Serves: ${cell.archetypes.join(', ')}`
                                  : 'Still being catalogued — direction read to follow.'}
                              </span>
                            )}
                          </button>
                        ) : (
                          /* GAP — broken box; tap through to The Rail,
                             pre-filtered to this exact hole. */
                          <button
                            type="button"
                            onClick={() => openRailForGap(row.canonical, view === 'register' ? col.id : undefined)}
                            className="block w-full text-left min-h-[44px] group"
                            style={{ ...dashedBoxStyle, padding: '8px 10px', background: 'transparent' }}
                            title={`Gap — see Beau's recommendations for ${row.label.toLowerCase()} on The Rail`}
                          >
                            <span
                              className="uppercase text-[var(--color-neutral-500,#a68e70)] group-hover:text-[var(--color-accent-700,#7c4a17)] transition-colors"
                              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10px', letterSpacing: '0.14em' }}
                            >
                              Gap ›
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TicketFrame>

      {view === 'archetype' && archetypes.length === 0 && (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-3`}>
          Choose your style directions in The Dossier and this view gains a column for each one.
        </p>
      )}

      <p className={`${typography.size.xs} ${typography.color.muted} mt-4`} style={{ fontSize: '10px' }}>
        Built from the classification Beau runs quietly behind each piece when you log it — no extra thinking, no
        renaming. Your pieces keep the names you gave them everywhere in the app. Archetype coverage is the same
        map’s second layer: tap any filled cell, or switch to Archetype view.
      </p>
    </section>
  );
}
