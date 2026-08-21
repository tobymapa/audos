/**
 * THE HUNT · ASK BEAU — the engine behind the second sub-tab.
 *
 * ONE box takes three kinds of thing, and Beau reads which it is:
 *
 *  · A QUESTION (“does a shawl-collar cardigan work on me?”) — answered as
 *    a verdict and a recommendation, against this man's record.
 *  · A REQUEST (“find me a navy wax jacket under £200”) — Beau sweeps the
 *    live market (the platform search endpoint) and comes back with real
 *    pieces, each with its own reason and a link.
 *  · A PRODUCT LINK — read off the page's own words and assessed for him.
 *
 * And the QUEUE: up to FOUR product links held side by side. Each one is
 * read as it is added by the shared link reader (hunt-reader.ts:
 * `readProductLink` — piece · maker · price · photograph · description), and
 * with two or more on the bench Beau writes the COMPARISON — a column per
 * product on the same criteria, then his call and the runner-up.
 *
 * Everything is grounded: prices and links come from what the sweep
 * actually returned, never invented. When the market cannot be reached Beau
 * says so and answers from judgement alone rather than fabricating a listing.
 */
import { callOpenAiText, type ClaudeSystemBlock } from './claude';
import { searchWeb } from './scout-ai';
import { isFastFashionBrand } from './hunt-ai';
import { secondhandAllowed } from './profile-data';
import { HUNT_CATEGORIES, huntCategory } from './hunt-model';
import { firstUrl, hostLabel, huntReaderBrief, pieceNameFromUrl, type HuntReader } from './hunt-reader';

/** How many products the bench holds — the founder's cap. */
export const ASK_QUEUE_LIMIT = 4;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One product on the comparison bench. */
export interface QueuedProduct {
  /** Local id — stable for the life of the bench. */
  id: string;
  url: string;
  pieceName: string;
  maker: string | null;
  price: string | null;
  /** The page's own product photograph, when it publishes one. */
  imageUrl: string | null;
  /** What the thing IS, from the page — cloth, construction, cut. */
  description: string | null;
  /** The Index category id, when Beau could place it. */
  categoryId: string | null;
  /** Beau's first read of the piece for this man. */
  note: string | null;
  /** True while the page is still being read. */
  reading: boolean;
  /** Set when the page could not be read — the link is kept regardless. */
  unread?: boolean;
}

/** One product Beau puts forward in an answer. */
export interface AskResultProduct {
  pieceName: string;
  maker: string | null;
  priceGuide: string | null;
  /** Why THIS piece for THIS man. */
  whyYou: string;
  /** What to look for / what to know before buying. */
  qualitySignals: string | null;
  /** A real product or listing page from the sweep — never a homepage. */
  url: string | null;
  /** Retailer or marketplace the link points at, for the label. */
  retailer: string | null;
  categoryId: string | null;
  subCategory: string | null;
}

export interface AskAnswer {
  /** Beau's stance in one line — the headline of the verdict area. */
  headline: string;
  /** The verdict and the recommendation, 2–4 short paragraphs' worth. */
  verdict: string;
  /** Real pieces to act on, when the ask wanted pieces. */
  products: AskResultProduct[];
  /** True when the live market sweep actually returned something. */
  grounded: boolean;
}

/** One column of the side-by-side comparison. */
export interface ComparisonColumn {
  /** The queued product's local id. */
  productId: string;
  /** Beau's one-word standing: 'The one' | 'Close' | 'No'. */
  standing: string;
  fit: string;
  make: string;
  colour: string;
  value: string;
}

export interface ComparisonResult {
  /** The criteria read across every product, one column each. */
  columns: ComparisonColumn[];
  /** Beau's call — which one, and why, in his own words. */
  call: string;
  /** The runner-up and the condition under which it wins instead. */
  runnerUp: string | null;
}

// ---------------------------------------------------------------------------
// The voice — shared with Beau's Picks in register, its own task here.
// ---------------------------------------------------------------------------

