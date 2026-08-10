/**
 * BEAU ENRICHMENT (add-piece refinements pass) — after a piece is saved,
 * Beau reads up on it online: the maker + type + material feed one platform
 * web search (`POST /api/search`, the platform's SerpAPI integration — never
 * a custom scraper), and a Haiku pass distills the snippets into the four
 * facts a wardrobe record actually wants:
 *
 *   · composition  — what the cloth actually is ("100% cotton oxford")
 *   · construction — how it's made ("Goodyear-welted", "single-needle")
 *   · care         — what the maker says about washing it
 *   · sizing       — known sizing behaviour ("runs slim — most size up")
 *
 * plus a one-or-two-sentence reading in Beau's voice and the source page he
 * leaned on. The result is persisted in the piece_enrichment companion
 * table (status 'found' | 'none') and surfaced on the piece card in The
 * Ledger as the "Beau, on this piece" panel (16a treatment). When the
 * search turns up nothing usable the card shows a quiet "Beau couldn't
 * find details for this piece" line — informational, never an error.
 *
 * STRICT HONESTY RULE: the model may only state facts supported by the
 * search snippets. An unknown brand or a generic garment yields 'none',
 * not invented specifics.
 */
import { CLAUDE_HAIKU, callClaude } from './claude';

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

export interface PieceEnrichment {
  id: number;
  piece_id: number;
  status: 'pending' | 'found' | 'none';
  summary: string | null;
  composition: string | null;
  construction: string | null;
  care: string | null;
  sizing: string | null;
  source_title: string | null;
  source_url: string | null;
}

/** Fired whenever an enrichment row lands, with { pieceId } in detail —
 * any mounted piece card refreshes its panel. */
export const PIECE_ENRICHED_EVENT = 'ethaion:piece-enriched';

export interface EnrichInput {
  pieceId: number;
  /** The piece's display name, e.g. "LIGHT BLUE COTTON OXFORD SHIRT". */
  name: string;
  /** The maker, when known — the strongest search signal. */
  brand?: string | null;
  /** The canonical type label, e.g. "Oxford shirt". */
  typeLabel?: string | null;
  material?: string | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The stored enrichment for one piece — the newest row wins. Never throws. */
export async function fetchPieceEnrichment(pieceId: number): Promise<PieceEnrichment | null> {
  try {
    const { data } = await db().from('piece_enrichment').eq('piece_id', pieceId).orderBy('created_at', 'desc').limit(1).get();
    return (data?.[0] as PieceEnrichment) || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The lookup — one web search, one Haiku distillation, one row.
// ---------------------------------------------------------------------------

/** In-flight lookups by piece id — a card opening mid-lookup shows "Beau is
 * reading up…" instead of starting a second search. */
const inflight = new Map<number, Promise<PieceEnrichment | null>>();

export function isEnriching(pieceId: number): boolean {
  return inflight.has(pieceId);
}

interface SearchHit {
  title: string;
  link: string;
  snippet: string;
}

async function webSearch(query: string, num = 6): Promise<SearchHit[]> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, searchType: 'web', num }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.results)) return [];
  return data.results
    .filter((r: any) => r && typeof r.title === 'string' && typeof r.link === 'string')
    .map((r: any) => ({ title: r.title, link: r.link, snippet: typeof r.snippet === 'string' ? r.snippet : '' }));
}

function cleanField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^(null|none|unknown|n\/a)$/i.test(trimmed)) return null;
  return trimmed.slice(0, 300);
}

/**
 * Look the piece up online and persist what Beau found. Fire-and-forget
 * from the save paths (`void enrichPiece(…)`); awaited nowhere. Returns the
 * stored row, or null when persistence itself failed.
 */
export function enrichPiece(input: EnrichInput): Promise<PieceEnrichment | null> {
  const existing = inflight.get(input.pieceId);
  if (existing) return existing;
  const job = runEnrichment(input).finally(() => inflight.delete(input.pieceId));
  inflight.set(input.pieceId, job);
  return job;
}

