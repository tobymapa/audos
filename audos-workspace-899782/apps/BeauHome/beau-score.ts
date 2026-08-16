/**
 * SCORE A PIECE — the Ask Beau drawer's second mode (August 2026).
 *
 * One input takes a URL, a description, or a photograph, and Beau assesses
 * the piece across the four pillars of the house thesis:
 *
 *   · CLOTH     — material and fabric quality
 *   · CUT       — silhouette, proportion, the construction cut
 *   · MAKE      — craftsmanship, finishing, stitching
 *   · LONGEVITY — will it still look right in ten years: timeless, or
 *                 trend-dependent
 *
 * …and closes with a REGRET RISK verdict — Low / Moderate / High — and one
 * sentence of reasoning. The scoring runs through the SAME mechanism the
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

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// The result shape + the chat-thread store
// ---------------------------------------------------------------------------

export type RegretRisk = 'Low' | 'Moderate' | 'High';

export interface BeauScore {
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
  cloth: string;
  cut: string;
  make: string;
  longevity: string;
  risk: RegretRisk;
  reason: string;
}

const STORE_KEY = 'ethaion:beau-scores:v1';
export const BEAU_SCORES_EVENT = 'ethaion:beau-scores-changed';

function isRisk(v: unknown): v is RegretRisk {
  return v === 'Low' || v === 'Moderate' || v === 'High';
}

/** Every assessment on file for the chat thread, newest last (reading order). */
export function loadBeauScores(): BeauScore[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(parsed)
      ? (parsed as BeauScore[]).filter((s) => s && s.id && s.pieceName && isRisk(s.risk))
      : [];
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

function cleanRisk(v: unknown): RegretRisk {
  const raw = str(v, 20).toLowerCase();
  if (raw.startsWith('low')) return 'Low';
  if (raw.startsWith('high')) return 'High';
  return 'Moderate';
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
// The scoring prompt — Beau's voice, the four pillars, the verdict.
// ---------------------------------------------------------------------------

const SCORE_VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app. A man is weighing a purchase and has put ONE piece in front of you: a link, a description, or a photograph. '
    + 'Assess it for HIM — against his frame, colouring, sizes, registers, climate, budget and what he already owns — across exactly FOUR pillars: '
    + 'CLOTH (material and fabric quality), CUT (silhouette, proportion, construction cut), MAKE (craftsmanship, finishing, stitching), LONGEVITY (will this piece still look right in ten years — is it timeless or trend-dependent). '
    + 'Then derive a REGRET RISK verdict: "Low" (buy with confidence), "Moderate" (worth it with caveats), or "High" (likely regretted), with ONE sentence of reasoning. '
    + 'Voice: quiet, knowing, concrete, lightly British; short declarative sentences written TO him ("you"); no marketing, no hedging, no exclamation marks, no emoji. '
    + 'Judge only from the facts given — where a fact is missing, say what you would check rather than inventing it. Never invent a price or a maker. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it.',
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
    imageDataUrl ? 'HE HAS PHOTOGRAPHED THE PIECE — the image above is the piece itself. Read the cloth, cut and make from it.' : null,
    'Assess this ONE piece across the four pillars and derive the Regret Risk. Return JSON: '
      + '{"pieceName": "…" (max 70 chars — colour and cloth included where known), '
      + '"maker": "…"|null, '
      + `"categoryId": one of ${CATEGORY_IDS} or null, `
      + '"cloth": "…", "cut": "…", "make": "…", "longevity": "…" (each ONE brief line, max 160 chars, specific to THIS man), '
      + '"risk": "Low"|"Moderate"|"High", '
      + '"reason": "…" (ONE sentence, max 200 chars — why that verdict for him)}.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = imageDataUrl
    ? await callVisionModel({ system: SCORE_VOICE.text, user, imageDataUrl })
    : await callModel({ model: CLAUDE_SONNET, second: CLAUDE_HAIKU, system: [SCORE_VOICE], user, maxTokens: 900, temperature: 0.4 });
  const parsed = parseJson(raw);
  const cloth = str(parsed?.cloth, 200);
  const cut = str(parsed?.cut, 200);
  const make = str(parsed?.make, 200);
  const longevity = str(parsed?.longevity, 200);
  if (!cloth && !cut && !make && !longevity) {
    throw new Error('Beau couldn\u2019t read that one — try a fuller description, a clearer photo, or the product link itself.');
  }

  const categoryRaw = str(parsed?.categoryId, 40).toLowerCase();
  const score: BeauScore = {
    id: `score-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    subject: ask || 'A photographed piece',
    pieceName: str(parsed?.pieceName, 90) || linkRead?.pieceName || (ask ? ask.slice(0, 70) : 'A photographed piece'),
    maker: str(parsed?.maker, 60) || linkRead?.maker || null,
    priceGuide: linkRead?.price || null,
    productUrl: linkRead?.url || link || null,
    imageUrl: linkRead?.imageUrl || null,
    categoryId: huntCategory(categoryRaw) ? categoryRaw : linkRead?.categoryId || null,
    cloth: cloth || 'Not enough on the cloth to judge — check the composition label.',
    cut: cut || 'Not enough on the cut to judge — check the measurements against yours.',
    make: make || 'Not enough on the make to judge — look at the seams and finishing up close.',
    longevity: longevity || 'Not enough to judge how it ages — classic shapes outlast the trend cycle.',
    risk: cleanRisk(parsed?.risk),
    reason: str(parsed?.reason, 240) || 'Judged against your dossier and what already hangs on your rail.',
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
      note: `Regret Risk ${score.risk} — ${score.reason} · Cloth: ${score.cloth} · Cut: ${score.cut} · Make: ${score.make} · Longevity: ${score.longevity}`.slice(0, 600),
      productUrl: score.productUrl,
      imageUrl: score.imageUrl,
    },
    'saved',
  ).catch((e) => console.warn('[Ethaion] score could not reach Your Calls (the chat copy still holds):', e));

  return score;
}
