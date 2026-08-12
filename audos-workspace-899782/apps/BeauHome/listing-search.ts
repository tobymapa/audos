/**
 * REAL LISTING SEARCH.
 *
 * The product thesis is that Beau does the searching. Before this module a
 * Find query like “a Grenfell Golfer, size 36, secondhand, under €200” came
 * back as a store directory — Buy at Grenfell, View on eBay — which is the
 * one thing the customer could have done himself in ten seconds. This module
 * turns that query into an ACTUAL product search and returns ACTUAL listings:
 * item title, price, condition, marketplace, and a direct URL to that item.
 *
 * TWO SOURCES, in preference order:
 *
 *  1. eBay Browse API (api.ebay.com/buy/browse/v1/item_summary/search) — the
 *     richest feed: real item ids, prices, condition, seller location,
 *     shipping and a direct itemWebUrl. It needs an eBay OAuth application
 *     token, so it runs through the workspace secrets proxy and only works
 *     once the founder has stored the credential (see CREDENTIALS below).
 *  2. The platform search endpoint (/api/search — SerpAPI, key server-side):
 *     Google Shopping plus site-scoped sweeps of the marketplaces that carry
 *     secondhand menswear (eBay, Grailed, Vinted, Vestiaire, Depop). No
 *     credential needed, so this is what runs out of the box — fewer
 *     structured fields, but still real listings at real prices with direct
 *     item URLs.
 *
 * CREDENTIALS — eBay (OPTIONAL; nothing is hardcoded and nothing breaks
 * without it). The founder stores ONE workspace secret through Otto or the
 * Integrations panel, with `api.ebay.com` on its allowed-hosts list:
 *
 *   · EBAY_OAUTH_BASIC  (preferred) — base64("<App ID>:<Cert ID>"), i.e. the
 *     eBay developer keyset's client id and client secret joined with a colon
 *     and base64-encoded. Beau mints a ~2h application token from it through
 *     the proxy and refreshes it automatically.
 *   · EBAY_OAUTH_TOKEN  (fallback) — a ready-made eBay application access
 *     token. Easier to paste, but eBay expires it after ~2 hours, so prefer
 *     EBAY_OAUTH_BASIC.
 *
 * TODO(founder): store EBAY_OAUTH_BASIC (or EBAY_OAUTH_TOKEN) as a workspace
 * secret with allowed host api.ebay.com to switch the eBay leg on. Until then
 * the eBay leg is skipped silently and the sweep runs on source 2 alone —
 * never a hard error, and never a fallback to store homepages.
 *
 * This module deliberately has NO import back into hunt-ai.ts (hunt-ai
 * imports this), so the few host/label tables it needs are kept local.
 */

import { BRAND_DIRECTORY } from './brands';
import { CURRENCIES, getCurrency } from './profile-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What condition the customer actually asked for. */
export type ConditionIntent = 'new' | 'used' | 'any';

/** A Find query read as structured search parameters. */
export interface FindQueryParams {
  /** The query exactly as typed. */
  raw: string;
  /** Search terms with the filter clauses stripped — what goes to `q`. */
  keywords: string;
  /** Maker, when one is named. */
  brand: string;
  /** Garment/item wording without the brand, e.g. “golfer jacket”. */
  itemType: string;
  /** The garment noun that made this a piece hunt, e.g. “jacket”. */
  garment: string;
  /** Size as written, e.g. “36”, “M”, “UK 9”. */
  size: string;
  /** Normalised tokens used to spot the size inside a listing title. */
  sizeTokens: string[];
  condition: ConditionIntent;
  /** The customer's own word for it — “vintage”, “secondhand”, “new”. */
  conditionWord: string;
  priceCeiling: number | null;
  priceFloor: number | null;
  /** Currency the ceiling is stated in (falls back to the display currency). */
  currency: string;
  /** Colours named in the brief — a soft ranking signal. */
  colours: string[];
  /** True when the brief names a piece AND at least one hard filter. */
  structured: boolean;
  /** True when the brief ALSO asks an open-ended question worth AI reasoning. */
  hasAdviceAsk: boolean;
}

/** One real listing on one real marketplace. */
export interface ListingResult {
  /** Stable key — the item URL. */
  id: string;
  title: string;
  priceValue: number | null;
  priceCurrency: string;
  priceDisplay: string;
  /** Condition as the source states it, e.g. “Pre-owned”, “Very Good”. */
  condition: string;
  conditionTier: 'new' | 'used' | 'unknown';
  /** Marketplace or retailer display name. */
  source: string;
  /** Direct link to THIS item — never a homepage. */
  url: string;
  imageUrl: string;
  sellerLocation: string;
  shippingNote: string;
  /** ISO date the listing went up, where the source reports it. */
  listedAt: string | null;
  /** Size lifted out of the listing title, when it is in there. */
  sizeText: string;
  /** Priced above the stated ceiling — shown last, and flagged. */
  overBudget: boolean;
  sizeMatch: boolean;
  score: number;
}

export interface ListingSearchOutcome {
  params: FindQueryParams;
  listings: ListingResult[];
  /** Human labels for the sources that were actually queried. */
  sourcesTried: string[];
  /** Beau's honest word when the sweep came back thin or empty. */
  note: string;
  /** Relaxed versions of the same brief, for one-tap broadening. */
  broaden: Array<{ label: string; query: string }>;
  /** True when the eBay leg was skipped for want of a stored credential. */
  ebayCredentialsMissing: boolean;
}

export interface ListingSearchOptions {
  /** From style prefs — gates marketplace sweeps on an “any condition” brief. */
  allowSecondhand?: boolean;
  onPhase?: (phase: string) => void;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** “1.200”, “1,200” and “200.50” all read the way a human means them. */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '');
  if (!/\d/.test(cleaned)) return null;
  const decimal = cleaned.match(/[.,](\d{1,2})$/);
  const whole = decimal ? cleaned.slice(0, cleaned.length - decimal[0].length) : cleaned;
  const digits = whole.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits) + (decimal ? Number(`0.${decimal[1]}`) : 0);
  return Number.isFinite(value) ? value : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '\u00a3',
  EUR: '\u20ac',
  USD: '$',
  CHF: 'CHF\u00a0',
  AUD: 'A$',
  CAD: 'C$',
  JPY: '\u00a5',
};

