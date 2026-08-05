/**
 * THE BRIEFING — the seasonal synthesis pass that sits under "What to
 * acquire next" in The Edit.
 *
 * WHAT IT IS NOT: a reformatted "What to acquire next". That list stays
 * exactly as built — live, atomic, ranked, link-forward to The Rail. The
 * Briefing is a SECOND, deeper reasoning pass over the same underlying gap
 * data, and it does the two things an atomic list structurally cannot:
 *
 *   1. SYNTHESIS — it connects several independent gaps into one
 *      throughline ("three gaps this season point the same direction")
 *      instead of listing them one at a time.
 *   2. SEASON-OVER-SEASON MEMORY — it compares this read to the last one
 *      ("the formal-footwear gap flagged last season is closed — the Loake
 *      1880s you added cover it"). This is the half no free tool can
 *      produce, because it needs a stored history.
 *
 * HOW THE MEMORY WORKS: every generated Briefing writes a row to the
 * `briefings` table carrying a GAP SNAPSHOT — what Beau had flagged, and
 * which pieces were owned, at the moment of writing. The next generation
 * reads the most recent snapshot back, diffs it against the current
 * assessment (diffSnapshots below — deterministic, not guessed by the
 * model) and hands both the raw snapshot and the computed diff to the
 * model, so "Since last time" states facts rather than impressions.
 *
 * The generation reuses the SAME reasoning transport as Beau's verdict and
 * "What to acquire next" (claude.ts — Sonnet, then Sonnet 4, then Haiku,
 * then the platform OpenAI proxy as the never-dead-end fallback), with an
 * expanded prompt: current gaps + the stored snapshot + an instruction to
 * synthesise rather than list.
 *
 * ENTITLEMENT: v1 ships UNLOCKED for every user while the feature is being
 * validated — there is deliberately no subscription/paywall flag here. A
 * future phase adds one; it belongs at the entry points below
 * (canGenerateBriefing / generateBriefing), not sprinkled through the UI.
 *
 * The user's own piece labels are sacred here as everywhere: "M43" stays
 * "M43".
 */

import { callClaude as callClaudeShared, CLAUDE_HAIKU, CLAUDE_SONNET, CLAUDE_SONNET_4 } from './claude';
import type { BeauAssessment } from './beau-assessment';
import type { StyleProfile, WardrobePiece } from './profile-data';

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

/** Fired whenever a Briefing is written, so live surfaces can refresh. */
export const BRIEFING_EVENT = 'ethaion:briefing-updated';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriefingGapEntry {
  pieceName: string;
  category: string;
  subType: string;
  archetypesServed: string[];
}

/** What was flagged — and what was owned — at generation time. */
export interface BriefingGapSnapshot {
  seasonLabel: string;
  takenAt: string;
  verdict: string;
  priority: { step: number; headline: string; why: string } | null;
  /** Foundation steps not yet complete when this Briefing was written. */
  openSteps: Array<{ step: number; name: string; read: string }>;
  gaps: BriefingGapEntry[];
  /** Archetype essentials still open, flattened for a cheap diff. */
  archetypeGaps: string[];
  /** The user's own labels for everything owned at the time. */
  ownedLabels: string[];
}

export interface BriefingSections {
  heading: string;
  opening: string;
  /** Null on the very first Briefing — there is nothing to compare to yet. */
  sinceLastTime: string | null;
  pathForward: string;
  /** The pieces named in pathForward, in the order they were sequenced. */
  referencedPieces: Array<{ label: string; category: string }>;
}

export interface BriefingRecord {
  id: number;
  seasonLabel: string;
  generatedAt: string;
  sections: BriefingSections;
  /** The whole document as plain text — what the export writes out. */
  content: string;
  gapSnapshot: BriefingGapSnapshot | null;
  engine: string;
}

/** The diff the model is handed so "Since last time" states facts. */
export interface BriefingDiff {
  closedGaps: BriefingGapEntry[];
  carriedGaps: BriefingGapEntry[];
  freshGaps: BriefingGapEntry[];
  newlyOwnedPieces: string[];
}

