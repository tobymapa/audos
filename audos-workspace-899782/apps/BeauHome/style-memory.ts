/**
 * BEAU STYLE MEMORY — persistent facts extracted from what the user SAYS.
 *
 * Chat insights used to evaporate at session end. This module makes Beau's
 * memory work like Claude/ChatGPT memory: the compute happens ONCE, at the
 * moment something meaningful is said, and from then on it is a fast DB read
 * — the `beau_style_memory` table, folded into Beau's context at the start
 * of every conversation by the `beau-get-rubric` server hook.
 *
 * EXACTLY THREE SIGNAL TYPES are captured (founder-confirmed scope):
 *   1. 'preference'    — explicit rules ("I never wear slim fit",
 *      "nothing synthetic", "no brown shoes")
 *   2. 'body_feedback' — fit/proportion observations ("the shoulders on that
 *      style never work for me", "I always size up in Italian brands")
 *   3. 'piece_verdict' — direct judgements on a specific piece or brand
 *      ("I tried that coat and hated it")
 *
 * NOT captured, by design: inferred or implied preferences, casual browsing
 * or questions, and passive Search swipes/scores. Explicit Save / Favourite /
 * Pass tags in The Search ARE intentional decisions and are written here too
 * (source 'search_tag') by hunt-model.ts.
 *
 * DEDUPLICATION: every fact carries a stable `fact_key`. A restatement or a
 * contradiction UPDATES the existing row (the extractor is shown the stored
 * facts, with ids, and answers with update/remove actions) — never a
 * duplicate. Facts are plain sentences, inspectable, never embeddings.
 *
 * WIRING: `installStyleMemoryExtractor()` (called once from
 * BeauConversations) listens for the platform's `audos:chat-user-message`
 * window event — fired for every user chat message — and runs a small Haiku
 * extraction pass in the background. Failures are always non-fatal: the chat
 * itself is never blocked or slowed by memory work.
 */
import { callModel, CLAUDE_HAIKU } from './claude';

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

export type StyleMemorySignal = 'preference' | 'body_feedback' | 'piece_verdict';
export type StyleMemorySource = 'chat' | 'search_tag';

export interface StyleMemoryFact {
  id: number;
  signalType: StyleMemorySignal;
  factText: string;
  subject: string | null;
  factKey: string;
  source: StyleMemorySource;
  updatedAt: string | null;
}

/** Fired whenever the style memory changes, so live surfaces can refresh. */
export const STYLE_MEMORY_EVENT = 'ethaion:style-memory-updated';

const TABLE = 'beau_style_memory';

function isSignal(v: unknown): v is StyleMemorySignal {
  return v === 'preference' || v === 'body_feedback' || v === 'piece_verdict';
}

function rowToFact(row: any): StyleMemoryFact | null {
  const factText = (row?.fact_text || '').toString().trim();
  if (!factText || !isSignal(row?.signal_type)) return null;
  return {
    id: Number(row.id),
    signalType: row.signal_type,
    factText,
    subject: (row.subject || '').toString().trim() || null,
    factKey: (row.fact_key || '').toString(),
    source: row.source === 'search_tag' ? 'search_tag' : 'chat',
    updatedAt: row.updated_at || row.created_at || null,
  };
}

/** Everything Beau remembers about this visitor, most recently touched first. */
export async function fetchStyleMemory(): Promise<StyleMemoryFact[]> {
  try {
    const { data } = await ws().from(TABLE).orderBy('updated_at', 'desc').limit(80).get();
    return ((data || []) as any[]).map(rowToFact).filter((f): f is StyleMemoryFact => f !== null);
  } catch (e) {
    console.warn('[Ethaion] style memory read failed (non-fatal):', e);
    return [];
  }
}

function announce(): void {
  try {
    window.dispatchEvent(new CustomEvent(STYLE_MEMORY_EVENT));
  } catch {
    /* non-fatal */
  }
}

/**
 * Forget one fact outright — the user's quiet right, exercised from the
 * Dossier's "What Beau remembers" screen. Corrections still happen in chat
 * (the extractor updates the stored fact); this is only for removal.
 */
export async function removeStyleMemoryFact(id: number): Promise<void> {
  await ws().from(TABLE).delete(id);
  announce();
}

function normaliseKeyPart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** The dedup key a chat-extracted fact files under. */
function chatFactKey(signalType: StyleMemorySignal, subject: string | null, factText: string): string {
  return `chat\u241f${signalType}\u241f${normaliseKeyPart(subject || factText)}`;
}

/** The dedup key a Search tag's fact files under — one per card. */
function searchFactKey(cardKey: string): string {
  return `search\u241f${cardKey}`;
}

interface FactFields {
  signalType: StyleMemorySignal;
  factText: string;
  subject: string | null;
  factKey: string;
  source: StyleMemorySource;
}

