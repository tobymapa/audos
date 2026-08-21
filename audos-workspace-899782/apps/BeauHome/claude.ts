/**
 * SHARED CLAUDE TRANSPORT — model tiering + Anthropic prompt caching
 * (Performance overhaul, Parts 3.3 & 3.4).
 *
 * ONE way to call Claude from every Beau feature, through the platform's
 * BYOK secrets proxy (`{{secrets.ANTHROPIC_API_KEY}}` — the key never
 * touches the browser).
 *
 * PROMPT CACHING (Part 3.3): callers pass `system` as an ordered list of
 * blocks and mark the STABLE ones (`cache: true`) — the big verbatim system
 * prompts, the wardrobe context, the style-profile context, the brand
 * catalog. Marked blocks are sent with `cache_control: { type: 'ephemeral' }`
 * so Anthropic re-uses the processed prefix on the next call instead of
 * re-reading it. Invalidation is automatic and exactly right: the cache is
 * keyed on content, so when the profile updates, the wardrobe changes or
 * the archetypes change, the block's text changes and the stale prefix
 * simply never matches again.
 *
 * MODEL TIERING (Part 3.4): use the exported constants —
 *   · CLAUDE_HAIKU  — quick-adjust chips, reasoning-strip generation, gap
 *     notes, simple source filters, brand-profile generation
 *   · CLAUDE_SONNET — brand dossiers, the Edit assessment, full outfit
 *     generation, Beau chat, find/match/judge
 * Everything that knows The Aspirant deeply stays on Sonnet.
 */

/**
 * THE MODEL IDS. Anthropic retires dated snapshots on a published schedule and
 * a retired id fails outright (404), which reads in the app as “Beau is away
 * from his desk” on every surface at once — so these must be checked against
 * the deprecations page whenever a Beau feature goes quiet everywhere.
 *
 * Retired and replaced (August 2026): claude-3-5-sonnet-20241022 (retired
 * 28 Oct 2025) → claude-sonnet-4-6; claude-3-5-haiku-20241022 (retired
 * 19 Feb 2026) → claude-haiku-4-5-20251001; claude-sonnet-4-20250514 (retired
 * 15 Jun 2026) → the current Sonnet snapshot.
 */
export const CLAUDE_SONNET = 'claude-sonnet-4-6';
/** Stand-in id in case the rolling Sonnet alias is ever unavailable. */
export const CLAUDE_SONNET_4 = 'claude-sonnet-4-5-20250929';
export const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';

export interface ClaudeSystemBlock {
  text: string;
  /** Mark stable, re-sent context (system prompts, wardrobe / profile /
   * brand-catalog blocks) so Anthropic caches the processed prefix. */
  cache?: boolean;
}

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

/** A model transport must always settle: otherwise every caller waiting on
 * callModel keeps its skeleton visible forever. Forty-five seconds leaves
 * room for a large personalised response while still handing control to the
 * next model tier when a proxy connection stalls. */
const MODEL_REQUEST_TIMEOUT_MS = 45_000;