const ASK_VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app. A man is asking you something directly: a question, a brief to go and find something, or a product he is weighing. Answer as a valet who knows him: quiet, knowing, concrete, lightly British; short declarative sentences; take a STANCE and say it first; no marketing, no hedging into a non-answer, no exclamation marks, no emoji. Write TO him (“you”). '
    + 'THE THESIS, without exception: natural or genuinely good materials, considered construction, timeless design, a piece that can be repaired and still reads right in fifteen years. Fast fashion never appears whatever the price fits. When his budget and the quality bar genuinely conflict, SAY SO and tell him what stretching a little, or going secondhand where he allows it, would buy him. '
    + 'GROUNDING: every price and every url must be copied from the LIVE MARKET RESULTS given to you — never invent either, and never point at a brand homepage or a search results page. If the results do not support a claim, leave the field empty and say what you do not know. Reason only from the facts in the brief. Return STRICT JSON only — no markdown fences, no prose around it.',
  cache: true,
};

const CATEGORY_IDS = HUNT_CATEGORIES.map((c) => c.id).join(', ');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function parseJson(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
      const start = trimmed.indexOf(open);
      const end = trimmed.lastIndexOf(close);
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          /* try the next shape */
        }
      }
    }
    return null;
  }
}

function str(v: unknown, max = 400): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function para(v: unknown, max = 1400): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function cleanCategoryId(raw: unknown): string | null {
  const id = str(raw, 40).toLowerCase();
  return huntCategory(id) ? id : null;
}

/** The sub-category label within a category, matched loosely so a near-miss
 * from the model still lands on a real run. */
function cleanSubCategory(categoryId: string | null, raw: unknown): string | null {
  const wanted = str(raw, 60).toLowerCase();
  if (!categoryId || !wanted) return null;
  const cat = huntCategory(categoryId);
  if (!cat) return null;
  const exact = cat.subCategories.find((s) => s.label.toLowerCase() === wanted);
  if (exact) return exact.label;
  const partial = cat.subCategories.find(
    (s) => s.label.toLowerCase().includes(wanted) || wanted.includes(s.label.toLowerCase()),
  );
  return partial ? partial.label : null;
}

interface Hit {
  title: string;
  link: string;
  snippet: string;
}

