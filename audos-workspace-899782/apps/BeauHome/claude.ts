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

export const CLAUDE_SONNET = 'claude-3-5-sonnet-20241022';
/** Stand-in id in case the 3.5 Sonnet id is ever retired. */
export const CLAUDE_SONNET_4 = 'claude-sonnet-4-20250514';
export const CLAUDE_HAIKU = 'claude-3-5-haiku-20241022';

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
    const res = await fetch(`/api/workspaces/${runtime.workspaceId}/secrets/proxy`, {
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
    if (!res.ok) return null;
    const wrapper = await res.json();
    if (!wrapper || typeof wrapper.status !== 'number' || wrapper.status < 200 || wrapper.status >= 300) return null;
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
