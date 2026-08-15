import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  ChevronRight,
  Trash2,
  ExternalLink,
  Scissors,
  History,
  TrendingUp,
  Award,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';

/* ============================================================================
 * Maker Scout — discover obscure, high-value menswear makers matched to your
 * exact criteria. Combines live web search + GPT curation, persisted per
 * visitor via WorkspaceDB (`scout_requests` table, created on first write).
 * ==========================================================================*/

interface ScoutRequest {
  id: number;
  item_type: string;
  budget: string;
  material_criteria: string;
  intended_use: string;
  status: 'pending' | 'complete' | 'error';
  recommendation_json?: string;
  error_message?: string;
  created_at?: string;
}

interface MaterialSpec {
  label: string;
  value: string;
  match: boolean;
}

interface CostPerWear {
  priceEstimate: string;
  estimatedYears: number;
  wearsPerYear: number;
  costPerWear: string;
  rationale: string;
}

interface Recommendation {
  brandName: string;
  tagline: string;
  origin: string;
  website?: string;
  matchScore: number;
  whyMatch: string;
  criteriaBreakdown: Array<{ criterion: string; met: boolean; note: string }>;
  materialSpecs: MaterialSpec[];
  makerHistory: string;
  costPerWear: CostPerWear;
  alternativeNote?: string;
}

declare global {
  interface Window {
    useWorkspaceDB: <T = unknown>(
      table: string,
      options?: {
        shared?: boolean;
        limit?: number;
        offset?: number;
        orderBy?: { column: string; direction: 'asc' | 'desc' };
        filters?: Array<{ column: string; operator: string; value: unknown }>;
      },
    ) => {
      data: T[];
      loading: boolean;
      error: Error | null;
      total: number;
      refresh: () => void;
    };
    __workspaceDb: {
      from: (
        table: string,
        options?: { shared?: boolean },
      ) => {
        insert: (row: Record<string, unknown>) => Promise<void>;
        update: (id: number, row: Record<string, unknown>) => Promise<void>;
        delete: (id: number) => Promise<void>;
        orderBy: (column: string, direction: 'asc' | 'desc') => {
          limit: (n: number) => { get: () => Promise<{ data: unknown[] }> };
        };
      };
    };
  }
}

const BUDGET_OPTIONS = [
  'Under $200',
  '$200 – $500',
  '$500 – $1,000',
  '$1,000 – $2,500',
  '$2,500+',
];

const ITEM_SUGGESTIONS = [
  'Blazer',
  'Oxford shirt',
  'Selvedge denim',
  'Chelsea boots',
  'Merino knit',
  'Overcoat',
  'Chinos',
  'Loafers',
];

const MATERIAL_HINTS = [
  '13oz Japanese selvedge',
  'Super 120s wool',
  'Vegetable-tanned leather',
  'Two-ply cotton poplin',
  'Harris Tweed',
  'Cashmere blend',
];

async function searchWeb(query: string) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, searchType: 'web', num: 10 }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Search failed');
  return data.results as Array<{ title: string; link: string; snippet: string }>;
}

async function generateRecommendation(
  criteria: Omit<ScoutRequest, 'id' | 'status' | 'created_at'>,
  searchResults: Array<{ title: string; link: string; snippet: string }>,
): Promise<Recommendation> {
  const systemPrompt = `You are Ethaion's Maker Scout — an expert valet for timeless menswear with deep knowledge of obscure, artisan, and heritage makers worldwide (Japanese ateliers, Neapolitan tailors, British mills, Scandinavian minimalists, etc.).

Your job: recommend ONE specific brand/maker that best matches the user's criteria. Prioritize lesser-known makers over mainstream luxury. Be transparent and honest about trade-offs.

Respond ONLY with valid JSON (no markdown fences) matching this schema:
{
  "brandName": "string",
  "tagline": "short brand positioning",
  "origin": "city, country",
  "website": "url or empty string",
  "matchScore": 0-100,
  "whyMatch": "2-3 sentences explaining the fit",
  "criteriaBreakdown": [{"criterion": "string", "met": boolean, "note": "brief explanation"}],
  "materialSpecs": [{"label": "Fabric/Material", "value": "specific detail", "match": boolean}, ...],
  "makerHistory": "2-4 sentences on heritage, founding, craft philosophy",
  "costPerWear": {
    "priceEstimate": "$XXX",
    "estimatedYears": number,
    "wearsPerYear": number,
    "costPerWear": "$X.XX",
    "rationale": "1-2 sentences"
  },
  "alternativeNote": "optional note if perfect match unavailable"
}`;

  const userPrompt = `Find an obscure menswear maker for:

Item type: ${criteria.item_type}
Budget: ${criteria.budget}
Material criteria: ${criteria.material_criteria}
Intended use: ${criteria.intended_use}

Web search results for reference:
${searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join('\n\n')}

Recommend the best obscure maker. Include at least 3 materialSpecs entries and 4 criteriaBreakdown items covering item type, budget, materials, and intended use.`;

  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1800,
      temperature: 0.65,
    }),
  });

  if (!res.ok) throw new Error('AI curation unavailable');
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(jsonStr) as Recommendation;
}