function hitsBlock(hits: Hit[]): string {
  if (hits.length === 0) {
    return 'LIVE MARKET RESULTS: none reachable right now — answer from judgement, set every "url" and "priceGuide" empty, and say in the verdict that you could not check the market this minute.';
  }
  return `LIVE MARKET RESULTS (fetched just now — every url and every price MUST be copied verbatim from these):\n${hits
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   ${h.link}`)
    .join('\n\n')}`;
}

/** Drop the hosts that are never a place to buy, and the makers the thesis
 * rules out, before the model ever sees them. */
function usefulHits(hits: Hit[]): Hit[] {
  const NON_COMMERCE = [
    'google.', 'bing.', 'reddit.com', 'youtube.com', 'pinterest.', 'instagram.com',
    'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'wikipedia.org', 'quora.com',
  ];
  const seen = new Set<string>();
  return hits.filter((h) => {
    const link = (h.link || '').toLowerCase();
    if (!link || seen.has(link)) return false;
    seen.add(link);
    if (NON_COMMERCE.some((host) => link.includes(host))) return false;
    return !isFastFashionBrand(h.title);
  });
}

// ---------------------------------------------------------------------------
// THE ASK — question, brief or link, answered in one pass.
// ---------------------------------------------------------------------------

/** A url compared the way two links to the same page should compare — case
 * and a trailing slash are not a different listing. */
function urlKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

function sanitizeProduct(raw: any, allowedUrls: Map<string, string>): AskResultProduct | null {
  const pieceName = str(raw?.pieceName || raw?.name, 90);
  if (!pieceName) return null;
  const maker = str(raw?.maker || raw?.brand, 60) || null;
  if (maker && isFastFashionBrand(maker)) return null;
  const rawUrl = str(raw?.url || raw?.link, 600);
  // A url the sweep did not return is a url Beau invented — drop it and keep
  // the recommendation, which stands on its reasoning. The sweep's own
  // spelling of the link wins, so what opens is exactly what was found.
  const url = rawUrl ? allowedUrls.get(urlKey(rawUrl)) || null : null;
  const categoryId = cleanCategoryId(raw?.categoryId);
  return {
    pieceName,
    maker,
    priceGuide: str(raw?.priceGuide || raw?.price, 40) || null,
    whyYou: str(raw?.whyYou || raw?.why_you || raw?.why, 300),
    qualitySignals: str(raw?.qualitySignals || raw?.quality_signals, 260) || null,
    url,
    retailer: str(raw?.retailer, 40) || hostLabel(url),
    categoryId,
    subCategory: cleanSubCategory(categoryId, raw?.subCategory),
  };
}

/**
 * Run ONE ask. `queued` is the bench as it stands — Beau reads it as part of
 * the context, so “which of these?” works without repeating the links.
 * Throws with a readable message only when no model could be reached.
 */
export async function runAskBeau(input: {
  query: string;
  reader: HuntReader;
  queued: QueuedProduct[];
  onPhase?: (phase: string) => void;
}): Promise<AskAnswer> {
  const { query, reader, queued, onPhase } = input;
  const ask = query.trim();
  const link = firstUrl(ask);

  // A brief that wants PIECES gets a live sweep; a pure question does not
  // need one, and a pasted link is searched by its own url.
  const wantsMarket = /\b(find|source|buy|where|which|recommend|under|cheaper|options?|alternatives?)\b/i.test(ask) || !!link;
  let hits: Hit[] = [];
  if (wantsMarket) {
    onPhase?.('Beau is sweeping the market…');
    const secondhand = secondhandAllowed(reader.prefs) ? ' new or secondhand vintage' : '';
    const queries = link
      ? [link, `${pieceNameFromUrl(link)} review price`]
      : [`${ask} menswear buy${secondhand}`.trim()];
    const rounds = await Promise.all(queries.map((q) => searchWeb(q, 8).catch(() => [] as Hit[])));
    hits = usefulHits(rounds.flat()).slice(0, 14);
  }

  onPhase?.('Beau is weighing it against your record…');
  const benchBlock =
    queued.length > 0
      ? `ALREADY ON HIS BENCH (${queued.length} of ${ASK_QUEUE_LIMIT}):\n${queued
          .map((p, i) => `${i + 1}. ${p.pieceName}${p.maker ? ` · ${p.maker}` : ''}${p.price ? ` · ${p.price}` : ''}\n   ${p.url}`)
          .join('\n')}`
      : null;

  const user = [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `WHAT HE OWNS, in his own words: ${reader.pieces.slice(0, 30).map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join('; ') || 'nothing logged yet'}`,
    benchBlock,
    `HIS ASK: ${ask}`,
    hitsBlock(hits),
    'Read what he is doing — asking a question, briefing you to find something, or putting a specific product to you — and answer in that form. '
      + 'Return JSON: {"headline": "…" (your stance in ONE line, max 90 chars), "verdict": "…" (the verdict AND the recommendation — two or three short paragraphs, separated by a blank line; the reasoning that earns the headline), '
      + `"products": [ … ] } — products holds the real pieces to act on (at most four; an empty array when the ask was a pure question). Each product: {"pieceName", "maker", "priceGuide" (copied from a result, else ""), "whyYou" (1–2 sentences for THIS man), "qualitySignals" (one sentence), "url" (copied VERBATIM from a result, else ""), "retailer", "categoryId" (one of ${CATEGORY_IDS}), "subCategory" (the run within that category, when you can place it)}.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = await callOpenAiText({
    system: [ASK_VOICE],
    user,
    maxTokens: 2400,
    json: true,
  });
  if (!raw) throw new Error('Beau is away from his desk this minute — try that again shortly.');
  const parsed = parseJson(raw);
  const headline = str(parsed?.headline, 140);
  const verdict = para(parsed?.verdict);
  if (!headline && !verdict) throw new Error('Beau couldn\u2019t read that one — try putting it another way.');
  const allowed = new Map(hits.map((h) => [urlKey(h.link), h.link]));
  const products = (Array.isArray(parsed?.products) ? parsed.products : [])
    .map((p: any) => sanitizeProduct(p, allowed))
    .filter((p: AskResultProduct | null): p is AskResultProduct => !!p)
    .slice(0, 4);
  return {
    headline: headline || 'Here\u2019s my read.',
    verdict,
    products,
    grounded: hits.length > 0,
  };
}