async function runEnrichment(input: EnrichInput): Promise<PieceEnrichment | null> {
  const brand = (input.brand || '').trim();
  const type = (input.typeLabel || '').trim() || input.name.trim();
  const material = (input.material || '').trim();

  let hits: SearchHit[] = [];
  try {
    if (brand) {
      hits = await webSearch(`${brand} ${type} ${material}`.trim().replace(/\s+/g, ' '), 6);
      // A maker so obscure the first search whiffs still deserves one more
      // try on the maker alone before Beau gives up.
      if (hits.length === 0) hits = await webSearch(`${brand} ${type}`, 6);
    } else if (material || type) {
      hits = await webSearch(`${[material, type].filter(Boolean).join(' ')} construction fabric care guide`, 6);
    }
  } catch (e) {
    console.warn('[Ethaion] enrichment search failed (non-fatal):', e);
  }

  if (hits.length === 0) return saveEnrichment(input.pieceId, { status: 'none' });

  const snippetBlock = hits
    .slice(0, 6)
    .map((h, i) => `[${i + 1}] ${h.title}\n${h.link}\n${h.snippet}`)
    .join('\n\n');

  const raw = await callClaude({
    model: CLAUDE_HAIKU,
    system: [
      {
        text:
          'You are Beau, the wardrobe valet in a menswear app. The user just logged a garment they OWN; you searched the web for it. From the search snippets ONLY, extract what a wardrobe record wants to know. Return STRICT JSON: {"found": boolean, "summary": string|null, "composition": string|null, "construction": string|null, "care": string|null, "sizing": string|null, "source_index": number|null}. Rules: state ONLY facts the snippets support — never invent composition percentages, construction methods, care temperatures or sizing behaviour. Leave a field null when the snippets do not cover it. "summary" is one or two short sentences in a quiet, knowing valet\u2019s voice about what makes this piece what it is (quality reputation, what to expect) — grounded in the snippets. "source_index" is the 1-based index of the single most authoritative snippet you leaned on (the maker\u2019s own page beats a marketplace). Set found=false (all fields null) when the snippets are about something else entirely or contain nothing garment-specific. JSON only, no prose.',
        cache: true,
      },
    ],
    user: `The piece: ${input.name}${brand ? ` by ${brand}` : ''}${material ? ` — ${material}` : ''}.\n\nSearch snippets:\n\n${snippetBlock}`,
    maxTokens: 500,
    temperature: 0.2,
  });

  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse((raw.match(/\{[\s\S]*\}/) || ['{}'])[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || parsed.found !== true) return saveEnrichment(input.pieceId, { status: 'none' });

  const sourceIdx = Number(parsed.source_index);
  const source = Number.isFinite(sourceIdx) && sourceIdx >= 1 && sourceIdx <= hits.length ? hits[sourceIdx - 1] : hits[0];
  const fields = {
    status: 'found' as const,
    summary: cleanField(parsed.summary),
    composition: cleanField(parsed.composition),
    construction: cleanField(parsed.construction),
    care: cleanField(parsed.care),
    sizing: cleanField(parsed.sizing),
    source_title: cleanField(source?.title),
    source_url: cleanField(source?.link),
  };
  // "Found" with every substantive field empty is really a miss.
  if (!fields.summary && !fields.composition && !fields.construction && !fields.care && !fields.sizing) {
    return saveEnrichment(input.pieceId, { status: 'none' });
  }
  return saveEnrichment(input.pieceId, fields);
}

async function saveEnrichment(
  pieceId: number,
  fields: Partial<Omit<PieceEnrichment, 'id' | 'piece_id'>> & { status: 'found' | 'none' },
): Promise<PieceEnrichment | null> {
  const clean = {
    status: fields.status,
    summary: fields.summary ?? null,
    composition: fields.composition ?? null,
    construction: fields.construction ?? null,
    care: fields.care ?? null,
    sizing: fields.sizing ?? null,
    source_title: fields.source_title ?? null,
    source_url: fields.source_url ?? null,
  };
  try {
    const { data } = await db().from('piece_enrichment').eq('piece_id', pieceId).limit(2).get();
    const existing = data?.[0];
    if (existing) await db().from('piece_enrichment').update(existing.id, clean);
    else await db().from('piece_enrichment').insert({ piece_id: pieceId, ...clean });
    window.dispatchEvent(new CustomEvent(PIECE_ENRICHED_EVENT, { detail: { pieceId } }));
    const { data: fresh } = await db().from('piece_enrichment').eq('piece_id', pieceId).orderBy('created_at', 'desc').limit(1).get();
    return (fresh?.[0] as PieceEnrichment) || null;
  } catch (e) {
    console.warn('[Ethaion] enrichment save failed (non-fatal):', e);
    return null;
  }
}