function parseRecommendation(row: ScoutRequest): Recommendation | null {
  if (!row.recommendation_json) return null;
  try {
    return JSON.parse(row.recommendation_json) as Recommendation;
  } catch {
    return null;
  }
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MakerScout() {
  const { data: requests, loading, error, refresh } = window.useWorkspaceDB<ScoutRequest>(
    'scout_requests',
    { orderBy: { column: 'created_at', direction: 'desc' }, limit: 50 },
  );

  const [view, setView] = useState<'scout' | 'history'>('scout');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemType, setItemType] = useState('');
  const [budget, setBudget] = useState(BUDGET_OPTIONS[1]);
  const [materialCriteria, setMaterialCriteria] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [scouting, setScouting] = useState(false);
  const [scoutPhase, setScoutPhase] = useState('');
  const [formError, setFormError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const selected = requests?.find((r) => r.id === selectedId) ?? null;
  const selectedRec = selected ? parseRecommendation(selected) : null;
  const latestComplete = requests?.find((r) => r.status === 'complete' && parseRecommendation(r));

  useEffect(() => {
    if (selectedId && selected?.status === 'complete' && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedId, selected?.status]);

  const runScout = async () => {
    const trimmedItem = itemType.trim();
    const trimmedMaterial = materialCriteria.trim();
    const trimmedUse = intendedUse.trim();

    if (!trimmedItem || !trimmedMaterial || !trimmedUse) {
      setFormError('Please complete all fields — specificity yields better matches.');
      return;
    }

    setFormError('');
    setScouting(true);
    setScoutPhase('Logging your brief…');

    let rowId: number | null = null;

    try {
      await window.__workspaceDb.from('scout_requests').insert({
        item_type: trimmedItem,
        budget,
        material_criteria: trimmedMaterial,
        intended_use: trimmedUse,
        status: 'pending',
      });

      const { data: latestRows } = await window.__workspaceDb
        .from('scout_requests')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      rowId = (latestRows?.[0] as ScoutRequest | undefined)?.id ?? null;
      if (!rowId) throw new Error('Could not save scout request');

      setScoutPhase('Searching obscure makers…');
      const searchQuery = `obscure artisan ${trimmedItem} menswear brand ${trimmedMaterial} ${budget} ${trimmedUse}`;
      const searchResults = await searchWeb(searchQuery);

      setScoutPhase('Curating your match…');
      const recommendation = await generateRecommendation(
        {
          item_type: trimmedItem,
          budget,
          material_criteria: trimmedMaterial,
          intended_use: trimmedUse,
        },
        searchResults,
      );

      await window.__workspaceDb.from('scout_requests').update(rowId, {
        status: 'complete',
        recommendation_json: JSON.stringify(recommendation),
      });

      setSelectedId(rowId);
      setItemType('');
      setMaterialCriteria('');
      setIntendedUse('');
      refresh();
      setView('scout');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scout failed';
      if (rowId) {
        await window.__workspaceDb.from('scout_requests').update(rowId, {
          status: 'error',
          error_message: message,
        });
      }
      setFormError(message);
      refresh();
    } finally {
      setScouting(false);
      setScoutPhase('');
    }
  };

  const handleDelete = async (id: number) => {
    await window.__workspaceDb.from('scout_requests').delete(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const displayRec = selectedRec ?? (selectedId ? null : latestComplete ? parseRecommendation(latestComplete) : null);
  const displayRow = selected ?? (displayRec && latestComplete ? latestComplete : null);

  const renderRecommendation = (rec: Recommendation, row: ScoutRequest | null) => (
    <div ref={resultRef} className="space-y-5 transition-opacity duration-500">
      {/* Brand hero */}
      <div className={`${tw.card.default} p-0 overflow-hidden`}>
        <div className="relative px-5 sm:px-6 pt-6 pb-5 border-b border-[var(--space-border-default)]">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--space-brand-primary) 0px, var(--space-brand-primary) 1px, transparent 1px, transparent 12px)',
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`${typography.size.xs} uppercase tracking-[0.2em] ${typography.color.muted} mb-1`}>
                Your match
              </p>
              <h3 className={`${typography.size['2xl']} ${typography.weight.semibold} ${typography.color.primary} leading-tight`}>
                {rec.brandName}
              </h3>
              <p className={`${typography.size.sm} ${typography.color.secondary} mt-1 italic`}>
                {rec.tagline}
              </p>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-2`}>
                {rec.origin}
                {row && ` · Scouted ${formatDate(row.created_at)}`}
              </p>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <div
                className="w-16 h-16 flex flex-col items-center justify-center border-2"
                style={{ borderColor: 'var(--space-brand-primary)' }}
              >
                <span className={`${typography.size.xl} ${typography.weight.bold} ${typography.color.brand}`}>
                  {rec.matchScore}
                </span>
                <span className={`${typography.size.xs} ${typography.color.muted}`}>match</span>
              </div>
            </div>
          </div>
          {rec.website && (
            <a
              href={rec.website.startsWith('http') ? rec.website : `https://${rec.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 mt-4 ${typography.size.sm} ${typography.color.brand} hover:underline`}
            >
              Visit maker <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <div className="px-5 sm:px-6 py-5">
          <p className={`${typography.size.sm} ${typography.color.secondary} leading-relaxed`}>
            {rec.whyMatch}
          </p>
        </div>
      </div>

      {/* Criteria transparency */}
      <div className={`${tw.card.default} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Search className={`w-4 h-4 ${tw.icon.primary}`} />
          <h4 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} uppercase tracking-wide`}>
            Criteria match
          </h4>
        </div>
        <ul className="space-y-3">
          {rec.criteriaBreakdown.map((c, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={`mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center text-xs font-medium ${
                  c.met
                    ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border border-[var(--space-brand-primary)]'
                    : 'border border-[var(--space-border-strong)] text-[var(--space-text-muted)]'
                }`}
              >
                {c.met ? '✓' : '—'}
              </span>
              <div>
                <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary}`}>
                  {c.criterion}
                </p>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>{c.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Material specs */}
      <div className={`${tw.card.default} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Scissors className={`w-4 h-4 ${tw.icon.accent}`} />
          <h4 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} uppercase tracking-wide`}>
            Material specifications
          </h4>
        </div>
        <dl className="divide-y divide-[var(--space-border-default)]">
          {/* Label and value sat on one line, which on a phone squeezed a
              specification like "13oz Japanese selvedge, one-wash" into a
              ragged right-hand column. They stack below sm. */}
          {rec.materialSpecs.map((spec, i) => (
            <div key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <dt className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} sm:shrink-0`}>
                {spec.label}
              </dt>
              <dd className={`${typography.size.sm} ${typography.color.primary} sm:text-right`}>
                {spec.value}
                {spec.match && (
                  <span className={`ml-2 ${typography.size.xs} ${typography.color.brand}`}>✓ criteria met</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Maker history */}
      <div className={`${tw.card.default} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Award className={`w-4 h-4 ${tw.icon.primary}`} />
          <h4 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} uppercase tracking-wide`}>
            Maker history
          </h4>
        </div>
        <p className={`${typography.size.sm} ${typography.color.secondary} leading-relaxed`}>
          {rec.makerHistory}
        </p>
      </div>

      {/* Cost per wear */}
      <div className={`${tw.bg.muted} border border-[var(--space-border-default)] p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className={`w-4 h-4 ${tw.icon.accent}`} />
          <h4 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} uppercase tracking-wide`}>
            Cost-per-wear analysis
          </h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Est. price', value: rec.costPerWear.priceEstimate },
            { label: 'Lifespan', value: `${rec.costPerWear.estimatedYears} yrs` },
            { label: 'Wears / year', value: String(rec.costPerWear.wearsPerYear) },
            { label: 'Cost / wear', value: rec.costPerWear.costPerWear },
          ].map((stat) => (
            <div key={stat.label} className={`${tw.bg.card} p-3 border border-[var(--space-border-default)]`}>
              <p className={`${typography.size.xs} ${typography.color.muted} uppercase tracking-wide`}>
                {stat.label}
              </p>
              <p className={`${typography.size.lg} ${typography.weight.semibold} ${typography.color.primary} mt-1`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
        <p className={`${typography.size.sm} ${typography.color.secondary} leading-relaxed`}>
          {rec.costPerWear.rationale}
        </p>
      </div>

      {rec.alternativeNote && (
        <p className={`${typography.size.xs} ${typography.color.muted} italic px-1`}>
          Note: {rec.alternativeNote}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-full flex flex-col w-full bg-transparent">
      {/* Editorial header strip */}
      {/* The heading and the Scout/History pair shared one row, which on a
          375px screen left the standfirst about 180px to say a full sentence
          in. Below sm they stack: heading and standfirst first, then the two
          views as a full-width pair of 44px targets. */}
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--space-border-default)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className={`hab-section-head ${typography.color.primary}`}>
              Maker Scout
            </h2>
            <p className={`${typography.size.sm} ${typography.color.secondary} mt-1 max-w-md`}>
              Log what you're looking for — we'll surface an obscure maker you couldn't find yourself.
            </p>
          </div>
          <div className="flex gap-1 sm:shrink-0">
            <button
              onClick={() => setView('scout')}
              className={`hab-tap flex-1 sm:flex-none px-3 py-1.5 ${typography.size.sm} font-medium transition-all ${
                view === 'scout'
                  ? `${tw.button.primary}`
                  : `${tw.button.ghost} border border-[var(--space-border-default)]`
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Scout
            </button>
            <button
              onClick={() => setView('history')}
              className={`hab-tap flex-1 sm:flex-none px-3 py-1.5 ${typography.size.sm} font-medium transition-all ${
                view === 'history'
                  ? `${tw.button.primary}`
                  : `${tw.button.ghost} border border-[var(--space-border-default)]`
              }`}
            >
              <History className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              History
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className={`w-7 h-7 animate-spin ${tw.icon.primary}`} />
            <p className={`${typography.size.sm} ${typography.color.muted}`}>Loading your scouts…</p>
          </div>
        ) : error ? (
          <div className="text-center py-20 px-5">
            <p className={`${typography.size.sm} text-[var(--space-semantic-danger)]`}>
              Couldn't load scouts: {error.message}
            </p>
            <button onClick={refresh} className={`mt-3 px-4 py-2 ${typography.size.sm} ${tw.button.secondary}`}>
              Try again
            </button>
          </div>
        ) : view === 'history' ? (
          <div className="p-4 sm:p-5 max-w-2xl">
            {!requests?.length ? (
              <div className="text-center py-16">
                <Search className={`w-10 h-10 mx-auto mb-3 ${tw.icon.muted}`} />
                <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>No scouts yet</p>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
                  Your past recommendations will appear here.
                </p>
                <button
                  onClick={() => setView('scout')}
                  className={`mt-4 px-4 py-2 ${typography.size.sm} ${tw.button.primary}`}
                >
                  Start scouting
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {requests.map((row) => {
                  const rec = parseRecommendation(row);
                  return (
                    <li key={row.id}>
                      <button
                        onClick={() => {
                          setSelectedId(row.id);
                          setView('scout');
                        }}
                        className={`w-full text-left ${tw.card.default} p-4 flex items-center gap-4 hover:border-[var(--space-brand-primary)]/50 transition-all group`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} truncate`}>
                            {rec?.brandName || row.item_type}
                          </p>
                          <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5 truncate`}>
                            {row.item_type} · {row.budget} · {formatDate(row.created_at)}
                          </p>
                        </div>
                        <span
                          className={`${tw.badge.default} ${
                            row.status === 'complete'
                              ? tw.badge.primary
                              : row.status === 'error'
                                ? tw.badge.danger
                                : tw.badge.neutral
                          }`}
                        >
                          {row.status}
                        </span>
                        <ChevronRight className={`w-4 h-4 ${tw.icon.muted} group-hover:translate-x-0.5 transition-transform`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="p-4 sm:p-5 grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-5 sm:gap-6 max-w-5xl">
            {/* Scout form */}
            <div className="space-y-4">
              <div className={`${tw.card.default} p-5`}>
                <h3 className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} uppercase tracking-wide mb-4`}>
                  Your brief
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className={`block ${typography.size.xs} ${typography.weight.medium} ${typography.color.secondary} mb-1.5 uppercase tracking-wide`}>
                      Item type
                    </label>
                    <input
                      type="text"
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                      placeholder="e.g. Unstructured linen blazer"
                      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      disabled={scouting}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ITEM_SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setItemType(s)}
                          className={`hab-tap px-3 py-1 ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-brand-primary)] hover:text-[var(--space-text-primary)] transition-colors`}
                          disabled={scouting}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={`block ${typography.size.xs} ${typography.weight.medium} ${typography.color.secondary} mb-1.5 uppercase tracking-wide`}>
                      Budget
                    </label>
                    <select
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      disabled={scouting}
                    >
                      {BUDGET_OPTIONS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block ${typography.size.xs} ${typography.weight.medium} ${typography.color.secondary} mb-1.5 uppercase tracking-wide`}>
                      Material criteria
                    </label>
                    <textarea
                      value={materialCriteria}
                      onChange={(e) => setMaterialCriteria(e.target.value)}
                      placeholder="e.g. Undyed Irish linen, horn buttons, half-canvas construction"
                      rows={3}
                      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
                      disabled={scouting}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {MATERIAL_HINTS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setMaterialCriteria((prev) => (prev ? `${prev}, ${m}` : m))
                          }
                          className={`hab-tap px-3 py-1 ${typography.size.xs} border border-[var(--space-border-default)] ${typography.color.muted} hover:border-[var(--space-brand-highlight)] transition-colors`}
                          disabled={scouting}
                        >
                          + {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={`block ${typography.size.xs} ${typography.weight.medium} ${typography.color.secondary} mb-1.5 uppercase tracking-wide`}>
                      Intended use
                    </label>
                    <input
                      type="text"
                      value={intendedUse}
                      onChange={(e) => setIntendedUse(e.target.value)}
                      placeholder="e.g. Summer weddings, travel, daily office"
                      className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
                      disabled={scouting}
                    />
                  </div>
                </div>

                {formError && (
                  <p className={`mt-3 ${typography.size.xs} text-[var(--space-semantic-danger)]`}>{formError}</p>
                )}

                <button
                  onClick={runScout}
                  disabled={scouting}
                  className={`w-full mt-5 px-4 py-3 ${typography.size.sm} font-medium flex items-center justify-center gap-2 ${tw.button.primary} disabled:opacity-50`}
                >
                  {scouting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {scoutPhase || 'Scouting…'}
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Scout a maker
                    </>
                  )}
                </button>
              </div>

              {selected && (
                <button
                  onClick={() => setSelectedId(null)}
                  className={`w-full px-3 py-2 ${typography.size.xs} ${tw.button.ghost} flex items-center justify-center gap-1 border border-[var(--space-border-default)]`}
                >
                  <Plus className="w-3 h-3" /> New scout
                </button>
              )}
            </div>

            {/* Results panel */}
            <div className="min-w-0">
              {scouting ? (
                <div className={`${tw.card.default} p-8 flex flex-col items-center justify-center min-h-[320px] text-center`}>
                  <div className="relative w-20 h-20 mb-6">
                    <div
                      className="absolute inset-0 border-2 border-[var(--space-brand-primary)] animate-pulse"
                      style={{ animationDuration: '2s' }}
                    />
                    <div className="absolute inset-3 flex items-center justify-center">
                      <Sparkles className={`w-8 h-8 ${tw.icon.primary}`} />
                    </div>
                  </div>
                  <p className={`${typography.size.base} ${typography.weight.medium} ${typography.color.primary}`}>
                    {scoutPhase || 'Scouting obscure makers…'}
                  </p>
                  <p className={`${typography.size.sm} ${typography.color.muted} mt-2 max-w-xs`}>
                    Searching artisan ateliers and heritage mills worldwide.
                  </p>
                </div>
              ) : displayRec && displayRow ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className={`${typography.size.xs} uppercase tracking-[0.2em] ${typography.color.muted}`}>
                      Recommendation
                    </p>
                    <button
                      onClick={() => handleDelete(displayRow.id)}
                      className={`hab-touch-icon p-1.5 ${tw.button.ghost} text-[var(--space-semantic-danger)] hover:bg-[var(--space-semantic-danger)]/10`}
                      aria-label="Delete scout"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {renderRecommendation(displayRec, displayRow)}
                </div>
              ) : selected?.status === 'error' ? (
                <div className={`${tw.card.default} p-8 text-center`}>
                  <X className={`w-8 h-8 mx-auto mb-3 text-[var(--space-semantic-danger)]`} />
                  <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>Scout failed</p>
                  <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
                    {selected.error_message || 'Something went wrong. Please try again.'}
                  </p>
                </div>
              ) : (
                <div className={`${tw.card.default} p-8 flex flex-col items-center justify-center min-h-[320px] text-center border-dashed`}>
                  <Search className={`w-10 h-10 mb-4 ${tw.icon.muted}`} />
                  <p className={`${typography.size.base} ${typography.weight.medium} ${typography.color.primary}`}>
                    Ready when you are
                  </p>
                  <p className={`${typography.size.sm} ${typography.color.muted} mt-2 max-w-sm leading-relaxed`}>
                    Describe the piece you're hunting — item, budget, materials, and how you'll wear it.
                    We'll return a transparent, criteria-matched recommendation from an obscure maker.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