// ---------------------------------------------------------------------------
// THE COMPARISON — two to four products, read on the same criteria.
// ---------------------------------------------------------------------------

/**
 * Beau's side-by-side of the bench. Requires two products; returns null when
 * he could not be reached, and the caller keeps the bench as it is.
 */
export async function compareQueued(input: {
  reader: HuntReader;
  queued: QueuedProduct[];
  onPhase?: (phase: string) => void;
}): Promise<ComparisonResult | null> {
  const { reader, queued, onPhase } = input;
  const bench = queued.slice(0, ASK_QUEUE_LIMIT);
  if (bench.length < 2) return null;

  onPhase?.('Beau is lining them up…');
  const rounds = await Promise.all(
    bench.map((p) => searchWeb(`${p.maker ? `${p.maker} ` : ''}${p.pieceName} review sizing quality`, 4).catch(() => [] as Hit[])),
  );
  const hits = usefulHits(rounds.flat()).slice(0, 16);

  onPhase?.('Beau is making the call…');
  const list = bench
    .map(
      (p, i) =>
        `${i + 1}. id "${p.id}" — ${p.pieceName}${p.maker ? ` · ${p.maker}` : ''}${p.price ? ` · ${p.price}` : ''}\n   ${p.url}${p.note ? `\n   your first read: ${p.note}` : ''}`,
    )
    .join('\n');
  const user = [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    `WHAT HE OWNS, in his own words: ${reader.pieces.slice(0, 30).map((p) => (p.brand ? `${p.brand} ${p.name}` : p.name)).join('; ') || 'nothing logged yet'}`,
    `THE ${bench.length} PRODUCTS ON HIS BENCH:\n${list}`,
    hitsBlock(hits),
    'Compare them properly — the same four criteria for each, then your call. '
      + 'Return JSON: {"columns": [{"productId": "<the id, verbatim>", "standing": "The one"|"Close"|"No", "fit": "…", "make": "…", "colour": "…", "value": "…"}], "call": "…", "runnerUp": "…"|null} — one column per product, in the order given; each criterion ONE short sentence (max 140 chars) written TO the wearer as “you/your” (never “he”, “his” or “this man”): "fit" against their frame and sizes, "make" the cloth and construction, "colour" against his complexion and what he owns, "value" against his budget and cost per wear. Exactly ONE column may be "The one". "call" is two or three sentences naming your choice and why. "runnerUp" names the second and the condition under which it wins instead, or null when nothing else earns it.',
  ].join('\n\n');

  const raw = await callOpenAiText({
    system: [ASK_VOICE],
    user,
    maxTokens: 2000,
    json: true,
  });
  const parsed = parseJson(raw);
  const rawColumns: any[] = Array.isArray(parsed?.columns) ? parsed.columns : [];
  if (rawColumns.length === 0) return null;
  const columns: ComparisonColumn[] = [];
  for (const p of bench) {
    const col = rawColumns.find((c: any) => str(c?.productId, 60) === p.id) || null;
    if (!col) continue;
    const standingRaw = str(col?.standing, 20).toLowerCase();
    columns.push({
      productId: p.id,
      standing: /the one|winner|yes/.test(standingRaw) ? 'The one' : /^no|pass|skip/.test(standingRaw) ? 'No' : 'Close',
      fit: str(col?.fit, 180),
      make: str(col?.make, 180),
      colour: str(col?.colour || col?.color, 180),
      value: str(col?.value, 180),
    });
  }
  if (columns.length < 2) return null;
  // Exactly one winner: if the model marked several, the first keeps it.
  let winnerTaken = false;
  for (const col of columns) {
    if (col.standing !== 'The one') continue;
    if (winnerTaken) col.standing = 'Close';
    winnerTaken = true;
  }
  return {
    columns,
    call: para(parsed?.call, 900) || 'Both hold up — the choice comes down to which register you need it in.',
    runnerUp: str(parsed?.runnerUp, 300) || null,
  };
}
