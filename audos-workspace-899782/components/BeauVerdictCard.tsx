import type { CSSProperties } from 'react';

export const BEAU_VERDICT_VARIABLES = [
  { variable: 'Material', weight: 5 },
  { variable: 'Construction', weight: 5 },
  { variable: 'Timelessness', weight: 4 },
  { variable: 'Versatility', weight: 3 },
  { variable: 'Brand Integrity', weight: 3 },
] as const;

export type BeauVerdictVariable = (typeof BEAU_VERDICT_VARIABLES)[number]['variable'];
export type BeauVerdictTag = 'BUY IT' | 'HOLD' | 'WALK AWAY';

export interface BeauVerdictScore {
  variable: BeauVerdictVariable;
  weight: 3 | 4 | 5;
  score: number;
  tag: string;
  reason: string;
}

export interface BeauVerdict {
  composite: number;
  verdict: BeauVerdictTag;
  summary: string;
  scores: BeauVerdictScore[];
  scoredForProfile: boolean;
}

const MONO = "'IBM Plex Mono', monospace";
const INK = 'var(--space-text-primary, #241a12)';
const BODY = 'var(--space-text-secondary, #3b2b1d)';
const MUTED = 'var(--space-text-muted, #856c51)';
const PAPER = 'var(--space-surface-card, #fbf8f1)';
const HAIRLINE = 'var(--space-border-default, rgba(59,43,29,.18))';
const STRONG = 'var(--space-border-strong, rgba(59,43,29,.34))';

function mono(size: number, color: string, tracking = '0.1em'): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: `${size}px`,
    letterSpacing: tracking,
    textTransform: 'uppercase',
    color,
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function clampWholeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) return null;
  return value;
}

export function verdictTagForComposite(composite: number): BeauVerdictTag {
  if (composite >= 8) return 'BUY IT';
  if (composite >= 5.5) return 'HOLD';
  return 'WALK AWAY';
}

/**
 * Accept model or persisted data only when all five locked variables exist.
 * Weights, composite and verdict are recalculated here so model arithmetic can
 * never change the scoring system.
 */
export function normalizeBeauVerdict(value: unknown, scoredForProfile?: boolean): BeauVerdict | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawScores = Array.isArray(raw.scores) ? raw.scores : [];
  const scores: BeauVerdictScore[] = [];

  for (const definition of BEAU_VERDICT_VARIABLES) {
    const candidate = rawScores.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return cleanText((entry as Record<string, unknown>).variable, 40).toLowerCase() === definition.variable.toLowerCase();
    }) as Record<string, unknown> | undefined;
    if (!candidate) return null;
    const score = clampWholeScore(candidate.score);
    const tag = cleanText(candidate.tag, 48);
    const reason = cleanText(candidate.reason, 240);
    const tagWords = tag ? tag.split(/\s+/).length : 0;
    if (score === null || tagWords < 2 || tagWords > 4 || !reason) return null;
    scores.push({
      variable: definition.variable,
      weight: definition.weight,
      score,
      tag,
      reason,
    });
  }

  const summary = cleanText(raw.summary, 320);
  if (!summary) return null;
  const weightedTotal = scores.reduce((total, row) => total + row.score * row.weight, 0);
  const composite = Math.round((weightedTotal / 20 + Number.EPSILON) * 10) / 10;
  return {
    composite,
    verdict: verdictTagForComposite(composite),
    summary,
    scores,
    scoredForProfile: typeof scoredForProfile === 'boolean' ? scoredForProfile : raw.scoredForProfile === true,
  };
}

export function parseBeauVerdict(value: unknown, scoredForProfile?: boolean): BeauVerdict | null {
  if (typeof value !== 'string') return normalizeBeauVerdict(value, scoredForProfile);
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (parsed && typeof parsed === 'object' && 'verdictCard' in (parsed as Record<string, unknown>)) {
    return normalizeBeauVerdict((parsed as Record<string, unknown>).verdictCard, scoredForProfile);
  }
  return normalizeBeauVerdict(parsed, scoredForProfile);
}