/** Insert the fact, or update the row already filed under its fact_key. */
async function upsertFact(input: FactFields): Promise<void> {
  const now = new Date().toISOString();
  const fields = {
    signal_type: input.signalType,
    fact_text: input.factText.trim().slice(0, 400),
    subject: (input.subject || '').trim().slice(0, 120) || null,
    fact_key: input.factKey,
    source: input.source,
    updated_at: now,
  };
  if (!fields.fact_text) return;
  const { data } = await ws().from(TABLE).eq('fact_key', input.factKey).limit(1).get();
  const existing = (data || [])[0];
  if (existing) await ws().from(TABLE).update(existing.id, fields);
  else await ws().from(TABLE).insert({ ...fields, created_at: now });
  announce();
}

// ---------------------------------------------------------------------------
// CHAT EXTRACTION — one small Haiku pass per user message, in the background.
// ---------------------------------------------------------------------------

const EXTRACTOR_SYSTEM = `You maintain Beau's persistent style memory for Ethaion, a classic-menswear advisor. You read ONE chat message the user just sent and decide whether it contains a fact worth remembering permanently.

CAPTURE exactly three kinds of signal, nothing else:
1. "preference" — an explicit rule the user states about what they wear or refuse ("I never wear slim fit", "nothing synthetic", "no brown shoes").
2. "body_feedback" — a fit or proportion observation about their own body ("the shoulders on that style never work for me", "I always size up in Italian brands").
3. "piece_verdict" — a direct judgement on a SPECIFIC piece or brand they name ("I tried that coat and hated it", "that collarless shirt doesn't work with my build").

DO NOT capture: inferred or implied preferences (if it is not stated outright, it is not a fact), questions, casual browsing, requests ("find me a navy jacket under £200" is a request, not a rule), hypotheticals, compliments on a recommendation, one-off situational remarks, or anything about someone other than the user.

DEDUPLICATION: you are given the facts already stored, each with its id. If the message merely restates a stored fact, return no action for it. If it UPDATES or CONTRADICTS a stored fact, return action "update" with that fact's id and the corrected fact_text — never file a second row for the same thing. If the user explicitly revokes a stored fact ("actually I'm fine with slim fit now") and no replacement rule remains, return action "remove" with the id.

Write fact_text in third person, plain, self-contained, under 200 characters ("Never wears slim fit", "Sizes up in Italian brands — they run small on him", "Tried the Barbour Bedale and hated it"). Set subject to the piece, brand, or garment type the fact is about when there is one, else null.

Return STRICT JSON, no prose, no markdown fences:
{"facts":[{"action":"add"|"update"|"remove","id":number|null,"signal_type":"preference"|"body_feedback"|"piece_verdict","subject":string|null,"fact_text":string|null}]}
Return {"facts":[]} when nothing qualifies — most messages contain nothing worth storing.`;

interface ExtractedAction {
  action: 'add' | 'update' | 'remove';
  id: number | null;
  signalType: StyleMemorySignal;
  subject: string | null;
  factText: string | null;
}

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
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function extractFromMessage(
  message: string,
  existing: StyleMemoryFact[],
): Promise<ExtractedAction[]> {
  const stored = existing.slice(0, 60).map((f) => ({
    id: f.id,
    signal_type: f.signalType,
    subject: f.subject,
    fact_text: f.factText,
  }));
  const user = `Stored facts (may be empty):\n${JSON.stringify(stored)}\n\nThe user's message:\n"""\n${message}\n"""`;
  const reply = await callModel({
    model: CLAUDE_HAIKU,
    second: null,
    system: [{ text: EXTRACTOR_SYSTEM, cache: true }],
    user,
    maxTokens: 500,
    temperature: 0.1,
    json: true,
  });
  if (!reply) return [];
  const parsed = extractJson(reply);
  const raw = Array.isArray(parsed?.facts) ? parsed.facts : [];
  const actions: ExtractedAction[] = [];
  for (const item of raw) {
    const action = item?.action;
    if (action !== 'add' && action !== 'update' && action !== 'remove') continue;
    const id = Number.isFinite(Number(item?.id)) && item?.id !== null ? Number(item.id) : null;
    if (action !== 'add' && (id === null || !existing.some((f) => f.id === id))) continue;
    const factText = typeof item?.fact_text === 'string' ? item.fact_text.trim() : null;
    if (action !== 'remove' && (!factText || !isSignal(item?.signal_type))) continue;
    actions.push({
      action,
      id,
      signalType: isSignal(item?.signal_type) ? item.signal_type : 'preference',
      subject: typeof item?.subject === 'string' ? item.subject.trim() || null : null,
      factText,
    });
  }
  return actions.slice(0, 6);
}