function symbolFor(code: string): string {
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

function formatMoney(value: number, code: string): string {
  const rounded = Math.abs(value - Math.round(value)) < 0.005 ? Math.round(value) : Number(value.toFixed(2));
  return `${symbolFor(code)}${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Approximate conversion for search filters only — display always keeps the
 * listing's own currency. Rates come from the app's own currency table. */
function convertAmount(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const fromRate = CURRENCIES.find((c) => c.id === from)?.perGBP ?? 1;
  const toRate = CURRENCIES.find((c) => c.id === to)?.perGBP ?? 1;
  return (amount / fromRate) * toRate;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\d?\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The lexicons the parser reads with
// ---------------------------------------------------------------------------

/** Garment nouns — longest phrases first so “field jacket” beats “jacket”. */
const GARMENT_NOUNS: string[] = [
  'double monk', 'chelsea boots', 'chukka boots', 'desert boots', 'derby shoes', 'oxford shoes',
  'penny loafers', 'tassel loafers', 'boat shoes', 'dress boots', 'work boots', 'hiking boots',
  'field jacket', 'harrington jacket', 'bomber jacket', 'chore jacket', 'chore coat', 'denim jacket',
  'wax jacket', 'waxed jacket', 'quilted jacket', 'golfer jacket', 'shooting jacket', 'safari jacket',
  'suede jacket', 'leather jacket', 'sports jacket', 'sport coat', 'shirt jacket', 'shacket',
  'trench coat', 'overcoat', 'topcoat', 'raincoat', 'car coat', 'duffle coat', 'peacoat', 'pea coat',
  'parka', 'anorak', 'gilet', 'body warmer', 'blazer', 'suit jacket', 'dinner jacket',
  'three piece suit', 'two piece suit', 'suit', 'waistcoat', 'tuxedo',
  'oxford shirt', 'button down shirt', 'button-down', 'dress shirt', 'flannel shirt', 'linen shirt',
  'denim shirt', 'polo shirt', 'rugby shirt', 'overshirt', 'shirt',
  'crew neck', 'crewneck', 'roll neck', 'rollneck', 'turtleneck', 'shawl collar cardigan',
  'cardigan', 'sweater', 'jumper', 'knit', 'knitwear', 'sweatshirt', 'hoodie', 'guernsey', 'aran',
  'fair isle', 'fisherman sweater', 'polo',
  'chinos', 'chino', 'trousers', 'flannel trousers', 'corduroy trousers', 'cords', 'jeans', 'denim',
  'shorts', 'joggers', 'five pocket', 'moleskin trousers',
  't-shirt', 'tee shirt', 'tee', 'vest', 'boxers', 'socks',
  'loafers', 'brogues', 'monk straps', 'monks', 'sneakers', 'trainers', 'plimsolls', 'espadrilles',
  'sandals', 'slippers', 'boots', 'shoes',
  'belt', 'braces', 'tie', 'necktie', 'bow tie', 'pocket square', 'scarf', 'gloves', 'hat', 'cap',
  'flat cap', 'beanie', 'watch strap', 'wallet', 'card holder', 'briefcase', 'holdall', 'weekender',
  'tote bag', 'rucksack', 'backpack', 'messenger bag', 'bag', 'umbrella', 'sunglasses',
  'swim shorts', 'robe', 'pyjamas', 'coat', 'jacket', 'mac', 'mackintosh',
];

/** Makers beyond the seed catalog that customers hunt for by name. */
const EXTRA_BRAND_NAMES: string[] = [
  'Baracuta', 'Belstaff', 'Aquascutum', 'Burberry', 'Invertere', 'Gloverall', 'Crombie', 'Lavenham',
  'Purdey', 'Musto', 'Sch\u00f6ffel', 'Le Chameau', 'Hunter', 'Aigle', 'Filson', 'Woolrich',
  'Pendleton', 'L.L. Bean', 'LL Bean', 'Patagonia', "Arc'teryx", 'Snow Peak', 'Fj\u00e4llr\u00e4ven',
  'Nigel Cabourn', 'Albam', 'Oliver Spencer', 'Margaret Howell', 'YMC', 'Folk', 'Percival',
  'Community Clothing', 'Anglo-Italian', 'Trunk Clothiers', 'Casatlantic', 'Husbands',
  'Officine G\u00e9n\u00e9rale', 'A.P.C.', 'Arpenteur', 'De Bonne Facture', 'Bleu de Paname', 'Vetra',
  'Danton', 'Armor Lux', 'Orcival', 'Aspesi', 'Stone Island', 'C.P. Company', 'Ten C', 'Massimo Alba',
  'Lardini', 'De Petrillo', 'Caruso', 'Ring Jacket', 'Camoshita', 'Stile Latino', 'Cesare Attolini',
  'Kiton', 'Loro Piana', 'Brunello Cucinelli', 'Zegna', 'Canali', 'Corneliani', 'Incotex', 'PT Torino',
  'Engineered Garments', 'Beams Plus', 'Nanamica', 'Visvim', 'Kapital', 'Blue Blue Japan', 'Chimala',
  'Orslow', "The Real McCoy's", "Buzz Rickson's", 'Warehouse & Co', 'Samurai', 'Iron Heart',
  'Pure Blue Japan', 'Momotaro', 'Studio D\u2019Artisan', '3sixteen', 'Freenote Cloth', 'Taylor Stitch',
  'Flint and Tinder', 'Buck Mason', 'Todd Snyder', 'J.Crew', 'Brooks Brothers', 'Ralph Lauren',
  'Polo Ralph Lauren', 'Lacoste', 'Fred Perry', 'Corgi', 'Anderson & Sheppard', 'Turnbull & Asser',
  'New & Lingwood', 'Emma Willis', 'Budd', 'Hilditch & Key', 'Charvet', 'Alden', 'Red Wing',
  "Tricker's", "Church's", 'Edward Green', 'John Lobb', 'Gaziano & Girling', 'Vass', 'Yanko',
  'Paraboot', 'Sebago', 'Quoddy', 'Yuketen', 'Blundstone', 'R.M. Williams', 'Grant Stone', 'Viberg',
  "White's Boots", 'Oak Street Bootmakers', 'Allen Edmonds', 'Cheaney', 'Barker', 'Grenson',
  'Septieme Largeur', 'Velasca', 'Scarosso', 'Clarks', "Levi's", 'Wrangler', 'Lee',
];

const USED_WORDS = [
  'secondhand', 'second-hand', 'second hand', 'pre-owned', 'preowned', 'pre owned', 'used',
  'vintage', 'preloved', 'pre-loved', 'thrifted', 'thrift', 'deadstock', 'nos', 'archive',
];

const NEW_WORDS = ['brand new', 'new with tags', 'nwt', 'unworn', 'new condition', 'new only', 'brand-new'];

/** Words that make a bare “new” part of a name rather than a condition. */
const NEW_FALSE_FRIENDS = /\bnew\s+(balance|york|england|zealand|era|&|and\b|lingwood)/i;

const COLOUR_WORDS = [
  'navy', 'black', 'white', 'cream', 'ecru', 'grey', 'gray', 'charcoal', 'brown', 'chocolate',
  'tan', 'camel', 'beige', 'stone', 'khaki', 'olive', 'green', 'forest green', 'bottle green',
  'blue', 'sky blue', 'burgundy', 'oxblood', 'wine', 'rust', 'orange', 'yellow', 'mustard',
  'pink', 'red', 'purple', 'lilac', 'sand', 'taupe', 'indigo', 'oatmeal',
];

const FILLER_WORDS = [
  'please', 'preferably', 'ideally', 'maybe', 'roughly', 'approximately', 'approx', 'about',
  'around', 'circa', 'ish', 'something', 'anything', 'some', 'a', 'an', 'the', 'me', 'for',
  'looking', 'look', 'want', 'need', 'find', 'search', 'hunt', 'source', 'get', 'buy', 'can',
  'you', 'could', 'would', 'i', 'my', 'is', 'this', 'that', 'worth', 'money', 'good', 'any',
  'in', 'of', 'on', 'at', 'and', 'or', 'with', 'to', 'do', 'know', 'about', 'what', 'should',
  'how', 'tell', 'quality', 'condition', 'listing', 'listings', 'ebay', 'grailed', 'vinted',
  'marketplace', 'menswear', 'mens', "men's", 'pair', 'pairs', 'but', 'also', 'plus', 'though',
  'however', 'recommend', 'recommendation', 'recommendations', 'suggest', 'suggestion',
  'suggestions', 'terms', 'wear', 'wearing', 'best', 'great', 'nice', 'help', 'hunting', 'like',
];

/** Words inside a signature-piece name that describe the type rather than the
 * model — so “Golfer jacket” keys on “golfer”, not on “jacket”. */
const GENERIC_PIECE_WORDS = new Set([
  'jacket', 'jackets', 'coat', 'coats', 'shirt', 'shirts', 'shoe', 'shoes', 'boot', 'boots',
  'loafer', 'loafers', 'trouser', 'trousers', 'tie', 'ties', 'sweater', 'sweaters', 'vest',
  'polo', 'tee', 'suit', 'belt', 'scarf', 'bag', 'jean', 'jeans', 'cardigan', 'pullover',
  'overshirt', 'blouson', 'raincoat', 'bomber', 'derby', 'oxford', 'brogue', 'chukka', 'crew',
  'neck', 'collar', 'dress', 'classic', 'slim', 'straight', 'high', 'rise', 'contemporary',
  'traditional', 'heavy', 'line', 'house', 'west', 'east', 'end', 'plain', 'suede', 'cotton',
  'wool', 'linen', 'cashmere', 'lambswool', 'stripe', 'work', 'field', 'flight', 'twin',
  'track', 'chore', 'military', 'vintage', 'chambray', 'grenadine', 'grossa', 'holdall',
  'weekender', 'sport', 'corduroy', 'moleskin', 'supply', 'supima', 'airism', 'desert',
  'penny', 'beefroll', 'original', 'shetland', 'aran', 'guernsey',
]);

// ---------------------------------------------------------------------------
// Parsing a Find query into structured search parameters
// ---------------------------------------------------------------------------

const CEILING_RE = /(?:under|below|less than|no more than|not more than|cheaper than|max(?:imum)?(?:\s+of)?|up to|within|<=?|budget(?:\s+of)?)\s*(?:about\s+|around\s+|roughly\s+|circa\s+)?([\u00a3\u20ac$\u00a5])?\s*(\d[\d.,]*)\s*(k\b)?\s*([\u00a3\u20ac$\u00a5]|gbp|eur|euros?|usd|dollars?|pounds?|quid|chf|aud|cad|jpy|yen)?/i;

const TRAILING_CEILING_RE = /([\u00a3\u20ac$\u00a5])?\s*(\d[\d.,]*)\s*(k\b)?\s*([\u00a3\u20ac$\u00a5]|gbp|eur|euros?|usd|dollars?|pounds?|quid)?\s*(?:or\s+(?:less|under|below)|tops|ceiling|absolute\s+max)/i;

const RANGE_RE = /between\s*([\u00a3\u20ac$\u00a5])?\s*(\d[\d.,]*)\s*(?:and|to|[-\u2013])\s*([\u00a3\u20ac$\u00a5])?\s*(\d[\d.,]*)/i;

const SIZE_CLAUSE_RES: RegExp[] = [
  /\bsize\s*[:\-]?\s*(?:uk|us|eu|it|fr|jp)?\s*\d{1,2}(?:\.5)?\s*(?:r|s|l)?\b/i,
  /\bsize\s*[:\-]?\s*(?:xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|small|medium|large|extra large)\b/i,
  /\b(?:uk|us|eu|it|fr|jp)\s?\d{1,2}(?:\.5)?\b/i,
  /\bw\d{2}\s?\/?\s?l\d{2}\b/i,
  /\b\d{2}(?:r|s|l)\b/i,
];

const CURRENCY_TOKENS: Record<string, string> = {
  '\u00a3': 'GBP', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', quid: 'GBP', sterling: 'GBP',
  '\u20ac': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  $: 'USD', usd: 'USD', dollar: 'USD', dollars: 'USD',
  '\u00a5': 'JPY', jpy: 'JPY', yen: 'JPY',
  chf: 'CHF', aud: 'AUD', cad: 'CAD',
};

function currencyFromToken(token: string | undefined): string {
  const t = (token || '').trim().toLowerCase();
  return t ? CURRENCY_TOKENS[t] || '' : '';
}

const ADVICE_RE = /\b(what should i|what do i|what to look for|what should i look for|how do i|how should i|how can i|how to tell|worth the money|worth it|is it worth|any advice|advice on|which is better|what makes|explain|talk me through|any tips|what else|what do you know about|how does .* compare|tell me about)\b/i;

/** Every brand name the parser can recognise, longest first. */
const BRAND_NAMES: string[] = [...BRAND_DIRECTORY.map((b) => b.brand), ...EXTRA_BRAND_NAMES].sort(
  (a, b) => b.length - a.length,
);

function normaliseWords(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function detectBrand(query: string): string {
  const words = normaliseWords(query);
  const flat = compact(query);
  for (const brand of BRAND_NAMES) {
    const needle = normaliseWords(brand).trim();
    if (needle && words.includes(` ${needle} `)) return brand;
  }
  // Punctuated names the customer typed without the punctuation — “Drakes” for
  // “Drake’s”. Long enough that a chance substring hit is not a real risk.
  for (const brand of BRAND_NAMES) {
    const flatBrand = compact(brand);
    if (flatBrand.length >= 6 && flat.includes(flatBrand)) return brand;
  }
  return '';
}

function detectGarment(query: string): string {
  const words = normaliseWords(query);
  const ordered = [...GARMENT_NOUNS].sort((a, b) => b.length - a.length);
  for (const noun of ordered) {
    if (words.includes(` ${normaliseWords(noun).trim()} `)) return noun;
  }
  // Plurals the lexicon lists in the singular (“trench coats”, “blazers”).
  for (const noun of ordered) {
    if (words.includes(` ${normaliseWords(noun).trim()}s `)) return noun;
  }
  return '';
}

/**
 * A maker's own model name counts as naming a piece: “a Grenfell Golfer” and
 * “a vintage Barbour Bedale” are as specific as “a waxed jacket”, and the
 * catalog already knows each maker's signature pieces.
 */
function detectSignaturePiece(query: string, brand: string): string {
  if (!brand) return '';
  const entry = BRAND_DIRECTORY.find((b) => b.brand === brand);
  if (!entry) return '';
  const words = normaliseWords(query);
  for (const piece of entry.signaturePieces || []) {
    const tokens = normaliseWords(piece).trim().split(' ');
    const distinctive = tokens.filter((t) => t.length >= 4 && !GENERIC_PIECE_WORDS.has(t));
    if (distinctive.length > 0 && distinctive.some((t) => words.includes(` ${t} `))) {
      return piece.toLowerCase();
    }
  }
  return '';
}

function detectSize(query: string): { size: string; tokens: string[] } {
  const lower = query.toLowerCase();

  const waist = lower.match(/\bw(\d{2})\s?\/?\s?l(\d{2})\b/);
  if (waist) return { size: `W${waist[1]} L${waist[2]}`, tokens: [`w${waist[1]}`, `${waist[1]}x${waist[2]}`, waist[1]] };

  const withSystem = lower.match(/\b(uk|us|eu|it|fr|jp)\s?(\d{1,2}(?:\.5)?)\b/);
  if (withSystem) {
    return {
      size: `${withSystem[1].toUpperCase()} ${withSystem[2]}`,
      tokens: [`${withSystem[1]} ${withSystem[2]}`, withSystem[2]],
    };
  }

  const numericWithFit = lower.match(/\b(\d{2})(r|s|l)\b/);
  if (numericWithFit) {
    return { size: `${numericWithFit[1]}${numericWithFit[2].toUpperCase()}`, tokens: [`${numericWithFit[1]}${numericWithFit[2]}`, numericWithFit[1]] };
  }

  const labelledNumber = lower.match(/\bsize\s*[:\-]?\s*(\d{1,2}(?:\.5)?)\b/);
  if (labelledNumber) return { size: labelledNumber[1], tokens: [labelledNumber[1]] };

  const labelledLetter = lower.match(/\bsize\s*[:\-]?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|small|medium|large)\b/);
  if (labelledLetter) {
    const raw = labelledLetter[1];
    const map: Record<string, string[]> = {
      xxs: ['xxs'], xs: ['xs', 'extra small'], s: ['s', 'small'], m: ['m', 'medium'],
      l: ['l', 'large'], xl: ['xl', 'extra large'], xxl: ['xxl', '2xl'], xxxl: ['xxxl', '3xl'],
      '2xl': ['2xl', 'xxl'], '3xl': ['3xl', 'xxxl'], small: ['s', 'small'], medium: ['m', 'medium'],
      large: ['l', 'large'],
    };
    return { size: raw.toUpperCase(), tokens: map[raw] || [raw] };
  }

  const bareLetter = lower.match(/\b(xs|xl|xxl|xxxl)\b/);
  if (bareLetter) return { size: bareLetter[1].toUpperCase(), tokens: [bareLetter[1]] };

  return { size: '', tokens: [] };
}

function detectCondition(query: string): { condition: ConditionIntent; word: string } {
  const lower = query.toLowerCase();
  for (const w of USED_WORDS) {
    if (new RegExp(`\\b${escapeRegExp(w)}\\b`).test(lower)) {
      return { condition: 'used', word: w === 'nos' ? 'deadstock' : w };
    }
  }
  for (const w of NEW_WORDS) {
    if (new RegExp(`\\b${escapeRegExp(w)}\\b`).test(lower)) return { condition: 'new', word: 'new' };
  }
  if (/\bnew\b/.test(lower) && !NEW_FALSE_FRIENDS.test(lower)) return { condition: 'new', word: 'new' };
  return { condition: 'any', word: '' };
}

function detectPrice(query: string): { ceiling: number | null; floor: number | null; currency: string; clauses: string[] } {
  const clauses: string[] = [];
  let ceiling: number | null = null;
  let floor: number | null = null;
  let currency = '';

  const range = query.match(RANGE_RE);
  if (range) {
    clauses.push(range[0]);
    floor = toNumber(range[2]);
    ceiling = toNumber(range[4]);
    currency = currencyFromToken(range[1]) || currencyFromToken(range[3]);
  }

  if (ceiling == null) {
    const capped = query.match(CEILING_RE);
    if (capped) {
      clauses.push(capped[0]);
      const base = toNumber(capped[2]);
      ceiling = base != null && capped[3] ? base * 1000 : base;
      currency = currencyFromToken(capped[1]) || currencyFromToken(capped[4]);
    }
  }

  if (ceiling == null) {
    const trailing = query.match(TRAILING_CEILING_RE);
    if (trailing) {
      clauses.push(trailing[0]);
      const base = toNumber(trailing[2]);
      ceiling = base != null && trailing[3] ? base * 1000 : base;
      currency = currencyFromToken(trailing[1]) || currencyFromToken(trailing[4]);
    }
  }

  if (!currency) {
    const loose = query.match(/([\u00a3\u20ac$\u00a5])\s*\d/) || query.match(/\b(gbp|eur|euros?|usd|dollars?|pounds?|quid|chf|aud|cad|jpy|yen)\b/i);
    if (loose) currency = currencyFromToken(loose[1]);
  }

  return { ceiling, floor, currency, clauses };
}

/** Same word twice in a row (or twice at all) never sharpens a search. */
function dedupeTokens(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\s+/)
    .filter((token) => {
      const key = compact(token);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ')
    .trim();
}

/**
 * On a hybrid brief — a piece hunt plus an open-ended question (“find me a
 * Harrington under £150, but also what should I look for?”) — only the part
 * before the question is a search brief. The question goes to Beau instead.
 */
function searchPortion(raw: string): string {
  const match = raw.match(ADVICE_RE);
  if (!match || match.index == null || match.index < 6) return raw;
  let head = raw.slice(0, match.index);
  for (let i = 0; i < 2; i += 1) {
    head = head
      .replace(/[\s,;:.\u2013\u2014-]+$/, '')
      .replace(/\b(?:but|and|also|plus|though|however|then)\s*$/i, '');
  }
  head = head.trim();
  return head.split(/\s+/).filter(Boolean).length >= 2 ? head : raw;
}

/** Strip every filter clause so what remains is the piece itself. */
function buildKeywords(query: string, priceClauses: string[], condition: ConditionIntent): string {
  let s = ` ${query.toLowerCase()} `;
  for (const clause of priceClauses) {
    if (clause) s = s.replace(clause.toLowerCase(), ' ');
  }
  for (const re of SIZE_CLAUSE_RES) s = s.replace(new RegExp(re.source, 'gi'), ' ');
  for (const w of [...USED_WORDS, ...NEW_WORDS]) s = s.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, 'gi'), ' ');
  // A bare “new” is a condition here, not part of the piece — but only when
  // the condition pass already read it that way (never “New & Lingwood”).
  if (condition === 'new') s = s.replace(/\bnew\b/gi, ' ');
  s = s.replace(/[\u00a3\u20ac$\u00a5]\s*\d[\d.,]*/g, ' ');
  s = s.replace(/\b\d[\d.,]*\s*(?:gbp|eur|euros?|usd|dollars?|pounds?|quid|chf|aud|cad|jpy|yen)\b/gi, ' ');
  s = s.replace(/[?!.,;:/|()\u2013\u2014"'\u2018\u2019\u201c\u201d]+/g, ' ');
  const kept = s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !FILLER_WORDS.includes(w) && !/^\d+$/.test(w));
  return kept.join(' ').trim();
}

/**
 * Read ONE Find query as structured search parameters. Entirely
 * deterministic — no model call, so the detection layer costs nothing and
 * never fails; the sweep that follows is where the time goes.
 */
export function parseFindQuery(query: string): FindQueryParams {
  const raw = (query || '').trim();
  const searchable = searchPortion(raw);
  const brand = detectBrand(searchable);
  const garment = detectGarment(searchable) || detectSignaturePiece(searchable, brand);
  const { size, tokens } = detectSize(raw);
  const { condition, word } = detectCondition(raw);
  const price = detectPrice(raw);

  let keywords = buildKeywords(searchable, price.clauses, condition);
  // The brand belongs in the search terms even when the customer wrote it in
  // a form the keyword pass dropped (punctuation, casing).
  const brandWords = brand ? normaliseWords(brand).trim().split(' ') : [];
  const brandCompact = brand ? compact(brand) : '';
  if (brand && !normaliseWords(keywords).includes(` ${normaliseWords(brand).trim()} `) && !compact(keywords).includes(brandCompact)) {
    keywords = `${brand} ${keywords}`.trim();
  }
  if (garment && !normaliseWords(keywords).includes(` ${normaliseWords(garment).trim()} `)) {
    keywords = `${keywords} ${garment}`.trim();
  }
  if (!keywords && garment) keywords = garment;
  // “Grenfell Golfer” + the catalog's “Golfer jacket” must not compound into
  // “golfer golfer jacket”.
  keywords = dedupeTokens(keywords);

  // What is left once the maker's name comes out is the piece as described.
  const itemType = keywords
    .split(/\s+/)
    .filter((token) => {
      const flat = compact(token);
      if (!flat) return false; // stray punctuation from a maker's name
      if (!brand) return true;
      return !brandWords.includes(flat) && !(flat.length > 2 && brandCompact.includes(flat)) && flat !== brandCompact;
    })
    .join(' ')
    .trim();

  const colours = COLOUR_WORDS.filter((c) => normaliseWords(raw).includes(` ${c} `));

  const hardFilters = [!!size, condition !== 'any', price.ceiling != null].filter(Boolean).length;

  return {
    raw,
    keywords: keywords.slice(0, 100),
    brand,
    itemType: itemType || garment,
    garment,
    size,
    sizeTokens: tokens,
    condition,
    conditionWord: word,
    priceCeiling: price.ceiling,
    priceFloor: price.floor,
    currency: price.currency || getCurrency().id,
    colours,
    // A piece hunt needs a PIECE and something to filter on. “Something for
    // rain”, “recommend a good wool overcoat” and “what do you know about
    // Corridor NYC?” deliberately fall through to Beau's own reasoning — they
    // want taste, not a list of listings.
    structured: (!!garment && (hardFilters >= 1 || !!brand)) || (!!brand && !!size),
    hasAdviceAsk: ADVICE_RE.test(raw),
  };
}

/** “Grenfell · golfer jacket · size 36 · secondhand · under €200”. */
export function describeParams(p: FindQueryParams): string {
  const bits: string[] = [];
  if (p.brand) bits.push(p.brand);
  if (p.itemType && p.itemType !== p.brand.toLowerCase()) bits.push(p.itemType);
  if (p.size) bits.push(`size ${p.size}`);
  if (p.condition === 'used') bits.push(p.conditionWord || 'secondhand');
  if (p.condition === 'new') bits.push('new');
  if (p.priceCeiling != null) {
    bits.push(
      p.priceFloor != null
        ? `${formatMoney(p.priceFloor, p.currency)}\u2013${formatMoney(p.priceCeiling, p.currency)}`
        : `under ${formatMoney(p.priceCeiling, p.currency)}`,
    );
  }
  return bits.join(' \u00b7 ');
}

/** Relaxed versions of the same brief — offered when the sweep comes up short. */
export function broadenOptions(p: FindQueryParams): Array<{ label: string; query: string }> {
  const options: Array<{ label: string; query: string }> = [];
  const base = [p.brand, p.itemType].filter(Boolean).join(' ').trim() || p.keywords;

  if (p.size) {
    const parts = [base];
    if (p.condition === 'used') parts.push(p.conditionWord || 'secondhand');
    if (p.priceCeiling != null) parts.push(`under ${formatMoney(p.priceCeiling, p.currency)}`);
    options.push({ label: `Drop the size ${p.size} filter`, query: parts.join(', ') });
  }
  if (p.priceCeiling != null) {
    const raised = Math.round((p.priceCeiling * 1.5) / 10) * 10;
    const parts = [base];
    if (p.size) parts.push(`size ${p.size}`);
    if (p.condition === 'used') parts.push(p.conditionWord || 'secondhand');
    parts.push(`under ${formatMoney(raised, p.currency)}`);
    options.push({ label: `Raise the ceiling to ${formatMoney(raised, p.currency)}`, query: parts.join(', ') });
  }
  if (p.condition !== 'any') {
    const parts = [base];
    if (p.size) parts.push(`size ${p.size}`);
    if (p.priceCeiling != null) parts.push(`under ${formatMoney(p.priceCeiling, p.currency)}`);
    options.push({ label: p.condition === 'used' ? 'Include new pieces too' : 'Include secondhand too', query: parts.join(', ') });
  }
  if (p.brand && p.itemType) {
    const parts = [p.itemType];
    if (p.size) parts.push(`size ${p.size}`);
    if (p.condition === 'used') parts.push(p.conditionWord || 'secondhand');
    if (p.priceCeiling != null) parts.push(`under ${formatMoney(p.priceCeiling, p.currency)}`);
    options.push({ label: `Any maker, not just ${p.brand}`, query: parts.join(', ') });
  }
  return options.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Source 1 — eBay Browse API, through the workspace secrets proxy
// ---------------------------------------------------------------------------

interface ProxyResult {
  status: number;
  body: any;
}

function runtime(): any {
  return (window as any).__workspaceDb;
}

function tryJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** One request forwarded by the workspace secrets proxy. `{{secrets.NAME}}`
 * placeholders are substituted at the edge — no key ever reaches the app. */
async function secretsProxy(request: Record<string, unknown>): Promise<ProxyResult | null> {
  const ws = runtime();
  if (!ws?.workspaceId || !ws?.token) return null;
  try {
    const res = await fetch(`/api/workspaces/${ws.workspaceId}/secrets/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token },
      body: JSON.stringify(request),
    });
    if (!res.ok) return null;
    const wrapper = await res.json();
    if (!wrapper || typeof wrapper.status !== 'number') return null;
    return { status: wrapper.status, body: typeof wrapper.body === 'string' ? tryJson(wrapper.body) : wrapper.body };
  } catch {
    return null;
  }
}

