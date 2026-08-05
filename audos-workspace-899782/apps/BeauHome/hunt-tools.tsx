/**
 * THE HUNT — Compare and Matrix sub-tabs.
 *
 *  - COMPARE: 2–3 brands side by side across the quality dimensions
 *    (price, origin, materials, construction, Beau's rating — with the
 *    brand-specific reason he gives it — value-over-time, signature
 *    pieces, archetype fit), with Beau's verdict paragraph beneath
 *    (personalised when profile is on). Brand data comes from the seed
 *    directory or the haiku generation layer.
 *  - MATRIX: the quality/longevity scatter — construction quality across,
 *    expected lifespan up, every maker a tappable dot. Built from Discover
 *    (Recommendation Engine overhaul): it plots the merged directory
 *    (catalog + user-added + Beau-recommended makers), and the "Add to
 *    Matrix" action on Discover rows builds a custom selection view.
 *
 * The old MATCH sub-tab (the AI style matchmaker) merged into the unified
 * Find (hunt-find.tsx) — matchmaker queries are one of the intents Find
 * routes automatically.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import type { CategoryBudget, StylePrefs, StyleProfile, WardrobePiece } from './profile-data';
import {
  MAX_COMPARE,
  beauRatingFromQuality,
  beauRatingSummary,
  brandCategory,
  mergeDirectory,
  DISCOVER_CATEGORIES,
  type BrandProfile,
  type DirectoryBrandRow,
} from './brands';
import {
  DISCOVER_BRANDS_EVENT,
  getBrandProfile,
  runCompareVerdict,
} from './hunt-ai';
import { ArchetypeTag, CompareAction } from './hunt-discover';
import { useBeauReveal } from './beau-reveal';

// ---------------------------------------------------------------------------
// COMPARE — side-by-side brand comparison
// ---------------------------------------------------------------------------

const compareHead = 'text-left uppercase text-[var(--color-neutral-600,#856c51)]';
const compareHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '11px',
  letterSpacing: '0.12em',
  fontWeight: 400,
  padding: '10px 14px 10px 0',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
  borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
};
const compareCellStyle: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '13px',
  lineHeight: 1.55,
  padding: '10px 14px 10px 0',
  verticalAlign: 'top',
  borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
};

export function CompareSubTab({
  profileOn,
  profile,
  budgets,
  pieces,
  prefs,
  compareList,
  onRemove,
  onClear,
  onOpenBrand,
  onGoDiscover,
}: {
  profileOn: boolean;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  compareList: string[];
  onRemove: (brand: string) => void;
  onClear: () => void;
  onOpenBrand: (brandName: string) => void;
  onGoDiscover: () => void;
}) {
  const [profiles, setProfiles] = useState<Record<string, BrandProfile>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [verdict, setVerdict] = useState<string | null>(null);
  const [verdictBusy, setVerdictBusy] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  // Beau "typing" (Part 3.2): the verdict paragraph types on as it lands.
  const verdictShown = useBeauReveal(verdict);

  // Resolve each queued brand — directory hit is instant, non-catalog
  // brands go through the haiku generation layer (cached).
  useEffect(() => {
    let cancelled = false;
    for (const name of compareList) {
      const key = name.toLowerCase();
      if (profiles[key] || loadErrors[key]) continue;
      getBrandProfile(name)
        .then((p) => {
          if (!cancelled) setProfiles((cur) => ({ ...cur, [key]: p }));
        })
        .catch((e: unknown) => {
          if (!cancelled) setLoadErrors((cur) => ({ ...cur, [key]: e instanceof Error ? e.message : 'Could not load this brand.' }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareList]);

  const loaded = compareList.map((n) => profiles[n.toLowerCase()]).filter(Boolean) as BrandProfile[];
  const allLoaded = loaded.length === compareList.length && compareList.length >= 2;

  // Beau's verdict — one sonnet paragraph per brand combination (cached in
  // hunt-ai by combination + profile toggle).
  useEffect(() => {
    if (!allLoaded) {
      setVerdict(null);
      return;
    }
    let cancelled = false;
    setVerdictBusy(true);
    setVerdictError(null);
    runCompareVerdict({ brands: loaded, profileOn, profile, budgets, pieces, prefs })
      .then((v) => {
        if (!cancelled) setVerdict(v);
      })
      .catch((e: unknown) => {
        if (!cancelled) setVerdictError(e instanceof Error ? e.message : 'Beau couldn\u2019t weigh these up just now.');
      })
      .finally(() => {
        if (!cancelled) setVerdictBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLoaded, compareList.join('|'), profileOn]);

  if (compareList.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>Nothing queued to compare yet</p>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-md mx-auto`}>
          Queue up to {MAX_COMPARE} brands with the “Add to Compare” action on any Discover row, any Find result,
          or a spec sheet in The Rail — then they line up here side by side.
        </p>
        <button
          type="button"
          onClick={onGoDiscover}
          className="mt-4 px-4 min-h-[44px] rounded text-[14px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
        >
          Browse the directory
        </button>
      </div>
    );
  }

  const dims: Array<{ label: string; render: (b: BrandProfile) => React.ReactNode }> = [
    { label: 'Price range', render: (b) => b.priceRangeLabel },
    { label: 'Country of origin', render: (b) => b.country },
    { label: 'Primary materials', render: (b) => b.materials.join(' / ') || '—' },
    { label: 'Construction method', render: (b) => b.construction || '—' },
    {
      /* The mark, then why THIS maker earned it — its own construction,
         materials and lifespan, never a definition of the tier
         (Recommendation Engine overhaul, Part 9). */
      label: 'Beau\u2019s rating',
      render: (b) => (
        <>
          <span className="text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', letterSpacing: '0.04em' }}>
            {beauRatingFromQuality(b.constructionQuality)}
          </span>
          {beauRatingSummary(b) ? ` — ${beauRatingSummary(b)}` : ''}
        </>
      ),
    },
    {
      label: 'Value over time',
      render: (b) => (
        <>
          {b.longevity.expectedYears}+ years · resoleable: {b.longevity.resoleable ? 'yes' : 'no'} · mendable:{' '}
          {b.longevity.mendable ? 'yes' : 'no'}
          {b.costPerYearNote ? ` — ${b.costPerYearNote}` : ''}
        </>
      ),
    },
    { label: 'Signature pieces', render: (b) => b.signaturePieces.join(' · ') || '—' },
    {
      label: 'Archetype fit',
      render: (b) => (
        <span className="flex flex-wrap gap-1">
          {b.archetypes.length > 0 ? b.archetypes.map((a) => <ArchetypeTag key={a} id={a} />) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '54ch' }}>
          {compareList.length === 1
            ? 'One brand queued — add a second from Discover or Find and the comparison opens up.'
            : 'Side by side, dimension by dimension — then Beau calls it.'}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="hover:underline"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
        >
          Clear the comparison ›
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: `${220 + compareList.length * 220}px`, borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
          <thead>
            <tr>
              <th className={compareHead} style={{ ...compareHeadStyle, borderTop: 'none' }} aria-hidden="true" />
              {compareList.map((name) => {
                const p = profiles[name.toLowerCase()];
                const err = loadErrors[name.toLowerCase()];
                return (
                  <th key={name} className="text-left" style={{ ...compareCellStyle, borderTop: 'none', paddingBottom: '14px' }}>
                    <button
                      type="button"
                      onClick={() => onOpenBrand(name)}
                      className={`block text-left ${typography.color.primary} hover:underline`}
                      style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '21px', lineHeight: 1.15 }}
                    >
                      {p?.brand || name}
                    </button>
                    <span className="inline-flex items-center gap-2 mt-1">
                      {!p && !err && (
                        <span className={`${typography.size.xs} ${typography.color.muted} inline-flex items-center gap-1`}>
                          <Loader2 className="w-3 h-3 animate-spin" /> pulling the file…
                        </span>
                      )}
                      {err && <span className={`${typography.size.xs} text-[var(--space-semantic-warning)]`}>{err}</span>}
                      <button
                        type="button"
                        onClick={() => onRemove(name)}
                        className="inline-flex items-center gap-0.5 text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)]"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
                        aria-label={`Remove ${name} from the comparison`}
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dims.map((dim) => (
              <tr key={dim.label}>
                <th scope="row" className={compareHead} style={compareHeadStyle}>
                  {dim.label}
                </th>
                {compareList.map((name) => {
                  const p = profiles[name.toLowerCase()];
                  return (
                    <td key={name} className={typography.color.primary} style={compareCellStyle}>
                      {p ? dim.render(p) : '…'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Beau's verdict — one paragraph, personalised when profile is on. */}
      {compareList.length >= 2 && (
        <div
          className="text-[var(--color-neutral-800,#453325)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.65, maxWidth: '66ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
        >
          <em
            className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '6px' }}
          >
            Beau&rsquo;s verdict{profileOn ? ' · for you' : ''}
          </em>
          {verdictBusy && (
            <span className={`${typography.size.sm} ${typography.color.secondary} inline-flex items-center gap-2`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Beau is weighing them up…
            </span>
          )}
          {!verdictBusy && verdictError && <span className={`${typography.size.sm} text-[var(--space-semantic-warning)]`}>{verdictError}</span>}
          {!verdictBusy && verdict && <span aria-live="polite">{verdictShown}</span>}
          {!verdictBusy && !verdict && !verdictError && !allLoaded && (
            <span className={`${typography.size.sm} ${typography.color.muted}`}>The verdict lands once every brand file is in.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MATRIX — the quality / longevity scatter plot, built from Discover
// ---------------------------------------------------------------------------

export function MatrixSubTab({
  onOpenBrand,
  matrixList,
  onToggleMatrix,
  onClearMatrix,
  onGoDiscover,
}: {
  onOpenBrand: (brandName: string) => void;
  /** The custom selection built with "Add to Matrix" on Discover rows. */
  matrixList: string[];
  onToggleMatrix: (brand: string) => void;
  onClearMatrix: () => void;
  onGoDiscover: () => void;
}) {
  const [category, setCategory] = useState<string>('');
  const [view, setView] = useState<'directory' | 'custom'>(() => (matrixList.length > 0 ? 'custom' : 'directory'));

  // The merged directory — catalog + user-added + Beau-recommended makers.
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  const entries = useMemo(() => mergeDirectory(addedRows), [addedRows]);

  const brands = useMemo(() => {
    const selected = new Set(matrixList.map((b) => b.toLowerCase()));
    return entries
      .map((e) => e.profile)
      .filter((b) => (view === 'custom' ? selected.has(b.brand.toLowerCase()) : true))
      .filter((b) => !category || brandCategory(b.brand) === category);
  }, [entries, view, matrixList, category]);

  // Plot geometry — x: construction quality (1–10), y: expected lifespan.
  const W = 760;
  const H = 500;
  const PAD_L = 56;
  const PAD_R = 24;
  const PAD_T = 20;
  const PAD_B = 56;
  const maxYears = 30;
  const x = (score: number) => PAD_L + ((Math.min(10, Math.max(1, score)) - 1) / 9) * (W - PAD_L - PAD_R);
  const y = (years: number) => H - PAD_B - (Math.min(maxYears, Math.max(0, years)) / maxYears) * (H - PAD_T - PAD_B);

  const ink = 'var(--color-text,#3b2b1d)';
  const hair = 'rgba(59,43,29,0.18)';
  const accent = 'var(--color-accent,#a8712c)';

  return (
    <div className="space-y-5">
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}>
        Every maker in the directory, plotted by how well it&rsquo;s built and how long it lasts. The top-right corner is
        where the money is best spent. Tap any dot for the brand dossier — or build your own plot with “Add to
        Matrix” on any Discover row.
      </p>

      {/* View toggle: the whole directory, or the custom Discover selection. */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <button type="button" onClick={() => setView('directory')} className={filterPillMatrix(view === 'directory')} aria-pressed={view === 'directory'}>
          Full directory
        </button>
        <button type="button" onClick={() => setView('custom')} className={filterPillMatrix(view === 'custom')} aria-pressed={view === 'custom'}>
          Your selection{matrixList.length > 0 ? ` · ${matrixList.length}` : ''}
        </button>
        {view === 'custom' && matrixList.length > 0 && (
          <button
            type="button"
            onClick={onClearMatrix}
            className="hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', color: 'var(--color-accent,#a8712c)' }}
          >
            Clear the selection ›
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className={`${typography.size.xs} ${typography.color.muted} mr-1`} style={{ fontSize: '10px' }}>Category</span>
        <button type="button" onClick={() => setCategory('')} className={filterPillMatrix(category === '')}>All</button>
        {DISCOVER_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(category === c ? '' : c)} className={filterPillMatrix(category === c)}>
            {c}
          </button>
        ))}
      </div>

      {view === 'custom' && brands.length === 0 ? (
        <div className="py-8 text-center">
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>Nothing on your Matrix yet</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-md mx-auto`}>
            Use the “Add to Matrix” action on any Discover row and the makers you pick plot here, alone on the grid.
          </p>
          <button
            type="button"
            onClick={onGoDiscover}
            className="mt-4 px-4 min-h-[44px] rounded text-[14px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
          >
            Browse the directory
          </button>
        </div>
      ) : (
        <div className="bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] p-2 sm:p-4 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Quality against longevity — one dot per brand" style={{ minWidth: '560px', width: '100%', height: 'auto' }}>
            {/* Hairline grid */}
            {[0, 5, 10, 15, 20, 25, 30].map((yr) => (
              <g key={`gy-${yr}`}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(yr)} y2={y(yr)} stroke={hair} strokeWidth="1" />
                <text x={PAD_L - 8} y={y(yr) + 3} textAnchor="end" fill="#856c51" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px' }}>
                  {yr}
                </text>
              </g>
            ))}
            {[2, 4, 6, 8, 10].map((s) => (
              <g key={`gx-${s}`}>
                <line x1={x(s)} x2={x(s)} y1={PAD_T} y2={H - PAD_B} stroke={hair} strokeWidth="1" />
                <text x={x(s)} y={H - PAD_B + 16} textAnchor="middle" fill="#856c51" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px' }}>
                  {s}
                </text>
              </g>
            ))}
            {/* Axes */}
            <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke={ink} strokeWidth="1" />
            <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke={ink} strokeWidth="1" />
            <text x={(PAD_L + W - PAD_R) / 2} y={H - 14} textAnchor="middle" fill="#634e38" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Construction quality →
            </text>
            <text x={16} y={(PAD_T + H - PAD_B) / 2} textAnchor="middle" transform={`rotate(-90 16 ${(PAD_T + H - PAD_B) / 2})`} fill="#634e38" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Expected lifespan (years) →
            </text>
            {/* Dots */}
            {brands.map((b, i) => {
              const cx = x(b.qualityScore);
              const cy = y(b.longevity.expectedYears);
              const labelRight = cx < W - 150;
              return (
                <g key={b.brand} onClick={() => onOpenBrand(b.brand)} style={{ cursor: 'pointer' }} role="button" aria-label={`${b.brand} — quality ${b.qualityScore} of 10, ${b.longevity.expectedYears}+ years`}>
                  <circle cx={cx} cy={cy} r="10" fill="transparent" />
                  <circle cx={cx} cy={cy} r="4.5" fill={accent} stroke="#fbf8f1" strokeWidth="1" />
                  <text
                    x={labelRight ? cx + 8 : cx - 8}
                    y={cy + (i % 2 === 0 ? -6 : 12)}
                    textAnchor={labelRight ? 'start' : 'end'}
                    fill="#3b2b1d"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px' }}
                  >
                    {b.brand}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <p className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
        Quality is Beau&rsquo;s construction score (1–10); lifespan assumes normal wear with basic care — resoleable and
        mendable pieces hold the top band. Labels may overlap where makers cluster; filter by category — or build a
        smaller custom selection from Discover — to spread them out.
      </p>
    </div>
  );
}

const filterPillMatrix = (active: boolean) =>
  `px-2.5 py-1 rounded ${typography.size.xs} border transition-colors ${
    active
      ? 'bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)] border-[var(--color-accent,#a8712c)]'
      : 'bg-transparent border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-600,#856c51)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)]'
  }`;