// ---------------------------------------------------------------------------
// Season labelling — "Summer 2027" on cycle, "Generated 3 August" off it.
// ---------------------------------------------------------------------------

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The season this date falls in. December belongs to the winter it opens. */
export function currentSeasonLabel(date: Date = new Date()): string {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month <= 1) return `Winter ${year}`;
  if (month <= 4) return `Spring ${year}`;
  if (month <= 7) return `Summer ${year}`;
  if (month <= 10) return `Autumn ${year}`;
  return `Winter ${year + 1}`;
}

function offCycleLabel(date: Date = new Date()): string {
  return `Generated ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/**
 * The dateline for a Briefing generated now: the season, unless this
 * season's Briefing already exists — a second pass inside the same season
 * is off-cycle and is dated instead.
 */
export function datelineFor(previous: BriefingRecord | null, date: Date = new Date()): string {
  const season = currentSeasonLabel(date);
  const written = previous?.gapSnapshot?.seasonLabel || previous?.seasonLabel || '';
  return written.toLowerCase().startsWith(season.toLowerCase()) ? offCycleLabel(date) : season;
}

/** True when the season has turned since the last Briefing was written. */
export function seasonHasTurned(previous: BriefingRecord | null, date: Date = new Date()): boolean {
  if (!previous) return false;
  const written = previous.gapSnapshot?.seasonLabel || previous.seasonLabel || '';
  return !written.toLowerCase().startsWith(currentSeasonLabel(date).toLowerCase());
}

// ---------------------------------------------------------------------------
// Snapshots, and the diff between two of them
// ---------------------------------------------------------------------------

function gapKey(gap: BriefingGapEntry): string {
  return `${(gap.category || '').toLowerCase()}\u241f${(gap.subType || gap.pieceName || '').toLowerCase()}`;
}

/** The gap state to store alongside a Briefing, for the next one to diff. */
export function buildGapSnapshot(
  assessment: BeauAssessment,
  pieces: WardrobePiece[],
  seasonLabel: string,
): BriefingGapSnapshot {
  return {
    seasonLabel,
    takenAt: new Date().toISOString(),
    verdict: assessment.verdict || '',
    priority: assessment.currentPriority,
    openSteps: (assessment.foundation || [])
      .filter((step) => step.status !== 'complete')
      .map((step) => ({ step: step.step, name: step.name, read: step.read })),
    gaps: (assessment.recommendations || []).map((rec) => ({
      pieceName: rec.pieceName,
      category: rec.category,
      subType: rec.subType,
      archetypesServed: rec.archetypesServed,
    })),
    archetypeGaps: (assessment.archetypeCoverage || []).flatMap((cov) =>
      (cov.missing || []).map((item) => `${cov.archetype}: ${item}`),
    ),
    ownedLabels: pieces.filter((p) => p.id > 0).map((p) => p.name),
  };
}

/**
 * What closed, what carried over, what is new — computed from the two
 * snapshots rather than left to the model to infer. A gap counts as closed
 * when neither its exact sub-type nor its category still appears among the
 * gaps flagged now.
 */
export function diffSnapshots(previous: BriefingGapSnapshot | null, current: BriefingGapSnapshot): BriefingDiff {
  if (!previous) {
    return { closedGaps: [], carriedGaps: [], freshGaps: current.gaps, newlyOwnedPieces: [] };
  }
  const currentKeys = new Set(current.gaps.map(gapKey));
  const currentCategories = new Set(current.gaps.map((g) => (g.category || '').toLowerCase()).filter(Boolean));
  const previousKeys = new Set(previous.gaps.map(gapKey));
  const previouslyOwned = new Set((previous.ownedLabels || []).map((l) => l.toLowerCase().trim()));

  const closedGaps: BriefingGapEntry[] = [];
  const carriedGaps: BriefingGapEntry[] = [];
  for (const gap of previous.gaps || []) {
    const stillOpen = currentKeys.has(gapKey(gap)) || currentCategories.has((gap.category || '').toLowerCase());
    (stillOpen ? carriedGaps : closedGaps).push(gap);
  }

  return {
    closedGaps,
    carriedGaps,
    freshGaps: current.gaps.filter((gap) => !previousKeys.has(gapKey(gap))),
    newlyOwnedPieces: (current.ownedLabels || []).filter((l) => !previouslyOwned.has(l.toLowerCase().trim())),
  };
}

// ---------------------------------------------------------------------------
// Persistence — the `briefings` table
// ---------------------------------------------------------------------------

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function rowToBriefing(row: any): BriefingRecord {
  const sections = parseJsonField<Partial<BriefingSections>>(row.sections, {});
  return {
    id: Number(row.id),
    seasonLabel: row.season_label || '',
    generatedAt: row.generated_at || row.created_at || '',
    content: row.content || '',
    engine: row.engine || '',
    gapSnapshot: parseJsonField<BriefingGapSnapshot | null>(row.gap_snapshot, null),
    sections: {
      heading: sections.heading || 'Where things stand.',
      opening: sections.opening || '',
      sinceLastTime: sections.sinceLastTime || null,
      pathForward: sections.pathForward || '',
      referencedPieces: Array.isArray(sections.referencedPieces) ? sections.referencedPieces : [],
    },
  };
}

/** Every Briefing this visitor has, newest first. */
export async function fetchBriefings(limit = 12): Promise<BriefingRecord[]> {
  try {
    const { data } = await ws().from('briefings').orderBy('created_at', 'desc').limit(limit).get();
    return (data || []).map(rowToBriefing);
  } catch (e) {
    console.warn('[Ethaion] briefing history fetch failed (non-fatal):', e);
    return [];
  }
}

/** The most recent Briefing, or null when none has ever been written. */
export async function fetchLatestBriefing(): Promise<BriefingRecord | null> {
  const list = await fetchBriefings(1);
  return list[0] || null;
}

// ---------------------------------------------------------------------------
// The prompt — expanded from the assessment pass: synthesise, don't list,
// and compare against the stored season memory.
// ---------------------------------------------------------------------------

export const BRIEFING_SYSTEM_PROMPT = `You are Beau — a personal wardrobe advisor for a man building a classic, intentional, quality-first wardrobe. You are writing THE BRIEFING: a short seasonal document addressed to him personally.

WHAT THE BRIEFING IS — AND IS NOT
He already has "What to acquire next": a live, ranked list of individual gaps, each with its own rationale, each linking through to product picks. The Briefing is NOT that list rewritten, reordered or expanded. Never restate it gap by gap. Your job is the two things an atomic list structurally cannot do:
1. SYNTHESIS — find the THROUGHLINE. Several separate gaps almost always point the same direction: one register that is thin, one context his wardrobe is not built for, one habit in how he buys. Name that single thing and show how the individual gaps are symptoms of it. If the gaps genuinely share no throughline, say so plainly and explain what that means, rather than forcing a pattern.
2. SEASON-OVER-SEASON MEMORY — you are given what you flagged last time and what he owns now. Say what has closed, name the piece he added that closed it in HIS words, and say whether this season's gaps are carried over or new.

VOICE AND FORM — this is a document, not a dashboard
- Continuous prose. Sentences and paragraphs. NEVER bullet points, NEVER numbered lists, NEVER sub-headings inside a section, NEVER bold labels or markdown of any kind.
- Second person, addressed to him. British English. Considered, unhurried, quietly authoritative. Never salesy, never breathless; no filler opener such as "Great news", and no sign-off.
- HIS LABELS ARE SACRED: refer to pieces he owns ONLY by the exact label he gave them. If the label says "M43", write "M43" — never expand, correct or substitute it.
- Pieces he does not yet own are named generically but specifically enough to shop for ("a chambray shirt", "mid-weight flannel trousers"). Do not invent brand claims beyond the example makers you were given.
- Personalisation should show: name the measurement, complexion, budget or lifestyle consideration when it drives the reasoning.

THE SECTIONS
heading — a single short sentence, 2 to 6 words, ending in a full stop. The document's title, in his register (e.g. "Where things stand.", "A season of consolidation."). Never a question, never a gap name.
opening — 60 to 110 words. The synthesis. State the throughline in the first sentence, show how this season's gaps sit inside it, then say what closing it properly asks of him. Prose only.
sinceLastTime — 2 to 3 sentences, ONLY when you were given a previous briefing. What closed (naming the piece he added, in his words), and whether this season's gaps are new or carried over. If you were given no previous briefing, return null — do not invent a history and do not write a placeholder.
pathForward — 80 to 140 words of SEQUENCED reasoning, not a list. Say what to start with and why that piece unlocks the most; say what follows it and what it depends on; say plainly what can wait and why nothing is blocked without it. The order, and the reason FOR the order, are the whole point. Prose only.
referencedPieces — the pieces you named in pathForward that he does not yet own, in the order you sequenced them, each with the wardrobe category it sits in (Tops, Bottoms, Shoes, Outerwear, Knitwear, Formalwear, Accessories). Between 0 and 4 entries. These become links through to his product picks, so name each one exactly as it appears in your prose.

OUTPUT — return ONLY valid JSON, no markdown fences, no prose before or after:
{
  "heading": "...",
  "opening": "...",
  "sinceLastTime": "..." or null,
  "pathForward": "...",
  "referencedPieces": [{ "label": "...", "category": "..." }]
}`;

function buildBriefingUserMessage(
  assessment: BeauAssessment,
  profile: StyleProfile | null,
  snapshot: BriefingGapSnapshot,
  previous: BriefingRecord | null,
  diff: BriefingDiff,
): string {
  const payload = {
    dateline: snapshot.seasonLabel,
    isFirstBriefing: !previous,
    him: {
      styleDirections: (profile?.archetypes || []).filter(Boolean),
      lifestyle: profile?.lifestyle || null,
      skinTone: profile?.skin_tone || null,
      build: profile?.build || null,
      heightRange: profile?.height_range || null,
    },
    thisSeason: {
      yourVerdict: assessment.verdict,
      currentPriority: assessment.currentPriority,
      openFoundationSteps: snapshot.openSteps,
      gapsFlaggedNow: (assessment.recommendations || []).map((rec) => ({
        pieceName: rec.pieceName,
        category: rec.category,
        subType: rec.subType,
        whyNow: rec.whyNow,
        archetypesServed: rec.archetypesServed,
        exampleBrand: rec.exampleBrand,
        fitNote: rec.fitNote,
      })),
      archetypeEssentialsStillOpen: snapshot.archetypeGaps,
      wardrobeHeOwnsNow: snapshot.ownedLabels,
    },
    previousBriefing: previous
      ? {
          dateline: previous.seasonLabel,
          writtenAt: previous.generatedAt,
          whatYouFlaggedThen: previous.gapSnapshot?.gaps || [],
          whatHeOwnedThen: previous.gapSnapshot?.ownedLabels || [],
          whatYouWroteThen: previous.sections.opening,
        }
      : null,
    sinceLastBriefing: previous
      ? {
          gapsNowClosed: diff.closedGaps,
          gapsCarriedOver: diff.carriedGaps,
          gapsNewThisSeason: diff.freshGaps,
          piecesHeAddedSinceThen: diff.newlyOwnedPieces,
        }
      : null,
  };

  return [
    'Here is everything you need to write his Briefing — his profile, the gaps you have flagged this season, what he owns now, and (when there is one) the Briefing you wrote last time with the gap state you recorded then:',
    JSON.stringify(payload, null, 2),
    'Write the Briefing and respond with ONLY the JSON object described in your instructions. Synthesise — do not list the gaps back to him.',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Model transport — the same ladder the assessment uses.
// ---------------------------------------------------------------------------

function callClaude(model: string, user: string): Promise<string | null> {
  return callClaudeShared({
    model,
    system: [{ text: BRIEFING_SYSTEM_PROMPT, cache: true }],
    user,
    maxTokens: 1600,
    temperature: 0.55,
  });
}

async function callGptFallback(user: string): Promise<string | null> {
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        max_tokens: 1600,
        temperature: 0.55,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] briefing fallback call failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch { /* unparseable */ }
    }
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Strip any list scaffolding the model reached for despite the brief. */
function asProse(value: unknown): string {
  return str(value)
    .replace(/\*\*/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-\u2022*\u2013]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ');
}

function parseBriefing(text: string, hasPrevious: boolean): BriefingSections | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object') return null;
  const opening = asProse(raw.opening);
  const pathForward = asProse(raw.pathForward ?? raw.path_forward ?? raw.theConsideredPathForward);
  if (!opening && !pathForward) return null;

  const since = asProse(raw.sinceLastTime ?? raw.since_last_time);
  const rawPieces = raw.referencedPieces ?? raw.referenced_pieces;
  const referencedPieces: Array<{ label: string; category: string }> = [];
  for (const item of Array.isArray(rawPieces) ? rawPieces : []) {
    const pieceLabel = typeof item === 'string' ? item.trim() : str(item?.label) || str(item?.pieceName);
    if (!pieceLabel) continue;
    referencedPieces.push({ label: pieceLabel, category: typeof item === 'string' ? '' : str(item?.category) });
    if (referencedPieces.length >= 4) break;
  }

  return {
    heading: str(raw.heading) || 'Where things stand.',
    opening,
    // A first Briefing has no history to compare against — never let a
    // hallucinated "since last time" through.
    sinceLastTime: hasPrevious && since ? since : null,
    pathForward,
    referencedPieces,
  };
}

// ---------------------------------------------------------------------------
// The plain-text document — what the export writes out.
// ---------------------------------------------------------------------------

export function briefingToPlainText(seasonLabel: string, sections: BriefingSections): string {
  const parts = [`BRIEFING — ${seasonLabel.toUpperCase()}`, '', sections.heading, '', sections.opening];
  if (sections.sinceLastTime) parts.push('', 'SINCE LAST TIME', sections.sinceLastTime);
  parts.push('', 'THE CONSIDERED PATH FORWARD', sections.pathForward);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Generation — the one public entry point
// ---------------------------------------------------------------------------

export interface GenerateBriefingInput {
  assessment: BeauAssessment;
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  /** Skip the read of the latest row when the caller already holds it. */
  previous?: BriefingRecord | null;
  onPhase?: (phase: string) => void;
}

/**
 * v1 gate: the Briefing needs a live assessment to reason over, and nothing
 * else — no entitlement check while the feature is being validated. The
 * future subscription flag belongs here.
 */
export function canGenerateBriefing(assessment: BeauAssessment | null): boolean {
  return !!assessment && (!!assessment.verdict || (assessment.recommendations || []).length > 0);
}

let inflight: Promise<BriefingRecord> | null = null;

/**
 * Write this season's Briefing: read the last stored snapshot, diff it
 * against the current assessment, reason over both, and persist the result
 * with a fresh snapshot for the NEXT Briefing to diff against.
 */
export async function generateBriefing(input: GenerateBriefingInput): Promise<BriefingRecord> {
  if (inflight) return inflight;

  const job = (async (): Promise<BriefingRecord> => {
    const { assessment, profile, pieces, onPhase } = input;
    onPhase?.('Beau is re-reading his last Briefing\u2026');
    const previous = input.previous !== undefined ? input.previous : await fetchLatestBriefing();

    const seasonLabel = datelineFor(previous);
    const snapshot = buildGapSnapshot(assessment, pieces, seasonLabel);
    const diff = diffSnapshots(previous?.gapSnapshot || null, snapshot);
    const user = buildBriefingUserMessage(assessment, profile, snapshot, previous, diff);

    onPhase?.(previous ? 'Beau is comparing this season to the last\u2026' : 'Beau is drawing the season together\u2026');

    let engine = 'claude-sonnet';
    let text = await callClaude(CLAUDE_SONNET, user);
    if (!text) text = await callClaude(CLAUDE_SONNET_4, user);
    if (!text) {
      engine = 'claude-haiku';
      text = await callClaude(CLAUDE_HAIKU, user);
    }
    if (!text) {
      engine = 'gpt-fallback';
      text = await callGptFallback(user);
    }
    if (!text) throw new Error('Beau couldn\u2019t reach his desk just now — try again in a moment.');

    const sections = parseBriefing(text, !!previous);
    if (!sections) throw new Error('Beau lost his thread writing this one — try again in a moment.');

    const content = briefingToPlainText(seasonLabel, sections);
    const generatedAt = new Date().toISOString();
    const fields = {
      // user_id stays null in v1: the platform already scopes every row to
      // the visitor's session. The column is there for the future signed-in
      // identity that will carry Briefings across devices.
      generated_at: generatedAt,
      gap_snapshot: JSON.stringify(snapshot),
      sections: JSON.stringify(sections),
      content,
      season_label: seasonLabel,
      engine,
    };

    let id = 0;
    try {
      await ws().from('briefings').insert(fields);
      const { data } = await ws().from('briefings').orderBy('created_at', 'desc').limit(1).get();
      id = Number(data?.[0]?.id) || 0;
    } catch (e) {
      // A storage failure must not throw away the document the user just
      // spent a call on — it still renders; only the season memory is lost.
      console.warn('[Ethaion] could not store the Briefing (non-fatal):', e);
    }

    const record: BriefingRecord = { id, seasonLabel, generatedAt, sections, content, gapSnapshot: snapshot, engine };
    window.dispatchEvent(new CustomEvent(BRIEFING_EVENT, { detail: { id } }));
    return record;
  })();

  inflight = job.finally(() => {
    inflight = null;
  });
  return inflight;
}

// ---------------------------------------------------------------------------
// Export — the one artifact in the app worth keeping outside it. The print
// stylesheet IS the PDF: every platform's print dialogue offers "Save as
// PDF", so this needs no rendering dependency.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function briefingPrintHtml(record: BriefingRecord): string {
  const { sections } = record;
  const since = sections.sinceLastTime
    ? `<section class="since"><h2>Since last time</h2><p>${escapeHtml(sections.sinceLastTime)}</p></section>`
    : '';
  // The sheet carries the app's type and palette, not the mockup's: Cormorant
  // Garamond headings, Lora body, Courier New section labels, and oxblood
  // rather than gold on every accent.
  const css = [
    '@page { margin: 22mm 20mm; }',
    'body { margin: 0; background: #fbf8f1; color: #3b2b1d; font-family: Lora, serif; }',
    '.sheet { max-width: 640px; margin: 0 auto; padding: 48px 8px; }',
    '.dateline { font-family: "Courier New", monospace; font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #8b3a3a; margin: 0 0 10px; }',
    'h1 { font-family: "Cormorant Garamond", serif; font-weight: 400; font-size: 28px; line-height: 1.2; margin: 0 0 28px; }',
    'h2 { font-family: "Courier New", monospace; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #8b3a3a; font-weight: 400; margin: 0 0 8px; }',
    'p { font-size: 15px; line-height: 1.75; margin: 0 0 28px; }',
    '.since { border-left: 2px solid #8b3a3a; padding-left: 18px; margin-bottom: 30px; }',
    '.since p { color: #634e38; font-size: 14px; line-height: 1.65; margin: 0; }',
    'footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid rgba(59,43,29,0.18); font-size: 11px; color: #856c51; }',
    '@media print { body { background: #fff; } .sheet { padding: 0; } }',
  ].join('\n');
  return [
    '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8" />',
    `<title>Ethaion — Briefing, ${escapeHtml(record.seasonLabel)}</title>`,
    `<style>${css}</style></head><body><div class="sheet">`,
    `<p class="dateline">Briefing — ${escapeHtml(record.seasonLabel)}</p>`,
    `<h1>${escapeHtml(sections.heading)}</h1>`,
    `<p>${escapeHtml(sections.opening)}</p>`,
    since,
    '<h2>The considered path forward</h2>',
    `<p>${escapeHtml(sections.pathForward)}</p>`,
    `<footer>Ethaion — written for you by Beau. ${escapeHtml(record.seasonLabel)}.</footer>`,
    '</div><script>window.addEventListener("load", function () { window.focus(); window.print(); });<\/script></body></html>',
  ].join('');
}

/**
 * Open the Briefing as a print document — the browser's print dialogue is
 * the export ("Save as PDF" on every platform). Tries a real window first so
 * the user can keep the sheet open; falls back to a hidden iframe when
 * pop-ups are blocked.
 */
export function exportBriefingDocument(record: BriefingRecord): boolean {
  const html = briefingPrintHtml(record);
  try {
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      return true;
    }
  } catch { /* pop-up blocked — fall through to the iframe */ }

  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    frame.srcdoc = html;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 60000);
    return true;
  } catch (e) {
    console.warn('[Ethaion] could not open the Briefing for export:', e);
    return false;
  }
}
