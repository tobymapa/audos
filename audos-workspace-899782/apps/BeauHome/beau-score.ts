/**
 * SCORE A PIECE — the Ask Beau drawer's second mode (August 2026).
 *
 * One input takes a URL, a description, or a photograph, and Beau scores
 * the piece across the five locked variables: Material and Construction ×5,
 * Timelessness ×4, Versatility and Brand Integrity ×3. The weighted composite
 * resolves to BUY IT, HOLD or WALK AWAY. The scoring runs through the SAME mechanism the
 * Search tab's Ask Beau uses: the shared Claude transport (claude.ts) with
 * the platform proxy fallback, the man's full dossier brief (hunt-reader's
 * huntReaderBrief — name, frame, colouring, sizes, directions, registers,
 * climate, budget, materials rule, his own words), and readProductLink for
 * grounding a pasted URL.
 *
 * Every result auto-saves to TWO independent places:
 *   1. the Ask Beau chat thread — as a card in the conversation history
 *      (the local score store below; deletable there);
 *   2. The Search → Your Calls — as a structured assessment record
 *      (hunt_calls, source 'score'; removable there).
 * The two copies are independent: deleting one never touches the other.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel, type ClaudeSystemBlock } from './claude';
import { fetchPrefs, fetchProfile, normalizePiece, type WardrobePiece } from './profile-data';
import { firstUrl, huntReaderBrief, loadHuntReader, readProductLink, type HuntReader, type ProductLinkRead } from './hunt-reader';
import { huntCategory, loadHuntCallsMirror, setHuntTag } from './hunt-model';
import { DOSSIER_DETAILS_EVENT } from './dossier-details';
import { COVERAGE_PREFS_EVENT } from './coverage-prefs';
import { normalizeBeauVerdict, type BeauVerdict } from '../../components/BeauVerdictCard';

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// The result shape + the chat-thread store
// ---------------------------------------------------------------------------

export interface BeauScore extends BeauVerdict {
  id: string;
  createdAt: string;
  /** What was put in the box — the URL, the description, or 'A photographed piece'. */
  subject: string;
  pieceName: string;
  maker: string | null;
  priceGuide: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

const STORE_KEY = 'ethaion:beau-scores:v2';
export const BEAU_SCORES_EVENT = 'ethaion:beau-scores-changed';

/** Every assessment on file for the chat thread, newest last (reading order). */
export function loadBeauScores(): BeauScore[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((stored: any) => {
        const verdict = normalizeBeauVerdict(stored, true);
        return verdict && stored?.id && stored?.pieceName ? ({ ...stored, ...verdict } as BeauScore) : null;
      })
      .filter((stored: BeauScore | null): stored is BeauScore => !!stored);
  } catch {
    return [];
  }
}

function storeScores(scores: BeauScore[]): void {
  try {
    // Fifty is plenty of history for a conversation surface.
    window.localStorage.setItem(STORE_KEY, JSON.stringify(scores.slice(-50)));
  } catch {
    /* storage unavailable — the inline result still shows */
  }
  window.dispatchEvent(new CustomEvent(BEAU_SCORES_EVENT));
}

/** Delete ONE chat-thread copy. The Your Calls record is untouched — the
 * two copies are independent by design. */