const TONES: Record<BeauVerdictTag, { ink: string; wash: string; border: string }> = {
  'BUY IT': {
    ink: 'var(--space-semantic-success-700, #37503c)',
    wash: 'color-mix(in srgb, var(--space-semantic-success-500, #4e6a50) 10%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-success-500, #4e6a50) 42%, transparent)',
  },
  HOLD: {
    ink: 'var(--space-semantic-warning-700, #5c3413)',
    wash: 'color-mix(in srgb, var(--space-semantic-warning-500, #96631f) 10%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-warning-500, #96631f) 42%, transparent)',
  },
  'WALK AWAY': {
    ink: 'var(--space-semantic-danger-700, #6f2a20)',
    wash: 'color-mix(in srgb, var(--space-semantic-danger-500, #a34e40) 10%, transparent)',
    border: 'color-mix(in srgb, var(--space-semantic-danger-500, #a34e40) 42%, transparent)',
  },
};

export function BeauVerdictCard({ verdict, className = '' }: { verdict: BeauVerdict; className?: string }) {
  const normalized = normalizeBeauVerdict(verdict);
  if (!normalized) return null;
  const tone = TONES[normalized.verdict];

  return (
    <div className={className} data-testid="beau-verdict-card">
      <article style={{ background: PAPER, border: `1px solid ${STRONG}` }} aria-label={`Beau verdict: ${normalized.verdict}`}>
        <header
          className="flex items-end justify-between gap-5"
          style={{ padding: '18px 18px 16px', borderBottom: `1px solid ${HAIRLINE}`, background: tone.wash }}
        >
          <div>
            <p style={{ ...mono(8.5, MUTED, '0.13em'), margin: 0 }}>Beau score</p>
            <p
              style={{
                fontFamily: 'var(--space-font-heading, "Cormorant Garamond", serif)',
                fontSize: '54px',
                fontWeight: 400,
                lineHeight: 0.86,
                color: INK,
                margin: '10px 0 0',
                fontFeatureSettings: "'tnum'",
              }}
            >
              {normalized.composite.toFixed(1)}
            </p>
          </div>
          <span style={{ ...mono(10, tone.ink, '0.12em'), border: `1px solid ${tone.border}`, padding: '7px 10px' }}>
            {normalized.verdict}
          </span>
        </header>

        <p
          style={{
            fontFamily: 'var(--space-font-heading, "Cormorant Garamond", serif)',
            fontSize: '20px',
            lineHeight: 1.35,
            color: INK,
            margin: 0,
            padding: '15px 18px',
            borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          {normalized.summary}
        </p>

        <div>
          {normalized.scores.map((row, index) => (
            <div
              key={row.variable}
              style={{ padding: '13px 18px 14px', borderTop: index === 0 ? 'none' : `1px solid ${HAIRLINE}` }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span style={{ ...mono(8.5, MUTED, '0.11em'), fontWeight: 500 }}>{row.variable}</span>
                <span style={{ ...mono(10, INK, '0.04em'), fontFeatureSettings: "'tnum'" }}>{row.score}/10</span>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.35, fontWeight: 600, color: BODY, margin: '5px 0 0' }}>{row.tag}</p>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: BODY, margin: '3px 0 0' }}>{row.reason}</p>
              <div style={{ width: `${(row.weight / 5) * 100}%`, height: '3px', background: tone.ink, marginTop: '9px' }} aria-hidden="true" />
            </div>
          ))}
        </div>
      </article>
      {normalized.scoredForProfile && (
        <p style={{ ...mono(8, MUTED, '0.07em'), margin: '8px 0 0' }}>Scored for your wardrobe and profile.</p>
      )}
    </div>
  );
}

export default BeauVerdictCard;