async function fetchModel(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = MODEL_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Call Claude through the secrets proxy. Returns the response text, or
 * null on ANY failure — callers keep their own fallbacks (another model
 * tier, the platform OpenAI proxy, or a local deterministic compose).
 */
export async function callClaude({
  model,
  system,
  user,
  maxTokens = 2000,
  temperature = 0.4,
}: {
  model: string;
  system: string | ClaudeSystemBlock[];
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const runtime = ws();
  if (!runtime?.workspaceId || !runtime?.token) return null;
  const blocks = (typeof system === 'string' ? [{ text: system, cache: true }] : system)
    .filter((b) => b && typeof b.text === 'string' && b.text.trim())
    .map((b) => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
  try {
    const res = await fetchModel(`/api/workspaces/${runtime.workspaceId}/secrets/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': runtime.token },
      body: JSON.stringify({
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': '{{secrets.ANTHROPIC_API_KEY}}',
          'anthropic-version': '2023-06-01',
          // Prompt caching is GA; the beta header keeps older gateway
          // behaviour happy and is ignored where it is no longer needed.
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        json: {
          model,
          max_tokens: maxTokens,
          temperature,
          system: blocks,
          messages: [{ role: 'user', content: user }],
        },
      }),
    });
    // Diagnostics only — the console, never the reader. Without these a
    // quiet Beau (no key on file, a retired snapshot, a rate limit) looks
    // identical from the outside to a slow one.
    if (!res.ok) {
      console.warn(`[Ethaion] Claude proxy returned HTTP ${res.status} for ${model}.`);
      return null;
    }
    const wrapper = await res.json();
    if (!wrapper || typeof wrapper.status !== 'number' || wrapper.status < 200 || wrapper.status >= 300) {
      const detail = typeof wrapper?.body === 'string' ? wrapper.body.slice(0, 300) : JSON.stringify(wrapper?.body || wrapper || {}).slice(0, 300);
      console.warn(`[Ethaion] Anthropic replied ${wrapper?.status} for ${model}: ${detail}`);
      return null;
    }
    const body = typeof wrapper.body === 'string' ? JSON.parse(wrapper.body) : wrapper.body;
    const text = Array.isArray(body?.content)
      ? body.content.map((block: any) => (typeof block?.text === 'string' ? block.text : '')).join('')
      : null;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch (e) {
    console.warn(`[Ethaion] Claude call (${model}) failed — falling back:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// THE NEVER-DEAD-END TRANSPORT
//
// `callClaude` returns null on ANY failure — a retired model id, a workspace
// with no ANTHROPIC_API_KEY on file, a rate limit, a network blip. A surface
// that has nowhere to show an error (Beau's Picks: the reader must see cards
// or nothing) needs one call that keeps trying rather than one that returns
// null and leaves a skeleton up forever. `callModel` is that call:
//
//   1. the model asked for (Sonnet by default — it knows this man deeply),
//   2. the SAME model once more after a short pause (a rate limit or a blip
//      almost always clears),
//   3. the second tier (Haiku), so a busy moment on one model is not a dead
//      end,
//   4. the PLATFORM's own OpenAI proxy — no key of the workspace's own is
//      involved, so this lands even when no Anthropic key is configured. The
//      system blocks are joined into one system message and the reply comes
//      back in the same shape the caller already parses.
//
// It returns null only when every one of those has failed.
// ---------------------------------------------------------------------------

/** The platform's managed OpenAI proxy — the last resort, never a key of
 * the workspace's own (openai-text-generation integration). */
async function callPlatformGpt({
  system,
  user,
  maxTokens,
  json,
}: {
  system: string;
  user: string;
  maxTokens: number;
  json: boolean;
}): Promise<string | null> {
  try {
    const res = await fetchModel('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        reasoning_effort: 'none',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: json
              ? `${user}\n\n(Return ONE JSON object — no prose, no markdown fences.)`
              : user,
          },
        ],
        max_completion_tokens: maxTokens,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] platform text-generation fallback failed:', e);
    return null;
  }
}

export async function callOpenAiText({
  system,
  user,
  maxTokens = 2000,
  json = true,
}: {
  system: ClaudeSystemBlock[];
  user: string;
  maxTokens?: number;
  json?: boolean;
}): Promise<string | null> {
  return callPlatformGpt({
    system: system.map((block) => block.text).join('\n\n'),
    user,
    maxTokens,
    json,
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * One model reply, from whichever transport can give one. Silent throughout:
 * the caller is told nothing about which tier answered, because the reader
 * must never be shown a transport.
 */
export async function callModel({
  model = CLAUDE_SONNET,
  second = CLAUDE_HAIKU,
  system,
  user,
  maxTokens = 2000,
  temperature = 0.4,
  json = true,
  retryMs = 900,
}: {
  model?: string;
  /** The second Anthropic tier tried before the platform fallback. */
  second?: string | null;
  system: ClaudeSystemBlock[];
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** True when the caller is parsing JSON — the platform fallback then asks
   * for a JSON object explicitly. */
  json?: boolean;
  /** The pause before the one silent retry of the first model. */
  retryMs?: number;
}): Promise<string | null> {
  const first = await callClaude({ model, system, user, maxTokens, temperature });
  if (first) return first;

  await pause(retryMs);
  const again = await callClaude({ model, system, user, maxTokens, temperature });
  if (again) return again;

  if (second) {
    const tiered = await callClaude({ model: second, system, user, maxTokens, temperature });
    if (tiered) return tiered;
  }

  return callPlatformGpt({
    system: system.map((b) => b.text).join('\n\n'),
    user,
    maxTokens,
    json,
  });
}
