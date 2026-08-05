/**
 * Wardrobe composition — a compact, expandable visual breakdown card.
 *
 * Three views, computed live from the logged pieces:
 *  - By category: a donut of Tops / Bottoms / Outerwear / Shoes / … shares
 *  - By material: natural fibres vs synthetic vs unrecorded
 *  - By milestone: a small progress bar per journey stage
 * Deliberately a card, not a dashboard — collapsed to one summary line.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, PieChart } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  WARDROBE_CATEGORIES,
  materialFor,
  type WardrobePiece,
} from './profile-data';
import { computeMilestones } from './milestones';

// Warm Editorial chart palette: tobacco gold leads, then steps drawn from the
// design system's accent, oxblood and neutral ramps — tuned for the oatmeal
// ground, never introducing colours outside the system.
const SEGMENT_COLORS = [
  '#a8712c', '#7c4a17', '#856c51', '#a34e40', '#634e38', '#b07d31', '#a68e70', '#5c3413', '#c5b193', '#6f2a20', '#453325',
];

// A useful starter wardrobe, not a shopping quota. Counts above the baseline
// stay full rather than turning the chart into an endless accumulation game.
const RECOMMENDED_BASELINE: Record<string, number> = {
  tops: 5,
  bottoms: 4,
  shoes: 3,
  outerwear: 3,
  knitwear: 3,
  formalwear: 1,
  accessories: 3,
  'base-layers': 4,
  bags: 1,
  hats: 1,
  headwear: 1,
};

const NATURAL_RE = /cotton|wool|linen|leather|suede|cashmere|silk|denim|canvas|merino|lambswool|shetland|tweed|flannel|corduroy|moleskin|hemp|mohair|alpaca|down|horsehide|cordovan/i;
const SYNTHETIC_RE = /polyester|nylon|acrylic|elastane|spandex|polyamide|viscose|rayon|synthetic|fleece|polar|pu |polyurethane|gore-?tex/i;

function Donut({ segments, size = 108 }: { segments: Array<{ label: string; count: number; color: string }>; size?: number }) {
  const total = segments.reduce((acc, s) => acc + s.count, 0);
  if (total === 0) return null;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wardrobe share by category">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--space-surface-muted)" strokeWidth={stroke} />
      {segments.map((seg) => {
        const frac = seg.count / total;
        const dash = frac * c;
        const el = (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          >
            <title>{`${seg.label}: ${seg.count}`}</title>
          </circle>
        );
        offset += dash;
        return el;
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="600" fill="var(--space-text-primary)">
        {total}
      </text>
    </svg>
  );
}

function ShareBar({ parts }: { parts: Array<{ label: string; count: number; color: string }> }) {
  const total = parts.reduce((acc, p) => acc + p.count, 0);
  if (total === 0) return null;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--space-surface-muted)]">
        {parts.filter((p) => p.count > 0).map((p) => (
          <span key={p.label} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.count}`} />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {parts.filter((p) => p.count > 0).map((p) => (
          <span key={p.label} className={`${typography.size.xs} ${typography.color.secondary} inline-flex items-center gap-1`} style={{ fontSize: '10px' }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            {p.label} · {Math.round((p.count / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function WardrobeComposition({
  pieces,
  materials = {},
}: {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
}) {
  const [open, setOpen] = useState(false);

  const categorySegments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pieces) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return WARDROBE_CATEGORIES
      .filter((c) => (RECOMMENDED_BASELINE[c.id] || 0) > 0)
      .map((c, i) => ({
        id: c.id,
        label: c.label,
        count: counts.get(c.id) || 0,
        recommended: RECOMMENDED_BASELINE[c.id],
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      }));
  }, [pieces]);

  const materialParts = useMemo(() => {
    let natural = 0;
    let synthetic = 0;
    let unknown = 0;
    for (const p of pieces) {
      const m = materialFor(p, materials);
      if (!m) unknown += 1;
      else if (SYNTHETIC_RE.test(m)) synthetic += 1;
      else if (NATURAL_RE.test(m)) natural += 1;
      else unknown += 1;
    }
    return [
      { label: 'Natural fibres', count: natural, color: '#7c4a17' },
      { label: 'Synthetic', count: synthetic, color: '#a34e40' },
      { label: 'Not recorded', count: unknown, color: '#a68e70' },
    ];
  }, [pieces, materials]);

  const { milestones } = useMemo(() => computeMilestones(pieces), [pieces]);
  const currentStage = milestones.find((m) => m.done < m.total) || milestones[milestones.length - 1];

  if (pieces.length === 0) return null;

  const ownedCategorySegments = categorySegments.filter((segment) => segment.count > 0);
  const topShare = ownedCategorySegments.length > 0
    ? [...ownedCategorySegments].sort((a, b) => b.count - a.count)[0]
    : null;

  return (
    <div className={`${tw.card.default} rounded-2xl`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <PieChart className={`w-4 h-4 ${tw.icon.primary} flex-shrink-0`} />
          <span className="min-w-0">
            <span className={`block ${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              Wardrobe composition
            </span>
            <span className={`block ${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              {topShare
                ? `${pieces.length} pieces — mostly ${topShare.label.toLowerCase()} · on the ${currentStage.label} stage (${currentStage.done}/${currentStage.total})`
                : `${pieces.length} pieces logged`}
            </span>
          </span>
        </span>
        <ChevronRight className={`w-4 h-4 text-[var(--space-text-muted)] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[var(--space-border-default)] pt-3 space-y-4">
          {/* By category — current count against a restrained baseline */}
          <div>
            <div className="flex items-center gap-4 flex-wrap mb-3">
              <Donut segments={categorySegments.filter((segment) => segment.count > 0)} />
              <div className="flex-1 min-w-[12rem]">
                <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted}`}>
                  Category balance
                </p>
                <p className={`${typography.size.xs} ${typography.color.secondary} mt-1 leading-relaxed`}>
                  Your count against a versatile starter baseline. More is not automatically better.
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              {categorySegments.map((seg) => {
                const pct = Math.min(100, Math.round((seg.count / seg.recommended) * 100));
                return (
                  <div key={seg.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`${typography.size.xs} ${typography.color.primary}`}>{seg.label}</span>
                      <span className={`${typography.size.xs} ${typography.color.muted} tabular-nums`}>
                        {seg.count} piece{seg.count === 1 ? '' : 's'} — recommended: {seg.recommended}+
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full overflow-hidden bg-[var(--space-surface-muted)]">
                      <span
                        className="block h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: seg.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By material */}
          <div>
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted} mb-1.5`}>
              By material
            </p>
            <ShareBar parts={materialParts} />
          </div>

          {/* By milestone */}
          <div>
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted} mb-1.5`}>
              Milestone journey
            </p>
            <div className="space-y-1.5">
              {milestones.map((m) => {
                const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                const isCurrent = m.id === currentStage.id;
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className={`${typography.size.xs} w-32 flex-shrink-0 ${isCurrent ? `${typography.weight.semibold} ${typography.color.primary}` : typography.color.muted}`} style={{ fontSize: '10px' }}>
                      {m.label}{isCurrent ? ' • now' : ''}
                    </span>
                    <span className="flex-1 h-1.5 rounded-full bg-[var(--space-surface-muted)] overflow-hidden">
                      <span className="block h-full rounded-full bg-[var(--space-brand-primary)] transition-all" style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`${typography.size.xs} ${typography.color.secondary} tabular-nums w-8 text-right`} style={{ fontSize: '10px' }}>
                      {m.done}/{m.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
