/**
 * Fashn.ai try-on provider — the concrete implementation behind lib/tryon.
 *
 * The Fashn API key NEVER appears in browser code: this module talks to the
 * workspace's `beau-tryon` server hook, which holds the key server-side
 * (preferring the FASHN_API_KEY workspace secret when one is stored) and
 * proxies the two Fashn endpoints:
 *
 *   POST /v1/run     — start a render (person image + garment image)
 *   GET  /v1/status  — poll until completed / failed
 *
 * A render typically takes 10–20 seconds; this module polls the hook every
 * few seconds with a hard budget, so a stuck job resolves into a quiet
 * error instead of an endless spinner.
 *
 * Screens NEVER import this file directly — they call `tryOn()` from
 * lib/tryon/index.ts, which keeps the provider swappable (e.g. a future
 * Google Vertex implementation drops in without touching any screen).
 */

export interface FashnTryOnOptions {
  /** Progress copy callback — Beau's warm voice, not a spinner. */
  onPhase?: (phase: string) => void;
}

const POLL_INTERVAL_MS = 3000;
const POLL_BUDGET_MS = 120000;

function hookUrl(): string {
  const wsId = (window as any).__workspaceDb?.workspaceId || 'workspace-899782';
  return `/api/workspaces/${wsId}/hooks/beau-tryon/execute`;
}

async function callHook(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(hookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && typeof data.error === 'string' && data.error) || `try-on hook returned ${res.status}`);
  }
  return data;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run a Fashn try-on render. Resolves with the rendered image URL. */
export async function fashnTryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  { onPhase }: FashnTryOnOptions = {},
): Promise<string> {
  onPhase?.('Beau is putting this together for you\u2026');
  const started = await callHook({ action: 'run', personImageUrl, garmentImageUrl });
  const id = typeof started?.id === 'string' ? started.id : '';
  if (!id) throw new Error((started && started.error) || 'the try-on could not start');

  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let data: any;
    try {
      data = await callHook({ action: 'status', id });
    } catch {
      continue; // one flaky poll shouldn't sink the render
    }
    if (data?.status === 'completed' && typeof data.imageUrl === 'string' && data.imageUrl) {
      return data.imageUrl;
    }
    if (data?.status === 'failed') {
      throw new Error((typeof data.error === 'string' && data.error) || 'the render failed');
    }
    onPhase?.(
      data?.status === 'processing'
        ? 'Nearly there \u2014 Beau is checking the drape\u2026'
        : 'Beau is putting this together for you\u2026',
    );
  }
  throw new Error('the render took too long');
}
