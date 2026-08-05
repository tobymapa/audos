/**
 * LAYER 1 — SEMANTIC TAGGING AT LOGGING TIME (the Beau intelligence overhaul).
 *
 * Every time a piece is logged (photo flow, search flow, or chat), after the
 * row is saved to wardrobe_pieces, ONE lightweight Claude call
 * (claude-3-5-haiku-20241022 — fast and cheap) runs silently in the
 * background. It receives the raw piece data AS THE USER ENTERED IT (name,
 * brand, category, material) and returns a semantic classification:
 *
 *   canonicalCategory · subType · archetypesServed · formalityLevel ·
 *   colourFamily · colourNotes · pairingFlags · seasonalRange
 *
 * The tags are stored in the piece_semantics companion table (keyed by
 * piece_id) and used for REASONING ONLY — Beau's assessment engine (Layer 2,
 * beau-assessment.ts) reads them instead of re-deriving garment meaning from
 * regex rules.
 *
 * CRITICAL RULE — NEVER RENAME THE USER'S PIECE. If they entered "M43",
 * every surface displays "M43". If they entered "chore coat", it stays
 * "chore coat". The semantic tags live in their own table and never touch
 * the wardrobe_pieces.name column. M43 is never substituted with M65; the
 * user's label is never transformed.
 *
 * A retroactive sweep (sweepSemanticTags) classifies pieces logged before
 * this pass — or via paths that bypass the app's insert helper (e.g. chat
 * tools) — so the whole wardrobe converges on tagged coverage.
 *
 * Transport: Claude via the platform's BYOK secrets proxy
 * (`{{secrets.ANTHROPIC_API_KEY}}` — the key never touches the browser),
 * with the platform OpenAI proxy (gpt-4o-mini) as the never-dead-end
 * fallback, exactly like beau-picks-ai.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SemanticTags {
  pieceId: number;
  canonicalCategory: string;
  subType: string;
  archetypesServed: string[];
  formalityLevel: string;
  colourFamily: string;
  colourNotes: string;
  pairingFlags: string[];
  seasonalRange: string[];
}

export interface TagInput {
  name: string;
  brand?: string | null;
  category?: string | null;
  slot?: string | null;
  material?: string | null;
  colors?: string[] | null;
}

/** Bump when the prompt/schema changes — lower-versioned rows get re-tagged
 * by the retroactive sweep. */
export const TAG_VERSION = 1;

// ---------------------------------------------------------------------------
// The Layer 1 classification prompt — passed VERBATIM to the model.
// ---------------------------------------------------------------------------

export const SEMANTIC_TAGGING_SYSTEM_PROMPT = `You are classifying a wardrobe piece for a menswear app. The user may use casual, abbreviated, or informal names. Infer the correct canonical meaning from context — "M43", "m-43", and "m-1943" are all the same WW2-era field jacket; "OCBD", "Oxford shirt", and "Oxford button-down" are the same sub-type; "pink chino pants" is a chino in pink. Do not correct the user's label — classify only.

Return JSON only:
- canonicalCategory: one of [Tops, Bottoms, Shoes, Outerwear, Knitwear, Formalwear, Accessories, Base layers, Bags, Hats/Headwear, Others]
- subType: specific functional sub-type (e.g. "Field Jacket", "Wax Jacket", "Oxford Button-Down", "Chino", "Chelsea Boot", "Crew-Neck Knitwear", "Chore Coat")
- archetypesServed: array from [Classic Ivy, British Country, Continental, American Outdoors, Workwear, Smart Casual, Military/Utility, Coastal/Nautical, Mediterranean/Riviera]
- formalityLevel: one of [formal, smart-casual, casual, rugged]
- colourFamily: primary colour family (e.g. "olive", "navy", "cream", "red", "pink", "sage")
- colourNotes: one sentence on pairing range and any constraints
- pairingFlags: array of notable flags (e.g. "bold colour — limited pairing range", "natural material — quality signal", "statement piece — needs neutral partners")
- seasonalRange: array from [spring, summer, autumn, winter]

Return only valid JSON. No other text.`;

// ---------------------------------------------------------------------------
// Model transport — Claude 3.5 Haiku via the BYOK secrets proxy, with the
// platform OpenAI proxy as the never-dead-end fallback.
// ---------------------------------------------------------------------------

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

async function callClaudeHaiku(system: string, user: string): Promise<string | null> {
  const runtime = ws();
  if (!runtime?.workspaceId || !runtime?.token) return null;
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
          'content-type': 'application/json',
        },
        json: {
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 700,
          temperature: 0.1,
          system,
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
    console.warn('[Ethaion] semantic-tag Claude call failed — falling back:', e);
    return null;
  }
}