async function applyActions(actions: ExtractedAction[]): Promise<void> {
  for (const act of actions) {
    try {
      if (act.action === 'remove' && act.id !== null) {
        await ws().from(TABLE).delete(act.id);
        announce();
        continue;
      }
      if (!act.factText) continue;
      const factKey = chatFactKey(act.signalType, act.subject, act.factText);
      if (act.action === 'update' && act.id !== null) {
        await ws().from(TABLE).update(act.id, {
          signal_type: act.signalType,
          fact_text: act.factText.slice(0, 400),
          subject: act.subject ? act.subject.slice(0, 120) : null,
          fact_key: factKey,
          source: 'chat',
          updated_at: new Date().toISOString(),
        });
        announce();
        continue;
      }
      await upsertFact({
        signalType: act.signalType,
        factText: act.factText,
        subject: act.subject,
        factKey,
        source: 'chat',
      });
    } catch (e) {
      console.warn('[Ethaion] style memory write failed (non-fatal):', e);
    }
  }
}

async function processMessage(message: string): Promise<void> {
  try {
    const existing = await fetchStyleMemory();
    const actions = await extractFromMessage(message.slice(0, 1500), existing);
    if (actions.length > 0) await applyActions(actions);
  } catch (e) {
    console.warn('[Ethaion] style memory extraction failed (non-fatal):', e);
  }
}

// One listener per page, one message processed once, strictly in sequence —
// sequential processing keeps the dedup read honest when two meaningful
// messages land close together.
let installed = false;
let chain: Promise<void> = Promise.resolve();
const seenMessages: string[] = [];

/**
 * Start listening for user chat messages (the platform runtime dispatches
 * `audos:chat-user-message` for every one). Safe to call repeatedly — the
 * listener installs once per page. Never blocks or slows the chat itself.
 */
export function installStyleMemoryExtractor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('audos:chat-user-message', (e: Event) => {
    const detail = (e as CustomEvent).detail as { threadId?: string; content?: string } | undefined;
    const raw = typeof detail?.content === 'string' ? detail.content.trim() : '';
    if (!raw || raw.startsWith('[SYSTEM:') || raw.length < 8) return;
    const sig = `${detail?.threadId || 'main'}\u241f${raw.slice(0, 200)}`;
    if (seenMessages.includes(sig)) return;
    seenMessages.push(sig);
    if (seenMessages.length > 200) seenMessages.shift();
    chain = chain.then(() => processMessage(raw)).catch(() => undefined);
  });
}

// ---------------------------------------------------------------------------
// THE SEARCH FEEDBACK — explicit tags are intentional decisions and update
// the memory; passive scores and casual swipes never do.
// ---------------------------------------------------------------------------

interface SearchTaggedPiece {
  pieceName: string;
  maker?: string | null;
  categoryId?: string | null;
  subCategory?: string | null;
}

function pieceLine(item: SearchTaggedPiece): string {
  const bits = [item.maker, item.subCategory || item.categoryId].filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return `“${item.pieceName}”${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

/**
 * File (or refresh) the fact behind an explicit Save / Favourite / Pass in
 * The Search. Keyed by the card's own stable key, so re-tagging the same
 * card moves ONE fact rather than stacking rows. Fire-and-forget: callers
 * never await UI on it.
 */
export async function recordSearchTagFact(
  item: SearchTaggedPiece,
  tag: 'saved' | 'favourite' | 'passed',
  cardKey: string,
): Promise<void> {
  const pieceName = (item.pieceName || '').trim();
  if (!pieceName || !cardKey) return;
  const line = pieceLine(item);
  const factText =
    tag === 'favourite'
      ? `Favourited ${line} in The Search — a piece he actively wants.`
      : tag === 'saved'
        ? `Saved ${line} in The Search — interested, still deciding.`
        : `Passed on ${line} in The Search — do not re-recommend it in the same form.`;
  try {
    await upsertFact({
      signalType: 'piece_verdict',
      factText,
      subject: pieceName,
      factKey: searchFactKey(cardKey),
      source: 'search_tag',
    });
  } catch (e) {
    console.warn('[Ethaion] search tag memory write failed (non-fatal):', e);
  }
}

/** A removed tag takes its fact with it — an untagged card holds no opinion. */
export async function clearSearchTagFact(cardKey: string): Promise<void> {
  if (!cardKey) return;
  try {
    const { data } = await ws().from(TABLE).eq('fact_key', searchFactKey(cardKey)).limit(5).get();
    for (const row of (data || []) as any[]) {
      await ws().from(TABLE).delete(row.id);
    }
    if ((data || []).length > 0) announce();
  } catch (e) {
    console.warn('[Ethaion] search tag memory removal failed (non-fatal):', e);
  }
}