export function deleteBeauScore(id: string): void {
  storeScores(loadBeauScores().filter((s) => s.id !== id));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function parseJson(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
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

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The ledger, read directly — the drawer has no App-level pieces prop. */
async function fetchWardrobePieces(): Promise<WardrobePiece[]> {
  try {
    const { data } = await ws().from('wardrobe_pieces').orderBy('created_at', 'asc').limit(1000).get();
    return ((data || []) as any[]).map((row) => normalizePiece(row));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// The vision transport — the same secrets proxy claude.ts uses, with the
// photograph carried as an image block; the platform OpenAI proxy is the
// never-dead-end fallback (gpt-4o-mini reads images too).
// ---------------------------------------------------------------------------

async function callVisionModel({
  system,
  user,
  imageDataUrl,
}: {
  system: string;
  user: string;
  imageDataUrl: string;
}): Promise<string | null> {
  const match = imageDataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  const mediaType = match ? match[1] : 'image/jpeg';
  const base64 = match ? match[2] : imageDataUrl;
  const runtime = ws();
  if (runtime?.workspaceId && runtime?.token) {
    for (const model of [CLAUDE_SONNET, CLAUDE_HAIKU]) {
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
              model,
              max_tokens: 900,
              temperature: 0.4,
              system,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                    { type: 'text', text: user },
                  ],
                },
              ],
            },
          }),
        });
        if (!res.ok) continue;
        const wrapper = await res.json();
        if (!wrapper || typeof wrapper.status !== 'number' || wrapper.status < 200 || wrapper.status >= 300) continue;
        const body = typeof wrapper.body === 'string' ? JSON.parse(wrapper.body) : wrapper.body;
        const text = Array.isArray(body?.content)
          ? body.content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('')
          : null;
        if (typeof text === 'string' && text.trim()) return text;
      } catch (e) {
        console.warn(`[Ethaion] score vision call (${model}) failed — trying the next tier:`, e);
      }
    }
  }
  // The platform's managed OpenAI proxy — no workspace key involved.
  try {
    const res = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              { type: 'text', text: `${user}\n\n(Return ONE JSON object — no prose, no markdown fences.)` },
            ],
          },
        ],
        max_tokens: 900,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : null;
  } catch (e) {
    console.warn('[Ethaion] score vision fallback failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// THE CONTEXT CACHE (performance, August 2026). Every score used to re-read
// the whole dossier — profile, prefs, the full ledger, and the seven
// companion rows loadHuntReader gathers — before a single model token
// moved. The facts barely change between two scores in one sitting, so the
// assembled reader is now held for a few minutes and dropped the moment the
// dossier or the register frequencies change (their own events), or the
// TTL lapses (which also catches a piece logged mid-session). The CALLS are
// always re-read — they are one localStorage mirror, effectively free — so
// a verdict can never miss a tag made seconds earlier. AI quality is
// untouched: the model sees exactly the same brief, sooner.
// ---------------------------------------------------------------------------

const READER_TTL_MS = 3 * 60_000;
let readerCache: { at: number; reader: HuntReader } | null = null;

function invalidateReaderCache(): void {
  readerCache = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener(DOSSIER_DETAILS_EVENT, invalidateReaderCache);
  window.addEventListener(COVERAGE_PREFS_EVENT, invalidateReaderCache);
}

/** The man's full record, cached for the session (see above). */
async function loadScoreReader(): Promise<HuntReader> {
  if (readerCache && Date.now() - readerCache.at < READER_TTL_MS) {
    return { ...readerCache.reader, calls: loadHuntCallsMirror() };
  }
  const [profile, prefs, pieces] = await Promise.all([
    fetchProfile().catch(() => null),
    fetchPrefs().catch(() => null),
    fetchWardrobePieces(),
  ]);
  const reader = await loadHuntReader({ profile, pieces, prefs, calls: loadHuntCallsMirror() });
  readerCache = { at: Date.now(), reader };
  return reader;
}

// ---------------------------------------------------------------------------
// The scoring prompt — Beau's voice and the locked five-variable verdict.
// ---------------------------------------------------------------------------

const SCORE_VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app. A man is weighing ONE piece: a link, a description, or a photograph. '
    + 'Score it for HIM against his profile and wardrobe using exactly these locked variables and weights: Material 5, Construction 5, Timelessness 4, Versatility 3, Brand Integrity 3. '
    + 'Material: fibre content, origin, percentage composition and how it ages. Construction: seam finishing, stitching, lining, hardware and quality-control evidence. Timelessness: classic versus trend-adjacent cut and distance from the trend cycle. Versatility: colour essentiality, formality range and cross-season wearability. Brand Integrity: quality consistency, price honesty and manufacturing transparency. '
    + 'Give each variable one whole-number score from 1 to 10. Composite is the weighted sum divided by 20, to one decimal. 8.0–10 is BUY IT; 5.5–7.9 is HOLD; 0–5.4 is WALK AWAY. '
    + 'Voice: quiet, knowing, concrete, lightly British. The summary is one direct, decisive sentence. Each tag is 2–4 words and each reason is one concise line. '
    + 'Use only supported facts. Where evidence is missing, say so in the relevant reason and score accordingly; never invent fabric, construction, origin, price or maker facts. '
    + 'Return STRICT JSON only — no markdown fences or prose around it. Always set scoredForProfile to true.',
  cache: true,
};

const CATEGORY_IDS = 'tops, knitwear, sweatshirts, outerwear, bottoms, formalwear, base-layers, shoes, accessories, bags, hats';

// ---------------------------------------------------------------------------
// runBeauScore — one assessment, grounded and saved to both homes.
// ---------------------------------------------------------------------------

export async function runBeauScore({
  input,
  imageDataUrl,
  onPhase,
}: {
  /** The box's contents — a URL, a description, or empty when only a photo. */
  input: string;
  /** A photographed piece, as a data URL — optional. */
  imageDataUrl?: string | null;
  onPhase?: (phase: string) => void;
}): Promise<BeauScore> {
  const ask = (input || '').trim();
  if (!ask && !imageDataUrl) throw new Error('Give Beau a link, a description, or a photo first.');

  onPhase?.('Beau is reading your dossier…');
  const reader = await loadScoreReader();

  // A pasted URL is read into grounded facts first — piece, maker, price,
  // photograph — exactly as the Search tab's Ask Beau reads one.
  const link = firstUrl(ask);
  let linkRead: ProductLinkRead | null = null;
  if (link) {
    onPhase?.('Beau is reading the product page…');
    linkRead = await readProductLink({ url: link, reader }).catch(() => null);
  }

  onPhase?.('Beau is weighing it against your record…');
  const pieceFacts = linkRead
    ? [
        `THE PIECE (read from the pasted link${linkRead.read ? '' : ' — the page would not open; only the url itself could be read'}):`,
        `Name: ${linkRead.pieceName}`,
        linkRead.maker ? `Maker: ${linkRead.maker}` : null,
        linkRead.price ? `Price: ${linkRead.price}` : null,
        linkRead.description ? `What it is: ${linkRead.description}` : null,
        `Link: ${linkRead.url}`,
      ]
        .filter(Boolean)
        .join('\n')
    : null;

  const user = [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `WHAT HE OWNS, in his own words: ${reader.pieces
      .slice(0, 30)
      .map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name))
      .join('; ') || 'nothing logged yet'}`,
    pieceFacts,
    ask && (!link || ask !== link) ? `HIS OWN WORDS ON IT: ${ask}` : null,
    imageDataUrl ? 'HE HAS PHOTOGRAPHED THE PIECE — the image above is the piece itself. Read every visible material, construction, silhouette and versatility signal from it.' : null,
    'Score this ONE piece. Return JSON: '
      + '{"pieceName": "…" (max 70 chars — colour and material included where known), '
      + '"maker": "…"|null, '
      + `"categoryId": one of ${CATEGORY_IDS} or null, `
      + '"composite": 7.8, "verdict": "BUY IT"|"HOLD"|"WALK AWAY", "summary": "One decisive sentence.", '
      + '"scores": ['
      + '{"variable":"Material","weight":5,"score":1-10 integer,"tag":"2–4 words","reason":"one concise evidence line"},'
      + '{"variable":"Construction","weight":5,"score":1-10 integer,"tag":"2–4 words","reason":"one concise evidence line"},'
      + '{"variable":"Timelessness","weight":4,"score":1-10 integer,"tag":"2–4 words","reason":"one concise evidence line"},'
      + '{"variable":"Versatility","weight":3,"score":1-10 integer,"tag":"2–4 words","reason":"one concise evidence line"},'
      + '{"variable":"Brand Integrity","weight":3,"score":1-10 integer,"tag":"2–4 words","reason":"one concise evidence line"}], '
      + '"scoredForProfile": true}.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = imageDataUrl
    ? await callVisionModel({ system: SCORE_VOICE.text, user, imageDataUrl })
    : await callModel({ model: CLAUDE_SONNET, second: CLAUDE_HAIKU, system: [SCORE_VOICE], user, maxTokens: 900, temperature: 0.4 });
  const parsed = parseJson(raw);
  const verdict = normalizeBeauVerdict(parsed, true);
  if (!verdict) {
    throw new Error('Beau couldn\u2019t complete all five scores — try a fuller description, a clearer photo, or the product link itself.');
  }

  const categoryRaw = str(parsed?.categoryId, 40).toLowerCase();
  const score: BeauScore = {
    ...verdict,
    id: `score-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    subject: ask || 'A photographed piece',
    pieceName: str(parsed?.pieceName, 90) || linkRead?.pieceName || (ask ? ask.slice(0, 70) : 'A photographed piece'),
    maker: str(parsed?.maker, 60) || linkRead?.maker || null,
    priceGuide: linkRead?.price || null,
    productUrl: linkRead?.url || link || null,
    imageUrl: linkRead?.imageUrl || null,
    categoryId: huntCategory(categoryRaw) ? categoryRaw : linkRead?.categoryId || null,
  };

  // AUTO-SAVE, both homes at once — each copy independently deletable.
  onPhase?.('Filing it to your record…');
  storeScores([...loadBeauScores(), score]);
  void setHuntTag(
    {
      pieceName: score.pieceName,
      categoryId: score.categoryId,
      subCategory: null,
      source: 'score',
      maker: score.maker,
      priceGuide: score.priceGuide,
      note: `${score.composite.toFixed(1)} · ${score.verdict} — ${score.summary} · ${score.scores.map((row) => `${row.variable}: ${row.score}/10`).join(' · ')}`.slice(0, 600),
      productUrl: score.productUrl,
      imageUrl: score.imageUrl,
    },
    'saved',
  ).catch((e) => console.warn('[Ethaion] score could not reach Your Calls (the chat copy still holds):', e));

  return score;
}