async function callGptFallback(system: string, user: string): Promise<string | null> {
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 700,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] semantic-tag fallback call failed:', e);
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

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : [];
}

function parseTags(text: string): Omit<SemanticTags, 'pieceId'> | null {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object') return null;
  const canonicalCategory = strField(raw.canonicalCategory) || strField(raw.canonical_category);
  const subType = strField(raw.subType) || strField(raw.sub_type);
  if (!canonicalCategory && !subType) return null;
  return {
    canonicalCategory,
    subType,
    archetypesServed: strArray(raw.archetypesServed ?? raw.archetypes_served),
    formalityLevel: strField(raw.formalityLevel) || strField(raw.formality_level),
    colourFamily: strField(raw.colourFamily) || strField(raw.colour_family) || strField(raw.colorFamily),
    colourNotes: strField(raw.colourNotes) || strField(raw.colour_notes) || strField(raw.colorNotes),
    pairingFlags: strArray(raw.pairingFlags ?? raw.pairing_flags),
    seasonalRange: strArray(raw.seasonalRange ?? raw.seasonal_range).map((s) => s.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// Persistence — the piece_semantics companion table (wardrobe_pieces cannot
// gain a column). Reasoning data only; NEVER read back into display names.
// ---------------------------------------------------------------------------

function rowToTags(row: any): SemanticTags {
  const jsonArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  return {
    pieceId: Number(row.piece_id),
    canonicalCategory: row.canonical_category || '',
    subType: row.sub_type || '',
    archetypesServed: jsonArr(row.archetypes_served),
    formalityLevel: row.formality_level || '',
    colourFamily: row.colour_family || '',
    colourNotes: row.colour_notes || '',
    pairingFlags: jsonArr(row.pairing_flags),
    seasonalRange: jsonArr(row.seasonal_range),
  };
}

/** All semantic tags for this visitor, keyed by piece id. */
export async function fetchSemanticTags(): Promise<Record<number, SemanticTags>> {
  try {
    const { data } = await ws().from('piece_semantics').limit(200).get();
    const map: Record<number, SemanticTags> = {};
    for (const row of data || []) {
      if (row?.piece_id != null) map[Number(row.piece_id)] = rowToTags(row);
    }
    return map;
  } catch (e) {
    console.warn('[Ethaion] semantic tags fetch failed (non-fatal):', e);
    return {};
  }
}

async function upsertTags(pieceId: number, tags: Omit<SemanticTags, 'pieceId'>, model: string): Promise<void> {
  const fields = {
    canonical_category: tags.canonicalCategory || null,
    sub_type: tags.subType || null,
    archetypes_served: JSON.stringify(tags.archetypesServed),
    formality_level: tags.formalityLevel || null,
    colour_family: tags.colourFamily || null,
    colour_notes: tags.colourNotes || null,
    pairing_flags: JSON.stringify(tags.pairingFlags),
    seasonal_range: JSON.stringify(tags.seasonalRange),
    model,
    tag_version: TAG_VERSION,
  };
  const { data } = await ws().from('piece_semantics').eq('piece_id', pieceId).limit(5).get();
  const existing = data?.[0] || null;
  if (existing) {
    await ws().from('piece_semantics').update(existing.id, fields);
    // Clean stray duplicates from racing writes (non-fatal).
    for (const extra of (data || []).slice(1)) {
      try {
        await ws().from('piece_semantics').delete(extra.id);
      } catch { /* non-fatal */ }
    }
  } else {
    await ws().from('piece_semantics').insert({ piece_id: pieceId, ...fields });
  }
}

/** Remove a deleted piece's semantic row(s) — called from deletePiece. */
export async function deleteSemanticTags(pieceId: number): Promise<void> {
  const { data } = await ws().from('piece_semantics').eq('piece_id', pieceId).limit(10).get();
  for (const row of data || []) await ws().from('piece_semantics').delete(row.id);
}

// ---------------------------------------------------------------------------
// The tagging call itself
// ---------------------------------------------------------------------------

function buildUserMessage(input: TagInput): string {
  const payload = {
    name: input.name,
    brand: input.brand || null,
    category: input.category || null,
    itemTypeSlot: input.slot || null,
    material: input.material || null,
    colours: input.colors && input.colors.length > 0 ? input.colors : null,
  };
  return `Classify this wardrobe piece. The raw data is exactly as the user entered it:\n\n${JSON.stringify(payload, null, 2)}`;
}

/** In-flight guard so the same piece is never tagged twice concurrently. */
const inflightTagging = new Set<number>();

/**
 * Classify one logged piece and store the tags. Silent and non-fatal by
 * design — the user never sees this run, and a failure simply leaves the
 * piece untagged for the retroactive sweep to retry later.
 * Returns true when tags were stored.
 */
export async function tagPieceRecord(pieceId: number, input: TagInput): Promise<boolean> {
  if (!pieceId || !input?.name || inflightTagging.has(pieceId)) return false;
  inflightTagging.add(pieceId);
  try {
    const user = buildUserMessage(input);
    let model = 'claude-3-5-haiku-20241022';
    let text = await callClaudeHaiku(SEMANTIC_TAGGING_SYSTEM_PROMPT, user);
    if (!text) {
      model = 'gpt-4o-mini';
      text = await callGptFallback(SEMANTIC_TAGGING_SYSTEM_PROMPT, user);
    }
    if (!text) return false;
    const tags = parseTags(text);
    if (!tags) return false;
    await upsertTags(pieceId, tags, model);
    // Let live surfaces (the Beau tab, the wardrobe summary) know richer
    // reasoning data just landed.
    window.dispatchEvent(new CustomEvent('ethaion:semantics-updated', { detail: { pieceId } }));
    return true;
  } catch (e) {
    console.warn('[Ethaion] semantic tagging failed (non-fatal):', e);
    return false;
  } finally {
    inflightTagging.delete(pieceId);
  }
}

/** Fire-and-forget wrapper used at the save boundary. */
export function tagPieceInBackground(pieceId: number, input: TagInput): void {
  void tagPieceRecord(pieceId, input);
}

/**
 * Re-tag a piece after an edit that changes its meaning (rename,
 * recategorise, material change). Reads the current row so the tags always
 * reflect what the user sees.
 */
export async function retagPiece(pieceId: number): Promise<void> {
  try {
    const { data } = await ws().from('wardrobe_pieces').eq('id', pieceId).limit(1).get();
    const piece = data?.[0];
    if (!piece) return;
    let material: string | null = null;
    try {
      const { data: mats } = await ws().from('piece_materials').eq('piece_id', pieceId).limit(1).get();
      material = mats?.[0]?.material || null;
    } catch { /* material optional */ }
    let colors: string[] = [];
    try {
      colors = typeof piece.colors === 'string' ? JSON.parse(piece.colors) : Array.isArray(piece.colors) ? piece.colors : [];
    } catch { /* colours optional */ }
    await tagPieceRecord(pieceId, {
      name: piece.name,
      brand: piece.brand || null,
      category: piece.category || null,
      slot: piece.slot || null,
      material,
      colors,
    });
  } catch (e) {
    console.warn('[Ethaion] re-tag failed (non-fatal):', e);
  }
}

// ---------------------------------------------------------------------------
// Retroactive sweep — pieces logged before this pass (or via chat tools that
// write straight to wardrobe_pieces) get classified on load, a few at a
// time, silently. Repeat sweeps are cheap no-ops.
// ---------------------------------------------------------------------------

let sweepRunning = false;

export interface SweepPieceLike {
  id: number;
  name: string;
  brand?: string | null;
  category?: string | null;
  slot?: string | null;
  colors?: string[] | null;
}

/**
 * Tag every piece that has no semantic row yet (or a row from an older
 * TAG_VERSION). Serial, capped per run so a large legacy wardrobe converges
 * over a couple of visits without a burst of calls. Returns how many pieces
 * were tagged.
 */
export async function sweepSemanticTags(
  pieces: SweepPieceLike[],
  materials: Record<number, string> = {},
  maxPerRun = 12,
): Promise<number> {
  if (sweepRunning || pieces.length === 0) return 0;
  sweepRunning = true;
  try {
    const existingRows = await (async () => {
      try {
        const { data } = await ws().from('piece_semantics').limit(200).get();
        return data || [];
      } catch {
        return [];
      }
    })();
    const current = new Set<number>();
    for (const row of existingRows) {
      if (row?.piece_id != null && Number(row.tag_version || 0) >= TAG_VERSION) current.add(Number(row.piece_id));
    }
    const pending = pieces.filter((p) => p.id > 0 && !current.has(p.id)).slice(0, maxPerRun);
    let tagged = 0;
    for (const piece of pending) {
      const ok = await tagPieceRecord(piece.id, {
        name: piece.name,
        brand: piece.brand || null,
        category: piece.category || null,
        slot: piece.slot || null,
        material: materials[piece.id] || null,
        colors: piece.colors || [],
      });
      if (ok) tagged += 1;
    }
    return tagged;
  } finally {
    sweepRunning = false;
  }
}