const EBAY_TOKEN_KEY = 'ethaion_ebay_app_token_v1';

function readCachedEbayToken(): string | null {
  try {
    const raw = sessionStorage.getItem(EBAY_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now() + 60_000) {
      return parsed.token as string;
    }
  } catch { /* storage unavailable — mint again */ }
  return null;
}

function cacheEbayToken(token: string, expiresInSeconds: number): void {
  try {
    sessionStorage.setItem(
      EBAY_TOKEN_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + Math.max(60, expiresInSeconds) * 1000 }),
    );
  } catch { /* storage unavailable — one mint per sweep is affordable */ }
}

/**
 * Mint an eBay application access token from EBAY_OAUTH_BASIC through the
 * proxy (client-credentials grant). Returns null when the secret is absent
 * or eBay refuses — the caller then tries the ready-token shape.
 */
async function mintEbayToken(): Promise<string | null> {
  const cached = readCachedEbayToken();
  if (cached) return cached;
  const result = await secretsProxy({
    method: 'POST',
    url: 'https://api.ebay.com/identity/v1/oauth2/token',
    headers: {
      Authorization: 'Basic {{secrets.EBAY_OAUTH_BASIC}}',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    form: { grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' },
  });
  if (!result || result.status < 200 || result.status >= 300) return null;
  const token = str(result.body?.access_token);
  if (!token) return null;
  const expires = Number(result.body?.expires_in);
  cacheEbayToken(token, Number.isFinite(expires) ? expires : 7200);
  return token;
}

interface Marketplace {
  id: string;
  currency: string;
  country: string;
  site: string;
}

const MARKETPLACES: Marketplace[] = [
  { id: 'EBAY_GB', currency: 'GBP', country: 'GB', site: 'ebay.co.uk' },
  { id: 'EBAY_US', currency: 'USD', country: 'US', site: 'ebay.com' },
  { id: 'EBAY_IT', currency: 'EUR', country: 'IT', site: 'ebay.it' },
  { id: 'EBAY_DE', currency: 'EUR', country: 'DE', site: 'ebay.de' },
  { id: 'EBAY_FR', currency: 'EUR', country: 'FR', site: 'ebay.fr' },
  { id: 'EBAY_ES', currency: 'EUR', country: 'ES', site: 'ebay.es' },
  { id: 'EBAY_IE', currency: 'EUR', country: 'IE', site: 'ebay.ie' },
];

function marketplaceById(id: string): Marketplace {
  return MARKETPLACES.find((m) => m.id === id) || MARKETPLACES[0];
}

/** Which eBay sites to sweep — the currency in the brief points at a region,
 * and a listing in one EU site rarely shows up in another, so EUR fans out. */
function marketplacesFor(currency: string): string[] {
  if (currency === 'EUR') return ['EBAY_IT', 'EBAY_DE', 'EBAY_FR', 'EBAY_GB'];
  if (currency === 'USD') return ['EBAY_US', 'EBAY_GB'];
  if (currency === 'GBP') return ['EBAY_GB', 'EBAY_IT', 'EBAY_DE'];
  return ['EBAY_GB', 'EBAY_US'];
}

const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom', US: 'United States', IT: 'Italy', DE: 'Germany', FR: 'France',
  ES: 'Spain', IE: 'Ireland', NL: 'Netherlands', BE: 'Belgium', AT: 'Austria', PT: 'Portugal',
  SE: 'Sweden', DK: 'Denmark', PL: 'Poland', JP: 'Japan', CA: 'Canada', AU: 'Australia',
  CH: 'Switzerland',
};

function ebayFilter(p: FindQueryParams, market: Marketplace): string {
  const parts: string[] = [];
  if (p.priceCeiling != null) {
    // A little headroom so a listing that only just misses still comes back
    // — the ranking flags it rather than pretending it does not exist.
    const ceiling = Math.ceil(convertAmount(p.priceCeiling, p.currency, market.currency) * 1.12);
    const floor = p.priceFloor != null ? Math.floor(convertAmount(p.priceFloor, p.currency, market.currency)) : null;
    parts.push(`price:[${floor != null ? floor : ''}..${ceiling}]`);
    parts.push(`priceCurrency:${market.currency}`);
  }
  if (p.condition === 'used') parts.push('conditions:{USED}');
  if (p.condition === 'new') parts.push('conditions:{NEW}');
  return parts.join(',');
}

function ebayConditionTier(raw: any): 'new' | 'used' | 'unknown' {
  const id = Number(raw?.conditionId);
  if (id === 1000 || id === 1500) return 'new';
  if (Number.isFinite(id) && id > 1500) return 'used';
  const label = str(raw?.condition).toLowerCase();
  if (!label) return 'unknown';
  if (/^new|nuovo|neu|neuf/.test(label)) return 'new';
  return 'used';
}

function sizeFromTitle(title: string): string {
  const m = title.match(/\bsize\s*[:\-]?\s*((?:uk|us|eu|it)?\s?\d{1,2}(?:\.5)?(?:r|s|l)?|xxs|xs|s|m|l|xl|xxl|xxxl)\b/i)
    || title.match(/\b(\d{2}(?:r|s|l))\b/i)
    || title.match(/\b(w\d{2}\s?l\d{2})\b/i);
  return m ? m[1].trim().toUpperCase() : '';
}

function fromEbayItem(raw: any, market: Marketplace): ListingResult | null {
  const url = str(raw?.itemWebUrl);
  const title = str(raw?.title);
  if (!url || !title) return null;
  const priceValue = Number(raw?.price?.value);
  const priceCurrency = str(raw?.price?.currency) || market.currency;
  const shipping = raw?.shippingOptions?.[0]?.shippingCost;
  const shipValue = Number(shipping?.value);
  const country = str(raw?.itemLocation?.country);
  return {
    id: url,
    title,
    priceValue: Number.isFinite(priceValue) ? priceValue : null,
    priceCurrency,
    priceDisplay: Number.isFinite(priceValue) ? formatMoney(priceValue, priceCurrency) : 'Price on the listing',
    condition: str(raw?.condition) || (ebayConditionTier(raw) === 'new' ? 'New' : 'Pre-owned'),
    conditionTier: ebayConditionTier(raw),
    source: 'eBay',
    url,
    imageUrl: str(raw?.image?.imageUrl) || str(raw?.thumbnailImages?.[0]?.imageUrl),
    sellerLocation: country ? COUNTRY_NAMES[country] || country : '',
    shippingNote: Number.isFinite(shipValue)
      ? shipValue === 0
        ? 'Free shipping'
        : `+ ${formatMoney(shipValue, str(shipping?.currency) || priceCurrency)} shipping`
      : '',
    listedAt: str(raw?.itemCreationDate) || null,
    sizeText: sizeFromTitle(title),
    overBudget: false,
    sizeMatch: false,
    score: 0,
  };
}

interface EbayLegResult {
  listings: ListingResult[];
  credentialsMissing: boolean;
}

const EBAY_OFF_KEY = 'ethaion_ebay_unavailable_until';
const EBAY_OFF_MS = 5 * 60 * 1000;

/** Before the credential is stored, every hunt would otherwise spend five
 * doomed round trips on eBay. One failure parks the leg for a few minutes. */
function ebayParked(): boolean {
  try {
    const until = Number(sessionStorage.getItem(EBAY_OFF_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function parkEbay(): void {
  try {
    sessionStorage.setItem(EBAY_OFF_KEY, String(Date.now() + EBAY_OFF_MS));
  } catch { /* storage unavailable — the probe below is the only cost */ }
}

async function ebayLeg(p: FindQueryParams, id: string, authorization: string): Promise<{ ok: boolean; listings: ListingResult[] }> {
  const market = marketplaceById(id);
  const filter = ebayFilter(p, market);
  const result = await secretsProxy({
    method: 'GET',
    url: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
    query: {
      q: p.keywords || p.raw.slice(0, 100),
      limit: '15',
      ...(p.priceCeiling != null ? { sort: 'price' } : {}),
      ...(filter ? { filter } : {}),
    },
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': market.id,
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=country%3D${market.country}`,
    },
  });
  if (!result || result.status < 200 || result.status >= 300) return { ok: false, listings: [] };
  const summaries: any[] = Array.isArray(result.body?.itemSummaries) ? result.body.itemSummaries : [];
  return { ok: true, listings: summaries.map((s) => fromEbayItem(s, market)).filter(Boolean) as ListingResult[] };
}

async function searchEbay(p: FindQueryParams): Promise<EbayLegResult> {
  if (!runtime()?.token || ebayParked()) return { listings: [], credentialsMissing: true };

  const minted = await mintEbayToken();
  // Two supported credential shapes: a minted token from EBAY_OAUTH_BASIC, or
  // a ready application token the founder pasted as EBAY_OAUTH_TOKEN (kept as
  // a placeholder so the value still never reaches the browser).
  const authorization = minted ? `Bearer ${minted}` : 'Bearer {{secrets.EBAY_OAUTH_TOKEN}}';

  const ids = marketplacesFor(p.currency);
  // Probe ONE marketplace first: if the credential is not there, that single
  // round trip is the whole cost before the open-market sweep takes over.
  const probe = await ebayLeg(p, ids[0], authorization);
  if (!probe.ok) {
    parkEbay();
    return { listings: [], credentialsMissing: !minted };
  }
  const rest = await Promise.all(ids.slice(1).map((id) => ebayLeg(p, id, authorization)));
  return {
    listings: [...probe.listings, ...rest.flatMap((leg) => leg.listings)],
    credentialsMissing: false,
  };
}

// ---------------------------------------------------------------------------
// Source 2 — the platform search endpoint (SerpAPI): Google Shopping plus
// site-scoped marketplace sweeps. No credential, so this always runs when the
// eBay leg is thin.
// ---------------------------------------------------------------------------

interface SerpRow {
  title?: string;
  link?: string;
  product_link?: string;
  snippet?: string;
  price?: string;
  extracted_price?: number;
  thumbnail?: string;
  source?: string;
  delivery?: string;
  condition?: string;
  position?: number;
}

/** The platform search endpoint. Kept local rather than reusing scout-ai's
 * `searchWeb` because the shopping shape carries price / thumbnail / source
 * fields that helper's row type drops. */
async function serpSearch(query: string, searchType: 'web' | 'shopping', num = 10): Promise<SerpRow[]> {
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, searchType, num }),
    });
    const data = await res.json();
    if (!data?.success) return [];
    return Array.isArray(data.results) ? (data.results as SerpRow[]) : [];
  } catch {
    return [];
  }
}

/** Marketplace item-page shapes — a listing, never a search page or homepage. */
const ITEM_URL_RULES: Array<{ host: RegExp; path: RegExp; label: string; tier: 'used' | 'mixed' }> = [
  { host: /(^|\.)ebay\./, path: /\/itm\//, label: 'eBay', tier: 'mixed' },
  { host: /(^|\.)grailed\.com$/, path: /\/listings\//, label: 'Grailed', tier: 'used' },
  { host: /(^|\.)vinted\./, path: /\/items\//, label: 'Vinted', tier: 'used' },
  { host: /(^|\.)vestiairecollective\.com$/, path: /-\d{5,}/, label: 'Vestiaire Collective', tier: 'used' },
  { host: /(^|\.)depop\.com$/, path: /\/products\//, label: 'Depop', tier: 'used' },
  { host: /(^|\.)therealreal\.com$/, path: /\/products\//, label: 'The RealReal', tier: 'used' },
  { host: /(^|\.)etsy\.com$/, path: /\/listing\//, label: 'Etsy', tier: 'used' },
  { host: /(^|\.)rebelle\.com$/, path: /\/(?:en\/)?item/, label: 'Rebelle', tier: 'used' },
];

/** Quality retailers worth a direct product page on a new-condition brief. */
const NEW_RETAILERS: Array<{ host: string; label: string }> = [
  { host: 'endclothing.com', label: 'END.' },
  { host: 'mrporter.com', label: 'MR PORTER' },
  { host: 'matchesfashion.com', label: 'MATCHES' },
  { host: 'farfetch.com', label: 'Farfetch' },
  { host: 'ssense.com', label: 'SSENSE' },
  { host: 'trunkclothiers.com', label: 'Trunk' },
  { host: 'huckberry.com', label: 'Huckberry' },
  { host: 'clutchcafe.com', label: 'Clutch Cafe' },
  { host: 'oipolloi.com', label: 'Oi Polloi' },
  { host: 'brownsfashion.com', label: 'Browns' },
  { host: 'selfridges.com', label: 'Selfridges' },
  { host: 'johnlewis.com', label: 'John Lewis' },
];

/** Fast fashion never passes the house thesis, whatever the price fit. */
const FAST_FASHION_DOMAINS = [
  'asos.com', 'hm.com', 'zara.com', 'shein.com', 'shein.co.uk', 'temu.com', 'primark.com',
  'boohoo.com', 'boohooman.com', 'prettylittlething.com', 'missguided.co.uk', 'fashionnova.com',
  'forever21.com', 'bershka.com', 'pullandbear.com', 'stradivarius.com', 'romwe.com', 'shopcider.com',
  'aliexpress.com', 'wish.com', 'dhgate.com',
];

/** Hosts that are never a place to buy — search, social, forums, editorial. */
const NON_COMMERCE_HOSTS = [
  'google.com', 'bing.com', 'reddit.com', 'youtube.com', 'pinterest.com', 'instagram.com',
  'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'wikipedia.org', 'quora.com',
  'medium.com', 'styleforum.net', 'permanentstyle.com', 'gq.com', 'esquire.com',
  'fashionbeans.com', 'substack.com', 'tumblr.com',
];

function hostIn(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

function isFastFashionHost(host: string): boolean {
  return hostIn(host, FAST_FASHION_DOMAINS);
}

/** “endclothing.com” → “Endclothing” — a readable label for a maker-direct
 * page from a shop the retailer table has never heard of. */
function hostLabel(host: string): string {
  const core = host.split('.')[0] || 'the maker';
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/** Classify a url: a real item page, a retailer product page, or neither. */
function classifyUrl(url: string, allowRetailerPages: boolean): { source: string; tier: 'used' | 'mixed' | 'new' } | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const host = hostOf(url);
  if (!host || isFastFashionHost(host)) return null;
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const rule of ITEM_URL_RULES) {
    if (rule.host.test(host) && rule.path.test(path)) return { source: rule.label, tier: rule.tier };
  }
  if (!allowRetailerPages || hostIn(host, NON_COMMERCE_HOSTS)) return null;
  const trimmed = path.replace(/\/+$/, '');
  const retailer = NEW_RETAILERS.find((r) => host === r.host || host.endsWith(`.${r.host}`));
  if (retailer) {
    // Known retailers each shape product urls their own way (“…-123.html”,
    // “/product/…/12345”): a product id or a page extension is the tell, and a
    // category listing without one is not a listing.
    const looksProduct = /\d{3,}/.test(trimmed) || /\.html?$/i.test(trimmed) || /\/(products?|item)\//i.test(trimmed);
    return looksProduct ? { source: retailer.label, tier: 'new' } : null;
  }
  // Anywhere else — including the maker's own shop, often the best answer on a
  // new-condition brief — the path must plainly name a product. A bare
  // homepage is exactly what this whole feature exists to stop returning.
  if (!/\/(products?|p|item|items|shop|collections)\/[^/]/i.test(trimmed)) return null;
  return { source: hostLabel(host), tier: 'new' };
}

const PRICE_IN_TEXT_RE = /([\u00a3\u20ac$])\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/;

function priceFromText(text: string, fallbackCurrency: string): { value: number | null; currency: string } {
  const symbolMatch = text.match(PRICE_IN_TEXT_RE);
  if (symbolMatch) {
    return { value: toNumber(symbolMatch[2]), currency: currencyFromToken(symbolMatch[1]) || fallbackCurrency };
  }
  const codeMatch = text.match(/\b(GBP|EUR|USD)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i);
  if (codeMatch) return { value: toNumber(codeMatch[2]), currency: currencyFromToken(codeMatch[1]) || fallbackCurrency };
  return { value: null, currency: fallbackCurrency };
}

function conditionFromText(text: string): { label: string; tier: 'new' | 'used' | 'unknown' } {
  const t = text.toLowerCase();
  if (/new with tags|nwt|brand new|\bunworn\b|deadstock/.test(t)) return { label: 'New with tags', tier: 'new' };
  if (/\bnuovo\b|\bneu\b|\bneuf\b/.test(t)) return { label: 'New', tier: 'new' };
  if (/very good condition|excellent condition/.test(t)) return { label: 'Very good', tier: 'used' };
  if (/good condition/.test(t)) return { label: 'Good', tier: 'used' };
  if (/pre-owned|preowned|second hand|secondhand|\bused\b|\bvintage\b|usato|gebraucht/.test(t)) {
    return { label: 'Pre-owned', tier: 'used' };
  }
  return { label: '', tier: 'unknown' };
}

function fromSerpRow(row: SerpRow, p: FindQueryParams, allowRetailerPages: boolean): ListingResult | null {
  const url = str(row.link) || str(row.product_link);
  const title = str(row.title);
  if (!url || !title) return null;
  const classified = classifyUrl(url, allowRetailerPages);
  if (!classified) return null;

  const text = `${title} ${str(row.snippet)} ${str(row.price)} ${str(row.condition)}`;
  const priced = typeof row.extracted_price === 'number' && Number.isFinite(row.extracted_price)
    ? { value: row.extracted_price, currency: priceFromText(str(row.price) || text, p.currency).currency }
    : priceFromText(str(row.price) || text, p.currency);
  const condition = str(row.condition)
    ? { label: str(row.condition), tier: conditionFromText(str(row.condition)).tier }
    : conditionFromText(text);

  return {
    id: url,
    title,
    priceValue: priced.value,
    priceCurrency: priced.currency,
    priceDisplay: priced.value != null ? formatMoney(priced.value, priced.currency) : 'Price on the listing',
    condition: condition.label || (classified.tier === 'new' ? 'New' : ''),
    conditionTier: condition.tier !== 'unknown' ? condition.tier : classified.tier === 'new' ? 'new' : 'unknown',
    source: classified.source || str(row.source) || hostOf(url),
    url,
    imageUrl: str(row.thumbnail),
    sellerLocation: '',
    shippingNote: /free (?:delivery|shipping)/i.test(str(row.delivery)) ? 'Free shipping' : str(row.delivery),
    listedAt: null,
    sizeText: sizeFromTitle(title),
    overBudget: false,
    sizeMatch: false,
    score: 0,
  };
}

function ceilingPhrase(p: FindQueryParams): string {
  return p.priceCeiling != null ? `under ${formatMoney(p.priceCeiling, p.currency)}` : '';
}

async function searchPlatform(p: FindQueryParams, allowSecondhand: boolean): Promise<{ listings: ListingResult[]; sources: string[] }> {
  const terms = [p.keywords, p.size ? `size ${p.size}` : ''].filter(Boolean).join(' ');
  const wantUsed = p.condition === 'used' || (p.condition === 'any' && allowSecondhand);
  const wantNew = p.condition !== 'used';
  const sources: string[] = [];

  const jobs: Array<Promise<SerpRow[]>> = [];
  const jobKinds: Array<'shopping' | 'marketplace' | 'retailer'> = [];

  jobs.push(serpSearch(`${terms} ${ceilingPhrase(p)}`.trim(), 'shopping', 15));
  jobKinds.push('shopping');
  sources.push('Google Shopping');

  if (wantUsed) {
    const marketplaceQuery = `${terms} ${p.conditionWord || 'secondhand'} (site:ebay.co.uk OR site:ebay.com OR site:ebay.it OR site:ebay.de OR site:ebay.fr OR site:grailed.com OR site:vinted.co.uk OR site:vestiairecollective.com OR site:depop.com)`;
    jobs.push(serpSearch(marketplaceQuery.trim(), 'web', 15));
    jobKinds.push('marketplace');
    sources.push('eBay \u00b7 Grailed \u00b7 Vinted \u00b7 Vestiaire \u00b7 Depop');
  }

  if (wantNew) {
    const retailerQuery = `${terms} buy (site:endclothing.com OR site:mrporter.com OR site:trunkclothiers.com OR site:huckberry.com OR site:clutchcafe.com OR site:oipolloi.com OR site:farfetch.com)`;
    jobs.push(serpSearch(retailerQuery.trim(), 'web', 12));
    jobKinds.push('retailer');
    sources.push('Quality retailers');
  }

  const settled = await Promise.all(jobs);
  const listings: ListingResult[] = [];
  settled.forEach((rows, i) => {
    const allowRetailerPages = jobKinds[i] !== 'marketplace';
    for (const row of rows) {
      const listing = fromSerpRow(row, p, allowRetailerPages);
      if (listing) listings.push(listing);
    }
  });
  return { listings, sources };
}

// ---------------------------------------------------------------------------
// Ranking — fit to the brief decides the order
// ---------------------------------------------------------------------------

function normalisedTitle(title: string): string {
  return ` ${title.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function sizeSignal(title: string, p: FindQueryParams): 'match' | 'conflict' | 'unknown' {
  if (p.sizeTokens.length === 0) return 'unknown';
  const t = normalisedTitle(title);
  if (p.sizeTokens.some((tok) => t.includes(` ${tok.toLowerCase()} `))) return 'match';
  const numeric = /^\d/.test(p.sizeTokens[0]);
  if (numeric) {
    // Another plausible garment size in the title and none of ours — a real
    // mismatch, not just a title that omits the size.
    if (/\b(2[6-9]|3\d|4\d|5[0-6])\b/.test(t)) return 'conflict';
  } else if (/\b(xxs|xs|small|medium|large|xl|xxl|xxxl)\b/.test(t)) {
    return 'conflict';
  }
  return 'unknown';
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

function rankListings(listings: ListingResult[], p: FindQueryParams): ListingResult[] {
  const ceilingInParamCurrency = p.priceCeiling;
  const brandWords = p.brand ? normaliseWords(p.brand).trim().split(' ') : [];
  const itemWords = normaliseWords(p.itemType).trim().split(' ').filter((w) => w.length > 2);

  const scored = listings.map((listing) => {
    const title = normalisedTitle(listing.title);
    let score = 100;

    // Price against the stated ceiling.
    let overBudget = false;
    if (ceilingInParamCurrency != null && listing.priceValue != null) {
      const inBriefCurrency = convertAmount(listing.priceValue, listing.priceCurrency, p.currency);
      if (inBriefCurrency > ceilingInParamCurrency) {
        overBudget = true;
        score -= 260;
      } else {
        score += Math.round((1 - inBriefCurrency / ceilingInParamCurrency) * 10);
      }
    } else if (listing.priceValue == null) {
      score -= 12;
    }

    // Size.
    const size = sizeSignal(listing.title, p);
    if (size === 'match') score += 40;
    if (size === 'conflict') score -= 18;

    // Condition.
    if (p.condition !== 'any') {
      if (listing.conditionTier === p.condition) score += 26;
      else if (listing.conditionTier !== 'unknown') score -= 45;
    }

    // The right maker and the right piece.
    if (brandWords.length > 0 && brandWords.every((w) => title.includes(w))) score += 22;
    const itemHits = itemWords.filter((w) => title.includes(w)).length;
    if (itemWords.length > 0) score += Math.round((itemHits / itemWords.length) * 16);
    if (p.colours.length > 0 && p.colours.some((c) => title.includes(c))) score += 6;

    // A photograph is most of a listing card.
    if (listing.imageUrl) score += 7;

    // Recency, where the source reports it.
    const age = daysSince(listing.listedAt);
    if (age != null) {
      if (age <= 7) score += 9;
      else if (age <= 30) score += 4;
    }

    return { ...listing, overBudget, sizeMatch: size === 'match', score };
  });

  // Well over the ceiling is excluded outright; a near miss stays, flagged.
  const filtered = scored.filter((l) => {
    if (!l.overBudget || ceilingInParamCurrency == null || l.priceValue == null) return true;
    const inBriefCurrency = convertAmount(l.priceValue, l.priceCurrency, p.currency);
    return inBriefCurrency <= ceilingInParamCurrency * 1.12;
  });

  return filtered.sort((a, b) => b.score - a.score);
}

/** The same item can surface from two sources with different detail — keep one
 * card and let the later sighting fill in whatever the first one lacked. */
function dedupe(listings: ListingResult[]): ListingResult[] {
  const byKey = new Map<string, ListingResult>();
  const order: string[] = [];
  for (const listing of listings) {
    const url = listing.url.split('?')[0].replace(/\/$/, '');
    const itemId = url.match(/\/itm\/(?:.*\/)?(\d{9,})/)?.[1] || '';
    const key = itemId || `${normalisedTitle(listing.title).slice(0, 60)}|${listing.priceValue ?? ''}`;
    const held = byKey.get(key);
    if (!held) {
      byKey.set(key, listing);
      order.push(key);
      continue;
    }
    byKey.set(key, {
      ...held,
      condition: held.condition || listing.condition,
      conditionTier: held.conditionTier !== 'unknown' ? held.conditionTier : listing.conditionTier,
      imageUrl: held.imageUrl || listing.imageUrl,
      priceValue: held.priceValue ?? listing.priceValue,
      priceCurrency: held.priceValue != null ? held.priceCurrency : listing.priceCurrency,
      priceDisplay: held.priceValue != null ? held.priceDisplay : listing.priceDisplay,
      sellerLocation: held.sellerLocation || listing.sellerLocation,
      shippingNote: held.shippingNote || listing.shippingNote,
      listedAt: held.listedAt || listing.listedAt,
      sizeText: held.sizeText || listing.sizeText,
    });
  }
  return order.map((key) => byKey.get(key) as ListingResult);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const MAX_LISTINGS = 12;

/** Beau's one-line read of what came back — written from the numbers, so it
 * never claims more than the sweep actually found. */
function summarise(listings: ListingResult[], p: FindQueryParams): string {
  if (listings.length === 0) return '';
  const priced = listings.filter((l) => l.priceValue != null);
  const cheapest = priced.length > 0
    ? priced.reduce((min, l) => (convertAmount(l.priceValue as number, l.priceCurrency, p.currency) < convertAmount(min.priceValue as number, min.priceCurrency, p.currency) ? l : min))
    : null;
  const inSize = listings.filter((l) => l.sizeMatch).length;
  const bits: string[] = [
    `${listings.length} live listing${listings.length === 1 ? '' : 's'}, ordered by fit to your brief`,
  ];
  if (cheapest) bits.push(`cheapest ${cheapest.priceDisplay} on ${cheapest.source}`);
  if (p.size) {
    bits.push(inSize > 0 ? `${inSize} showing size ${p.size} in the title` : `none state size ${p.size} in the title \u2014 check each listing`);
  }
  return `${bits.join(' \u00b7 ')}. Prices and conditions are the seller's own; every link goes straight to the item.`;
}

function emptyNote(p: FindQueryParams, ebayCredentialsMissing: boolean): string {
  const brief = describeParams(p) || p.raw;
  const parts = [`Nothing on the market right now matching ${brief}.`];
  const relax: string[] = [];
  if (p.size) relax.push(`drop the size ${p.size} filter`);
  if (p.priceCeiling != null) relax.push(`raise the ceiling above ${formatMoney(p.priceCeiling, p.currency)}`);
  if (p.condition === 'used') relax.push('let me look at new pieces too');
  else if (p.condition === 'new') relax.push('let me look at secondhand too');
  if (p.brand) relax.push('open it up beyond one maker');
  if (relax.length > 0) {
    parts.push(`Widen it and I\u2019ll go again \u2014 ${relax.slice(0, 3).join(', ')}.`);
  }
  if (ebayCredentialsMissing) {
    parts.push('I\u2019m sweeping the open market rather than eBay\u2019s own feed just now, so widen the brief before you take my word that nothing exists.');
  }
  return parts.join(' ');
}

/**
 * Run ONE real product search for a structured Find brief. Never throws:
 * every leg fails soft, and an empty result comes back as an honest note plus
 * relaxed versions of the same brief rather than a list of shop homepages.
 */
export async function runListingSearch(
  params: FindQueryParams,
  options: ListingSearchOptions = {},
): Promise<ListingSearchOutcome> {
  const { allowSecondhand = true, onPhase } = options;
  const sourcesTried: string[] = [];
  let ebayCredentialsMissing = false;
  let listings: ListingResult[] = [];

  onPhase?.('Searching eBay for the actual listings\u2026');
  try {
    const ebay = await searchEbay(params);
    ebayCredentialsMissing = ebay.credentialsMissing;
    if (ebay.listings.length > 0) sourcesTried.push('eBay');
    listings = listings.concat(ebay.listings);
  } catch {
    ebayCredentialsMissing = true;
  }

  // The open-market sweep runs whenever eBay came back thin — which includes
  // every run before the eBay credential is stored. “Thin” is judged on what
  // survives the brief, not on the raw count: four marketplaces returning the
  // same two items, one of them over the ceiling, is one usable listing.
  if (rankListings(dedupe(listings), params).length < 6) {
    onPhase?.('Sweeping the marketplaces\u2026');
    try {
      const platform = await searchPlatform(params, allowSecondhand);
      listings = listings.concat(platform.listings);
      for (const s of platform.sources) if (!sourcesTried.includes(s)) sourcesTried.push(s);
    } catch { /* one dead leg never kills the sweep */ }
  }

  const ranked = rankListings(dedupe(listings), params).slice(0, MAX_LISTINGS);

  return {
    params,
    listings: ranked,
    sourcesTried,
    note: ranked.length === 0 ? emptyNote(params, ebayCredentialsMissing) : summarise(ranked, params),
    broaden: ranked.length < 4 ? broadenOptions(params) : [],
    ebayCredentialsMissing,
  };
}
