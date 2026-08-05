/**
 * Ethaion style-profile domain data + persistence helpers (v2).
 *
 * Shared by apps/BeauHome (onboarding + home screen + wardrobe) and
 * apps/YourStyle (editable profile screen). All persistence goes through the
 * auto-injected WorkspaceDB SDK (`window.__workspaceDb`) — per-visitor
 * session scoping is handled by the platform.
 *
 * v2 changes:
 *  - Price is GONE from onboarding. Budgets are now per clothing category
 *    (`category_budgets` table, one row per category) and are edited from the
 *    home screen's filter panel.
 *  - Wardrobe items live in `wardrobe_pieces` (rich metadata: colours,
 *    seasons, occasions, photo). The legacy `wardrobe_items` table is
 *    migrated client-side on first load.
 *  - Every profile save still syncs into `style_rubric` so Beau's chat tools
 *    (get_rubric) see it without re-asking.
 *
 * Beau intelligence overhaul (Layer 1): every insert/update of a wardrobe
 * piece fires a silent background semantic classification (semantic-tags.ts)
 * whose result lands in the piece_semantics companion table. The user's own
 * piece name is NEVER altered by it.
 */
import { retagPiece, tagPieceInBackground } from './semantic-tags';
import { sortByCategoryOrder } from './category-order';
import { recordWarmthInBackground, refreshPieceWarmth } from './warmth-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lifestyle {
  setting?: string;
  travel?: string;
  /** Home city, free text (e.g. "Barcelona") — weights Curated by climate and season. */
  city?: string;
}

export interface StyleProfile {
  id: number;
  intent: string | null;
  archetypes: string[] | null;
  occasions: string[] | null;
  lifestyle: Lifestyle | null;
  height_range: string | null;
  build: string | null;
  fit_notes: string | null;
  skin_tone: string | null;
  materials: string | null;
  /** Legacy single budget from v1 onboarding — no longer collected. */
  budget_range: string | null;
  onboarding_step: number | null;
  onboarding_complete: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface WardrobePiece {
  id: number;
  name: string;
  category: string;
  slot: string | null;
  brand: string | null;
  colors: string[] | null;
  seasons: string[] | null;
  occasions: string[] | null;
  photo_url: string | null;
  created_at?: string;
}

/** Editable companion fields that cannot live on the legacy wardrobe table. */
export interface PieceDetails {
  id: number;
  piece_id: number;
  size: string | null;
  notes: string | null;
}

export interface CareReminder {
  id: number;
  piece_id: number;
  enabled: boolean;
  frequency_days: number;
  reminder_text: string;
  next_due_at: string;
  last_completed_at: string | null;
}

export interface CategoryBudget {
  id: number;
  category: string;
  min_price: number | null;
  max_price: number | null;
}

/** Visitor preferences beyond the core profile (style_prefs table). */
export interface StylePrefs {
  id: number;
  /** Vintage/secondhand openness: 'yes' | 'sometimes' | 'no'. */
  secondhand: string | null;
  /** Preferred display currency code, e.g. 'GBP', 'EUR', 'USD'. */
  currency: string | null;
  /** Optional free-form "anything else Beau should know" context. */
  free_text: string | null;
}

/** Sizing + body measurements (style_measurements table) — captured in the
 * onboarding's optional measurements step and editable from Your Style. */
export interface StyleMeasurements {
  id: number;
  /** Usual clothing size, e.g. 'M' or '40'. */
  clothing_size: string | null;
  /** Clothing sizes in typical brands, e.g. 'Zara M, Uniqlo L'. */
  brand_sizes: string | null;
  /** Shoe size in the chosen system, e.g. '9' or '43'. */
  shoe_size: string | null;
  /** Sizing system for shoe_size: 'UK' | 'EU' | 'US'. */
  shoe_size_system: string | null;
  /** Shoe sizes in typical brands, e.g. 'Adidas UK 9.5, Loake UK 9'. */
  shoe_brand_sizes: string | null;
  chest_cm: string | null;
  waist_cm: string | null;
  hips_cm: string | null;
  inseam_cm: string | null;
  shoulder_cm: string | null;
}

export const SHOE_SIZE_SYSTEMS = ['UK', 'EU', 'US'];

export const CLOTHING_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export interface Option {
  id: string;
  label: string;
  sub?: string;
}

// ---------------------------------------------------------------------------
// Onboarding option sets (price/budget step removed in v2)
// ---------------------------------------------------------------------------

export const INTENT_OPTIONS: Option[] = [
  { id: 'building', label: 'Building a wardrobe from scratch', sub: 'Start with the right foundations, in the right order.' },
  { id: 'adding', label: 'Adding specific pieces to a settled wardrobe', sub: 'You know what you like — you\u2019re hunting particular additions.' },
  { id: 'refining', label: 'Refining and revamping overall', sub: 'Edit what you have, upgrade what earns its place.' },
];

export interface Archetype extends Option {
  detail: string;
}

/** The nine style families (Pass Forty-Four — Formal retired) — each card
 * carries a photorealistic reference photograph of the outfit itself. */
export const ARCHETYPES: Archetype[] = [
  { id: 'ivy', label: 'Classic Ivy', detail: 'Ivy League heritage — OCBDs, chinos, loafers, navy blazers. Timeless, relaxed formality.' },
  { id: 'country', label: 'British Country', detail: 'Tweed, Barbour, brogues, earth tones. Built for the English outdoors — field and village.' },
  { id: 'continental', label: 'Continental', detail: 'Italian and French professional ease. Unstructured tailoring, quality fabrics, understated elegance.' },
  { id: 'sportsman', label: 'American Outdoors', detail: 'Rugged American utility — Filson, canvas, flannel, leather boots. Built for the wild, not the office.' },
  { id: 'workwear', label: 'Workwear', detail: 'Elevated utility — French chore coats, Carhartt, Japanese workwear. Function-first, worn beautifully.' },
  { id: 'relaxed', label: 'Smart Casual', detail: 'The daily register — polished but approachable. Shirt, trousers, clean shoes.' },
  { id: 'military', label: 'Military / Utility', detail: 'Service-inspired structure — field jackets, cargo trousers, combat boots, functional details.' },
  { id: 'nautical', label: 'Coastal / Nautical', detail: 'Breton stripes, deck shoes, navy and white, linen. At home by the sea.' },
  { id: 'riviera', label: 'Mediterranean / Riviera', detail: 'Relaxed linen, warm tones, coastal Italy ease. More Capri than Milan boardroom.' },
];

/** Labels for archetype ids no longer offered but still present in older profiles. */
const LEGACY_ARCHETYPE_LABELS: Record<string, string> = {
  moto: 'Rider / Moto',
  formal: 'Formal',
};

export const OCCASION_OPTIONS: Option[] = [
  { id: 'work', label: 'Work / office' },
  { id: 'smart-casual', label: 'Smart casual' },
  { id: 'travel', label: 'Travel' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'formal-events', label: 'Formal events' },
  { id: 'active', label: 'Active / outdoor' },
];

export const SETTING_OPTIONS: Option[] = [
  { id: 'city', label: 'City', sub: 'Pavement, offices, dinners out' },
  { id: 'town', label: 'Town / Suburban', sub: 'A bit of both worlds' },
  { id: 'countryside', label: 'Countryside', sub: 'Weather, walking, real terrain' },
];

export const TRAVEL_OPTIONS: Option[] = [
  { id: 'rarely', label: 'Rarely travel' },
  { id: 'few-times', label: 'A few trips a year' },
  { id: 'monthly', label: 'Most months' },
  { id: 'constantly', label: 'Constantly on the move' },
];

/** Legacy height BANDS. Nobody is asked to pick a band any more — onboarding
 * and The Dossier both take a SPECIFIC height (see heightRangeFromCm) — but
 * the band is still derived and stored, because Beau's proportion rules and
 * the curation scoring read `profile.height_range`. */
export const HEIGHT_OPTIONS: Option[] = [
  { id: 'under-56', label: 'Under 5\u20326\u2033', sub: 'below 168 cm' },
  { id: '56-59', label: '5\u20326\u2033 \u2013 5\u20329\u2033', sub: '168\u2013175 cm' },
  { id: '510-61', label: '5\u203210\u2033 \u2013 6\u20321\u2033', sub: '178\u2013185 cm' },
  { id: 'over-61', label: 'Over 6\u20321\u2033', sub: 'above 185 cm' },
];

/** The band a specific height falls into — the ONE place the mapping lives. */
export function heightRangeFromCm(cm: number | null | undefined): string | null {
  if (!cm || !isFinite(cm) || cm <= 0) return null;
  if (cm < 168) return 'under-56';
  if (cm < 177) return '56-59';
  if (cm < 186) return '510-61';
  return 'over-61';
}

/** Centimetres → { ft, inch }, rounded to the nearest inch. */
export function cmToFeetInches(cm: number): { ft: number; inch: number } {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
}

export function feetInchesToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + (isFinite(inch) ? inch : 0)) * 2.54);
}

/** A specific height, written the way the user prefers to read it. */
export function formatHeight(cm: number | null | undefined, unit: 'cm' | 'ftin' = 'cm'): string {
  if (!cm || !isFinite(cm) || cm <= 0) return '';
  if (unit === 'ftin') {
    const { ft, inch } = cmToFeetInches(cm);
    return `${ft}\u2032${inch}\u2033`;
  }
  return `${Math.round(cm)} cm`;
}

export const BUILD_OPTIONS: Option[] = [
  { id: 'slim', label: 'Slim', sub: 'Lean frame, narrower shoulders' },
  { id: 'athletic', label: 'Athletic', sub: 'Squarer shoulders, tapered waist' },
  { id: 'regular', label: 'Regular', sub: 'Even, average proportions' },
  { id: 'broad', label: 'Broader', sub: 'Wider shoulders or a solid frame' },
];

/** The avatar system only models three builds — 'regular' rides with
 * 'athletic' there, while the profile keeps the user's own four-way answer. */
export function avatarBodyTypeFor(build: string | null | undefined): 'slim' | 'athletic' | 'broad' | null {
  const id = (build || '').toLowerCase();
  if (id === 'slim') return 'slim';
  if (id === 'broad') return 'broad';
  if (id === 'athletic' || id === 'regular') return 'athletic';
  return null;
}

export interface SkinTone extends Option {
  swatch: string;
  undertone: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: 'fair', label: 'Fair', swatch: '#f3ddc9', undertone: 'cool or pink undertone' },
  { id: 'light', label: 'Light', swatch: '#eccbaa', undertone: 'neutral undertone' },
  { id: 'medium', label: 'Medium', swatch: '#d9a877', undertone: 'warm undertone' },
  { id: 'olive', label: 'Olive', swatch: '#c19a6b', undertone: 'green-gold undertone' },
  { id: 'brown', label: 'Brown', swatch: '#9c6b43', undertone: 'warm brown undertone' },
  { id: 'deep', label: 'Deep', swatch: '#5e3d28', undertone: 'rich, deep undertone' },
];

export const MATERIAL_OPTIONS: Option[] = [
  { id: 'natural-only', label: 'Natural fibres only', sub: 'Cotton, wool, linen, leather — no synthetics.' },
  { id: 'natural-preference', label: 'Strong preference for natural', sub: 'Natural first; synthetics only when truly justified.' },
  { id: 'open', label: 'Open to quality synthetics', sub: 'Judge each piece on its merits.' },
];

// ---------------------------------------------------------------------------
// Vintage & secondhand preference + display currency (style_prefs table)
// ---------------------------------------------------------------------------

export const SECONDHAND_OPTIONS: Option[] = [
  { id: 'yes', label: 'Yes \u2014 happily', sub: 'Great pieces have second lives \u2014 eBay and Vestiaire finds welcome, clearly labelled.' },
  { id: 'sometimes', label: 'Sometimes', sub: 'For the right piece \u2014 shown alongside new, always clearly labelled.' },
  { id: 'no', label: 'No \u2014 new only', sub: 'First-hand pieces only.' },
];

export interface Currency {
  id: string;
  symbol: string;
  label: string;
  /** Approximate units per \u00a31 — display conversion only, not a live rate. */
  perGBP: number;
}

export const CURRENCIES: Currency[] = [
  { id: 'GBP', symbol: '\u00a3', label: 'Pound sterling', perGBP: 1 },
  { id: 'EUR', symbol: '\u20ac', label: 'Euro', perGBP: 1.17 },
  { id: 'USD', symbol: '$', label: 'US dollar', perGBP: 1.27 },
  { id: 'CHF', symbol: 'CHF\u00a0', label: 'Swiss franc', perGBP: 1.12 },
  { id: 'AUD', symbol: 'A$', label: 'Australian dollar', perGBP: 1.93 },
  { id: 'CAD', symbol: 'C$', label: 'Canadian dollar', perGBP: 1.74 },
  { id: 'JPY', symbol: '¥', label: 'Japanese yen', perGBP: 190 },
];

/** The piece-details currency selector options (Pass Forty-Six) — the
 * display label per currency id, in the confirmed order. Selecting one sets
 * the app-wide display currency (style_prefs.currency). */
export const CURRENCY_SELECT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'GBP', label: 'GBP (£)' },
  { id: 'USD', label: 'USD ($)' },
  { id: 'EUR', label: 'EUR (€)' },
  { id: 'CAD', label: 'CAD (CA$)' },
  { id: 'AUD', label: 'AUD (A$)' },
  { id: 'JPY', label: 'JPY (¥)' },
  { id: 'CHF', label: 'CHF (Fr)' },
];

// Module-level active currency so price formatting works anywhere in the app
// without prop-drilling. Set from style_prefs on load/save; components
// re-render via the 'ethaion:prefs' event savePrefs dispatches.
let activeCurrencyId = 'GBP';

export function setActiveCurrency(id?: string | null): void {
  if (id && CURRENCIES.some((c) => c.id === id)) activeCurrencyId = id;
}

export function getCurrency(): Currency {
  return CURRENCIES.find((c) => c.id === activeCurrencyId) || CURRENCIES[0];
}

export function currencySymbol(): string {
  return getCurrency().symbol;
}

/** Convert a GBP catalog price into the active display currency (rounded). */
export function convertFromGBP(gbp: number): number {
  const cur = getCurrency();
  if (cur.id === 'GBP') return gbp;
  return Math.round(gbp * cur.perGBP);
}

export function formatPrice(gbp: number): string {
  return `${currencySymbol()}${convertFromGBP(gbp)}`;
}

// ---------------------------------------------------------------------------
// Context — home city + current season, so Beau reasons like a valet who
// knows where the user lives, not a generic recommendation engine.
// ---------------------------------------------------------------------------

/** Southern-hemisphere city hints — these flip the season calendar. */
const SOUTHERN_CITY_HINTS = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'auckland', 'wellington', 'cape town', 'johannesburg', 'buenos aires', 'santiago', 'sao paulo', 's\u00e3o paulo', 'rio de janeiro', 'lima', 'montevideo'];
/** Warm/Mediterranean-climate hints — loafers, linen, espadrilles rank up. */
const WARM_CITY_HINTS = ['barcelona', 'madrid', 'valencia', 'seville', 'lisbon', 'porto', 'rome', 'naples', 'palermo', 'milan', 'athens', 'marseille', 'nice', 'malaga', 'palma', 'ibiza', 'miami', 'los angeles', 'san diego', 'phoenix', 'austin', 'houston', 'dallas', 'singapore', 'dubai', 'abu dhabi', 'hong kong', 'bangkok', 'tel aviv', 'mexico city', 'brisbane', 'perth'];
/** Cooler-climate hints — knitwear and outerwear gaps rank up. */
const COOL_CITY_HINTS = ['london', 'edinburgh', 'glasgow', 'manchester', 'leeds', 'dublin', 'copenhagen', 'stockholm', 'oslo', 'helsinki', 'amsterdam', 'brussels', 'paris', 'berlin', 'hamburg', 'munich', 'zurich', 'geneva', 'vienna', 'prague', 'warsaw', 'toronto', 'montreal', 'vancouver', 'chicago', 'boston', 'new york', 'seattle', 'reykjavik', 'moscow'];

export function homeCity(profile: Partial<StyleProfile> | null | undefined): string | null {
  const raw = (profile?.lifestyle as Lifestyle | null | undefined)?.city;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Current wearing season ('ss' | 'aw'), hemisphere-aware when a city is known. */
export function currentSeason(city?: string | null): 'ss' | 'aw' {
  const month = new Date().getMonth(); // 0–11
  const northernSummer = month >= 3 && month <= 8; // Apr–Sep
  const southern = city ? SOUTHERN_CITY_HINTS.some((hint) => city.toLowerCase().includes(hint)) : false;
  return (southern ? !northernSummer : northernSummer) ? 'ss' : 'aw';
}

/** Rough climate read for a home city — null when the city is unknown to us. */
export function cityClimate(city?: string | null): 'warm' | 'cool' | null {
  if (!city) return null;
  const q = city.toLowerCase();
  if (WARM_CITY_HINTS.some((hint) => q.includes(hint))) return 'warm';
  if (COOL_CITY_HINTS.some((hint) => q.includes(hint))) return 'cool';
  return null;
}

/** Slots that suit a warm/Mediterranean climate. */
export const WARM_CLIMATE_SLOTS = new Set(['loafers', 'deck-shoes', 'espadrilles', 'polo', 'tee', 'shorts', 'casual-shirt', 'chinos', 'sneakers', 'brimmed-hat']);
/** Slots that suit a cooler climate. */
export const COOL_CLIMATE_SLOTS = new Set(['crewneck', 'cardigan', 'formal-overcoat', 'overcoat', 'waxed-jacket', 'field-jacket', 'casual-rain-jacket', 'structured-trench', 'raincoat', 'scarf', 'gloves', 'beanie', 'thermal', 'long-johns', 'boots']);
/** Slots that carry a professional/business register. */
export const PROFESSIONAL_SLOTS = new Set(['derbies', 'blazer', 'suit', 'high-rise-trousers', 'trousers', 'dress-shirt', 'tie', 'briefcase', 'formal-overcoat', 'structured-trench', 'overcoat']);

function labelOf(options: Option[], id?: string | null): string {
  if (!id) return '';
  return options.find((o) => o.id === id)?.label || id;
}

export const label = {
  intent: (id?: string | null) => labelOf(INTENT_OPTIONS, id),
  archetype: (id?: string | null) => (id && LEGACY_ARCHETYPE_LABELS[id]) || labelOf(ARCHETYPES, id),
  occasion: (id?: string | null) => labelOf(OCCASION_OPTIONS, id),
  setting: (id?: string | null) => labelOf(SETTING_OPTIONS, id),
  travel: (id?: string | null) => labelOf(TRAVEL_OPTIONS, id),
  height: (id?: string | null) => labelOf(HEIGHT_OPTIONS, id),
  build: (id?: string | null) => labelOf(BUILD_OPTIONS, id),
  skinTone: (id?: string | null) => labelOf(SKIN_TONES, id),
  materials: (id?: string | null) => labelOf(MATERIAL_OPTIONS, id),
  secondhand: (id?: string | null) => labelOf(SECONDHAND_OPTIONS, id),
};

// ---------------------------------------------------------------------------
// Wardrobe — v2 categories, canonical slots, seasons, occasions, colours
// ---------------------------------------------------------------------------

export interface WardrobeSlot {
  id: string;
  label: string;
  illo: string;
  keywords: string[];
}

export interface WardrobeCategory {
  id: string;
  label: string;
  /** Slot used as the category's cover illustration. */
  coverIllo: string;
  /** Logged pieces that count as a "full" category — drives the tracker icon's colour fill. */
  fullCount: number;
  slots: WardrobeSlot[];
}

/** Declared here in file-of-record order; WARDROBE_CATEGORIES below hands
 * them out in the app's ONE canonical order (category-order.ts). */
const WARDROBE_CATEGORIES_UNORDERED: WardrobeCategory[] = [
  {
    id: 'tops',
    label: 'Tops',
    coverIllo: 'ocbd',
    fullCount: 5,
    slots: [
      { id: 'ocbd', label: 'Oxford button-down', illo: 'ocbd', keywords: ['ocbd', 'oxford shirt', 'oxford cloth', 'button-down shirt', 'button down shirt', 'oxford'] },
      { id: 'dress-shirt', label: 'Dress shirt', illo: 'dress-shirt', keywords: ['dress shirt', 'poplin shirt', 'poplin', 'twill shirt', 'formal shirt'] },
      { id: 'casual-shirt', label: 'Casual shirt', illo: 'flannel', keywords: ['flannel shirt', 'flannel', 'chambray', 'linen shirt', 'camp collar', 'overshirt', 'work shirt', 'shirt'] },
      { id: 'polo', label: 'Polo', illo: 'polo', keywords: ['piqué cotton polo', 'pique cotton polo', 'piqué polo', 'pique polo', 'polo', 'piqué', 'pique'] },
      { id: 'tee', label: 'T-shirt', illo: 'tee', keywords: ['t-shirt', 'tshirt', 't shirt', 'tee', 'henley'] },
    ],
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    coverIllo: 'chinos',
    fullCount: 4,
    slots: [
      { id: 'chinos', label: 'Chinos', illo: 'chinos', keywords: ['chino', 'chinos', 'khakis', 'khaki pant'] },
      { id: 'jeans', label: 'Jeans', illo: 'jeans', keywords: ['jeans', 'jean', 'denim', 'selvedge'] },
      { id: 'high-rise-trousers', label: 'High-rise tailored trousers', illo: 'trousers', keywords: ['high-rise trouser', 'high rise trouser', 'high-waisted trouser', 'high waisted trouser', 'high-rise pants', 'high rise pants'] },
      { id: 'trousers', label: 'Tailored trousers', illo: 'trousers', keywords: ['trouser', 'trousers', 'slacks', 'wool pant', 'pleated pant', 'flannel trousers'] },
      { id: 'shorts', label: 'Shorts', illo: 'shorts', keywords: ['shorts', 'short'] },
    ],
  },
  {
    id: 'shoes',
    label: 'Shoes',
    coverIllo: 'loafers',
    fullCount: 4,
    slots: [
      { id: 'loafers', label: 'Loafers', illo: 'loafers', keywords: ['loafer', 'loafers', 'penny loafer', 'tassel loafer', 'moccasin'] },
      { id: 'deck-shoes', label: 'Deck shoes', illo: 'deck-shoes', keywords: ['deck shoe', 'deck shoes', 'boat shoe', 'boat shoes', 'topsider', 'top-sider', 'topsiders'] },
      { id: 'derbies', label: 'Derbies / Oxfords', illo: 'derbies', keywords: ['derby', 'derbies', 'brogue', 'oxford shoe', 'oxfords', 'blucher', 'dress shoe'] },
      { id: 'boots', label: 'Boots', illo: 'boots', keywords: ['boot', 'boots', 'chelsea', 'chukka', 'service boot', 'work boot', 'engineer boot'] },
      { id: 'sneakers', label: 'Sneakers', illo: 'sneakers', keywords: ['sneaker', 'sneakers', 'trainer', 'trainers', 'gat', 'tennis shoe', 'plimsoll', 'canvas shoe'] },
      { id: 'espadrilles', label: 'Espadrilles', illo: 'espadrilles', keywords: ['espadrille', 'espadrilles', 'alpargata', 'alpargatas'] },
    ],
  },
  {
    id: 'outerwear',
    label: 'Outerwear',
    coverIllo: 'waxed-jacket',
    fullCount: 3,
    slots: [
      { id: 'field-jacket', label: 'Field jacket', illo: 'field-jacket', keywords: ['field jacket', 'm43', 'm-43', 'm65', 'm-65', 'm-1943', 'fatigue jacket', 'military jacket'] },
      { id: 'waxed-jacket', label: 'Waxed jacket', illo: 'waxed-jacket', keywords: ['waxed jacket', 'waxed cotton', 'barbour', 'bedale', 'beaufort', 'wax jacket'] },
      { id: 'blazer', label: 'Blazer / Sport coat', illo: 'blazer', keywords: ['blazer', 'sport coat', 'sports coat', 'sports jacket', 'sport jacket', 'teba'] },
      { id: 'harrington', label: 'Harrington / Bomber', illo: 'harrington', keywords: ['harrington', 'bomber', 'ma-1', 'blouson'] },
      { id: 'leather-jacket', label: 'Leather jacket', illo: 'leather-jacket', keywords: ['leather jacket', 'cafe racer', 'moto jacket', 'biker jacket', 'trucker jacket'] },
      { id: 'formal-overcoat', label: 'Formal wool overcoat', illo: 'overcoat', keywords: ['formal overcoat', 'wool overcoat', 'single-breasted overcoat', 'single breasted overcoat', 'topcoat'] },
      { id: 'casual-rain-jacket', label: 'Casual rain jacket', illo: 'waxed-jacket', keywords: ['casual rain jacket', 'lightweight waxed jacket', 'rain jacket', 'weather jacket'] },
      { id: 'structured-trench', label: 'Structured trench coat', illo: 'raincoat', keywords: ['structured trench', 'trench coat', 'gabardine trench', 'belted trench'] },
      { id: 'overcoat', label: 'Other overcoat', illo: 'overcoat', keywords: ['overcoat', 'polo coat', 'wool coat', 'peacoat', 'pea coat', 'duffle coat'] },
      { id: 'raincoat', label: 'Other raincoat / Mac', illo: 'raincoat', keywords: ['raincoat', 'rain coat', 'mackintosh', 'mac coat', 'anorak', 'parka'] },
    ],
  },
  {
    id: 'knitwear',
    label: 'Knitwear',
    coverIllo: 'crewneck',
    fullCount: 3,
    slots: [
      { id: 'crewneck', label: 'Crewneck knit', illo: 'crewneck', keywords: ['crewneck', 'crew neck', 'jumper', 'sweater', 'knit', 'merino', 'lambswool', 'shetland', 'cashmere', 'rollneck', 'roll neck', 'turtleneck'] },
      { id: 'cardigan', label: 'Cardigan', illo: 'cardigan', keywords: ['cardigan', 'shawl collar'] },
      { id: 'sweatshirt', label: 'Sweatshirt', illo: 'sweatshirt', keywords: ['sweatshirt', 'hoodie', 'loopwheel'] },
    ],
  },
  {
    id: 'formalwear',
    label: 'Formalwear',
    coverIllo: 'suit',
    fullCount: 2,
    slots: [
      { id: 'suit', label: 'Suit', illo: 'suit', keywords: ['suit', 'two-piece', 'three-piece', 'two piece suit', 'three piece suit', 'suit jacket', 'suit trousers', 'suit pant'] },
      { id: 'dinner-suit', label: 'Dinner suit / Black tie', illo: 'dinner-suit', keywords: ['dinner suit', 'dinner jacket', 'tuxedo', 'black tie', 'tux'] },
      { id: 'tie', label: 'Tie', illo: 'tie', keywords: ['necktie', 'repp tie', 'knit tie', 'silk tie', 'grenadine', 'tie'] },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    coverIllo: 'belt',
    fullCount: 3,
    slots: [
      { id: 'belt', label: 'Belt', illo: 'belt', keywords: ['belt'] },
      { id: 'scarf', label: 'Scarf', illo: 'scarf', keywords: ['scarf'] },
      { id: 'gloves', label: 'Gloves', illo: 'gloves', keywords: ['gloves', 'glove', 'mittens'] },
    ],
  },
  {
    id: 'base-layers',
    label: 'Base layers',
    coverIllo: 'thermal',
    fullCount: 2,
    slots: [
      { id: 'thermal', label: 'Thermal top', illo: 'thermal', keywords: ['thermal', 'waffle henley', 'base layer', 'baselayer', 'merino base'] },
      { id: 'long-johns', label: 'Long johns', illo: 'long-johns', keywords: ['long johns', 'long-johns', 'long underwear', 'thermal leggings'] },
      { id: 'undershirt', label: 'Undershirt', illo: 'tee', keywords: ['undershirt', 'a-shirt', 'vest top'] },
    ],
  },
  {
    id: 'bags',
    label: 'Bags',
    coverIllo: 'bag',
    fullCount: 2,
    slots: [
      { id: 'bag', label: 'Weekender / Holdall', illo: 'bag', keywords: ['weekender', 'holdall', 'duffle', 'duffel', 'luggage', 'suitcase', 'bag'] },
      { id: 'briefcase', label: 'Briefcase / Tote', illo: 'briefcase', keywords: ['briefcase', 'tote', 'satchel', 'messenger bag'] },
      { id: 'backpack', label: 'Backpack', illo: 'backpack', keywords: ['rucksack', 'backpack', 'daypack'] },
    ],
  },
  {
    id: 'hats',
    label: 'Hats / Headwear',
    coverIllo: 'flat-cap',
    fullCount: 2,
    slots: [
      { id: 'flat-cap', label: 'Flat cap', illo: 'flat-cap', keywords: ['flat cap', 'newsboy', 'baseball cap', 'cap', 'hat'] },
      { id: 'beanie', label: 'Beanie / Watch cap', illo: 'beanie', keywords: ['beanie', 'watch cap', 'watchcap'] },
      { id: 'brimmed-hat', label: 'Brimmed hat', illo: 'brimmed-hat', keywords: ['fedora', 'panama', 'trilby', 'bucket hat'] },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    coverIllo: 'generic',
    fullCount: 3,
    slots: [],
  },
];

/**
 * The categories in the canonical menswear order used EVERYWHERE (Ledger,
 * Rail, Coverage Map, World of Menswear): Tops · Knitwear · Outerwear ·
 * Bottoms · Formalwear · Base Layers · Shoes · Accessories · Bags ·
 * Hats/Headwear · Other. Change the order in category-order.ts, never here.
 */
export const WARDROBE_CATEGORIES: WardrobeCategory[] = sortByCategoryOrder(
  WARDROBE_CATEGORIES_UNORDERED,
  (cat) => cat.id,
);

export function categoryLabel(id?: string | null): string {
  return WARDROBE_CATEGORIES.find((c) => c.id === id)?.label || (id || '');
}

export function categoryById(id?: string | null): WardrobeCategory | null {
  return WARDROBE_CATEGORIES.find((c) => c.id === id) || null;
}

export function slotById(slotId?: string | null): WardrobeSlot | null {
  if (!slotId) return null;
  for (const cat of WARDROBE_CATEGORIES) {
    const found = cat.slots.find((s) => s.id === slotId);
    if (found) return found;
  }
  return null;
}

/** Season wearability tags. */
export const SEASON_OPTIONS: Option[] = [
  { id: 'ss', label: 'SS' },
  { id: 'aw', label: 'AW' },
  { id: 'year-round', label: 'Year-round' },
];

/** Occasion tags for wardrobe pieces. */
export const OCCASION_TAGS: Option[] = [
  { id: 'casual', label: 'Casual' },
  { id: 'smart-casual', label: 'Smart-casual' },
  { id: 'business', label: 'Business' },
  { id: 'formal', label: 'Formal' },
];

export function seasonLabel(id: string): string {
  return SEASON_OPTIONS.find((o) => o.id === id)?.label || id;
}

export function occasionTagLabel(id: string): string {
  return OCCASION_TAGS.find((o) => o.id === id)?.label || id;
}

/** Named menswear colours → swatch hex, for the colour-reveal UI. */
export const COLOR_SWATCHES: Record<string, string> = {
  navy: '#1f2a44',
  blue: '#3b6ea5',
  'light blue': '#a8c4de',
  'royal blue': '#2b4c9b',
  indigo: '#3d4a75',
  denim: '#5b6f8e',
  white: '#f7f5ef',
  'off-white': '#f1ede2',
  'off white': '#f1ede2',
  cream: '#efe8d5',
  ecru: '#e9e2cf',
  oatmeal: '#d9d2bd',
  stone: '#cfc8b8',
  linen: '#ece3d0',
  beige: '#d8cbb2',
  sand: '#d6c39a',
  tan: '#c19a6b',
  camel: '#c8a06a',
  khaki: '#a49a6d',
  olive: '#6b7047',
  green: '#4a6b4f',
  'light green': '#a9c5a0',
  sage: '#a3ad91',
  'forest green': '#37503c',
  'bottle green': '#1f4a38',
  brown: '#6d452a',
  'light brown': '#a97d55',
  'dark brown': '#4e311e',
  chocolate: '#43301f',
  burgundy: '#6e2639',
  wine: '#5f2233',
  red: '#a63a3a',
  'tomato red': '#c8442e',
  rust: '#b0592f',
  terracotta: '#c26744',
  orange: '#cf7a3a',
  mustard: '#c99a2e',
  yellow: '#d9b23c',
  pink: '#e8b4c0',
  'light pink': '#f2d4dc',
  'dusty pink': '#d8a7b1',
  'dark pink': '#c96f8a',
  purple: '#6a4d7c',
  lavender: '#b6a8d4',
  grey: '#9aa0a6',
  gray: '#9aa0a6',
  // Dark grey is deliberately distinct from plain grey (Pass Twelve) — it
  // previously fell through the substring match onto grey's own swatch.
  'dark grey': '#575c64',
  'dark gray': '#575c64',
  'light grey': '#c5c8cc',
  charcoal: '#4a4d52',
  black: '#26242b',
};

// Substring fallback checks the LONGEST names first so "light green" never
// falls onto plain green's swatch.
const SWATCH_NAMES_BY_LENGTH = Object.keys(COLOR_SWATCHES).sort((a, b) => b.length - a.length);

export function swatchFor(color: string): string {
  const key = color.toLowerCase().trim();
  if (COLOR_SWATCHES[key]) return COLOR_SWATCHES[key];
  for (const name of SWATCH_NAMES_BY_LENGTH) {
    if (key.includes(name)) return COLOR_SWATCHES[name];
  }
  return '#b3b0a4';
}

/**
 * The structured tap-to-select colour palette (Pass Fourteen) — the ONLY way
 * colours are entered anywhere in the app. Ordered by family; every id is a
 * COLOR_SWATCHES key, displayed via formatColorName. Max 3 per piece.
 */
export const COLOR_OPTIONS: string[] = [
  'white', 'off-white', 'cream', 'ecru', 'stone', 'linen',
  'light grey', 'grey', 'dark grey', 'charcoal', 'black',
  'light blue', 'blue', 'navy', 'royal blue',
  'light pink', 'pink', 'dusty pink', 'dark pink', 'burgundy', 'wine',
  'light green', 'sage', 'olive', 'forest green', 'bottle green',
  'camel', 'tan', 'sand', 'khaki',
  'light brown', 'brown', 'dark brown',
  'orange', 'rust', 'terracotta',
  'yellow', 'mustard',
  'purple', 'lavender',
  'red', 'tomato red',
];

export const MAX_PIECE_COLORS = 3;

/** Map free text (AI output or a legacy value) onto the palette; null when nothing matches. */
export function matchColorOption(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  if (COLOR_OPTIONS.includes(key)) return key;
  if (key === 'gray') return 'grey';
  if (key === 'off white') return 'off-white';
  // Legacy swatch names that aren't palette entries map to their nearest family.
  const legacy: Record<string, string> = { indigo: 'navy', denim: 'blue', oatmeal: 'cream', beige: 'sand', chocolate: 'dark brown', green: 'forest green' };
  if (legacy[key]) return legacy[key];
  for (const opt of [...COLOR_OPTIONS].sort((a, b) => b.length - a.length)) {
    if (key.includes(opt)) return opt;
  }
  return null;
}

/** Structured pattern vocabulary (Pass Fourteen) — separate from colour, tap-to-select only. */
export const PATTERN_OPTIONS: Option[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'striped', label: 'Striped' },
  { id: 'checked', label: 'Checked' },
  { id: 'plaid', label: 'Plaid' },
  { id: 'houndstooth', label: 'Houndstooth' },
  { id: 'herringbone', label: 'Herringbone' },
  { id: 'prince-of-wales', label: 'Prince of Wales check' },
  { id: 'windowpane', label: 'Windowpane' },
  { id: 'gingham', label: 'Gingham' },
  { id: 'floral', label: 'Floral' },
  { id: 'paisley', label: 'Paisley' },
  { id: 'polka-dot', label: 'Polka dot' },
  { id: 'fair-isle', label: 'Fair Isle' },
  { id: 'cable-knit', label: 'Cable knit' },
  { id: 'other', label: 'Other' },
];

export function patternLabel(id?: string | null): string {
  if (!id) return '';
  return PATTERN_OPTIONS.find((o) => o.id === id)?.label || titleCaseName(id.replace(/-/g, ' '));
}

/** Map free text onto the pattern vocabulary; null when nothing matches. */
export function matchPatternOption(raw: string): string | null {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '-');
  if (!key) return null;
  if (PATTERN_OPTIONS.some((o) => o.id === key)) return key;
  const loose = raw.toLowerCase();
  if (/stripe/.test(loose)) return 'striped';
  if (/prince[ -]of[ -]wales|pow check|glen ?(check|plaid)/.test(loose)) return 'prince-of-wales';
  if (/houndstooth|dogtooth/.test(loose)) return 'houndstooth';
  if (/herringbone/.test(loose)) return 'herringbone';
  if (/windowpane/.test(loose)) return 'windowpane';
  if (/gingham/.test(loose)) return 'gingham';
  if (/plaid|tartan/.test(loose)) return 'plaid';
  if (/check/.test(loose)) return 'checked';
  if (/floral|flower/.test(loose)) return 'floral';
  if (/paisley/.test(loose)) return 'paisley';
  if (/polka|dot/.test(loose)) return 'polka-dot';
  if (/fair ?isle/.test(loose)) return 'fair-isle';
  if (/cable/.test(loose)) return 'cable-knit';
  if (/solid|plain/.test(loose)) return 'solid';
  return null;
}

/** The controlled material list (Pass Fourteen) — tap-to-select, no free text. */
export const MATERIAL_CHOICES: string[] = [
  'Cotton', 'Linen', 'Wool', 'Merino Wool', 'Cashmere', 'Silk', 'Denim', 'Tweed', 'Flannel',
  'Velvet', 'Corduroy', 'Leather', 'Suede', 'Nylon', 'Polyester', 'Synthetic Blend', 'Natural Blend', 'Other',
];

/** Map free text (AI output or a legacy value like 'Cotton oxford') onto the controlled material list. */
export function matchMaterialChoice(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  const exact = MATERIAL_CHOICES.find((m) => m.toLowerCase() === key);
  if (exact) return exact;
  if (/merino/.test(key)) return 'Merino Wool';
  if (/cashmere/.test(key)) return 'Cashmere';
  if (/suede/.test(key)) return 'Suede';
  if (/leather|steerhide|calf/.test(key)) return 'Leather';
  if (/denim|selvedge/.test(key)) return 'Denim';
  if (/tweed/.test(key)) return 'Tweed';
  if (/flannel/.test(key)) return 'Flannel';
  if (/velvet/.test(key)) return 'Velvet';
  if (/corduroy|cord\b/.test(key)) return 'Corduroy';
  if (/linen/.test(key)) return 'Linen';
  if (/silk|grenadine/.test(key)) return 'Silk';
  if (/lambswool|shetland|worsted|wool|hopsack/.test(key)) return 'Wool';
  if (/nylon/.test(key)) return 'Nylon';
  if (/polyester/.test(key)) return 'Polyester';
  if (/cotton|oxford|poplin|twill|jersey|piqu|canvas|moleskin|gabardine|sateen|loopback|waffle/.test(key)) return 'Cotton';
  if (/synthetic|acrylic|elastane|spandex/.test(key)) return 'Synthetic Blend';
  if (/blend/.test(key)) return 'Natural Blend';
  return null;
}

/** Pull known colour names out of free text (local fallback parser). */
export function extractColors(text: string): string[] {
  const q = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  const names = Object.keys(COLOR_SWATCHES).sort((a, b) => b.length - a.length);
  let remaining = q;
  for (const name of names) {
    if (remaining.includes(` ${name} `) || remaining.includes(`-${name} `) || remaining.includes(` ${name}-`)) {
      if (name === 'gray' && found.includes('grey')) continue;
      found.push(name === 'gray' ? 'grey' : name);
      remaining = remaining.split(name).join(' ');
    }
  }
  return found;
}

/**
 * Match free text ("m43 field jacket") to a category + canonical slot using
 * longest-keyword-wins so specific phrases beat generic ones.
 */
export function categorizeItem(text: string): { category: string | null; slot: string | null } {
  const q = text.toLowerCase().trim();
  if (!q) return { category: null, slot: null };
  if (/high[ -]?(?:rise|waist(?:ed)?)/.test(q) && /trouser|pant/.test(q) && !/jean|denim/.test(q)) {
    return { category: 'bottoms', slot: 'high-rise-trousers' };
  }

  let best: { category: string; slot: string; len: number } | null = null;
  for (const cat of WARDROBE_CATEGORIES) {
    for (const slot of cat.slots) {
      for (const kw of slot.keywords) {
        if (q.includes(kw) && (!best || kw.length > best.len)) {
          best = { category: cat.id, slot: slot.id, len: kw.length };
        }
      }
    }
  }
  if (best) return { category: best.category, slot: best.slot };

  // Generic fallbacks when no slot keyword hit.
  if (/(shirt|top|blouse)/.test(q)) return { category: 'tops', slot: null };
  if (/(pant|trouser|bottom|jean|chino|short)/.test(q)) return { category: 'bottoms', slot: null };
  if (/(shoe|boot|loafer|sneaker|footwear)/.test(q)) return { category: 'shoes', slot: null };
  if (/(jacket|coat|outerwear|parka)/.test(q)) return { category: 'outerwear', slot: null };
  if (/(knit|sweater|jumper|fleece)/.test(q)) return { category: 'knitwear', slot: null };
  if (/(thermal|long john|base ?layer|undershirt)/.test(q)) return { category: 'base-layers', slot: null };
  if (/(backpack|rucksack|holdall|weekender|luggage|briefcase|tote|bag)/.test(q)) return { category: 'bags', slot: null };
  if (/(beanie|fedora|panama|cap|hat)/.test(q)) return { category: 'hats', slot: null };
  if (/(sock|underwear|boxer|wallet|watch|sunglasses|umbrella)/.test(q)) return { category: 'accessories', slot: null };
  return { category: 'other', slot: null };
}

/** Default season tags per slot (fallback when the AI parser isn't used). */
const SLOT_SEASONS: Record<string, string[]> = {
  shorts: ['ss'], polo: ['ss'], tee: ['year-round'], espadrilles: ['ss'], 'deck-shoes': ['ss'],
  crewneck: ['aw'], cardigan: ['aw'], sweatshirt: ['year-round'],
  // Seasonal logic (v6): AW-specific outerwear is tagged AW, never year-round.
  // An M-43 field jacket, a waxed jacket, an overcoat, a leather jacket — these
  // are autumn/winter pieces. Only true all-season shells stay year-round.
  'formal-overcoat': ['aw'], overcoat: ['aw'], 'waxed-jacket': ['aw'], 'field-jacket': ['aw'],
  'casual-rain-jacket': ['year-round'], 'structured-trench': ['year-round'], raincoat: ['year-round'], harrington: ['ss'], 'leather-jacket': ['aw'],
  scarf: ['aw'], 'flat-cap': ['year-round'], gloves: ['aw'],
  thermal: ['aw'], 'long-johns': ['aw'], undershirt: ['year-round'],
  beanie: ['aw'], 'brimmed-hat': ['ss'],
};

/** Default occasion tags per slot (fallback when the AI parser isn't used). */
const SLOT_OCCASIONS: Record<string, string[]> = {
  ocbd: ['casual', 'smart-casual'], 'dress-shirt': ['business', 'formal'],
  'casual-shirt': ['casual'], polo: ['casual', 'smart-casual'], tee: ['casual'],
  chinos: ['casual', 'smart-casual'], jeans: ['casual'], 'high-rise-trousers': ['smart-casual', 'business'], trousers: ['smart-casual', 'business'], shorts: ['casual'],
  loafers: ['smart-casual', 'business'], 'deck-shoes': ['casual'], derbies: ['smart-casual', 'business'], boots: ['casual', 'smart-casual'], sneakers: ['casual'], espadrilles: ['casual', 'smart-casual'],
  blazer: ['smart-casual', 'business'], 'formal-overcoat': ['smart-casual', 'business', 'formal'], 'casual-rain-jacket': ['casual', 'smart-casual'], 'structured-trench': ['smart-casual', 'business', 'formal'], overcoat: ['smart-casual', 'business'],
  suit: ['business', 'formal'], 'dinner-suit': ['formal'], tie: ['business', 'formal'],
  crewneck: ['casual', 'smart-casual'], cardigan: ['casual', 'smart-casual'], sweatshirt: ['casual'],
};

export function defaultSeasons(slot: string | null): string[] {
  return (slot && SLOT_SEASONS[slot]) || ['year-round'];
}

export function defaultOccasions(slot: string | null): string[] {
  return (slot && SLOT_OCCASIONS[slot]) || ['casual'];
}

// Menswear acronyms / proper nouns for the local capitalisation fallback.
const FORCE_UPPER = new Set(['ocbd', 'ma-1', 'm-43', 'm43', 'm-65', 'm65', 'gat', 'gats']);
const KEEP_LOWER = new Set(['in', 'of', 'and', 'with', 'the', 'a', 'an']);

/** Local title-case fallback: 'light blue ocbd' → 'Light Blue OCBD'. */
export function formatItemName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (FORCE_UPPER.has(lower)) return lower.toUpperCase().replace('M43', 'M-43').replace('M65', 'M-65');
      if (i > 0 && KEEP_LOWER.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Input formatting & brand intelligence (Pass Twelve)
// ---------------------------------------------------------------------------

/** Brands save as ALL CAPS: "Uniqlo", "UNIqlo" and "uniqlo" all become "UNIQLO". */
export function formatBrandName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** ONE casing everywhere for colours & materials: Title Case per word — "navy BLUE" → "Navy Blue", "MERINO wool" → "Merino Wool". */
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join('-'),
    )
    .join(' ');
}

export const formatColorName = titleCaseName;
export const formatMaterialName = titleCaseName;

/** Canonical menswear brand spellings Beau recognises (compared case- and punctuation-insensitively). */
export const KNOWN_BRANDS: string[] = [
  'Uniqlo', 'Grenfell', 'Barbour', 'Belstaff', 'Burberry', 'Aquascutum', 'Mackintosh', 'Lavenham', 'Gloverall',
  'John Partridge', 'Private White V.C.', 'Baracuta', 'Grensons', 'Drake\u2019s', 'Trunk Clothiers', 'Anglo-Italian',
  'Beams Plus', 'Kamakura', 'Levi\u2019s', 'Carhartt', 'Patagonia', 'Sunspel', 'John Smedley', 'William Lockie',
  'Harley of Scotland', 'Jamieson\u2019s', 'Howlin\u2019', 'Le Minor', 'Saint James', 'Armor-Lux', 'Orcival',
  'Lacoste', 'Fred Perry', 'Adidas', 'Nike', 'New Balance', 'Converse', 'Vans', 'Novesta', 'Clarks', 'Loake',
  'Church\u2019s', 'Crockett & Jones', 'Tricker\u2019s', 'Alden', 'Paraboot', 'G.H. Bass', 'Sebago', 'Red Wing',
  'Dr. Martens', 'Birkenstock', 'Meermin', 'TLB Mallorca', 'Carmina', 'Yanko', 'Edward Green', 'John Lobb',
  'Gaziano & Girling', 'R.M. Williams', 'Oliver Spencer', 'Margaret Howell', 'A.P.C.', 'Norse Projects', 'Arket',
  'COS', 'Muji', 'Gap', 'Zara', 'H&M', 'Massimo Dutti', 'Mango', 'Hackett', 'Reiss', 'Paul Smith',
  'Orlebar Brown', 'Eton', 'Turnbull & Asser', 'Emma Willis', 'Charles Tyrwhitt', 'T.M. Lewin', 'Brooks Brothers',
  'J.Crew', 'J.Press', 'L.L. Bean', 'Lands\u2019 End', 'Orvis', 'Pendleton', 'Woolrich', 'Fj\u00e4llr\u00e4ven',
  'Arc\u2019teryx', 'The North Face', 'Moncler', 'Canada Goose', 'Stone Island', 'C.P. Company', 'Schott',
  'Buzz Rickson\u2019s', 'The Real McCoy\u2019s', 'Iron Heart', 'Momotaro', 'Edwin', 'Nudie', 'Our Legacy',
  'Lemaire', 'De Bonne Facture', 'Berg & Berg', 'Informale', 'Spoke', 'Incotex', 'PT Torino', 'orSlow',
  'Kapital', 'Engineered Garments', 'Needles', 'Visvim', 'Kestin', 'Universal Works', 'Folk', 'YMC', 'Albam',
  'Finisterre', 'Percival', 'Wax London', 'Peregrine', 'Gant', 'Tommy Hilfiger', 'Polo Ralph Lauren', 'RRL',
  'Ralph Lauren', 'Todd Snyder', 'Everlane', 'Asket', 'ISTO', 'Portuguese Flannel', 'La Paz', 'Far Afield',
  '3sixteen', 'Tellason', 'Hiut', 'Blackhorse Lane Ateliers', 'Stan Ray', 'Gitman Vintage', 'Luca Faloni',
  'Ring Jacket', 'Suitsupply', 'Spier & Mackay', 'Natalino', 'Rota', 'Bill\u2019s Khakis', 'Begg x Co',
  'Sam Hober', 'Filson', 'Tilley', 'Bates Hatters', 'Lock & Co', 'Christys\u2019', 'Borsalino', 'Stetson',
  'Mr P.', 'Vetra', 'Le Laboureur', 'Danton', 'Bleu de Paname', 'Post Overalls', 'Battenwear', 'Snow Peak',
  'Nanamica', 'Goldwin', 'Montbell', 'Aim\u00e9 Leon Dore', 'Noah', 'Corridor', 'Alex Mill', 'Buck Mason',
  'Taylor Stitch', 'Flint and Tinder', 'Wills', 'Scott Fraser Collection', 'Casatlantic', 'Yarmouth Oilskins',
];

function normalizeBrandKey(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/** Plain Levenshtein distance — small strings only, so the simple DP is fine. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[] = new Array(cols).fill(0).map((_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    let prevDiag = dist[0];
    dist[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const tmp = dist[j];
      dist[j] = Math.min(dist[j] + 1, dist[j - 1] + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = tmp;
    }
  }
  return dist[cols - 1];
}

export interface BrandCheck {
  status: 'known' | 'suggestion' | 'unknown';
  /** Canonical ALL-CAPS spelling — the "Did you mean GRENFELL?" candidate. */
  suggestion?: string;
}

/**
 * Typo intelligence for brand fields (Pass Twelve): an exact match (case- and
 * punctuation-insensitive) is known; a near-miss (edit distance ≤ 2 on names
 * of 5+ characters, ≤ 1 on shorter) surfaces ONE "did you mean" suggestion the
 * user can confirm or reject; anything else is accepted exactly as typed — an
 * unfamiliar brand is never blocked and never silently "corrected".
 */
export function checkBrandSpelling(raw: string): BrandCheck {
  const key = normalizeBrandKey(raw);
  if (key.length < 3) return { status: 'unknown' };
  let best: { brand: string; dist: number } | null = null;
  const maxDist = key.length >= 5 ? 2 : 1;
  for (const brand of KNOWN_BRANDS) {
    const brandKey = normalizeBrandKey(brand);
    if (brandKey === key) return { status: 'known', suggestion: formatBrandName(brand) };
    if (Math.abs(brandKey.length - key.length) > maxDist) continue;
    const dist = editDistance(key, brandKey);
    if (dist <= maxDist && (!best || dist < best.dist)) best = { brand, dist };
  }
  if (best) return { status: 'suggestion', suggestion: formatBrandName(best.brand) };
  return { status: 'unknown' };
}

// ---------------------------------------------------------------------------
// Structured sizes (Pass Twelve) — the user picks a size TYPE, then a value.
// No free-text size entry anywhere; legacy free-text values still display.
// ---------------------------------------------------------------------------

export interface SizeType {
  id: string;
  label: string;
  /** Prepended to the stored value so "EU 42" and "UK 9" read unambiguously. */
  prefix: string;
  values: string[];
}

export const SIZE_TYPES: SizeType[] = [
  { id: 'lettered', label: 'Letter (XXS–XXL)', prefix: '', values: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'eu', label: 'Numeric — EU (44–56)', prefix: 'EU ', values: ['44', '46', '48', '50', '52', '54', '56'] },
  { id: 'numeric', label: 'Numeric — UK/US (28–42)', prefix: '', values: ['28', '30', '32', '34', '36', '38', '40', '42'] },
  { id: 'shoe-eu', label: 'Shoe — EU (38–48)', prefix: 'EU ', values: ['38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'] },
  { id: 'shoe-uk', label: 'Shoe — UK (5–13)', prefix: 'UK ', values: ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'] },
  // Made-to-measure (Pass Fourteen) — available alongside the standard ranges.
  { id: 'made', label: 'Bespoke / Tailored', prefix: '', values: ['Bespoke', 'Tailored'] },
];

export function composeSize(typeId: string, value: string): string {
  const type = SIZE_TYPES.find((s) => s.id === typeId);
  return type && value ? `${type.prefix}${value}` : value;
}

/** Best-effort read of a stored size back into the selector; legacy free text may return null. */
export function parseSize(stored: string | null | undefined): { typeId: string; value: string } | null {
  const raw = (stored || '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'BESPOKE') return { typeId: 'made', value: 'Bespoke' };
  if (raw === 'TAILORED') return { typeId: 'made', value: 'Tailored' };
  const byId = (id: string) => SIZE_TYPES.find((s) => s.id === id) as SizeType;
  const uk = raw.match(/^UK\s*([\d.]+)$/);
  if (uk && byId('shoe-uk').values.includes(uk[1])) return { typeId: 'shoe-uk', value: uk[1] };
  const eu = raw.match(/^EU\s*(\d+)$/);
  if (eu) {
    if (byId('eu').values.includes(eu[1])) return { typeId: 'eu', value: eu[1] };
    if (byId('shoe-eu').values.includes(eu[1])) return { typeId: 'shoe-eu', value: eu[1] };
  }
  if (byId('lettered').values.includes(raw)) return { typeId: 'lettered', value: raw };
  if (byId('numeric').values.includes(raw)) return { typeId: 'numeric', value: raw };
  if (byId('shoe-uk').values.includes(raw)) return { typeId: 'shoe-uk', value: raw };
  return null;
}

// ---------------------------------------------------------------------------
// Machine-generated piece names (Pass Fourteen)
// ---------------------------------------------------------------------------

/** Label for a canonical slot id, searched across every category. */
export function slotLabel(slotId?: string | null): string | null {
  if (!slotId) return null;
  for (const cat of WARDROBE_CATEGORIES) {
    const s = cat.slots.find((x) => x.id === slotId);
    if (s) return s.label;
  }
  return null;
}

/**
 * The machine-generated piece name: [Colour] [Material] [Item Type] — e.g.
 * "Navy Cotton Oxford button-down", "Light Pink Linen Trousers". Primary
 * (first-selected) colour only; the material is skipped when unknown or
 * "Other"; the item type falls back slot label → free-text type → category.
 * Users can override the name — the override is flagged via name_is_custom.
 */
export function generatePieceName(input: {
  colors?: string[] | null;
  material?: string | null;
  slot?: string | null;
  category?: string | null;
  /** Free-text clothing type when no canonical slot matches, e.g. "Field Jacket". */
  itemType?: string | null;
}): string {
  const type = (input.itemType || '').trim() || slotLabel(input.slot) || (input.category ? categoryLabel(input.category) : '');
  const typeLower = type.toLowerCase();
  const colorRaw = ((input.colors || [])[0] || '').trim();
  const color = colorRaw && !typeLower.includes(colorRaw.toLowerCase()) ? formatColorName(colorRaw) : '';
  const materialRaw = (input.material || '').trim();
  const material =
    materialRaw && materialRaw.toLowerCase() !== 'other' && !typeLower.includes(materialRaw.toLowerCase())
      ? formatMaterialName(materialRaw)
      : '';
  return [color, material, type].filter(Boolean).join(' ').trim();
}

/**
 * Enforce the pattern-label rule (Pass Twenty-One): a name may only say
 * "Patterned" when the piece's STRUCTURED pattern field is explicitly set to
 * something other than 'solid' or blank. Otherwise the word is stripped so
 * the label reflects the base garment only ("Button-Down", never
 * "Patterned Button-Down" on a plain shirt).
 */
export function reconcilePatternedName(name: string, pattern?: string | null): string {
  const explicit = (pattern || '').trim().toLowerCase();
  if (explicit && explicit !== 'solid') return name;
  const stripped = name
    .replace(/\bpatterned\b[\s-]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped || name;
}

/** Suggestions for the "Add what you own" input — bulk, no-format examples. */
export const OWN_SUGGESTIONS: string[] = [
  'ocbd blue white pink',
  'barbour bedale navy chinos brown loafers',
  'm43 field jacket grey shetland crewneck',
  'navy hopsack blazer charcoal suit',
  'levis 501 selvedge chelsea boots dark brown',
];

// ---------------------------------------------------------------------------
// Beau-curated feed — real-photo catalog scored against the profile
// ---------------------------------------------------------------------------

export interface CatalogItem {
  id: string;
  brand: string;
  name: string;
  /** Direct official product page (or the live marketplace listing for pre-owned pieces). */
  productUrl?: string;
  /** Legacy display string — the UI renders prices via formatPrice(priceGBP). */
  price?: string;
  priceGBP: number;
  archetypes: string[];
  category: string;
  slot: string;
  colors: string[];
  occasions: string[];
  /** Unsplash search query used to fetch a real product photograph. */
  photoQuery: string;
  natural: boolean;
  materialNote: string;
  shorterFriendly?: boolean;
  /** Present on secondhand/vintage listings (eBay, Vestiaire) — always shown labelled. */
  preowned?: { source: string; kind: 'Secondhand' | 'Vintage' };
}

export const CURATED_CATALOG: CatalogItem[] = [
  { id: 'drakes-ocbd', brand: 'Drake\u2019s', name: 'Cotton Oxford Button-Down', price: '\u00a3175', priceGBP: 175, archetypes: ['ivy', 'relaxed', 'sportsman'], category: 'tops', slot: 'ocbd', colors: ['light blue'], occasions: ['casual', 'smart-casual'], photoQuery: 'oxford button down shirt menswear folded', natural: true, materialNote: 'heavyweight American oxford cloth' },
  { id: 'barbour-bedale', brand: 'Barbour', name: 'Bedale Waxed Jacket', price: '\u00a3249', priceGBP: 249, archetypes: ['country', 'sportsman'], category: 'outerwear', slot: 'waxed-jacket', colors: ['olive'], occasions: ['casual', 'smart-casual'], photoQuery: 'waxed cotton jacket menswear heritage', natural: true, materialNote: '6oz waxed Sylkoil cotton', shorterFriendly: true },
  { id: 'paraboot-michael', brand: 'Paraboot', name: 'Michael Derby', price: '\u00a3390', priceGBP: 390, archetypes: ['country', 'continental', 'ivy'], category: 'shoes', slot: 'derbies', colors: ['dark brown'], occasions: ['smart-casual', 'business'], photoQuery: 'brown leather derby shoes product', natural: true, materialNote: 'Norwegian-welted grained calf' },
  { id: 'colhays-shawl', brand: 'Colhay\u2019s', name: 'Lambswool Shawl Cardigan', price: '\u00a3325', priceGBP: 325, archetypes: ['ivy', 'country'], category: 'knitwear', slot: 'cardigan', colors: ['navy'], occasions: ['casual', 'smart-casual'], photoQuery: 'shawl collar wool cardigan menswear', natural: true, materialNote: 'Scottish-spun lambswool' },
  { id: 'orslow-105', brand: 'orSlow', name: '105 Standard Selvedge Jeans', price: '\u00a3230', priceGBP: 230, archetypes: ['sportsman', 'relaxed', 'moto', 'workwear', 'military'], category: 'bottoms', slot: 'jeans', colors: ['indigo'], occasions: ['casual'], photoQuery: 'selvedge denim jeans folded product', natural: true, materialNote: 'Japanese 13.7oz selvedge denim' },
  { id: 'casatlantic-eljadida', brand: 'Casatlantic', name: 'El Jadida High-Rise Chinos', price: '\u00a3150', priceGBP: 150, archetypes: ['continental', 'ivy', 'relaxed', 'riviera'], category: 'bottoms', slot: 'chinos', colors: ['tan'], occasions: ['casual', 'smart-casual'], photoQuery: 'cotton chino trousers menswear product', natural: true, materialNote: 'Moroccan-made cotton twill', shorterFriendly: true },
  { id: 'velasca-loafers', brand: 'Velasca', name: 'Feree Suede Sports Loafer', price: '\u00a3210', priceGBP: 210, archetypes: ['continental', 'ivy', 'riviera'], category: 'shoes', slot: 'loafers', colors: ['brown'], occasions: ['smart-casual', 'business'], photoQuery: 'suede loafers menswear product', natural: true, materialNote: 'Italian calf suede, handmade in Italy' },
  { id: 'schott-141', brand: 'Schott NYC', name: '141 Caf\u00e9 Racer Jacket', price: '\u00a3720', priceGBP: 720, archetypes: ['moto', 'workwear'], category: 'outerwear', slot: 'leather-jacket', colors: ['black'], occasions: ['casual'], photoQuery: 'black leather cafe racer jacket', natural: true, materialNote: 'steerhide, made in USA' },
  { id: 'sunspel-riviera', brand: 'Sunspel', name: 'Riviera Polo', price: '\u00a3115', priceGBP: 115, archetypes: ['continental', 'formal', 'relaxed', 'riviera', 'nautical'], category: 'tops', slot: 'polo', colors: ['navy'], occasions: ['casual', 'smart-casual'], photoQuery: 'navy cotton polo shirt menswear product', natural: true, materialNote: 'open-weave Riviera cotton' },
  { id: 'jamiesons-shetland', brand: 'Jamieson\u2019s of Shetland', name: 'Shetland Jumper in Eclipse Blue', price: '\u00a3125', priceGBP: 125, archetypes: ['ivy', 'country', 'sportsman'], category: 'knitwear', slot: 'crewneck', colors: ['blue'], occasions: ['casual', 'smart-casual'], photoQuery: 'blue Shetland wool crewneck sweater knitwear', natural: true, materialNote: '100% Shetland wool, knitted in Shetland' },
  { id: 'ladywhite-tee', brand: 'Lady White Co.', name: 'Our T-Shirt \u2014 White (Single)', price: '$70', priceGBP: 52, archetypes: ['relaxed', 'sportsman', 'workwear', 'military', 'nautical'], category: 'tops', slot: 'tee', colors: ['white'], occasions: ['casual'], photoQuery: 'white heavyweight cotton t-shirt product', natural: true, materialNote: 'single US-grown cotton jersey T-shirt, knitted and sewn in Los Angeles' },
  { id: 'crockett-chukka', brand: 'Crockett & Jones', name: 'Chiltern Chukka Boot', price: '\u00a3480', priceGBP: 480, archetypes: ['country', 'ivy', 'formal'], category: 'shoes', slot: 'boots', colors: ['brown'], occasions: ['smart-casual', 'business'], photoQuery: 'suede chukka boots menswear product', natural: true, materialNote: 'rough-out suede, Dainite sole' },
  { id: 'ringjacket-blazer', brand: 'Ring Jacket', name: 'Balloon Wool Hopsack Blazer', price: '\u00a3890', priceGBP: 890, archetypes: ['formal', 'ivy', 'continental'], category: 'outerwear', slot: 'blazer', colors: ['navy'], occasions: ['smart-casual', 'business'], photoQuery: 'navy wool blazer tailoring menswear', natural: true, materialNote: 'unstructured, half-lined hopsack', shorterFriendly: true },
  { id: 'private-white-harrington', brand: 'Private White V.C.', name: 'Ventile Harrington', price: '\u00a3395', priceGBP: 395, archetypes: ['relaxed', 'moto', 'sportsman', 'nautical'], category: 'outerwear', slot: 'harrington', colors: ['stone'], occasions: ['casual', 'smart-casual'], photoQuery: 'harrington jacket menswear product', natural: true, materialNote: 'weatherproof Ventile cotton, made in Manchester', shorterFriendly: true },
  { id: 'suitsupply-havana', brand: 'Suitsupply', name: 'Havana Wool Suit', price: '\u00a3399', priceGBP: 399, archetypes: ['formal', 'continental'], category: 'formalwear', slot: 'suit', colors: ['charcoal'], occasions: ['business', 'formal'], photoQuery: 'tailored wool suit menswear', natural: true, materialNote: 'S110s wool, half-canvassed', shorterFriendly: true },
  { id: 'begg-scarf', brand: 'Begg x Co', name: 'Arran Cashmere Scarf', price: '\u00a3350', priceGBP: 350, archetypes: ['country', 'ivy', 'formal'], category: 'accessories', slot: 'scarf', colors: ['grey'], occasions: ['smart-casual', 'business'], photoQuery: 'grey cashmere scarf menswear product', natural: true, materialNote: 'Scottish-woven pure cashmere, finished with teasels' },

  // --- Density additions (v5): several real choices per category ---
  { id: 'luca-faloni-linen', brand: 'Luca Faloni', name: 'Portofino Linen Shirt', priceGBP: 150, archetypes: ['riviera', 'nautical', 'continental'], category: 'tops', slot: 'casual-shirt', colors: ['white'], occasions: ['casual', 'smart-casual'], photoQuery: 'white linen shirt menswear product', natural: true, materialNote: 'pure Italian linen' },
  { id: 'gitman-flannel', brand: 'Gitman Vintage', name: 'Brushed Flannel Shirt', priceGBP: 160, archetypes: ['sportsman', 'workwear', 'country'], category: 'tops', slot: 'casual-shirt', colors: ['green'], occasions: ['casual'], photoQuery: 'plaid flannel shirt menswear product', natural: true, materialNote: 'US-made brushed cotton flannel' },
  { id: 'smedley-polo', brand: 'John Smedley', name: 'Adrian Sea Island Polo', priceGBP: 165, archetypes: ['continental', 'formal', 'ivy'], category: 'tops', slot: 'polo', colors: ['charcoal'], occasions: ['smart-casual', 'business'], photoQuery: 'knitted polo shirt menswear product', natural: true, materialNote: 'Sea Island cotton, knitted in Derbyshire' },
  { id: 'stanray-fatigue', brand: 'Stan Ray', name: 'OG Loose Fatigue Pant', priceGBP: 85, archetypes: ['military', 'workwear', 'relaxed'], category: 'bottoms', slot: 'trousers', colors: ['olive'], occasions: ['casual'], photoQuery: 'olive fatigue trousers menswear product', natural: true, materialNote: 'ripstop cotton, made in Texas' },
  { id: 'rota-flannel', brand: 'Rota', name: 'Grey Flannel Trousers', priceGBP: 240, archetypes: ['formal', 'continental', 'ivy'], category: 'bottoms', slot: 'trousers', colors: ['grey'], occasions: ['business', 'smart-casual'], photoQuery: 'grey wool flannel trousers menswear', natural: true, materialNote: 'Vitale Barberis flannel, made in Italy', shorterFriendly: true },
  { id: 'novesta-star', brand: 'Novesta', name: 'Star Master Sneaker', priceGBP: 75, archetypes: ['relaxed', 'nautical', 'riviera', 'workwear'], category: 'shoes', slot: 'sneakers', colors: ['white'], occasions: ['casual'], photoQuery: 'white canvas sneakers product', natural: true, materialNote: 'canvas and natural rubber, made in Slovakia' },
  { id: 'rmw-craftsman', brand: 'R.M. Williams', name: 'Comfort Craftsman Boot', priceGBP: 429, archetypes: ['country', 'sportsman', 'relaxed'], category: 'shoes', slot: 'boots', colors: ['dark brown'], occasions: ['smart-casual', 'casual'], photoQuery: 'brown chelsea boots menswear product', natural: true, materialNote: 'wholecut yearling leather, one-piece vamp' },
  // A deck shoe is its own slot (Pass Seven) — it is NOT a loafer substitute:
  // they overlap in casual settings only; a deck shoe cannot anchor smart
  // casual or a suit.
  { id: 'paraboot-barth', brand: 'Paraboot', name: 'Barth Deck Shoe', priceGBP: 250, archetypes: ['nautical', 'riviera', 'ivy'], category: 'shoes', slot: 'deck-shoes', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy boat shoes menswear product', natural: true, materialNote: 'oiled leather, hand-sewn moccasin' },
  { id: 'buzz-m43', brand: 'Buzz Rickson', name: 'M-43 Field Jacket', priceGBP: 395, archetypes: ['military', 'workwear', 'sportsman'], category: 'outerwear', slot: 'field-jacket', colors: ['olive'], occasions: ['casual'], photoQuery: 'olive field jacket menswear product', natural: true, materialNote: 'reproduction-grade back-satin cotton' },
  { id: 'gloverall-duffle', brand: 'Gloverall', name: 'Monty Duffle Coat', priceGBP: 375, archetypes: ['country', 'ivy', 'nautical'], category: 'outerwear', slot: 'overcoat', colors: ['camel'], occasions: ['casual', 'smart-casual'], photoQuery: 'camel duffle coat menswear product', natural: true, materialNote: 'English wool, horn toggles' },
  { id: 'mackintosh-mac', brand: 'Mackintosh', name: 'Bonded Cotton Mac', priceGBP: 595, archetypes: ['formal', 'continental', 'ivy'], category: 'outerwear', slot: 'raincoat', colors: ['stone'], occasions: ['business', 'smart-casual'], photoQuery: 'stone raincoat mac menswear product', natural: true, materialNote: 'hand-bonded cotton, made in Scotland' },
  { id: 'guernsey-tricoteur', brand: 'Le Tricoteur', name: 'Traditional Guernsey', priceGBP: 120, archetypes: ['nautical', 'country', 'sportsman'], category: 'knitwear', slot: 'crewneck', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy guernsey wool sweater knitwear', natural: true, materialNote: 'tight-spun worsted wool, knitted in Guernsey' },
  { id: 'lockie-lambswool', brand: 'William Lockie', name: 'Lambswool Crewneck', priceGBP: 110, archetypes: ['ivy', 'country', 'formal', 'relaxed'], category: 'knitwear', slot: 'crewneck', colors: ['burgundy'], occasions: ['casual', 'smart-casual'], photoQuery: 'burgundy lambswool crewneck sweater', natural: true, materialNote: 'Scottish lambswool, made in Hawick' },
  { id: 'drakes-repp', brand: 'Drake\u2019s', name: 'Repp Stripe Silk Tie', priceGBP: 135, archetypes: ['ivy', 'formal'], category: 'formalwear', slot: 'tie', colors: ['navy'], occasions: ['business', 'formal'], photoQuery: 'repp stripe silk tie menswear', natural: true, materialNote: 'English silk, handmade in London' },
  { id: 'andersons-belt', brand: 'Anderson\u2019s', name: 'Woven Leather Belt in Dark Brown', price: '\u20ac195', priceGBP: 165, archetypes: ['continental', 'riviera', 'ivy', 'relaxed'], category: 'accessories', slot: 'belt', colors: ['dark brown'], occasions: ['casual', 'smart-casual'], photoQuery: 'dark brown woven leather belt menswear product', natural: true, materialNote: '100% woven leather, handmade in Italy' },
  { id: 'filson-duffle', brand: 'Filson', name: 'Small Rugged Twill Duffle', priceGBP: 395, archetypes: ['sportsman', 'country', 'workwear'], category: 'bags', slot: 'bag', colors: ['tan'], occasions: ['casual'], photoQuery: 'tan canvas leather duffle bag product', natural: true, materialNote: '22oz twill and bridle leather, made in USA' },
  { id: 'lock-gill-cap', brand: 'Lock & Co', name: 'Gill Tweed Flat Cap', priceGBP: 85, archetypes: ['country', 'workwear'], category: 'hats', slot: 'flat-cap', colors: ['brown'], occasions: ['casual', 'smart-casual'], photoQuery: 'tweed flat cap menswear product', natural: true, materialNote: 'English tweed, hatters to St James\u2019s since 1676' },

  // --- Secondhand & vintage (surfaced only when his profile allows) ---
  { id: 'ebay-barbour-vintage', brand: 'Barbour', name: 'Vintage Beaufort Waxed Jacket', priceGBP: 95, archetypes: ['country', 'sportsman'], category: 'outerwear', slot: 'waxed-jacket', colors: ['olive'], occasions: ['casual', 'smart-casual'], photoQuery: 'vintage waxed cotton jacket menswear', natural: true, materialNote: 'broken-in wax cotton \u2014 rewaxable for decades', preowned: { source: 'eBay', kind: 'Vintage' }, shorterFriendly: true },
  { id: 'vestiaire-schott', brand: 'Schott NYC', name: 'Perfecto Leather Jacket', priceGBP: 320, archetypes: ['moto', 'workwear'], category: 'outerwear', slot: 'leather-jacket', colors: ['black'], occasions: ['casual'], photoQuery: 'black leather biker jacket vintage', natural: true, materialNote: 'steerhide that only improves with wear', preowned: { source: 'Vestiaire', kind: 'Secondhand' } },
  { id: 'ebay-harris-tweed', brand: 'Harris Tweed', name: 'Vintage Tweed Sport Coat', priceGBP: 75, archetypes: ['country', 'ivy'], category: 'outerwear', slot: 'blazer', colors: ['brown'], occasions: ['smart-casual'], photoQuery: 'brown harris tweed jacket menswear', natural: true, materialNote: 'hand-woven Hebridean wool, decades of life left', preowned: { source: 'eBay', kind: 'Vintage' } },
  { id: 'vestiaire-church-oxfords', brand: 'Church\u2019s', name: 'Consul Calf Oxfords', priceGBP: 180, archetypes: ['formal', 'ivy', 'continental'], category: 'shoes', slot: 'derbies', colors: ['black'], occasions: ['business', 'formal'], photoQuery: 'black leather oxford shoes product', natural: true, materialNote: 'Goodyear-welted \u2014 resoleable for another lifetime', preowned: { source: 'Vestiaire', kind: 'Secondhand' } },
  { id: 'ebay-levis-vintage', brand: 'Levi\u2019s', name: 'Vintage 501s, Made in USA', priceGBP: 85, archetypes: ['sportsman', 'workwear', 'relaxed', 'moto'], category: 'bottoms', slot: 'jeans', colors: ['indigo'], occasions: ['casual'], photoQuery: 'vintage levis 501 jeans product', natural: true, materialNote: 'pre-1990s denim with the fade already earned', preowned: { source: 'eBay', kind: 'Vintage' } },
  { id: 'vestiaire-burberry-trench', brand: 'Burberry', name: 'Black Gabardine Mid-Length Belted Trench Coat', price: '$459', priceGBP: 342, archetypes: ['formal', 'continental'], category: 'outerwear', slot: 'raincoat', colors: ['black'], occasions: ['business', 'smart-casual'], photoQuery: 'black Burberry gabardine belted trench coat menswear product', natural: true, materialNote: 'authenticated pre-owned cotton gabardine trench coat', preowned: { source: 'RETYCHE', kind: 'Secondhand' } },
];

/**
 * Stable destination for every original curated card. Every URL here was
 * verified live (HTTP 200) in the Pass Five link audit — individual eBay
 * listings were removed because auction pages expire and cannot be confirmed
 * active; items without a confirmed URL are never surfaced.
 */
const CURATED_PRODUCT_URLS: Record<string, string> = {
  'drakes-ocbd': 'https://www.drakes.com/products/ice-blue-cotton-oxford-cloth-button-down-shirt-1',
  'barbour-bedale': 'https://www.barbour.com/barbour-classic-bedaler-wax-jacket',
  'paraboot-michael': 'https://www.paraboot.com/en/men/derbies/michael-marche-ii-marron-lisse-cafe-2/',
  'colhays-shawl': 'https://colhays.com/products/superfine-lambswool-shawl-collar-cardigan-in-navy',
  'orslow-105': 'https://www.article-london.com/products/orslow-105-standard-jean-one-wash',
  'casatlantic-eljadida': 'https://www.casatlantic.com/products/el-jadida-cotton-khaki-trousers',
  'velasca-loafers': 'https://row.velasca.com/products/feree-tdms',
  'schott-141': 'https://www.schottnyc.com/products/141-classic-racer-leather-motorcycle-jacket',
  'sunspel-riviera': 'https://www.sunspel.com/products/mens-cotton-riviera-polo-shirt-navy-mpol1026',
  'jamiesons-shetland': 'https://dicks-edinburgh.co.uk/products/jamiesons-crew-neck-shetland-jumper-in-eclipse-blue',
  'ladywhite-tee': 'https://shopcanoeclub.com/products/our-t-shirt-white',
  'crockett-chukka': 'https://us.crockettandjones.com/products/chiltern-darkbrown-suede',
  'ringjacket-blazer': 'https://www.thearmoury.com/products/the-armoury-wool-balloon-model-3-sport-coat',
  'private-white-harrington': 'https://www.privatewhitevc.com/products/the-ventile-harrington-midnight-navy',
  'suitsupply-havana': 'https://suitsupply.com/en-gb/men/suits/dark-grey-tailored-fit-havana-suit/C5505-S.html',
  'begg-scarf': 'https://www.beggxco.com/products/mens-solid-classic-cashmere-scarf-flannel-grey',
  'luca-faloni-linen': 'https://lucafaloni.com/products/white-portofino-linen-shirt',
  'gitman-flannel': 'https://gitmanvintage.com/products/olive-classic-flannel-1',
  'smedley-polo': 'https://www.johnsmedley.com/uk/adrian-polo-shirt',
  'stanray-fatigue': 'https://www.stanray.com/products/og-loose-fatigue-olive-sateen',
  'rota-flannel': 'https://rota-pantaloni.com/products/medium-grey-flannel-trousers',
  'novesta-star': 'https://www.gonovesta.com/en/star-master-10-white',
  'rmw-craftsman': 'https://www.rmwilliams.com/comfort-craftsman-boot-chestnut-yearling-leather.html',
  'paraboot-barth': 'https://www.paraboot.com/en/men/boat-shoes/barth-marine-blanche-navy-2/',
  'buzz-m43': 'https://sonofastag.com/products/buzz-ricksons-m-1943-us-army-field-jacket-olive-drab',
  'gloverall-duffle': 'https://www.gloverall.com/products/mens-original-monty-duffle-coat-camel',
  'mackintosh-mac': 'https://www.mackintosh.com/products/mens-dunkled-rubberised-3-4-length-coat-navy',
  'guernsey-tricoteur': 'https://letricoteur.co/products/navy-blue-traditional-fishermans-guernsey-sweater-jumper',
  'lockie-lambswool': 'https://www.ahume.co.uk/products/william-lockie-rob-2-ply-lambswool-crew-neck-bordeaux',
  'drakes-repp': 'https://www.drakes.com/products/navy-and-white-stripe-repp-silk-tipped-tie',
  'andersons-belt': 'https://www.caineclothiers.com/products/woven-leather-belt-dark-brown',
  'filson-duffle': 'https://www.filson.com/small-rugged-twill-duffle-bag.html',
  'lock-gill-cap': 'https://www.lockhatters.com/products/gill-flat-cap',
  'ebay-levis-vintage': 'https://www.vintagerareusa.com/products/vintage-levis-501-jeans-indigo-1990s-size-w35-l30-made-in-usa',
  'vestiaire-burberry-trench': 'https://www.retyche.com/products/burberry-mens-black-gabardine-mid-length-belted-trench-coat-48-men-us-38-men-l',
};

/**
 * Density expansion: every category that appears in Curated now has at least
 * eight investment-worthy options. Brands are makers with durable product
 * lines; all destinations are first-party product or collection pages.
 */
const CURATED_EXPANSION: CatalogItem[] = [
  { id: 'asket-tee', brand: 'ASKET', name: 'The T-Shirt', productUrl: 'https://www.asket.com/gb/mens/t-shirts/t-shirt-white', priceGBP: 45, archetypes: ['relaxed', 'ivy', 'nautical'], category: 'tops', slot: 'tee', colors: ['white'], occasions: ['casual'], photoQuery: 'white heavyweight cotton t shirt product', natural: true, materialNote: 'midweight organic cotton jersey' },
  { id: 'kamakura-ocbd', brand: 'Kamakura Shirts', name: 'Vintage Ivy Button-Down Oxford', productUrl: 'https://kamakurashirts.com/products/vivy02', priceGBP: 95, archetypes: ['ivy', 'relaxed'], category: 'tops', slot: 'ocbd', colors: ['light blue'], occasions: ['casual', 'smart-casual'], photoQuery: 'light blue oxford button down shirt product', natural: true, materialNote: 'Japanese cotton oxford cloth' },
  { id: 'merz-henley', brand: 'Merz b. Schwanen', name: 'Loopwheeled Henley', productUrl: 'https://www.merzbschwanen.com/products/men-s-loopwheeled-henley-7-2oz-sq-yd-classic-fit-7', priceGBP: 105, archetypes: ['workwear', 'sportsman', 'military'], category: 'tops', slot: 'tee', colors: ['white'], occasions: ['casual'], photoQuery: 'white cotton henley menswear product', natural: true, materialNote: 'loopwheeled organic cotton jersey' },

  { id: 'incotex-chinos', brand: 'Incotex', name: 'Tapered-Fit Summer Satin Trousers', productUrl: 'https://www.slowear.com/en-gb/products/tapered-fit-summer-satin-trousers-dark-blue-11s18890871835', priceGBP: 270, archetypes: ['continental', 'ivy', 'relaxed'], category: 'bottoms', slot: 'chinos', colors: ['navy'], occasions: ['smart-casual', 'business'], photoQuery: 'navy cotton trousers mens product', natural: true, materialNote: 'lightweight summer cotton satin' },
  { id: 'bills-khakis', brand: 'Bill’s Khakis', name: 'Original Twill Classic Fit M2', productUrl: 'https://billskhakis.com/products/original-twill-classic-fit-m2', priceGBP: 135, archetypes: ['ivy', 'sportsman', 'country'], category: 'bottoms', slot: 'chinos', colors: ['khaki'], occasions: ['casual', 'smart-casual'], photoQuery: 'khaki cotton trousers menswear product', natural: true, materialNote: '8.5oz combed cotton twill' },
  { id: 'blackhorse-jeans', brand: 'Blackhorse Lane Ateliers', name: 'E5 Relaxed Tapered Selvedge Jeans', productUrl: 'https://blackhorselane.com/products/e5-relaxed-tapered-jean-14oz-japanese-indigo-selvedge', priceGBP: 275, archetypes: ['workwear', 'sportsman', 'relaxed'], category: 'bottoms', slot: 'jeans', colors: ['indigo'], occasions: ['casual'], photoQuery: 'indigo selvedge jeans folded product', natural: true, materialNote: '14oz Japanese indigo selvedge denim, made in London' },
  { id: 'natalino-high-rise-trousers', brand: 'Natalino', name: 'High-Rise Pleated Wool Trousers', productUrl: 'https://natalino.co/products/single-pleat-trouser-mid-grey-flannel', priceGBP: 185, archetypes: ['ivy', 'continental', 'formal'], category: 'bottoms', slot: 'high-rise-trousers', colors: ['mid-grey'], occasions: ['smart-casual', 'business'], photoQuery: 'grey high rise pleated wool trousers menswear', natural: true, materialNote: 'high-rise single-pleat wool flannel', shorterFriendly: true },
  { id: 'spier-navy-overcoat', brand: 'Spier & Mackay', name: 'Navy Single-Breasted Wool Overcoat', productUrl: 'https://www.spierandmackay.com/product/navy-overcoat-15089-sbo1', priceGBP: 315, archetypes: ['ivy', 'continental', 'formal', 'country'], category: 'outerwear', slot: 'formal-overcoat', colors: ['navy'], occasions: ['business', 'formal', 'smart-casual'], photoQuery: 'navy single breasted knee length wool overcoat menswear', natural: true, materialNote: '85% wool and 15% cashmere, with a breathable Bemberg cupro lining' },
  { id: 'barbour-lightweight-ashby', brand: 'Barbour', name: 'Lightweight Ashby Waxed Rain Jacket', productUrl: 'https://www.barbour.com/gb/lightweight-ashby-waxed-jacket-MWX1377NY51.html', priceGBP: 249, archetypes: ['country', 'ivy', 'sportsman'], category: 'outerwear', slot: 'casual-rain-jacket', colors: ['navy'], occasions: ['casual', 'smart-casual'], photoQuery: 'navy lightweight waxed cotton rain jacket menswear', natural: true, materialNote: 'lightweight 4oz waxed cotton shell with cotton lining' },
  { id: 'mackintosh-blanefield-navy', brand: 'Mackintosh', name: 'Blanefield Navy Gabardine Trench Coat', productUrl: 'https://www.mackintosh.com/en-us/products/mens-blanefield-gabardine-double-breasted-trench-coat-navy', priceGBP: 895, archetypes: ['ivy', 'continental', 'formal', 'country'], category: 'outerwear', slot: 'structured-trench', colors: ['navy'], occasions: ['business', 'formal', 'smart-casual'], photoQuery: 'navy structured cotton gabardine trench coat menswear', natural: true, materialNote: 'water-repellent 100% Supima cotton gabardine' },

  { id: 'alden-986', brand: 'Alden', name: '986 Leisure Handsewn Loafer', productUrl: 'https://www.aldenshop.com/products/986-leisure-handsewn-moccasin-penny-loafer-color-8-shell-cordovan', priceGBP: 720, archetypes: ['ivy', 'formal'], category: 'shoes', slot: 'loafers', colors: ['burgundy'], occasions: ['smart-casual', 'business'], photoQuery: 'burgundy penny loafers product', natural: true, materialNote: 'shell cordovan, Goodyear welted' },
  { id: 'trickers-stow', brand: 'Tricker’s', name: 'Stow Country Boot', productUrl: 'https://trickers.com/products/stow-country-boot-acorn-antique', priceGBP: 565, archetypes: ['country', 'workwear', 'ivy'], category: 'shoes', slot: 'boots', colors: ['tan'], occasions: ['casual', 'smart-casual'], photoQuery: 'tan brogue boots mens product', natural: true, materialNote: 'calf leather, storm-welted in Northampton' },
  { id: 'crown-sneaker', brand: 'Crown Northampton', name: 'Overstone Derby Sneaker', productUrl: 'https://crownnorthampton.com/products/overstone-derby-all-white-calf-leather', priceGBP: 290, archetypes: ['relaxed', 'continental', 'ivy'], category: 'shoes', slot: 'sneakers', colors: ['white'], occasions: ['casual', 'smart-casual'], photoQuery: 'white leather minimalist sneakers product', natural: true, materialNote: 'full-grain calf leather, hand-made in Northampton' },
  { id: 'bass-weejuns', brand: 'G.H. Bass', name: 'Larson Weejuns Loafer', productUrl: 'https://www.ghbass.com/products/mens-larson-weejuns-penny-loafer-wine', priceGBP: 160, archetypes: ['ivy', 'relaxed'], category: 'shoes', slot: 'loafers', colors: ['burgundy'], occasions: ['casual', 'smart-casual'], photoQuery: 'wine leather penny loafers product', natural: true, materialNote: 'hand-sewn polished leather' },
  { id: 'loake-aldwych', brand: 'Loake', name: 'Aldwych Cap Toe Oxford', productUrl: 'https://www.loake.com/products/aldwych-black', priceGBP: 319, archetypes: ['formal', 'ivy', 'continental'], category: 'shoes', slot: 'derbies', colors: ['black'], occasions: ['business', 'formal'], photoQuery: 'black cap toe oxford shoes product', natural: true, materialNote: 'smooth calf, Goodyear-welted in Northamptonshire' },

  { id: 'grenfell-golfer', brand: 'Grenfell', name: 'Golfer Jacket', productUrl: 'https://grenfell.com/products/golfer-grenfell-cloth-navy', priceGBP: 495, archetypes: ['ivy', 'country', 'relaxed'], category: 'outerwear', slot: 'harrington', colors: ['stone'], occasions: ['casual', 'smart-casual'], photoQuery: 'stone cotton harrington jacket menswear product', natural: true, materialNote: 'weather-resistant Grenfell cloth cotton, made in London', shorterFriendly: true },

  { id: 'andersen-sailor', brand: 'Andersen-Andersen', name: 'Sailor Crewneck', productUrl: 'https://andersen-andersen.com/products/sailor-crewneck-navy-blue', priceGBP: 300, archetypes: ['nautical', 'workwear', 'country'], category: 'knitwear', slot: 'crewneck', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy heavy wool sailor sweater', natural: true, materialNote: 'dense pure new wool, knitted in Italy' },
  { id: 'harley-shetland', brand: 'Tom Lane', name: 'Shetland Crew Neck Jumper', productUrl: 'https://www.tomlane.co/shop/shetland-crew-dark-green/', priceGBP: 125, archetypes: ['ivy', 'country'], category: 'knitwear', slot: 'crewneck', colors: ['forest green'], occasions: ['casual', 'smart-casual'], photoQuery: 'green shetland wool sweater product', natural: true, materialNote: 'Scottish Shetland wool, made in Scotland' },
  { id: 'inis-aran', brand: 'Inis Meáin', name: 'Aran Cable Crewneck', productUrl: 'https://inismeain.ie/products/cashmere-aran-sweater', priceGBP: 390, archetypes: ['nautical', 'country'], category: 'knitwear', slot: 'crewneck', colors: ['oatmeal'], occasions: ['casual'], photoQuery: 'oatmeal aran wool sweater product', natural: true, materialNote: 'merino and cashmere, knitted on Inis Meáin' },
  { id: 'rubato-knit', brand: 'Rubato', name: 'Standard Crew Neck in Navy', productUrl: 'https://www.atemporubato.com/products/rubato-standard-crew-neck-in-navy', price: '2,850 SEK', priceGBP: 226, archetypes: ['ivy', 'continental', 'relaxed'], category: 'knitwear', slot: 'crewneck', colors: ['navy'], occasions: ['casual', 'smart-casual'], photoQuery: 'navy lambswool crewneck sweater menswear', natural: true, materialNote: '100% lambswool, knitted in Scotland with a vintage proportion' },
  { id: 'bosie-mogganer', brand: 'Le Tricoteur', name: 'Navy Blue Traditional Guernsey Jumper', productUrl: 'https://letricoteur.co/products/navy-blue-traditional-fishermans-guernsey-sweater-jumper', priceGBP: 180, archetypes: ['nautical', 'country', 'sportsman'], category: 'knitwear', slot: 'crewneck', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy guernsey wool jumper product', natural: true, materialNote: '100% British worsted wool, hand-finished in Guernsey' },

  { id: 'natalino-suit', brand: 'Natalino', name: 'Navy Tropical Wool Sport Jacket', productUrl: 'https://natalino.co/products/sport-jacket-navy-tropical-wool-1', price: '\u00a3412.50', priceGBP: 413, archetypes: ['formal', 'ivy', 'continental'], category: 'outerwear', slot: 'blazer', colors: ['navy'], occasions: ['smart-casual', 'business'], photoQuery: 'navy tropical wool sport jacket product', natural: true, materialNote: '300g two-ply high-twist tropical wool, half-canvassed construction' },
  { id: 'spier-suit', brand: 'Spier & Mackay', name: 'Charcoal Contemporary Suit', productUrl: 'https://www.spierandmackay.com/product/charcoal-ellis-suit-15004-su-el01', priceGBP: 425, archetypes: ['formal', 'ivy'], category: 'formalwear', slot: 'suit', colors: ['charcoal'], occasions: ['business', 'formal'], photoQuery: 'charcoal wool suit menswear product', natural: true, materialNote: 'Super 110s wool, half-canvassed' },
  { id: 'ralph-tux', brand: 'Ralph Lauren Purple Label', name: 'Gregory Hand-Tailored Wool Peak Tuxedo', productUrl: 'https://www.ralphlauren.co.uk/en/gregory-hand-tailored-wool-peak-tuxedo-491565.html', price: '\u00a33,265', priceGBP: 3265, archetypes: ['formal'], category: 'formalwear', slot: 'dinner-suit', colors: ['black'], occasions: ['formal'], photoQuery: 'black Ralph Lauren Purple Label Gregory tuxedo product', natural: true, materialNote: 'wool barathea with silk-faced peak lapels, hand-tailored in Italy' },
  { id: 'hober-grenadine', brand: 'Sam Hober', name: 'Midnight Blue Grenadine Grossa Silk Tie', productUrl: 'https://samhober.com/products/midnight-blue-grenadine-grossa-silk-tie-ggt-8', priceGBP: 120, archetypes: ['formal', 'ivy', 'continental'], category: 'formalwear', slot: 'tie', colors: ['navy'], occasions: ['business', 'formal'], photoQuery: 'navy grenadine silk tie product', natural: true, materialNote: 'handmade grenadine silk' },
  { id: 'charvet-tie', brand: 'Charvet', name: 'Woven Silk Tie', productUrl: 'https://milanstyle.com/products/charvet-8-5cm-silk-jacquard-tie-men-burgundy-mr-porter', priceGBP: 210, archetypes: ['formal', 'continental'], category: 'formalwear', slot: 'tie', colors: ['burgundy'], occasions: ['business', 'formal'], photoQuery: 'burgundy woven silk tie product', natural: true, materialNote: 'woven silk, made in Paris' },
  { id: 'cordings-suit', brand: 'Cordings', name: 'House Check Tweed Jacket', productUrl: 'https://www.cordings.co.uk/house-check-tweed-jacket.html', priceGBP: 535, archetypes: ['country', 'formal'], category: 'outerwear', slot: 'blazer', colors: ['brown'], occasions: ['smart-casual', 'business'], photoQuery: 'brown tweed sport coat menswear product', natural: true, materialNote: 'British wool tweed' },

  { id: 'hestra-gloves', brand: 'Hestra', name: 'Matthew Leather Gloves', productUrl: 'https://www.hestragloves.eu/products/matthew-dark-brown', priceGBP: 105, archetypes: ['country', 'formal', 'continental'], category: 'accessories', slot: 'gloves', colors: ['tan'], occasions: ['smart-casual', 'business'], photoQuery: 'tan leather gloves mens product', natural: true, materialNote: 'hairsheep leather with wool lining' },
  { id: 'fox-umbrella', brand: 'Fox Umbrellas', name: 'Whangee Crook Umbrella', productUrl: 'https://crane-brothers.com/products/whangee-cane-crook-fox-umbrella-navy', priceGBP: 155, archetypes: ['formal', 'country', 'ivy'], category: 'accessories', slot: 'generic', colors: ['navy'], occasions: ['business', 'formal'], photoQuery: 'classic navy umbrella product', natural: true, materialNote: 'hand-finished whangee handle and woven canopy' },
  { id: 'drakes-scarf', brand: 'Drake’s', name: 'Brown Unicorn Print Tubular Silk Tasselled Scarf', productUrl: 'https://www.drakes.com/products/brown-unicorn-print-tubular-silk-tasselled-scarf', price: '\u00a3295', priceGBP: 295, archetypes: ['continental', 'ivy', 'formal'], category: 'accessories', slot: 'scarf', colors: ['brown'], occasions: ['smart-casual'], photoQuery: 'brown unicorn print silk tasselled scarf product', natural: true, materialNote: '100% printed silk with tasselled ends, made in England' },
  { id: 'equus-belt', brand: 'Bowie & Burton', name: 'Bridle Leather Belt', productUrl: 'https://bowieburton.com/products/bridle-belt', price: '$97', priceGBP: 72, archetypes: ['country', 'formal', 'ivy'], category: 'accessories', slot: 'belt', colors: ['brown'], occasions: ['smart-casual', 'business'], photoQuery: 'brown bridle leather belt product', natural: true, materialNote: 'American bridle leather with solid brass buckle, handmade in Texas' },
  { id: 'johnstons-scarf', brand: 'Johnstons of Elgin', name: 'Camel Cashmere Scarf', productUrl: 'https://johnstonsofelgin.com/en-us/products/camel-cashmere-scarf', price: '\u00a3185', priceGBP: 185, archetypes: ['formal', 'country', 'continental'], category: 'accessories', slot: 'scarf', colors: ['camel'], occasions: ['smart-casual', 'business'], photoQuery: 'camel cashmere scarf product', natural: true, materialNote: '100% cashmere, woven and finished in Elgin, Scotland' },
  { id: 'dents-gloves', brand: 'Dents', name: 'Heritage Leather Gloves', productUrl: 'https://www.kjbeckett.com/products/dents-badminton-heritage-cashmere-lined-leather-gloves-bark-brown-097069', priceGBP: 95, archetypes: ['country', 'formal'], category: 'accessories', slot: 'gloves', colors: ['brown'], occasions: ['business', 'smart-casual'], photoQuery: 'brown leather gloves menswear product', natural: true, materialNote: 'handsewn leather with cashmere lining' },

  { id: 'bennett-weekender', brand: 'Bennett Winch', name: 'The Weekender', productUrl: 'https://www.bennettwinch.com/products/weekender-navy', priceGBP: 650, archetypes: ['formal', 'country', 'sportsman'], category: 'bags', slot: 'bag', colors: ['olive'], occasions: ['casual', 'business'], photoQuery: 'olive canvas leather weekender bag product', natural: true, materialNote: 'British cotton canvas and bridle leather' },
  { id: 'swaine-briefcase', brand: 'Swaine', name: 'Original 3.5 Attaché', productUrl: 'https://swaine.london/products/original-3-5-attache', priceGBP: 3330, archetypes: ['formal', 'country'], category: 'bags', slot: 'briefcase', colors: ['dark brown'], occasions: ['business'], photoQuery: 'brown leather attache case luxury product', natural: true, materialNote: 'handmade English bridle leather' },
  { id: 'bleu-backpack', brand: 'Chapman', name: 'Large Border Backpack', productUrl: 'https://chapmanmade.uk/products/large-border-backpack-1', priceGBP: 350, archetypes: ['workwear', 'continental', 'sportsman'], category: 'bags', slot: 'backpack', colors: ['sand'], occasions: ['casual'], photoQuery: 'sand canvas leather backpack product', natural: true, materialNote: 'British bonded cotton canvas and vegetable-tanned leather' },
  { id: 'brady-ariel', brand: 'Brady', name: 'Ariel Trout Large', productUrl: 'https://brady1887.com/en-os/products/ariel-trout-large-1', price: '\u00a3344', priceGBP: 344, archetypes: ['country', 'sportsman', 'workwear'], category: 'bags', slot: 'bag', colors: ['khaki'], occasions: ['casual'], photoQuery: 'khaki Brady Ariel Trout canvas shoulder bag product', natural: true, materialNote: 'triple-layer Drill Drop cotton with leather trim, made in England' },
  { id: 'clegg-tote', brand: 'Frank Clegg', name: 'Signature Working Tote in Smooth Tumbled Leather', productUrl: 'https://frankcleggleatherworks.com/signature-working-tote-777.html', price: '$800', priceGBP: 596, archetypes: ['ivy', 'formal', 'continental'], category: 'bags', slot: 'bag', colors: ['cognac'], occasions: ['business', 'smart-casual'], photoQuery: 'cognac tumbled leather working tote product', natural: true, materialNote: 'smooth tumbled leather, handmade in Massachusetts' },
  { id: 'chapman-holdall', brand: 'Chapman', name: 'The Chapman Weekender', productUrl: 'https://chapmanmade.uk/products/the-chapman-weekender-1', priceGBP: 730, archetypes: ['country', 'sportsman'], category: 'bags', slot: 'bag', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy canvas leather holdall product', natural: true, materialNote: 'British waterproof canvas and leather, made in Cumbria' },
  { id: 'billingham-rucksack', brand: 'Billingham', name: '35 Rucksack', productUrl: 'https://billingham.co.uk/products/35-rucksack', priceGBP: 330, archetypes: ['country', 'sportsman', 'workwear'], category: 'bags', slot: 'backpack', colors: ['olive'], occasions: ['casual'], photoQuery: 'olive canvas leather rucksack product', natural: true, materialNote: 'weatherproof cotton canvas and bridle leather' },

  { id: 'lock-muirfield', brand: 'Lock & Co.', name: 'Muirfield Linen Cap', productUrl: 'https://www.lockhatters.com/products/navy-linen-muirfield-bakerboy-cap', priceGBP: 125, archetypes: ['country', 'ivy', 'riviera'], category: 'hats', slot: 'flat-cap', colors: ['navy'], occasions: ['casual', 'smart-casual'], photoQuery: 'navy linen flat cap product', natural: true, materialNote: 'lightweight linen, made in England' },
  { id: 'stetson-hatteras', brand: 'Stetson', name: 'Hatteras Donegal Tweed Cap', productUrl: 'https://stetson.eu/Hatteras-Donegal-Tweed-Cap-uk.html', priceGBP: 129, archetypes: ['country', 'workwear', 'sportsman'], category: 'hats', slot: 'flat-cap', colors: ['brown'], occasions: ['casual'], photoQuery: 'brown tweed newsboy cap product', natural: true, materialNote: 'Donegal tweed with cotton lining' },
  { id: 'christys-fedora', brand: 'Christys’ London', name: 'Epsom Fur Felt Racing Trilby', productUrl: 'https://christys-hats.com/products/epsom-fur-felt-racing-trilby-hat', priceGBP: 225, archetypes: ['formal', 'country'], category: 'hats', slot: 'brimmed-hat', colors: ['navy'], occasions: ['smart-casual', 'formal'], photoQuery: 'navy felt trilby hat product', natural: true, materialNote: 'fur felt, handmade in England' },
  { id: 'inis-beanie', brand: 'Inis Meáin', name: 'Cashmere Rib Hat & Scarf Set', productUrl: 'https://inismeain.ie/products/cashmere-rib-hat-scarf-set', priceGBP: 205, archetypes: ['nautical', 'country'], category: 'hats', slot: 'beanie', colors: ['navy'], occasions: ['casual'], photoQuery: 'navy ribbed cashmere hat scarf set product', natural: true, materialNote: 'ribbed cashmere knit, made on Inis Meáin' },
  { id: 'filson-cap', brand: 'Filson', name: 'Washed Low-Profile Logger Cap', productUrl: 'https://www.filson.com/products/washed-low-profile-logger-cap-washed-olive', priceGBP: 45, archetypes: ['sportsman', 'workwear'], category: 'hats', slot: 'flat-cap', colors: ['olive'], occasions: ['casual'], photoQuery: 'olive cotton baseball cap product', natural: true, materialNote: 'prewashed cotton twill' },
  { id: 'tilley-hat', brand: 'Tilley', name: 'T3 Classic Hat', productUrl: 'https://uk.tilley.com/products/t3-classic-hat-canada-made', priceGBP: 75, archetypes: ['sportsman', 'nautical'], category: 'hats', slot: 'brimmed-hat', colors: ['khaki'], occasions: ['casual'], photoQuery: 'khaki cotton brim hat product', natural: true, materialNote: 'durable cotton duck canvas, made in Canada' },
  { id: 'bates-fedora', brand: 'Bates Hatters', name: 'Dark Grey Grosvenor Fedora', productUrl: 'https://www.hilditchandkey.co.uk/products/dark-grey-grosvenor-fedora', priceGBP: 169, archetypes: ['formal', 'country', 'continental'], category: 'hats', slot: 'brimmed-hat', colors: ['charcoal'], occasions: ['smart-casual', 'formal'], photoQuery: 'charcoal felt fedora mens product', natural: true, materialNote: 'fur felt, finished in London' },
];

/** Skin-tone guidance: flattering palette + specific, actionable advice. */
export interface ToneGuidance {
  /** Colour names (COLOR_SWATCHES keys) that flatter this tone — shown as chips. */
  palette: string[];
  /** Colours to keep away from the face. */
  avoid: string[];
  /** One specific, actionable line for the Build & Complexion card. */
  line: string;
}

export const TONE_GUIDANCE: Record<string, ToneGuidance> = {
  fair: {
    palette: ['navy', 'burgundy', 'forest green', 'charcoal', 'indigo', 'camel'],
    avoid: ['beige', 'oatmeal', 'yellow'],
    line: 'Cool/pink undertone — mid-to-dark colours give you contrast: navy, burgundy, forest green, charcoal. Keep pale beiges and washed-out yellows away from your face; wear them below the waist instead.',
  },
  light: {
    palette: ['navy', 'olive', 'denim', 'grey', 'burgundy', 'tan'],
    avoid: ['white', 'cream'],
    line: 'Neutral undertone — most mid-tones work: navy, olive, denim blue, grey, burgundy. Stark white near the face can wash you out; ecru or light blue does the same job better.',
  },
  medium: {
    palette: ['olive', 'navy', 'rust', 'camel', 'cream', 'brown'],
    avoid: ['grey', 'black'],
    line: 'Warm undertone — earth tones are your lane: olive, rust, camel, warm browns, plus navy as the anchor. Head-to-toe grey or black reads flat on you; break it with a warm layer.',
  },
  olive: {
    palette: ['cream', 'white', 'navy', 'burgundy', 'camel', 'rust'],
    avoid: ['olive', 'khaki'],
    line: 'Green-gold undertone — high contrast flatters: cream and white shirts, navy and burgundy layers, camel outerwear. Olive-on-olive blends into your skin; keep greens darker (forest) and away from the collar.',
  },
  brown: {
    palette: ['cream', 'white', 'light blue', 'camel', 'rust', 'mustard'],
    avoid: ['dark brown', 'chocolate'],
    line: 'Warm brown undertone — light and warm shades pop: cream, white, light blue, camel, rust, mustard. Very dark browns near the face lose definition; keep the darkest tones for shoes and trousers.',
  },
  deep: {
    palette: ['white', 'cream', 'camel', 'rust', 'light grey', 'light blue'],
    avoid: ['black', 'charcoal'],
    line: 'Rich, deep undertone — light shades give maximum contrast: white, cream, camel, rust, light grey. All-black outfits flatten the effect; use black as one element with a lighter layer against your face.',
  },
};

/** Colours that flatter each skin tone (used in the personalised why). */
/** Neutrals that read correctly against every complexion — they keep the
 * palette filter honest without culling the classic base wardrobe. */
const UNIVERSAL_NEUTRALS = ['navy', 'grey', 'mid-grey', 'light grey', 'charcoal', 'white', 'cream', 'ecru', 'stone', 'indigo', 'denim', 'oatmeal', 'khaki'];

/** True when at least one of the item's colours is palette-appropriate for
 * the skin tone on file (or when no skin tone is on file). */
export function itemFitsTonePalette(item: { colors: string[] }, profile: Partial<StyleProfile>): boolean {
  const palette = profile.skin_tone ? TONE_FRIENDLY_COLORS[profile.skin_tone] : null;
  if (!palette || palette.length === 0) return true;
  const allowed = [...palette, ...UNIVERSAL_NEUTRALS].map((c) => c.toLowerCase());
  return item.colors.some((c) => {
    const lc = c.toLowerCase();
    return allowed.some((p) => lc === p || lc.includes(p) || p.includes(lc));
  });
}

const TONE_FRIENDLY_COLORS: Record<string, string[]> = {
  fair: ['navy', 'olive', 'brown', 'burgundy', 'charcoal', 'indigo', 'camel'],
  light: ['navy', 'olive', 'brown', 'grey', 'denim', 'tan', 'burgundy'],
  medium: ['olive', 'navy', 'cream', 'tan', 'camel', 'brown', 'rust', 'oatmeal', 'stone'],
  olive: ['cream', 'white', 'navy', 'brown', 'burgundy', 'camel', 'rust', 'oatmeal'],
  brown: ['cream', 'white', 'olive', 'camel', 'rust', 'mustard', 'light blue', 'stone'],
  deep: ['white', 'cream', 'camel', 'rust', 'olive', 'light blue', 'light grey'],
};

/**
 * Why this MAKER (Pass Eight): the Ethaion thesis argued per brand — natural
 * materials, construction quality, and a product line stable enough that the
 * same piece will still exist, unchanged, in five years. Only brands with a
 * defensible line get one; anything else falls back to a thesis composed from
 * the item's actual material note.
 */
const BRAND_THESIS: Record<string, string> = {
  'Drake\u2019s': 'Drake\u2019s has made the same oxford cloth and the same ties in London for decades \u2014 the cut barely moves year to year, which is exactly the point.',
  Barbour: 'Barbour\u2019s wax jackets are serviceable for life \u2014 rewaxing and repair are part of the product, and the Bedale has been in the line unchanged since 1980.',
  Paraboot: 'Paraboot still welts its own soles in France \u2014 the Michael and Barth have been in continuous production since the 1940s, resoleable indefinitely.',
  'Colhay\u2019s': 'Colhay\u2019s knits Scottish lambswool in the same Hawick mills the great houses use, without the licensing markup.',
  orSlow: 'orSlow reproduces mid-century workwear on vintage looms \u2014 the 105 is one cut, done properly, unchanged since the brand began.',
  Velasca: 'Velasca sells Italian-made, hand-finished shoes direct from Marche workshops \u2014 construction-first, no seasonal reinvention.',
  Sunspel: 'Sunspel has knitted cotton in the same Long Eaton factory since 1937 \u2014 the Riviera polo is a permanent product, not a season.',
  'Jamieson\u2019s of Shetland': 'Jamieson\u2019s spins and knits actual Shetland wool on Shetland \u2014 provenance you can trace to the island.',
  'Lady White Co.': 'Lady White cuts and sews heavyweight jersey in Los Angeles \u2014 a t-shirt built as a garment, not an undergarment.',
  'Crockett & Jones': 'Crockett & Jones Goodyear-welts everything in Northampton \u2014 shoes made to be resoled for decades, in lasts that never chase trends.',
  'Private White V.C.': 'Private White V.C. owns its Manchester factory outright \u2014 cloth to finished garment under one roof, built to repair.',
  'Begg x Co': 'Begg has woven cashmere in Ayr since 1866 \u2014 finished with dried teasels, a process nobody else bothers with any more.',
  'Luca Faloni': 'Luca Faloni sources Italian linen and cashmere direct from the mills \u2014 a small permanent line, no seasonal churn.',
  'Gitman Vintage': 'Gitman has sewn shirts in the same Pennsylvania factory since 1978 \u2014 the flannels repeat every year because they\u2019re right.',
  'John Smedley': 'John Smedley has knitted fine-gauge cotton and merino in Derbyshire since 1784 \u2014 the oldest continuously operating factory in the trade.',
  'R.M. Williams': 'R.M. Williams builds the Craftsman from one piece of leather with a single back seam \u2014 unchanged since 1932, resoleable in Adelaide.',
  'Buzz Rickson': 'Buzz Rickson reproduces military spec to the thread \u2014 the M-43 is made to the original government pattern, not inspired by it.',
  Gloverall: 'Gloverall made the original duffle from Royal Navy surplus \u2014 the Monty is the reference garment every other duffle copies.',
  Mackintosh: 'Mackintosh still hand-bonds its cotton in Scotland \u2014 the process IS the product, and it has been since 1823.',
  'Le Tricoteur': 'Le Tricoteur knits traditional guernseys on Guernsey \u2014 tight-spun worsted wool to the fisherman\u2019s pattern, built for decades of wear.',
  'William Lockie': 'William Lockie has spun and knitted in Hawick since 1874 \u2014 honest Scottish lambswool at mill prices.',
  'Anderson\u2019s': 'Anderson\u2019s has woven belts in Parma since 1966 \u2014 one product, made properly, supplied to half the good shops in Europe.',
  Filson: 'Filson\u2019s twill and bridle-leather goods carry a lifetime guarantee the company actually honours \u2014 buy once.',
  Alden: 'Alden is the last of the great New England shoemakers \u2014 shell cordovan lasts that have not changed in fifty years.',
  'Tricker\u2019s': 'Tricker\u2019s has built country boots in Northampton since 1829 \u2014 storm-welted, resoleable, and in the line for generations.',
  'G.H. Bass': 'Bass invented the penny loafer in 1936 \u2014 the Weejun is the original article, still hand-sewn.',
  Loake: 'Loake Goodyear-welts in Northamptonshire at the most honest price in welted footwear \u2014 the entry point to shoes that outlive fashion.',
  Natalino: 'Natalino cuts classic tailoring in permanent cloths at direct prices \u2014 the antithesis of the seasonal drop.',
  'Blackhorse Lane Ateliers': 'Blackhorse Lane sews selvedge jeans in London and offers lifetime repairs \u2014 the construction is the warranty.',
  ASKET: 'ASKET runs a permanent collection with full cost and factory traceability \u2014 the same t-shirt, restocked forever, never redesigned.',
  'Kamakura Shirts': 'Kamakura sews Japanese oxford cloth to a spec the Ivy shops of the sixties would recognise \u2014 at half the price of the heritage names.',
  'Merz b. Schwanen': 'Merz b. Schwanen loopwheels its jersey on original 1920s machines \u2014 slow fabric that holds its shape for years.',
  'Andersen-Andersen': 'Andersen-Andersen knits dense sailor wool to a Danish maritime pattern \u2014 five styles, no seasons.',
  'Inis Me\u00e1in': 'Inis Me\u00e1in knits on the Aran island itself \u2014 island patterns in noble yarns, made by the people the tradition belongs to.',
  Rubato: 'Rubato does one thing \u2014 vintage-proportioned Scottish lambswool knits \u2014 and changes nothing between years.',
  Hestra: 'Hestra has made gloves in Sweden for five generations \u2014 the Matthew is a permanent pattern, repairable at the factory.',
  'Johnstons of Elgin': 'Johnstons has woven cashmere in Elgin since 1797 \u2014 fibre to finished scarf in one Scottish mill.',
  'Bennett Winch': 'Bennett Winch builds luggage in England from British canvas and bridle leather \u2014 guaranteed for life, designed once.',
  'Frank Clegg': 'Frank Clegg benchmakes leather goods in Massachusetts \u2014 father-and-sons workshop, briefcases that age into heirlooms.',
  Suitsupply: 'Suitsupply half-canvasses at a price point where everyone else fuses \u2014 the honest entry into real tailoring.',
  'Spier & Mackay': 'Spier & Mackay cuts half-canvassed tailoring in classic blocks at direct prices \u2014 substance where the money matters.',
  'Lock & Co': 'Lock & Co has made hats in St James\u2019s since 1676 \u2014 the oldest shop in London does not chase seasons.',
  'Lock & Co.': 'Lock & Co has made hats in St James\u2019s since 1676 \u2014 the oldest shop in London does not chase seasons.',
  Grenfell: 'Grenfell weaves its namesake cloth and sews in London \u2014 the Golfer has been in the line since the 1930s.',
  'Fox Umbrellas': 'Fox has made umbrellas in England since 1868 \u2014 a frame built to be re-covered, not replaced.',
  Dents: 'Dents has cut leather gloves in England since 1777 \u2014 the patterns are older than most countries\u2019 constitutions.',
  Stetson: 'Stetson\u2019s European line is made by proper hatters in licensed workshops \u2014 tweeds and felts that repeat every winter.',
  Charvet: 'Charvet has made ties in the Place Vend\u00f4me since 1838 \u2014 the reference house for woven silk.',
  'Sam Hober': 'Sam Hober handmakes grenadine ties to order \u2014 one workshop, one obsession, every tie sewn to your length.',
  Cordings: 'Cordings has outfitted the English countryside since 1839 \u2014 its house tweeds are rewoven, not redesigned.',
};

/** The maker argued against the Ethaion thesis — with an item-true fallback. */
function brandThesisLine(item: CatalogItem): string {
  const listed = BRAND_THESIS[item.brand];
  if (listed) return listed;
  return `${item.brand} earns its place on the thesis, not the label: ${item.materialNote}, from a maker whose line is stable enough to repeat \u2014 the piece you buy is the piece they\u2019ll still make in five years.`;
}

/**
 * Stylist-depth reasoning behind the "Why this?" sheet (Pass Eight): each
 * dimension argued separately and auditable — colour for HIS complexion and
 * rail, silhouette for HIS frame and occasions, the maker against the
 * Ethaion thesis, this variant against its nearest alternatives, and why
 * completing this gap matters NOW.
 */
export interface CardReasoning {
  colour: string;
  silhouette: string;
  brand: string;
  variant: string;
  whyNow: string;
}

export interface FeedCard {
  item: CatalogItem;
  /** Expert-inferred wardrobe requirement this item satisfies, when present. */
  gap?: MenswearGap;
  /** Card line + sheet opener: what OWNING this unlocks — occasions, contexts, combinations. */
  unlocks: string;
  /** Why THIS specific item for THIS man — the compact assembled paragraph. */
  why: string;
  /** The structured stylist reasoning behind the "Why this?" sheet. */
  reasoning: CardReasoning;
  /** Present when this card replaced one the user pushed back on in-session. */
  swapNote?: string;
}

export function formatBudget(b: { min_price: number | null; max_price: number | null } | undefined | null): string {
  if (!b || (b.min_price == null && b.max_price == null)) return '';
  const s = currencySymbol();
  if (b.min_price != null && b.max_price != null) return `${s}${b.min_price}\u2013${s}${b.max_price}`;
  if (b.max_price != null) return `up to ${s}${b.max_price}`;
  return `from ${s}${b.min_price}`;
}

// ---------------------------------------------------------------------------
// Outfit-aware gap detection (Pass Seven). The engine reasons from the
// wardrobe's COMBINATIONS outward, never from empty categories. Before any
// recommendation the question is: "Given what this man owns, what is the
// single most consequential missing piece for building complete,
// occasion-appropriate outfits?" That piece leads.
// ---------------------------------------------------------------------------

export interface OutfitContext {
  /** Suits + dinner suits owned. */
  suitCount: number;
  /** Owns formalwear, or pieces tagged formal. */
  hasFormalwear: boolean;
  /** Owns tailoring of any kind — a suit, a blazer, or tailored trousers. */
  hasTailoring: boolean;
  /** Owns a real smart-casual register (2+ business/smart-casual pieces, or blazer/chinos/trousers). */
  hasSmartCasual: boolean;
  /** Owns outdoor/casual anchors — waxed or field jacket, jeans, leather jacket. */
  hasOutdoorCasual: boolean;
  hasDressShoes: boolean;
  hasLoafers: boolean;
  hasBoots: boolean;
  hasSneakers: boolean;
  hasDressShirt: boolean;
  /** Owns ANY outerwear at all (blazers aside) — without it, weather is unserved. */
  hasOuterwear: boolean;
  /** Owns a real weather layer — waxed jacket, raincoat, or overcoat. */
  hasWeatherLayer: boolean;
  /** Owns a blazer — the piece that bridges casual and formal without a full suit. */
  hasBlazer: boolean;
  /** Owns knitwear — the transitional-weather layering register. */
  hasKnitwear: boolean;
}

export function readOutfitContext(pieces: WardrobePiece[]): OutfitContext {
  const ownedSlots = new Set(pieces.map((p) => p.slot).filter(Boolean) as string[]);
  const occCount = (tags: string[]) =>
    pieces.filter((p) => (p.occasions || []).some((o) => tags.includes(o))).length;
  const suitCount = pieces.filter((p) => p.slot === 'suit' || p.slot === 'dinner-suit').length;
  return {
    suitCount,
    hasFormalwear: suitCount > 0 || occCount(['formal']) > 0,
    hasTailoring: suitCount > 0 || ownedSlots.has('blazer') || ownedSlots.has('high-rise-trousers') || ownedSlots.has('trousers'),
    hasSmartCasual:
      occCount(['smart-casual', 'business']) >= 2 ||
      ownedSlots.has('blazer') || ownedSlots.has('chinos') || ownedSlots.has('high-rise-trousers') || ownedSlots.has('trousers'),
    hasOutdoorCasual:
      ['waxed-jacket', 'field-jacket', 'leather-jacket', 'jeans'].some((s) => ownedSlots.has(s)) ||
      occCount(['casual']) >= 3,
    hasDressShoes: ownedSlots.has('derbies'),
    hasLoafers: ownedSlots.has('loafers'),
    hasBoots: ownedSlots.has('boots'),
    hasSneakers: ownedSlots.has('sneakers'),
    hasDressShirt: ownedSlots.has('dress-shirt'),
    hasOuterwear: pieces.some((p) => p.category === 'outerwear' && p.slot !== 'blazer'),
    hasWeatherLayer: ['waxed-jacket', 'casual-rain-jacket', 'structured-trench', 'raincoat', 'formal-overcoat', 'overcoat'].some((s) => ownedSlots.has(s)),
    hasBlazer: ownedSlots.has('blazer'),
    hasKnitwear: pieces.some((p) => p.category === 'knitwear') || ownedSlots.has('crewneck') || ownedSlots.has('cardigan'),
  };
}

/**
 * How consequential this piece is for COMPLETING outfits the wardrobe can
 * already half-make (0–10). Suits with no dress shoes outrank everything; a
 * loafer bridges more registers than a deck shoe ever will; and a deck shoe
 * NEVER inherits a loafer's urgency — they overlap only at the casual end,
 * and a deck shoe cannot anchor smart casual or a suit.
 */
export function outfitGapUrgency(
  item: { slot: string; category: string },
  pieces: WardrobePiece[],
  ctx?: OutfitContext,
): number {
  const c = ctx || readOutfitContext(pieces);
  if (item.category === 'shoes') {
    // Formalwear with nothing correct to wear under it — the most important gap.
    if (item.slot === 'derbies' && c.hasFormalwear && !c.hasDressShoes) return 10;
    // The loafer bridges more registers than any shoe short of an oxford —
    // in a smart-casual wardrobe WITHOUT true formalwear, it leads.
    if (item.slot === 'loafers' && c.hasSmartCasual && !c.hasLoafers) return c.hasDressShoes ? 6 : 7;
    if (item.slot === 'derbies' && c.hasTailoring && !c.hasDressShoes) return 6;
    if (item.slot === 'boots' && c.hasOutdoorCasual && !c.hasBoots) return 5;
    if (item.slot === 'sneakers' && c.hasOutdoorCasual && !c.hasSneakers) return 4;
    if (item.slot === 'deck-shoes') return 1; // summer leisure — never a loafer substitute
    return 0;
  }
  // A suit without a proper coat is incomplete the moment it leaves the room.
  if (item.slot === 'formal-overcoat' && c.hasFormalwear) return 9;
  // A suit with nothing correct under it is still not an outfit.
  if (item.slot === 'dress-shirt' && c.hasFormalwear && !c.hasDressShirt) return 6;
  // High rise is the proportion-correct trouser architecture for a shorter frame.
  if (item.slot === 'high-rise-trousers') return 7;
  // OCCASION coverage, never category coverage (Pass Eight): the question is
  // not "is this category empty?" but "which occasions and weather conditions
  // can this wardrobe not currently dress for?".
  // No blazer → the smart-casual middle is uncovered end to end: nothing
  // bridges casual and formal without going full suit.
  if (item.slot === 'blazer' && !c.hasBlazer) return c.hasTailoring ? 6 : 8;
  // No outerwear at all → no protection from cold or wet weather. The real
  // weather layers (wax, rain, overcoat) lead; lighter jackets follow.
  if (!c.hasOuterwear && item.category === 'outerwear' && item.slot !== 'blazer') {
    return ['waxed-jacket', 'casual-rain-jacket', 'structured-trench', 'raincoat', 'formal-overcoat', 'overcoat'].includes(item.slot) ? 8 : 5;
  }
  if (!c.hasWeatherLayer && ['waxed-jacket', 'casual-rain-jacket', 'structured-trench', 'raincoat', 'formal-overcoat', 'overcoat'].includes(item.slot)) return 5;
  // No knitwear → no layering option for transitional weather; smart-casual
  // warmth unserved from October to April.
  if (!c.hasKnitwear && (item.slot === 'crewneck' || item.slot === 'cardigan')) return 5;
  return 0;
}

// ---------------------------------------------------------------------------
// Occasion-coverage reasoning (Pass Nine). The wardrobe is read as a set of
// OCCASIONS it can or cannot dress for END-TO-END — a full outfit per
// occasion, never a category checklist. Each occasion is a recipe of
// requirement groups; a group is satisfied by ANY owned piece whose slot (or
// name/material, for slotless entries) matches. Curated surfaces ONE
// recommendation per unserved occasion, framed by what owning the piece LETS
// the user DO — never by which category happens to be empty.
// ---------------------------------------------------------------------------

export interface OccasionRequirementGroup {
  id: string;
  /** The missing piece named plainly — used in milestone rows and copy. */
  label: string;
  /** Owning ANY of these slots satisfies the group. */
  slots: string[];
  /** Extra matcher for slotless pieces and materials (linen, waterproof…). */
  nameHint?: RegExp;
  /** Some groups only apply to some wardrobes (knitwear once suits exist). */
  when?: (ctx: OutfitContext) => boolean;
}

export interface OccasionDef {
  id: string;
  label: string;
  /** The occasion in plain words. */
  meaning: string;
  groups: OccasionRequirementGroup[];
  /** Derived occasions are served when any of these occasions is served. */
  servedBy?: string[];
}

/** In consequence order — the most formal, least substitutable occasions first. */
export const OCCASION_COVERAGE: OccasionDef[] = [
  {
    id: 'formal',
    label: 'Formal / black tie',
    meaning: 'A wedding, a funeral, an interview, black tie — dressed end to end, not from the ankles up only.',
    groups: [
      { id: 'formal-suit', label: 'a suit', slots: ['suit', 'dinner-suit'] },
      { id: 'formal-shoe', label: 'a shoe that completes a suit', slots: ['derbies'] },
      { id: 'formal-shirt', label: 'a dress shirt', slots: ['dress-shirt'] },
      { id: 'formal-tie', label: 'a tie or bow tie', slots: ['tie'] },
      { id: 'formal-overcoat', label: 'a knee-length formal wool overcoat', slots: ['formal-overcoat'], nameHint: /single.?breasted.*(?:wool|cashmere).*overcoat|(?:wool|cashmere).*overcoat/i },
    ],
  },
  {
    id: 'business',
    label: 'Business / office',
    meaning: 'Client days and proper offices — tailored trousers or a suit, a correct shoe, a proper shirt.',
    groups: [
      { id: 'business-trousers', label: 'tailored trousers or a suit', slots: ['high-rise-trousers', 'trousers', 'suit'] },
      { id: 'business-shoe', label: 'an Oxford or Derby', slots: ['derbies'] },
      { id: 'business-shirt', label: 'a dress shirt', slots: ['dress-shirt'] },
    ],
  },
  {
    id: 'smart-casual',
    label: 'Smart casual',
    meaning: 'Dinner out, a relaxed meeting, an evening that\u2019s not fully formal but not casual either.',
    groups: [
      { id: 'sc-trousers', label: 'chinos or tailored trousers', slots: ['chinos', 'trousers'] },
      { id: 'sc-shoe', label: 'a loafer or clean sneaker', slots: ['loafers', 'sneakers'] },
      { id: 'sc-top', label: 'an OCBD or knitwear', slots: ['ocbd', 'crewneck', 'cardigan', 'polo'] },
      { id: 'sc-layer', label: 'a smart casual layer — a blazer or sport coat', slots: ['blazer'] },
    ],
  },
  {
    id: 'casual',
    label: 'Casual day',
    meaning: 'The ordinary day done properly — a quality tee or OCBD, real trousers, a clean shoe.',
    groups: [
      { id: 'casual-top', label: 'a quality tee or OCBD', slots: ['tee', 'ocbd', 'casual-shirt', 'polo'] },
      { id: 'casual-bottoms', label: 'chinos or quality denim', slots: ['chinos', 'jeans'] },
      { id: 'casual-shoe', label: 'a clean sneaker or loafer', slots: ['sneakers', 'loafers'] },
    ],
  },
  {
    id: 'rainy',
    label: 'Rainy / inclement weather',
    meaning: 'Caught in real rain with something appropriate to wear — not a ruined suit jacket.',
    groups: [
      {
        id: 'rain-shell',
        label: 'waterproof outerwear — a wax jacket, trench, or raincoat',
        slots: ['waxed-jacket', 'casual-rain-jacket', 'structured-trench', 'raincoat'],
        nameHint: /\bwax(?:ed)?\b|rain\s?coat|trench|mackintosh|\bmac\b|anorak|waterproof/i,
      },
      {
        id: 'rain-footwear',
        label: 'weatherproof footwear',
        slots: ['boots'],
        nameHint: /wellington|galosh|weatherproof|storm.?welt/i,
      },
    ],
  },
  {
    id: 'cold',
    label: 'Cold weather / layering',
    meaning: 'Warmth built in layers — knitwear, an overcoat, or heavy outerwear.',
    groups: [
      {
        id: 'cold-layer',
        label: 'knitwear, an overcoat, or heavy outerwear',
        slots: ['crewneck', 'cardigan', 'formal-overcoat', 'overcoat', 'waxed-jacket', 'field-jacket', 'leather-jacket'],
        nameHint: /jumper|sweater|overcoat|parka|puffer|down jacket|duffle|fleece/i,
      },
      {
        id: 'cold-knit-under-tailoring',
        label: 'knitwear to layer under tailoring',
        slots: ['crewneck', 'cardigan'],
        nameHint: /jumper|sweater|knit/i,
        when: (ctx) => ctx.suitCount > 0,
      },
    ],
  },
  {
    id: 'warm',
    label: 'Mediterranean / warm weather',
    meaning: 'Real heat dressed deliberately — linen, lightweight cotton, or shorts, with the right shoe.',
    groups: [
      {
        id: 'warm-garment',
        label: 'linen, lightweight cotton, or shorts',
        slots: ['shorts', 'polo', 'espadrilles'],
        nameHint: /linen|seersucker|madras|lightweight cotton/i,
      },
      { id: 'warm-footwear', label: 'loafers or espadrilles', slots: ['loafers', 'espadrilles'] },
    ],
  },
  {
    id: 'evening',
    label: 'Evening out / dinner',
    meaning: 'Smart casual or above — an evening look that isn\u2019t borrowed from the weekend.',
    groups: [],
    servedBy: ['smart-casual', 'business', 'formal'],
  },
  {
    id: 'weekend',
    label: 'Weekend / active casual',
    meaning: 'The off-duty days — comfortable, casual, still deliberate.',
    groups: [
      { id: 'weekend-top', label: 'a casual top', slots: ['tee', 'sweatshirt', 'polo', 'casual-shirt', 'ocbd'] },
      { id: 'weekend-bottoms', label: 'comfortable bottoms', slots: ['jeans', 'chinos', 'shorts'] },
      { id: 'weekend-shoe', label: 'casual footwear', slots: ['sneakers', 'boots'] },
    ],
  },
];

export interface OccasionAssessment {
  id: string;
  label: string;
  meaning: string;
  served: boolean;
  /** Derived occasions (evening) inherit coverage — never a direct card target. */
  derived: boolean;
  /** Requirement groups the current wardrobe cannot satisfy. */
  missing: OccasionRequirementGroup[];
  metCount: number;
  totalCount: number;
}

function pieceMatchesRequirement(piece: WardrobePiece, group: OccasionRequirementGroup): boolean {
  if (piece.slot && group.slots.includes(piece.slot)) return true;
  if (group.nameHint && group.nameHint.test(piece.name || '')) return true;
  return false;
}

/**
 * Steps 1–3 of the occasion engine: read every logged piece (tracker and The
 * Rail are the same data), map the wardrobe onto every occasion, and flag the
 * ones a full outfit cannot yet be built for. The inference is derived from
 * wardrobe state alone — the user never names the missing piece (two suits +
 * no formal shoe → formal unserved, even though the top half is covered).
 */
export function assessOccasionCoverage(pieces: WardrobePiece[]): OccasionAssessment[] {
  const ctx = readOutfitContext(pieces);
  const byId = new Map<string, OccasionAssessment>();
  const out: OccasionAssessment[] = [];
  for (const def of OCCASION_COVERAGE) {
    if (def.servedBy && def.servedBy.length > 0) {
      const routes = def.servedBy.map((id) => byId.get(id)).filter(Boolean) as OccasionAssessment[];
      const served = routes.some((r) => r.served);
      const easiest = routes.slice().sort((a, b) => a.missing.length - b.missing.length)[0];
      const assessment: OccasionAssessment = {
        id: def.id,
        label: def.label,
        meaning: def.meaning,
        served,
        derived: true,
        missing: served || !easiest ? [] : easiest.missing,
        metCount: served ? 1 : 0,
        totalCount: 1,
      };
      byId.set(def.id, assessment);
      out.push(assessment);
      continue;
    }
    const required = def.groups.filter((g) => !g.when || g.when(ctx));
    const missing = required.filter((g) => !pieces.some((p) => pieceMatchesRequirement(p, g)));
    const assessment: OccasionAssessment = {
      id: def.id,
      label: def.label,
      meaning: def.meaning,
      served: missing.length === 0,
      derived: false,
      missing,
      metCount: required.length - missing.length,
      totalCount: required.length,
    };
    byId.set(def.id, assessment);
    out.push(assessment);
  }
  return out;
}

/**
 * The first unserved occasion (in consequence order) whose open requirement
 * this item would genuinely fill — how Curated maps a candidate piece onto
 * the occasion gaps. Derived occasions never claim a card (their coverage
 * flows from the primary occasions).
 */
export function itemFillsOccasionGap(
  item: { slot: string; name?: string; materialNote?: string },
  assessments: OccasionAssessment[],
): { occasion: OccasionAssessment; group: OccasionRequirementGroup } | null {
  for (const occasion of assessments) {
    if (occasion.served || occasion.derived) continue;
    const group = occasion.missing.find(
      (g) =>
        g.slots.includes(item.slot) ||
        (!!g.nameHint && (g.nameHint.test(item.name || '') || g.nameHint.test(item.materialNote || ''))),
    );
    if (group) return { occasion, group };
  }
  return null;
}

/** Small-number words for natural copy ("two suits", never "2 suits"). */
function countWord(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n);
}

/**
 * What OWNING each piece unlocks (Pass Seven): the occasions, contexts and
 * outfit combinations the wardrobe currently can't make — a picture, not a
 * label. Never "Fills your X gap", never "Next step:", never a sentence that
 * just restates what the item is.
 */
const SLOT_UNLOCKS: Record<string, string> = {
  ocbd: 'Open-collared at the weekend, tucked under a blazer for the office, sleeves rolled at dinner — one shirt that carries three registers without changing anything else you\u2019re wearing.',
  'dress-shirt': 'Crisp poplin under tailoring opens the smart end properly — interviews, weddings, real dinners — the rooms where an oxford cloth shirt reads a half-step too relaxed.',
  'casual-shirt': 'The layer between a tee and a jumper: over a tee in spring, under a jacket in autumn, alone on holiday — texture that makes plain trousers look considered.',
  polo: 'Warm evenings, smart-casual invitations, travel — a knitted polo goes where a tee is too little and a shirt too much, and it sits cleanly under a blazer.',
  tee: 'The base of every off-duty outfit you\u2019ll build — under an overshirt, under knitwear, alone with good trousers. The weight is what keeps it from reading as underwear.',
  chinos: 'The trouser that talks to everything: sneakers at the weekend, loafers at dinner, a blazer when it counts. Most of the outfits you can\u2019t currently make start here.',
  jeans: 'One dark, straight selvedge jean covers evenings and weekends alike — smart enough for dinner under a knit, honest enough for the pub, better with every year of wear.',
  'high-rise-trousers': 'High-rise wool trousers are the right call for a shorter frame — they lengthen the leg and restore a clean jacket-to-trouser proportion. Mid-grey covers smart casual and business without adding winter-only redundancy in Barcelona.',
  trousers: 'Tailored trousers reach the register jeans can\u2019t — client meetings, good restaurants, anywhere \u201csmart casual\u201d is written down — without calling for a full suit.',
  shorts: 'Real heat, holidays, terraces — a tailored short with a shorter inseam keeps the outfit deliberate when trousers stop being an option.',
  sneakers: 'A clean, minimal sneaker carries chinos, jeans and shorts through the casual week — the pair every off-duty outfit borrows.',
  espadrilles: 'Beach dinners, hot pavements, holiday evenings — the shoe for when even a deck shoe feels like too much structure.',
  'field-jacket': 'Weekends, travel, dog-walk weather — a field jacket over a knit and jeans is a complete casual outfit, with pockets for everything.',
  'waxed-jacket': 'Proper rain, country weekends, the wet commute — waxed cotton is the outdoor layer that still looks right at the pub afterwards, and it improves with abuse.',
  blazer: 'A soft, unstructured blazer turns the shirts and trousers you already own into dinner, meeting and event outfits — the single biggest jump in range per purchase.',
  harrington: 'Mild evenings and smart-casual weekends — a harrington over a polo or an oxford shirt finishes the outfit without adding warmth you don\u2019t need.',
  'leather-jacket': 'Evening outfits with an edge: over a tee in summer, over a knit in autumn — the jacket that makes plain clothes look intentional for a decade.',
  'formal-overcoat': 'A single-breasted wool overcoat completes the suit-level register — weddings, business and formal evenings no longer stop at the jacket. Knee length keeps one uninterrupted vertical line on a shorter frame; navy works with the navy and grey already in rotation.',
  'casual-rain-jacket': 'This is the weather layer between structured outerwear and nothing: light enough for Barcelona, practical with denim and chinos, and relaxed enough for weekends without pretending to be a formal coat.',
  'structured-trench': 'A structured navy trench fills the outerwear gap between smart casual and formal — long enough to work over tailoring, useful enough for a wet weekend, and coherent with a navy-and-grey wardrobe. Black would sit outside that colour story.',
  overcoat: 'A knee-length overcoat is what lets you wear tailoring — or anything else — from November to March. Without one, winter caps every outfit at casual.',
  raincoat: 'Wet commutes and shoulder-season travel without ruining the wool underneath — the layer you\u2019ll reach for forty days a year.',
  crewneck: 'Over a collar for the office, over a tee at the weekend, under a coat in January — one fine crewneck stretches every shirt you own across two more seasons.',
  cardigan: 'Indoor structure: restaurants, offices and long evenings where a blazer is too formal and a sweatshirt too soft. A shawl collar does the work of a jacket without the shoulders.',
  sweatshirt: 'Sunday mornings, travel days, the errand run — a dense, loopwheeled sweatshirt keeps off-duty from sliding into sloppy.',
  suit: 'Weddings, funerals, interviews, proper dinners — the invitations the rest of a wardrobe can\u2019t answer. One dark, soft-shouldered suit answers all of them.',
  'dinner-suit': 'Black-tie invitations stop being a scramble — owning the uniform properly beats renting it twice, and it fits the second time you wear it.',
  tie: 'The step between wearing a suit and being dressed — ceremonies, boardrooms, and any room where the collar is expected to close.',
  belt: 'Every tucked-in outfit you own needs it — one good strap in the right leather finishes trousers and jeans alike, and ends the question.',
  scarf: 'The difference between enduring January and dressing for it — and the fastest way to put colour next to your face.',
  gloves: 'Cold commutes and long walks in an overcoat — the detail that makes winter tailoring feel finished rather than survived.',
  briefcase: 'Meetings, trains, the daily carry — a structured leather bag makes the same outfit read a register higher.',
  bag: 'Weekends away without borrowed luggage — one honest holdall covers every two-night trip you\u2019ll actually take.',
  backpack: 'The commute and the carry-on — clean lines and no technical webbing, so it doesn\u2019t argue with a coat.',
  'flat-cap': 'Cold mornings and outdoor weekends — headwear that agrees with waxed cotton, tweed and wool alike.',
  beanie: 'The below-five-degrees walk — warmth that doesn\u2019t undo the rest of the outfit, no logo doing the talking.',
  'brimmed-hat': 'Real sun — holidays, gardens, long afternoons outside — without wearing something that looks like equipment.',
  thermal: 'The quiet layer underneath that lets you wear the clothes you actually like in February, instead of reaching for a technical shell.',
};

/**
 * The card line and sheet opener (Pass Seven): what owning this unlocks in
 * occasions, contexts and combinations — reasoned from the wardrobe's actual
 * state for footwear, where outfit completion is most consequential.
 */
function composeUnlocks(item: CatalogItem, pieces: WardrobePiece[], profile?: Partial<StyleProfile>): string {
  const ctx = readOutfitContext(pieces);
  const unlockCity = homeCity(profile);
  const unlockClimate = cityClimate(unlockCity);
  // Occasion-coverage reasoning (Pass Nine): which occasions can this
  // wardrobe not currently dress for, and does this piece close one of them?
  const coverage = assessOccasionCoverage(pieces);
  const gapFilled = itemFillsOccasionGap(item, coverage);
  if (item.slot === 'derbies') {
    if (ctx.hasFormalwear && !ctx.hasDressShoes) {
      const opener = ctx.suitCount > 0
        ? `You have ${ctx.suitCount === 1 ? 'a suit' : `${countWord(ctx.suitCount)} suits`} and, as yet, no shoe fit to be worn alongside — the wedding, the interview, the serious dinner are covered from the ankles up only.`
        : 'You dress for formal occasions, yet nothing on your shoe rack holds up in those rooms — a wedding, an interview, a proper dinner would each catch you short at the shoe.';
      return `${opener} A cap toe oxford or plain derby settles the formal end in one purchase: the cleanest silhouette in dress footwear, correct with any suit you will ever own, boardroom to black tie.`;
    }
    return 'A resolved lace-up opens the smart end — interviews, weddings, proper dinners — and carries tailored trousers on the days a loafer reads too relaxed.';
  }
  if (item.slot === 'loafers') {
    if (ctx.hasDressShoes) {
      return 'Your lace-ups hold the formal end; the loafer takes everything just below it — dinner out, a gallery opening, a relaxed office day — smart without the severity, at ease under tailored trousers and with chinos alike.';
    }
    return 'No shoe yet for smart casual — dinner out, a gallery opening, a relaxed office day — something more considered than a trainer but less severe than an oxford. That is exactly the loafer\u2019s territory: it slips under tailored trousers, sharpens chinos, and covers every invitation between the two.';
  }
  if (item.slot === 'deck-shoes') {
    return 'Built for summer leisure — shorts, faded chinos, a linen shirt, harbour towns, a terrace at noon, a day on the water. It earns its keep where a trainer reads too sporty and anything smarter too stiff; suits and smart-casual rooms are a different shoe\u2019s territory, and it doesn\u2019t pretend otherwise.';
  }
  if (item.slot === 'boots') {
    return ctx.hasOutdoorCasual
      ? 'Your casual outfits — the jeans, the outdoor layers — currently stop at the ankle. Boots carry them through rain, cold and rough ground, and still sit right in town on a wet day.'
      : 'Boots open the wet, cold months — jeans-and-waxed-cotton weather — where every other shoe comes home worse for it.';
  }
  if (item.slot === 'dress-shirt' && ctx.hasFormalwear && !ctx.hasDressShirt) {
    return 'A suit with nothing correct under it is still not an outfit — crisp poplin closes that loop, and on its own with grey trousers it carries interviews and dinners too.';
  }
  if (item.slot === 'dress-shirt' && gapFilled && (gapFilled.occasion.id === 'formal' || gapFilled.occasion.id === 'business')) {
    return 'Office and formal rooms both expect a proper shirt, and nothing on your rail answers — an oxford cloth collar reads a half-step too relaxed there. Crisp poplin closes both registers in one purchase, under tailoring or on its own with grey trousers.';
  }
  if (item.slot === 'trousers' && gapFilled && gapFilled.occasion.id === 'business') {
    return 'Business settings are unserved end to end — nothing you own builds a correct office outfit. Tailored trousers are where that changes: they reach the register denim can\u2019t without calling for a full suit, and they carry client days and good restaurants on their own.';
  }
  // Occasion-coverage reasoning (Pass Eight): when a whole occasion or
  // weather register is unserved, the copy names what that costs him in
  // lifestyle terms — never which category happens to be empty.
  if (item.slot === 'blazer' && !ctx.hasBlazer) {
    const blazerCityClause = unlockCity
      ? ` — and it\u2019s the gap that matters most for daily life in ${unlockCity}: dinner out, a relaxed meeting, an evening that\u2019s not fully formal but not casual either`
      : '';
    return ctx.suitCount > 0
      ? `Your wardrobe has no smart casual layer — no blazer, no sport coat — so between your ${ctx.suitCount === 1 ? 'suit' : 'suits'} and your casual clothes sits a register nothing you own can reach${blazerCityClause}. A soft, unstructured blazer covers all of it, and it turns the shirts and trousers already on your rail into complete smart-casual outfits.`
      : `Smart casual occasions are currently uncovered end to end — a good restaurant, a client day, an event with expectations but no dress code${blazerCityClause}. Nothing you own bridges casual and formal without a full suit; an unstructured blazer is that bridge, and it builds outfits from clothes you already have.`;
  }
  if ((item.slot === 'crewneck' || item.slot === 'cardigan') && !ctx.hasKnitwear && ctx.suitCount > 0) {
    return `You have ${ctx.suitCount === 1 ? 'a suit' : `${countWord(ctx.suitCount)} suits`} and no knitwear — when the temperature drops there is nothing to layer under a jacket, so cold-weather tailoring goes unserved from October to April. One fine knit closes it: under the tailoring, over a shirt on its own, and under a coat in January.`;
  }
  if ((item.slot === 'crewneck' || item.slot === 'cardigan') && !ctx.hasKnitwear) {
    return 'You have no layering option for transitional weather — the March and October weeks where a shirt is too little and a coat too much, and smart-casual warmth goes unserved. One good knit closes that: over a collar for the office, over a tee at the weekend, under outerwear when winter proper arrives.';
  }
  if (!ctx.hasOuterwear && ['waxed-jacket', 'raincoat', 'overcoat'].includes(item.slot)) {
    const weatherCost = unlockClimate === 'cool' && unlockCity
      ? ` In ${unlockCity}, that gap costs you most of the year.`
      : '';
    const settle = item.slot === 'waxed-jacket'
      ? 'Waxed cotton settles it in one piece: real rain, cold commutes, country weekends — and it still looks right at the pub afterwards.'
      : item.slot === 'raincoat'
        ? 'A proper raincoat settles the wet days without ruining the wool underneath — the layer you\u2019ll reach for forty days a year.'
        : 'A knee-length overcoat settles the cold months — it goes over everything you own and is what makes winter dressing possible at all.';
    return `You own nothing that stands between you and cold or wet weather — every outfit you can currently build ends at the front door in bad conditions. ${settle}${weatherCost}`;
  }
  if ((item.slot === 'waxed-jacket' || item.slot === 'raincoat') && gapFilled && gapFilled.group.id === 'rain-shell') {
    const rainCost = unlockClimate === 'cool' && unlockCity ? ` In ${unlockCity}, that\u2019s not a hypothetical.` : '';
    const rainSettle = item.slot === 'waxed-jacket'
      ? 'A wax cotton jacket covers this entirely: weather-proof, ages well, and works from casual to smart casual.'
      : 'A proper raincoat covers this entirely: it keeps the wool underneath dry and reads correct over tailoring and knitwear alike.';
    return `No waterproof outerwear. If you\u2019re caught in rain, nothing in your wardrobe is appropriate — you\u2019d ruin a suit jacket or good knitwear.${rainCost} ${rainSettle}`;
  }
  if (item.slot === 'suit' && gapFilled && gapFilled.group.id === 'formal-suit') {
    return 'Formal invitations — a wedding, a funeral, an interview, a serious dinner — currently have no answer in your wardrobe: nothing you own reaches that register end to end. One dark, soft-shouldered suit answers all of them at once, and it will still be answering them in ten years.';
  }
  if (item.slot === 'tie' && gapFilled && gapFilled.group.id === 'formal-tie' && ctx.suitCount > 0) {
    return 'Your tailoring stops one step short of formal — without a tie the collar never properly closes, and ceremonies, boardrooms and the smartest dinners expect it to. One grenadine tie works with every jacket and every collar you own.';
  }
  if (gapFilled && gapFilled.group.id === 'warm-garment') {
    const warmCost = unlockClimate === 'warm' && unlockCity ? ` In ${unlockCity}, that\u2019s a gap for most of the year.` : '';
    const warmSettle = item.slot === 'shorts'
      ? 'Tailored shorts with a shorter inseam keep the outfit deliberate when trousers stop being an option.'
      : item.slot === 'espadrilles'
        ? 'Espadrilles cover the hot-pavement end — beach dinners, terraces, holiday evenings — with no structure to fight the heat.'
        : item.slot === 'polo'
          ? 'A knitted polo carries warm evenings and smart-casual invitations without asking a woven shirt to suffer.'
          : /linen|seersucker/i.test(item.materialNote || '')
            ? `${item.materialNote.charAt(0).toUpperCase()}${item.materialNote.slice(1)} breathes where ordinary cloth doesn\u2019t — the difference between enduring heat and dressing for it.`
            : 'This piece is built for exactly that register — it starts earning wears the first warm week.';
    return `Nothing in your wardrobe is cut for real heat — no linen, no lightweight cotton, no shorts — so warm weather is an occasion you can\u2019t yet dress for.${warmCost} ${warmSettle}`;
  }
  const stock = SLOT_UNLOCKS[item.slot];
  if (stock) return stock;
  // Unknown slot — paint the occasions it serves rather than naming a gap.
  const occs = item.occasions.map((o) => occasionTagLabel(o).toLowerCase()).join(' and ');
  return occs
    ? `Opens up ${occs} outfits your wardrobe can\u2019t currently make.`
    : 'A piece your current combinations can\u2019t stand in for.';
}

/**
 * Slot-level stylist knowledge (Pass Six, material-neutral since Pass Seven):
 * why THIS shape, in the voice of a well-read tailor — direct, unpretentious,
 * no listicle filler. Material claims live in materialTruthLine, which reads
 * the ACTUAL item — a slot note must never say “suede” about a smooth shoe.
 */
const STYLIST_SLOT_NOTES: Record<string, string> = {
  ocbd: 'The oxford button-down earns its keep like nothing else — open-collared at the weekend, tucked under tailoring on Monday.',
  'dress-shirt': 'A proper poplin shirt is the backbone of the smart register — nothing else dresses tailoring correctly.',
  'casual-shirt': 'A textured casual shirt holds an off-duty register without collapsing into a tee.',
  polo: 'A knitted polo sits exactly between shirt and tee — smart enough for dinner, easy enough for July.',
  tee: 'A heavyweight plain tee is a layering instrument, not an afterthought — the weight is what keeps its shape.',
  chinos: 'Chinos are the centre of gravity between denim and flannel — the trouser most outfits actually want.',
  jeans: 'One dark, straight selvedge jean outdresses five washed ones — let the indigo do the talking.',
  trousers: 'Tailored trousers are the single biggest register upgrade per pound — they move you past jeans-with-everything.',
  shorts: 'Tailored shorts with a shorter inseam — the difference between dressed and undone in real heat.',
  loafers: 'The loafer\u2019s slip-on silhouette is the trick — it relaxes tailored trousers and sharpens casual ones at the same time.',
  'deck-shoes': 'Hand-sewn moccasin construction with a low, clean profile — built to be worn sockless, at ease with salt, sun and stone. A summer-leisure shoe on its own terms, not a stand-in for anything smarter.',
  derbies: 'The cleanest silhouettes in formal footwear — a cap toe oxford or plain derby dresses any suit correctly and never overstates.',
  boots: 'A Chelsea or chukka for colder, wetter days — clean enough for smart-casual, practical enough for real weather.',
  sneakers: 'One clean, minimal sneaker; anything louder dates in a season.',
  espadrilles: 'Espadrilles are holiday footwear resolved into one shape — worn easily, never precious, happiest on hot pavements.',
  'field-jacket': 'The field jacket is utility resolved into shape — four pockets, no fuss, better with every year of wear.',
  'waxed-jacket': 'Waxed cotton is the rare outerwear that improves with abuse — country cloth that still reads right in town.',
  blazer: 'An unstructured blazer with a soft, natural shoulder dresses you up without stiffness — the fastest upgrade in menswear.',
  harrington: 'The harrington is the lightest smart-casual layer there is — collar up, zip halfway, done.',
  'leather-jacket': 'A minimal leather is a decade purchase — restraint in the hardware keeps it from costume.',
  overcoat: 'A knee-length wool overcoat goes over everything you own — it is what makes cold-weather tailoring possible.',
  raincoat: 'A proper raincoat spares your wool — the unglamorous piece you will reach for most.',
  crewneck: 'A fine merino or Shetland crewneck layers over a collar without bulk — knitwear\u2019s essential shape.',
  cardigan: 'A shawl-collar cardigan is indoor outerwear — structure for the days a blazer is too much.',
  sweatshirt: 'A dense loopwheeled sweatshirt holds its shape for years — off-duty without going sloppy.',
  suit: 'One dark, soft-shouldered suit answers every invitation the rest of the wardrobe can\u2019t.',
  'dinner-suit': 'Black tie is a uniform — owning it properly beats renting it twice.',
  tie: 'A grenadine is the one tie that works with every collar and every jacket you own.',
  belt: 'The belt should agree with the shoes — one good bridle-leather strap ends the question.',
  scarf: 'A wool or cashmere scarf does more warming per gram than any layer you can buy.',
  gloves: 'Unlined leather gloves — the pair that makes an overcoat feel finished.',
  briefcase: 'A structured leather bag settles the daily-carry question with one purchase.',
  bag: 'One honest canvas-and-leather holdall covers every weekend you\u2019ll actually take.',
  backpack: 'A clean, technical-free backpack that doesn\u2019t argue with tailoring.',
  'flat-cap': 'A wool flat cap is winter headwear that agrees with everything above the ankles.',
  beanie: 'A ribbed merino watch cap — warmth with no logo doing the talking.',
  'brimmed-hat': 'A packable brimmed hat is sun protection that doesn\u2019t look like equipment.',
  thermal: 'A proper base layer is what lets the rest of the wardrobe stay elegant in February.',
};

/**
 * The colour argument, made personally (Pass Six): why THIS colour for THIS
 * man — his complexion, what already hangs on his rail — in stylist language
 * ("brown before black", "burgundy rather than tan"), not colour-theory filler.
 */
function stylistColourLine(
  item: CatalogItem,
  profile: Partial<StyleProfile>,
  pieces: WardrobePiece[],
): string {
  const itemColors = item.colors.map((c) => c.toLowerCase());
  const toneLabel = profile.skin_tone ? label.skinTone(profile.skin_tone).toLowerCase() : null;
  const tonePalette = profile.skin_tone ? TONE_FRIENDLY_COLORS[profile.skin_tone] || [] : [];
  const toneMatch = item.colors.find((c) => tonePalette.includes(c.toLowerCase()));

  if (item.slot === 'structured-trench') {
    return 'Navy, not black: it continues the navy-and-grey colour story already on the rail, works over both palettes, and avoids the hard contrast black would introduce.';
  }
  if (item.slot === 'formal-overcoat') {
    return 'Navy is the first formal-coat colour here: coherent with navy and grey tailoring, flattering for fair-to-warm skin tones, and quieter than black. Camel is the valid second option when more warmth is wanted.';
  }
  if (item.slot === 'casual-rain-jacket') {
    return 'Navy keeps the practical layer connected to denim, grey trousers and brown footwear; olive is the useful country-leaning alternative. Black adds no combination the wardrobe needs.';
  }
  if (item.slot === 'high-rise-trousers') {
    return 'Mid-grey is the neutral bridge: it takes navy knitwear and jackets, brown footwear and white or blue shirts without duplicating navy trousers.';
  }

  // Footwear gets the classic arguments verbatim — they are the advice.
  if (item.category === 'shoes' && itemColors.includes('black')) {
    return 'Black for formality — correct with any suit, boardroom to black tie; go dark chestnut brown instead if you want one shoe to stretch across smarter casual settings too.';
  }
  if (item.category === 'shoes' && itemColors.some((c) => c.includes('brown') || c === 'tan' || c === 'snuff')) {
    return 'Brown before black — brown reads more versatile and less severe; black is for the formal end, brown builds the everyday foundation.';
  }
  if (item.slot === 'loafers' && itemColors.includes('burgundy')) {
    return 'Burgundy before black — the most versatile first loafer colour: less severe than black, richer than tan, and right with denim, chinos and grey trousers alike.';
  }
  if (item.slot === 'loafers' && itemColors.includes('tan')) {
    return 'Tan keeps the loafer at its relaxed end — warm against denim and stone chinos; go darker first if smarter rooms are on the diary.';
  }
  if (item.slot === 'deck-shoes') {
    return `In ${itemColors[0] || 'tan'} it stays inside the warm-weather palette — easy against shorts, chinos and linen, and exactly as relaxed as the occasions it serves.`;
  }
  if (itemColors.some((c) => c.includes('burgundy') || c.includes('oxblood')) && toneLabel) {
    return `Burgundy rather than tan — with your ${toneLabel} skin tone it gives contrast without competing.`;
  }
  if (toneMatch && toneLabel) {
    return `The ${toneMatch.toLowerCase()} is deliberate: against your ${toneLabel} skin tone it flatters rather than washes out.`;
  }
  // No tone data — argue from what already hangs on his rail instead.
  const ownedColors = new Set<string>();
  for (const p of pieces) for (const c of p.colors || []) ownedColors.add(c.toLowerCase());
  const baseColors = ['navy', 'olive', 'brown', 'grey', 'tan', 'cream', 'white', 'charcoal', 'black', 'indigo', 'denim'].filter((c) => ownedColors.has(c));
  if (baseColors.length >= 2) {
    return `In this colour it pairs with the ${baseColors[0]} and ${baseColors[1]} already on your rail — no new colour problems.`;
  }
  return '';
}

/**
 * The material truth line (Pass Seven): describe the ACTUAL item being
 * recommended — suede when it's suede, smooth leather when it's smooth —
 * never the category archetype. No mismatches between item and description.
 */
function materialTruthLine(item: CatalogItem): string {
  // Attribute-first rule: with no material on record, no accurate claim can
  // be written — return nothing and the feed drops the item entirely.
  if (!item.materialNote || !item.materialNote.trim()) return '';
  const m = item.materialNote.toLowerCase();
  const note = `${item.materialNote.charAt(0).toUpperCase()}${item.materialNote.slice(1)}`;
  if (item.category === 'shoes') {
    if (/suede|rough-?out/.test(m)) {
      if (item.slot === 'loafers') {
        return `This pair is suede — ${item.materialNote} — softer and more relaxed than smooth leather, which is exactly what lets a suede loafer bridge from chinos all the way into suiting; brush it, don\u2019t polish it.`;
      }
      return `This pair is suede — ${item.materialNote} — softer and more relaxed than smooth leather; brush it, don\u2019t polish it, and keep it back from the sharpest tailoring.`;
    }
    if (/cordovan/.test(m)) {
      return `This pair is shell cordovan — ${item.materialNote} — a dense, smooth leather that ripples rather than creases and outlasts calf by decades.`;
    }
    if (/canvas/.test(m)) {
      return `${note} — fabric, not leather: lighter, washable, and unbothered by summer.`;
    }
    if (/oiled|grain/.test(m)) {
      return `This pair is ${item.materialNote} — smooth-side leather with weather in mind; it shrugs off rain that would mark finer calf.`;
    }
    return `This pair is smooth leather — ${item.materialNote} — it reads smarter than suede and holds up in city conditions.`;
  }
  return `${note} — that specific cloth is what you\u2019re paying for, not the label.`;
}

/** The verified, material-complete catalog — shared by the feed and the alternative finder. */
function fullCuratedCatalog(): CatalogItem[] {
  return [...CURATED_CATALOG, ...CURATED_EXPANSION]
    .map((item) => ({ ...item, productUrl: item.productUrl || CURATED_PRODUCT_URLS[item.id] }))
    // Attribute-first rule: if the item's actual material isn't on record, an
    // accurate justification cannot be written — so the item is never shown.
    .filter((item) => !!item.productUrl && !!item.materialNote && item.materialNote.trim().length > 0);
}

/**
 * Why THIS variant over its nearest alternatives (Pass Eight): argued against
 * the actual alternates Beau rates in the same slot — a different finish, a
 * different colour, usually a different maker. Cross-brand is deliberate:
 * Beau picks the best expression of each variant, never the deepest single
 * catalogue.
 */
function composeVariantLine(item: CatalogItem, profile: Partial<StyleProfile>): string {
  const siblings = fullCuratedCatalog().filter((c) => c.slot === item.slot && c.id !== item.id && !c.preowned);
  const m = (item.materialNote || '').toLowerCase();
  const isSuede = /suede|rough-?out/.test(m);

  // Footwear finish IS the register — argue it explicitly. Same-maker
  // alternates are named first when they exist (Pass Nine): two constructions
  // from one label make the comparison like for like.
  if (item.slot === 'loafers') {
    const sameBrandLoafers = siblings.filter((s) => s.brand === item.brand);
    const loaferPool = sameBrandLoafers.length > 0 ? sameBrandLoafers : siblings;
    const other = loaferPool.find((s) => /suede|rough-?out/.test((s.materialNote || '').toLowerCase()) !== isSuede)
      || siblings.find((s) => /suede|rough-?out/.test((s.materialNote || '').toLowerCase()) !== isSuede);
    const contrast = other
      ? other.brand === item.brand
        ? ` — ${other.brand}\u2019s own ${other.name} is the other road, same maker, so the comparison is like for like`
        : ` — ${other.brand}\u2019s ${other.name} is the other road`
      : '';
    return isSuede
      ? `Suede rather than smooth leather${contrast}. Suede sits in the relaxed, casual-smart register: easy with chinos and denim, right for terraces and gallery evenings. Smooth leather reads smarter and can carry into near-formal rooms. They serve different occasion envelopes — this one matches where your gap actually is.`
      : `Smooth leather rather than suede${contrast}. Smooth reads smarter and carries into near-formal rooms — dinners with expectations, proper offices — where suede stays in the relaxed casual-smart register. They serve different occasion envelopes — this one matches where your gap actually is.`;
  }
  if (item.slot === 'derbies') {
    const isBlack = item.colors.some((c) => c.toLowerCase() === 'black');
    const sameBrandDerbies = siblings.filter((s) => s.brand === item.brand);
    const derbyPool = sameBrandDerbies.length > 0 ? sameBrandDerbies : siblings;
    const other = derbyPool.find((s) => s.colors.some((c) => c.toLowerCase() === 'black') !== isBlack)
      || siblings.find((s) => s.colors.some((c) => c.toLowerCase() === 'black') !== isBlack);
    const contrast = other
      ? other.brand === item.brand
        ? ` — ${other.brand}\u2019s own ${other.colors[0] || ''} pair is the alternative, same maker, like for like`
        : ` — ${other.brand}\u2019s ${other.colors[0] || ''} pair is the alternative`
      : '';
    return isBlack
      ? `Black over brown${contrast}. Black is the strictly formal answer — correct with any suit, boardroom to black tie — where dark brown reads slightly less severe and stretches across more of a wardrobe. Chosen because your open gap sits at the formal end specifically.`
      : `Dark brown over black${contrast}. Brown reads slightly less severe and pairs across more of your wardrobe — a suit, a blazer with chinos, smart trousers on their own. Brown before black is almost always the right starting point unless your wardrobe is already formal-heavy.`;
  }

  // Generic: name the nearest alternates and say why this expression wins.
  // Same-maker alternates lead when they exist (easier to compare like for
  // like); cross-brand remains when only one expression per label is rated.
  const sameBrandAlts = siblings.filter((s) => s.brand === item.brand);
  const alts = (sameBrandAlts.length > 0 ? sameBrandAlts : siblings).slice(0, 2);
  if (alts.length === 0) return '';
  const sameMaker = alts[0].brand === item.brand;
  const altNames = alts
    .map((a) => (sameMaker ? `the ${a.name} in ${a.colors[0] || 'another colour'}` : `${a.brand}\u2019s in ${a.colors[0] || 'another colour'}`))
    .join(' and ');
  const userArchetypes = Array.isArray(profile.archetypes) ? profile.archetypes : [];
  const matched = item.archetypes.filter((a) => userArchetypes.includes(a));
  const because = matched.length > 0
    ? `this expression sits squarest in your ${label.archetype(matched[0])} lane`
    : 'this expression is the most versatile against what you already own';
  return sameMaker
    ? `Beau also rates ${altNames} from ${item.brand} — same maker deliberately, so the comparison is like for like — but in ${item.colors[0] || 'this colour'}, with ${item.materialNote}, ${because}.`
    : `Beau also rates ${altNames} — different makers, because he picks the best expression of each variant rather than filling from one catalogue — but in ${item.colors[0] || 'this colour'}, with ${item.materialNote}, ${because}.`;
}

/**
 * Why NOW (Pass Eight): what closing this gap unlocks at this point in the
 * journey — the occasions it enables, the milestone it completes — in
 * lifestyle terms, never checklist terms.
 */
function composeWhyNow(item: CatalogItem, pieces: WardrobePiece[], profile: Partial<StyleProfile>): string {
  const ctx = readOutfitContext(pieces);
  const urgency = outfitGapUrgency(item, pieces, ctx);
  const city = homeCity(profile);
  const season = currentSeason(city);
  const itemSeasons = defaultSeasons(item.slot);
  const inSeason = itemSeasons.includes(season) || itemSeasons.includes('year-round');

  if (item.slot === 'derbies' && ctx.hasFormalwear && !ctx.hasDressShoes) {
    return 'Right now every formal invitation on your calendar — a wedding, an interview, a serious dinner — is dressed from the ankles up only. Closing this one gap completes the formal register in a single purchase; nothing else in the wardrobe unlocks as much.';
  }
  if (item.slot === 'blazer' && !ctx.hasBlazer) {
    return 'This is the biggest jump in range per purchase available to you: one soft blazer turns the shirts and trousers you already own into dinner, meeting and event outfits — the whole smart-casual register opens at once.';
  }
  if (!ctx.hasOuterwear && ['waxed-jacket', 'raincoat', 'overcoat'].includes(item.slot)) {
    return `${city ? `In ${city}, w` : 'W'}eather is the constraint your wardrobe can\u2019t currently answer — until an outer layer exists, cold and rain cap every outfit you can build. That makes this the gap to close before refining anything else.`;
  }
  if (!ctx.hasKnitwear && (item.slot === 'crewneck' || item.slot === 'cardigan')) {
    return 'Transitional weather arrives twice a year, every year — without a knit, those months force a choice between underdressed and overcoated. One layer serves both shoulder seasons the week it arrives.';
  }
  if (item.slot === 'loafers' && ctx.hasSmartCasual && !ctx.hasLoafers) {
    return 'The dinners, gallery evenings and relaxed office days are already on your calendar — this closes the one gap that keeps you defaulting to trainers for them. Everything it pairs with, you already own.';
  }
  if (urgency >= 5) {
    return 'Of the gaps still open, this is the one that completes outfits your wardrobe can already half-make — it multiplies pieces you own rather than starting a new project.';
  }
  return inSeason
    ? 'In season now — it starts earning wears the week it arrives, and it widens what your existing pieces can do rather than duplicating any of them.'
    : 'Not urgent — it\u2019s out of season at the moment — but the gap is real, and buying quality off-peak is usually when the price is right.';
}

/** The silhouette argument: the shape's craft case plus his frame rules. */
function composeSilhouetteLine(item: CatalogItem, profile: Partial<StyleProfile>): string {
  if (item.slot === 'formal-overcoat') {
    return 'Single-breasted and knee-length is the correct proportion: the long uninterrupted line lengthens a shorter frame, while a pea coat would cut the torso in half. Alter sleeve length and button stance; do not crop the hem above the knee.';
  }
  if (item.slot === 'structured-trench') {
    return 'A defined shoulder, controlled belt and knee-length line give enough structure to sit over tailoring without turning boxy on a shorter frame.';
  }
  if (item.slot === 'casual-rain-jacket') {
    return 'A trim hip-length weather jacket keeps the casual role distinct from the longer formal trench and avoids excess bulk in a mild climate.';
  }
  if (item.slot === 'high-rise-trousers') {
    return 'High rise lengthens the leg; a clean taper to roughly a 7.5-inch opening keeps the line neither skinny nor wide, with little or no break.';
  }
  const craft = STYLIST_SLOT_NOTES[item.slot] || '';
  const frame = item.shorterFriendly && (profile.height_range === 'under-56' || profile.height_range === '56-59')
    ? ' The proportion is scaled for a shorter frame — nothing swamps.'
    : '';
  return `${craft}${frame}`.trim();
}

/** Assemble the structured stylist reasoning behind the "Why this?" sheet. */
function composeReasoning(
  item: CatalogItem,
  profile: Partial<StyleProfile>,
  pieces: WardrobePiece[],
): CardReasoning {
  const colour = stylistColourLine(item, profile, pieces)
    || (item.colors[0]
      ? `In ${item.colors[0]}, it stays inside the classic base palette — it pairs with navy, grey and earth tones without creating a new colour problem.`
      : '');
  return {
    colour,
    silhouette: composeSilhouetteLine(item, profile),
    brand: brandThesisLine(item),
    variant: composeVariantLine(item, profile),
    whyNow: composeWhyNow(item, pieces, profile),
  };
}

/** Slots this piece builds outfits with — used to name owned partner pieces. */
const OUTFIT_PARTNERS: Record<string, string[]> = {
  derbies: ['suit', 'trousers', 'dress-shirt', 'blazer', 'overcoat'],
  loafers: ['trousers', 'chinos', 'blazer', 'ocbd', 'polo', 'suit'],
  'deck-shoes': ['shorts', 'chinos', 'casual-shirt', 'polo', 'tee'],
  boots: ['jeans', 'waxed-jacket', 'field-jacket', 'chinos', 'crewneck'],
  sneakers: ['jeans', 'chinos', 'tee', 'sweatshirt', 'harrington'],
  espadrilles: ['shorts', 'casual-shirt', 'polo', 'chinos'],
  blazer: ['ocbd', 'dress-shirt', 'high-rise-trousers', 'trousers', 'chinos', 'polo'],
  chinos: ['ocbd', 'polo', 'blazer', 'loafers', 'sneakers'],
  jeans: ['tee', 'ocbd', 'crewneck', 'boots', 'sneakers'],
  'high-rise-trousers': ['dress-shirt', 'ocbd', 'blazer', 'loafers', 'derbies'],
  trousers: ['dress-shirt', 'ocbd', 'blazer', 'loafers', 'derbies'],
  ocbd: ['chinos', 'jeans', 'blazer', 'crewneck'],
  'dress-shirt': ['suit', 'trousers', 'blazer', 'tie'],
  crewneck: ['ocbd', 'jeans', 'chinos', 'overcoat'],
  cardigan: ['ocbd', 'tee', 'trousers', 'jeans'],
  'formal-overcoat': ['suit', 'blazer', 'crewneck', 'high-rise-trousers', 'trousers'],
  'casual-rain-jacket': ['jeans', 'chinos', 'ocbd', 'crewneck'],
  'structured-trench': ['suit', 'blazer', 'high-rise-trousers', 'trousers', 'crewneck'],
  overcoat: ['suit', 'blazer', 'crewneck', 'trousers'],
  suit: ['dress-shirt', 'derbies', 'tie', 'formal-overcoat', 'overcoat'],
  tie: ['suit', 'dress-shirt', 'blazer'],
  belt: ['chinos', 'trousers', 'jeans'],
};

/** Plain names for partner slots, for natural sentences. */
const PARTNER_NAMES: Record<string, string> = {
  suit: 'suit', 'high-rise-trousers': 'high-rise tailored trousers', trousers: 'tailored trousers', 'dress-shirt': 'dress shirt', blazer: 'blazer',
  'formal-overcoat': 'formal wool overcoat', 'casual-rain-jacket': 'casual rain jacket', 'structured-trench': 'structured trench', overcoat: 'overcoat', chinos: 'chinos', jeans: 'jeans', shorts: 'shorts', ocbd: 'oxford shirt',
  polo: 'polo', tee: 'tees', 'casual-shirt': 'casual shirt', crewneck: 'crewneck',
  sweatshirt: 'sweatshirt', harrington: 'harrington', 'waxed-jacket': 'waxed jacket',
  'field-jacket': 'field jacket', loafers: 'loafers', derbies: 'dress shoes', sneakers: 'sneakers',
  boots: 'boots', tie: 'tie', cardigan: 'cardigan', espadrilles: 'espadrilles',
};

/**
 * How the piece fits what he ALREADY owns — names actual partner pieces from
 * his rail, so the reasoning is anchored in his wardrobe, not a generic one.
 */
function wardrobeFitLine(item: CatalogItem, pieces: WardrobePiece[]): string {
  const partners = OUTFIT_PARTNERS[item.slot];
  if (!partners) return '';
  const slotCounts = new Map<string, number>();
  for (const p of pieces) {
    if (p.slot) slotCounts.set(p.slot, (slotCounts.get(p.slot) || 0) + 1);
  }
  const nameFor = (s: string) => {
    const base = PARTNER_NAMES[s] || s;
    return (slotCounts.get(s) || 0) > 1 && !base.endsWith('s') ? `${base}s` : base;
  };
  const owned = partners.filter((s) => slotCounts.has(s)).map(nameFor).slice(0, 2);
  if (owned.length === 0) return '';
  if (owned.length === 1) return `It goes to work immediately with the ${owned[0]} you already own.`;
  return `It goes to work immediately with the ${owned[0]} and ${owned[1]} you already own.`;
}

/**
 * The "Why this one" reasoning behind the card's info tap (Pass Seven):
 * why THIS specific item — its actual material and colour first, then the
 * shape's craft argument, the personal colour case, his frame/materials
 * rules, his city and season, provenance, and the budget note. Assembled to
 * stay under ~90 words and to never merely restate what the item is.
 */
function composeWhy(
  item: CatalogItem,
  profile: Partial<StyleProfile>,
  budgets: Record<string, CategoryBudget>,
  pieces: WardrobePiece[],
): string {
  const userArchetypes = Array.isArray(profile.archetypes) ? profile.archetypes : [];
  const matched = item.archetypes.filter((a) => userArchetypes.includes(a));

  // 1) The actual item — material and finish as they really are.
  const spec = materialTruthLine(item);

  // 2) The craft argument — why this shape at all (material-neutral).
  const craft = composeSilhouetteLine(item, profile);

  // 3) The colour argument, personal to his complexion and rail.
  const colour = stylistColourLine(item, profile, pieces);

  // 3b) How it plugs into what he already owns — named partner pieces.
  const fit = wardrobeFitLine(item, pieces);

  // 4) His own rules — frame and materials, only when they genuinely apply.
  let rules = '';
  if (item.shorterFriendly && (profile.height_range === 'under-56' || profile.height_range === '56-59')) {
    rules = 'The shorter cut respects your proportions — it sits well on a shorter frame.';
  } else if (item.natural && (profile.materials === 'natural-only' || profile.materials === 'natural-preference')) {
    rules = 'Inside your natural-fibres rule.';
  }

  // 4b) Fit rationale from the build on file (Pass Forty-Four): the copy
  // names why the cut suits THIS frame, never a generic one.
  const buildLine = profile.build === 'slim'
    ? 'The proportions sit well on a slim build — trim through the body without clinging.'
    : profile.build === 'athletic'
      ? 'Cut with room through the shoulder and chest — right for an athletic build.'
      : profile.build === 'broad'
        ? 'The fuller, cleaner line flatters a broad frame instead of fighting it.'
        : '';

  // 4) His city and the season — the valet's "I know where you live" line.
  const city = homeCity(profile);
  const climate = cityClimate(city);
  const itemSeasons = defaultSeasons(item.slot);
  let context = '';
  if (city && climate === 'warm' && WARM_CLIMATE_SLOTS.has(item.slot)) {
    context = `Chosen with ${city} in mind — it will earn wears there most of the year.`;
  } else if (city && climate === 'cool' && COOL_CLIMATE_SLOTS.has(item.slot)) {
    context = `In ${city} this is a workhorse, not an occasional.`;
  } else if (!itemSeasons.includes('year-round') && itemSeasons.includes(currentSeason(city))) {
    context = currentSeason(city) === 'ss' ? 'In season now — the warm months are its moment.' : 'In season now — cold-month cloth for cold months.';
  }

  // 5) The archetype thread, when the colour line didn't already carry it.
  const lane = matched.length > 0 && !colour
    ? `Squarely in your ${label.archetype(matched[0])} lane.`
    : '';

  // Secondhand/vintage transparency — said out loud, never hidden.
  const provenance = item.preowned
    ? `${item.preowned.kind} via ${item.preowned.source} — quality that outlives its first owner.`
    : '';

  // Budget note — ONLY when the piece stretches past the stated ceiling.
  const budget = budgets[item.category];
  const budgetText = formatBudget(budget);
  const money = budget && budgetText && budget.max_price != null && convertFromGBP(item.priceGBP) > budget.max_price
    ? `Stretches your ${budgetText} ceiling — the quality earns it.`
    : '';

  // Assemble in priority order, capped near 90 words so it stays scannable.
  const out: string[] = [];
  let words = 0;
  for (const sentence of [spec, craft, colour, fit, rules, buildLine, lane, context, provenance, money]) {
    if (!sentence) continue;
    const w = sentence.split(/\s+/).length;
    if (out.length >= 2 && words + w > 88) continue;
    out.push(sentence);
    words += w;
  }
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Curated feedback loop (Pass Eight) — session-level recalibration signals.
// "Not feeling this? Tell Beau why" produces one of these; the feed excludes
// the rejected card, avoids the disliked attributes for the session, and the
// alternative finder surfaces a better-matched piece in its place. Session
// only — never a permanent profile update.
// ---------------------------------------------------------------------------

export interface CuratedSessionSignal {
  /** The rejected catalog item id. */
  itemId: string;
  slot: string;
  category: string;
  /** Interpreted objection kinds, e.g. ['wrong-colour', 'wrong-formality']. */
  reasons: string[];
  /** Colours to steer away from for the rest of the session (lowercase). */
  avoidColors: string[];
  /** Brands to steer away from for the rest of the session. */
  avoidBrands: string[];
  /** Direction of the formality objection, when there is one. */
  wantSmarter?: boolean;
  wantMoreCasual?: boolean;
  /** "I already own something like this" — stop recommending the slot. */
  alreadyOwn?: boolean;
  /** The user's own words, for the swap note. */
  note?: string;
}

/**
 * Find a better-matched alternative after a "not feeling this" signal: same
 * gap (slot) where possible, avoiding the disliked colour/brand/finish, and
 * respecting the formality direction. Returns null when nothing in the
 * verified catalog clears the bar — the UI says so honestly instead.
 */
export function findCuratedAlternative(
  rejected: CatalogItem,
  signal: CuratedSessionSignal,
  profile: Partial<StyleProfile>,
  budgets: Record<string, CategoryBudget>,
  pieces: WardrobePiece[],
  prefs: StylePrefs | null = null,
): FeedCard | null {
  const userArchetypes = Array.isArray(profile.archetypes) ? profile.archetypes : [];
  const ownedSlots = new Set(pieces.map((p) => p.slot).filter(Boolean) as string[]);
  const allowPreowned = secondhandAllowed(prefs);
  const avoidColors = new Set(signal.avoidColors.map((c) => c.toLowerCase()));
  const avoidBrands = new Set(signal.avoidBrands.map((b) => b.toLowerCase()));
  const tonePalette = profile.skin_tone ? TONE_FRIENDLY_COLORS[profile.skin_tone] || [] : [];

  const candidates = fullCuratedCatalog().filter((c) =>
    c.id !== rejected.id &&
    (!c.preowned || allowPreowned) &&
    !ownedSlots.has(c.slot) &&
    !avoidBrands.has(c.brand.toLowerCase()) &&
    !c.colors.some((col) => avoidColors.has(col.toLowerCase())) &&
    // Pass Forty-Four: alternatives obey the same profile hard rules as the
    // feed — archetype fit, palette-appropriate colour, the budget ceiling.
    (userArchetypes.length === 0 || c.archetypes.some((a) => userArchetypes.includes(a))) &&
    itemFitsTonePalette(c, profile) &&
    !(budgets[c.category] && budgets[c.category].max_price != null && convertFromGBP(c.priceGBP) > (budgets[c.category].max_price as number)) &&
    (signal.alreadyOwn ? c.slot !== signal.slot && c.category === signal.category : c.slot === signal.slot || c.category === signal.category),
  );
  if (candidates.length === 0) return null;

  const scored = candidates.map((item) => {
    let score = 0;
    if (!signal.alreadyOwn && item.slot === signal.slot) score += 6; // same gap, different expression
    score += item.archetypes.filter((a) => userArchetypes.includes(a)).length * 2;
    if (item.colors.some((c) => tonePalette.includes(c.toLowerCase()))) score += 2;
    const smartness = item.occasions.filter((o) => o === 'business' || o === 'formal').length
      - (item.occasions.length === 1 && item.occasions[0] === 'casual' ? 1 : 0);
    if (signal.wantSmarter) score += smartness * 2;
    if (signal.wantMoreCasual) score -= smartness * 2;
    // A meaningful swap changes something — but when the brand ISN'T the
    // objection, the same maker in a different colour or construction is
    // preferred (Pass Nine): it keeps the comparison like for like.
    if (signal.avoidBrands.length === 0 && item.brand === rejected.brand) score += 1;
    else if (signal.avoidBrands.length > 0 && item.brand !== rejected.brand) score += 1;
    if (item.colors[0] && rejected.colors[0] && item.colors[0] !== rejected.colors[0]) score += 1;
    const budget = budgets[item.category];
    if (budget && budget.max_price != null) {
      const displayPrice = convertFromGBP(item.priceGBP);
      if (displayPrice <= budget.max_price) score += 3;
      else if (displayPrice > budget.max_price * 1.25) score -= 100;
    }
    return { item, score };
  }).filter(({ score }) => score > -50);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].item;

  // The swap note names what actually changed — auditable, not hand-wavy.
  const changes: string[] = [];
  if (pick.colors[0] && rejected.colors[0] && pick.colors[0].toLowerCase() !== rejected.colors[0].toLowerCase()) {
    changes.push(`${pick.colors[0]} instead of ${rejected.colors[0]}`);
  }
  const rejSuede = /suede|rough-?out/.test((rejected.materialNote || '').toLowerCase());
  const pickSuede = /suede|rough-?out/.test((pick.materialNote || '').toLowerCase());
  if (pick.category === 'shoes' && rejSuede !== pickSuede) {
    changes.push(pickSuede ? 'suede\u2019s softer register instead of smooth leather' : 'smooth leather\u2019s smarter register instead of suede');
  }
  if (pick.brand !== rejected.brand) changes.push(`${pick.brand} rather than ${rejected.brand}`);
  if (pick.slot !== rejected.slot) changes.push('a different shape serving the same occasions');
  const swapNote = `You passed on the ${rejected.brand} ${rejected.name}${signal.note ? ` (\u201c${signal.note}\u201d)` : ''} — this one trades ${changes.length > 0 ? changes.slice(0, 2).join(', ') : 'the details you flagged'} while still closing the same gap.`;

  return {
    item: pick,
    unlocks: composeUnlocks(pick, pieces, profile),
    why: composeWhy(pick, profile, budgets, pieces),
    reasoning: composeReasoning(pick, profile, pieces),
    swapNote,
  };
}

// ---------------------------------------------------------------------------
// Menswear completeness — expert requirements first, user input second.
// ---------------------------------------------------------------------------

export type MenswearGapKind = 'foundational' | 'occasion' | 'seasonal' | 'coherence' | 'investment';

export interface MenswearGap {
  id: string;
  kind: MenswearGapKind;
  label: string;
  detail: string;
  slots: string[];
  priority: number;
}

/**
 * A classic-wardrobe brief built independently of anything the user happened
 * to name. The profile then changes the expression (cloth, colour, cut and
 * weight); the owned wardrobe is subtracted afterwards.
 */
const MENSWEAR_COMPLETENESS: MenswearGap[] = [
  {
    id: 'foundation-jeans',
    kind: 'foundational',
    label: 'Dark-wash jeans',
    detail: 'The foundational casual trouser that bridges weekend and smart casual.',
    slots: ['jeans'],
    priority: 0,
  },
  {
    id: 'foundation-shirt',
    kind: 'foundational',
    label: 'A versatile Oxford shirt',
    detail: 'A proper shirt for daily wear, layering and smart casual outfits.',
    slots: ['ocbd'],
    priority: 1,
  },
  {
    id: 'foundation-high-rise-trousers',
    kind: 'foundational',
    label: 'High-rise tailored trousers',
    detail: 'The right trouser architecture for a shorter frame and the smart-casual-to-business register.',
    slots: ['high-rise-trousers'],
    priority: 2,
  },
  {
    id: 'occasion-formal-overcoat',
    kind: 'occasion',
    label: 'Formal wool overcoat',
    detail: 'The missing outer layer that lets tailoring work as a complete formal outfit.',
    slots: ['formal-overcoat'],
    priority: 100,
  },
  {
    id: 'seasonal-casual-rain-jacket',
    kind: 'seasonal',
    label: 'Casual rain jacket',
    detail: 'Practical wet-weather coverage for weekends and everyday clothes.',
    slots: ['casual-rain-jacket'],
    priority: 200,
  },
  {
    id: 'seasonal-structured-trench',
    kind: 'seasonal',
    label: 'Structured navy or grey trench',
    detail: 'Rain protection that also works over tailoring and stays coherent with a navy-and-grey wardrobe.',
    slots: ['structured-trench'],
    priority: 201,
  },
];

function pieceText(piece: WardrobePiece): string {
  return `${piece.name || ''} ${(piece.colors || []).join(' ')}`.toLowerCase();
}

function pieceSatisfiesMenswearGap(piece: WardrobePiece, gap: MenswearGap): boolean {
  const text = pieceText(piece);
  // A structured trench is complete only in the coherent navy/grey palette;
  // an existing black trench does not satisfy this user's requirement.
  if (gap.id === 'seasonal-structured-trench' && piece.slot === 'structured-trench') {
    const colours = new Set((piece.colors || []).map((colour) => colour.toLowerCase()));
    return colours.has('navy') || colours.has('grey') || colours.has('charcoal');
  }
  if (piece.slot && gap.slots.includes(piece.slot)) return true;
  switch (gap.id) {
    case 'occasion-formal-overcoat':
      return piece.slot === 'overcoat' && /overcoat|topcoat/.test(text) && !/pea\s?coat|duffle/.test(text);
    case 'seasonal-casual-rain-jacket':
      return (piece.slot === 'waxed-jacket' || piece.slot === 'raincoat') && /wax|rain|weather|waterproof/.test(text) && !/trench/.test(text);
    case 'seasonal-structured-trench': {
      const colours = new Set((piece.colors || []).map((colour) => colour.toLowerCase()));
      return piece.slot === 'raincoat' && /trench/.test(text) && (colours.has('navy') || colours.has('grey') || colours.has('charcoal'));
    }
    case 'foundation-high-rise-trousers':
      return piece.slot === 'trousers' && /high[ -]?rise|high[ -]?waist/.test(text);
    default:
      return false;
  }
}

export function catalogItemFillsMenswearGap(item: CatalogItem, gap: MenswearGap): boolean {
  return gap.slots.includes(item.slot);
}

export function buildMenswearCompleteness(
  profile: Partial<StyleProfile>,
  pieces: WardrobePiece[],
  catalog: CatalogItem[] = fullCuratedCatalog(),
): { gaps: MenswearGap[]; complete: MenswearGap[] } {
  // Profile is intentionally consumed here even where the universal classic
  // requirements are unchanged: it is the source for their eventual colour,
  // cloth and silhouette expression in composeReasoning.
  void profile;
  const complete = MENSWEAR_COMPLETENESS.filter((gap) => pieces.some((piece) => pieceSatisfiesMenswearGap(piece, gap)));
  const gaps = MENSWEAR_COMPLETENESS
    .filter((gap) => !complete.some((done) => done.id === gap.id))
    .filter((gap) => catalog.some((item) => catalogItemFillsMenswearGap(item, gap)))
    .sort((a, b) => a.priority - b.priority);
  return { gaps, complete };
}

/** Score the catalog against the profile + budgets + owned pieces + prefs. */
export function buildCuratedFeed(
  profile: Partial<StyleProfile>,
  budgets: Record<string, CategoryBudget>,
  pieces: WardrobePiece[],
  prefs: StylePrefs | null = null,
  count = 24,
  signals: CuratedSessionSignal[] = [],
): FeedCard[] {
  const userArchetypes = Array.isArray(profile.archetypes) ? profile.archetypes : [];
  const ownedSlots = new Set(pieces.map((p) => p.slot).filter(Boolean) as string[]);
  const allowPreowned = secondhandAllowed(prefs);
  const completeness = buildMenswearCompleteness(profile, pieces, fullCuratedCatalog());

  // Session recalibration (Pass Eight): slots the user says they already
  // cover leave the feed, and disliked colours, brands and formality
  // directions are downranked for THIS session only. Explicitly rejected
  // cards stay in the list — the UI replaces them in place with the
  // better-matched alternative.
  const rejectedIds = new Set(signals.map((s) => s.itemId));
  const alreadyOwnSlots = new Set(signals.filter((s) => s.alreadyOwn).map((s) => s.slot));
  const sessionAvoidColors = new Set(signals.flatMap((s) => s.avoidColors).map((c) => c.toLowerCase()));
  const sessionAvoidBrands = new Set(signals.flatMap((s) => s.avoidBrands).map((b) => b.toLowerCase()));
  const sessionWantSmarter = signals.some((s) => s.wantSmarter);
  const sessionWantCasual = signals.some((s) => s.wantMoreCasual);

  // Context — the valet knows where he lives and what month it is.
  const city = homeCity(profile);
  const season = currentSeason(city);
  const climate = cityClimate(city);
  const professional = (Array.isArray(profile.occasions) && profile.occasions.includes('work')) ||
    (profile.lifestyle as Lifestyle | null | undefined)?.setting === 'city';

  // Outfit-aware gap detection (Pass Seven): read the wardrobe's actual
  // combinations once, then let outfit-completion urgency outrank taste
  // matching — suits with no dress shoes lead the feed, full stop.
  const outfitCtx = readOutfitContext(pieces);

  const scored = fullCuratedCatalog()
    .filter((item) => !item.preowned || allowPreowned)
    // A black trench contradicts this navy/grey wardrobe's colour story and
    // never enters the candidate set unless a future explicit rule justifies it.
    .filter((item) => !(item.slot === 'raincoat' && /trench/i.test(item.name) && item.colors.some((colour) => colour.toLowerCase() === 'black')))
    // Natural-only is an eligibility rule, not flattering copy added after
    // selection. Technical exceptions belong in Scout, never this feed.
    .filter((item) => profile.materials !== 'natural-only' || item.natural)
    // ARCHETYPE FIT is a hard rule (Pass Forty-Four): with archetypes on
    // file, only pieces tagged for at least one of them are eligible — a
    // Classic Ivy + British Country man never sees American Outdoors picks.
    .filter((item) => userArchetypes.length === 0 || item.archetypes.some((a) => userArchetypes.includes(a)))
    // COLOUR PROFILE (Pass Forty-Four): with skin tone on file, recommended
    // colours are filtered to palette-appropriate picks (plus the universal
    // neutrals every complexion carries).
    .filter((item) => itemFitsTonePalette(item, profile))
    // BUDGET (Pass Forty-Four): with a ceiling set for the category, the
    // recommended pieces fall within it — no over-budget picks.
    .filter((item) => {
      const b = budgets[item.category];
      return !(b && b.max_price != null && convertFromGBP(item.priceGBP) > b.max_price);
    })
    // GAP-FILLING, hard rule: never recommend a slot the user already owns.
    // He has white sneakers → no more sneakers, ever; the next shoe is a
    // chukka, loafer, Oxford or Chelsea. Enforced here, before scoring.
    .filter((item) => !ownedSlots.has(item.slot))
    // Legacy broad slots can satisfy a more precise requirement by their
    // attributes. Once satisfied, do not recommend its specialised slot too.
    .filter((item) => !completeness.complete.some((done) => catalogItemFillsMenswearGap(item, done)))
    // Session feedback: "I already own this" slots leave the feed entirely —
    // except the rejected card itself, which stays so the UI can replace it
    // in place with the alternative.
    .filter((item) => !alreadyOwnSlots.has(item.slot) || rejectedIds.has(item.id))
    .map((item) => {
    let score = 0;
    const gap = completeness.gaps.find((candidate) => catalogItemFillsMenswearGap(item, candidate));
    const matched = item.archetypes.filter((a) => userArchetypes.includes(a)).length;
    score += matched * 3;

    // Reason outward from the independent completeness brief before taste
    // matching. Foundations lead, then occasion, climate, coherence and
    // investment pieces. The user's nouns never create a gap.
    if (gap) {
      const gapWeight: Record<MenswearGapKind, number> = {
        foundational: 30,
        occasion: 24,
        seasonal: 18,
        coherence: 10,
        investment: 4,
      };
      score += gapWeight[gap.kind];
    }

    // The single most consequential missing piece for building complete,
    // occasion-appropriate outfits leads — weighted above every taste signal.
    score += outfitGapUrgency(item, pieces, outfitCtx) * 3;

    // Season fit: pieces wearable NOW rank above out-of-season ones.
    const itemSeasons = defaultSeasons(item.slot);
    if (itemSeasons.includes(season)) score += 2;
    else if (!itemSeasons.includes('year-round')) score -= 2;

    // Climate fit from the home city (Barcelona → loafers, linen, espadrilles
    // up; heavy knitwear down. London → knitwear and outerwear up).
    if (climate === 'warm') {
      if (WARM_CLIMATE_SLOTS.has(item.slot)) score += 2;
      if (COOL_CLIMATE_SLOTS.has(item.slot)) score -= 2;
      if (/linen|open-weave|lightweight|tropical|summer/i.test(item.materialNote)) score += 1;
    } else if (climate === 'cool') {
      if (COOL_CLIMATE_SLOTS.has(item.slot)) score += 2;
      if (/linen|seersucker/i.test(item.materialNote)) score -= 1;
    }

    // Professional register: oxfords, blazers, tailoring rank up for men who
    // dress for work in a city.
    if (professional && PROFESSIONAL_SLOTS.has(item.slot)) score += 1;

    const displayPrice = convertFromGBP(item.priceGBP);
    const budget = budgets[item.category];
    if (budget && budget.max_price != null) {
      if (displayPrice <= budget.max_price) score += 3;
      else if (displayPrice <= budget.max_price * 1.25) score -= 1;
      // A genuine gap remains visible even when the current catalogue option
      // stretches the ceiling; its card says so. Non-gaps stay hard-filtered.
      else score -= gap ? 8 : 100;
      if (budget.min_price != null && displayPrice < budget.min_price) score -= 2;
    }

    if (item.natural && (profile.materials === 'natural-only' || profile.materials === 'natural-preference')) score += 1;
    if (item.shorterFriendly && (profile.height_range === 'under-56' || profile.height_range === '56-59')) score += 1;
    // 'Sometimes' means sparingly: secondhand stays visible but below new equivalents.
    if (item.preowned && prefs?.secondhand === 'sometimes') score -= 1;

    // Session feedback recalibration — quiet downranks, this session only.
    if (item.colors.some((c) => sessionAvoidColors.has(c.toLowerCase()))) score -= 3;
    if (sessionAvoidBrands.has(item.brand.toLowerCase())) score -= 4;
    if (sessionWantSmarter || sessionWantCasual) {
      const smartness = item.occasions.filter((o) => o === 'business' || o === 'formal').length
        - (item.occasions.length === 1 && item.occasions[0] === 'casual' ? 1 : 0);
      if (sessionWantSmarter) score += smartness;
      if (sessionWantCasual) score -= smartness;
    }
    return { item, score, gap };
  }).filter(({ score }) => score > -50);

  scored.sort((a, b) => b.score - a.score);

  // Pin one eligible expression of every inferred completeness gap before
  // ordinary score order. This prevents milestone previews or taste matching
  // from hiding foundational requirements such as jeans, or the distinct
  // formal-overcoat / casual-rain / structured-trench roles.
  const pinned: typeof scored = [];
  const usedIds = new Set<string>();
  for (const required of completeness.gaps) {
    const match = scored.find((row) => !usedIds.has(row.item.id) && row.gap?.id === required.id);
    if (!match) continue;
    pinned.push(match);
    usedIds.add(match.item.id);
  }
  const ordered = [...pinned, ...scored.filter((row) => !usedIds.has(row.item.id))];

  return ordered.slice(0, count)
    .map(({ item, gap }): FeedCard => ({
      item,
      ...(gap ? { gap } : {}),
      unlocks: composeUnlocks(item, pieces, profile),
      why: composeWhy(item, profile, budgets, pieces),
      reasoning: composeReasoning(item, profile, pieces),
    }))
    // If an accurate, attribute-true justification could not be written for
    // a piece, that piece does not run — the card is dropped, never padded.
    .filter((card) => card.unlocks.trim().length > 0 && card.why.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Proportions — concise bullets (deterministic fallback for the AI ones)
// ---------------------------------------------------------------------------

export interface ProportionBullets {
  /** What works for his frame. */
  works: string[];
  /** What to look for when buying. */
  lookFor: string[];
  /** What to avoid. */
  avoid: string[];
}

// Specific, quantified frame guidance (v6): numbers where they matter —
// jacket hem position, trouser break, leg opening. No advice that is true
// for everyone.
const HEIGHT_BULLETS: Record<string, ProportionBullets> = {
  'under-56': {
    works: ['Jacket hems at mid-seat — never below', 'Higher rise (10–11") — longer leg line'],
    lookFor: ['"Short" jacket lengths (36S–40S)', 'No break — hem just clears the shoe', 'Leg opening ~17cm'],
    avoid: ['Jacket hems past the seat', 'Any excess cloth pooling at the ankle', 'Shoulder seams past your own by >1cm'],
  },
  '56-59': {
    works: ['Jacket hem no lower than mid-seat', 'Rise around 10.5" to lift the leg line'],
    lookFor: ['Trouser break just touching the shoe — no excess', 'Leg opening 17–18cm', '"Short" lengths before tailoring a Regular'],
    avoid: ['Oversized shoulders', 'Stacked or puddling hems', 'Longline coats past the knee'],
  },
  '510-61': {
    works: ['Standard lengths straight off the rack', 'Slight break or no break — both work'],
    lookFor: ['Shoulder seam ending at your shoulder bone', 'Leg opening 18–19cm on tailoring'],
    avoid: ['Extremes — ultra-cropped or longline'],
  },
  'over-61': {
    works: ['Jacket hems covering the full seat', 'Slight break — anchors the longer leg'],
    lookFor: ['"Long" sizes (40L+) — sleeve length first', 'Leg opening 19–20cm to match the frame'],
    avoid: ['Cropped jackets that exaggerate height', 'Leg openings under 18cm — reads spindly'],
  },
};

const BUILD_BULLETS: Record<string, ProportionBullets> = {
  slim: {
    works: ['Texture that adds mass — Shetland, flannel, tweed', 'Light shoulder structure (~1cm padding)'],
    lookFor: ['5–7cm of ease at the chest — trim, never tight', 'Lapels 7.5–8.5cm'],
    avoid: ['Skin-tight knits', 'Lapels under 7cm — they narrow you further'],
  },
  regular: {
    works: ['True classic blocks — most off-the-rack cuts'],
    lookFor: ['Drop-6 tailoring (chest minus 6 at the waist)', 'Shoulders first — waists can be altered, shoulders can\u2019t'],
    avoid: ['Trend silhouettes in either direction'],
  },
  athletic: {
    works: ['Unstructured tailoring — absorbs a 7–8" chest-to-waist drop', 'Higher armholes for built shoulders'],
    lookFor: ['Athletic-cut blocks (drop-7/8)', '2–3cm of thigh ease minimum on trousers'],
    avoid: ['Standard slim trousers that fight the thigh', 'Added shoulder padding on an already built frame'],
  },
  broad: {
    works: ['Strong vertical lines — placket, lapel, crease', 'Deeper V — shawl cardigans, 3-roll-2 lapels'],
    lookFor: ['Jacket hem to the full seat — never above', 'Mid-rise, straight leg (19–20cm opening) for balance'],
    avoid: ['Horizontal stripes and flapped chest pockets', 'Short, boxy jackets'],
  },
};

/** Concise what-suits-your-frame bullets — deterministic AI fallback. */
export function composeProportionBullets(profile: Partial<StyleProfile>): ProportionBullets {
  const out: ProportionBullets = { works: [], lookFor: [], avoid: [] };
  const merge = (b?: ProportionBullets) => {
    if (!b) return;
    out.works.push(...b.works);
    out.lookFor.push(...b.lookFor);
    out.avoid.push(...b.avoid);
  };
  if (profile.height_range) merge(HEIGHT_BULLETS[profile.height_range]);
  if (profile.build) merge(BUILD_BULLETS[profile.build]);
  if (profile.fit_notes) out.lookFor.push(`Your note — \u201c${profile.fit_notes}\u201d — repeat it to any tailor`);
  return out;
}

// ---------------------------------------------------------------------------
// Persistence — style_profile row + style_rubric sync
// ---------------------------------------------------------------------------

// Literal `window.__workspaceDb` references below matter: the platform
// compiler auto-injects the WorkspaceDB SDK when it sees that token in
// app source.
function db(): any {
  return window.__workspaceDb;
}

// Serialize writes per domain so rapid taps cannot race fetch-then-insert,
// without unrelated writes causing global head-of-line blocking.
function makeQueue() {
  let queue: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = queue.then(job, job);
    queue = next.catch(() => undefined);
    return next;
  };
}

const enqueue = makeQueue();
const enqueueProfile = makeQueue();
const enqueuePrefs = makeQueue();
let profileWritesPending = 0;

function parseJsonish<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function normalizeProfile(row: any): StyleProfile {
  return {
    ...row,
    archetypes: parseJsonish<string[]>(row.archetypes, []),
    occasions: parseJsonish<string[]>(row.occasions, []),
    lifestyle: parseJsonish<Lifestyle>(row.lifestyle, {}),
  } as StyleProfile;
}

/** Slots that moved out of Accessories when Bags and Hats became categories (v3). */
const SLOT_CATEGORY_MOVES: Record<string, string> = {
  bag: 'bags',
  'flat-cap': 'hats',
};

export function normalizePiece(row: any): WardrobePiece {
  const slot = (row.slot ?? null) as string | null;
  const inferred = categorizeItem(row.name || '');
  const inferredEspadrilles = inferred.slot === 'espadrilles' && (!slot || row.category === 'other');
  const normalizedSlot = inferredEspadrilles ? 'espadrilles' : slot;
  const movedCategory = normalizedSlot && row.category === 'accessories' ? SLOT_CATEGORY_MOVES[normalizedSlot] : undefined;
  return {
    ...row,
    category: inferredEspadrilles ? 'shoes' : movedCategory || row.category,
    slot: normalizedSlot,
    colors: parseJsonish<string[]>(row.colors, []),
    seasons: parseJsonish<string[]>(row.seasons, []),
    occasions: parseJsonish<string[]>(row.occasions, []),
  } as WardrobePiece;
}

function parseRubricArchetypes(aesthetic: unknown, current: string[]): string[] {
  if (typeof aesthetic !== 'string' || !aesthetic.trim()) return current;
  const explicit = aesthetic.match(/style archetypes?\s*:\s*([^\n.]+)/i);
  const haystack = (explicit?.[1] || aesthetic).toLowerCase();
  const found = ARCHETYPES
    .filter((a) => haystack.includes(a.label.toLowerCase()) || haystack.includes(a.id.toLowerCase()))
    .map((a) => a.id);
  if (found.length === 0) return current;
  // Beau is instructed to write the complete list after "Style archetypes:";
  // older free-form rubric notes are additive so they cannot erase a profile.
  return explicit ? found : Array.from(new Set([...current, ...found]));
}

/**
 * Read the structured profile and reconcile archetype edits Beau made through
 * save_rubric. This closes the former one-way sync where app edits reached
 * chat, but chat edits never came back to Your Style.
 */
async function fetchStructuredProfile(): Promise<StyleProfile | null> {
  const { data } = await db().from('style_profile').orderBy('created_at', 'asc').limit(1).get();
  const row = (data && data[0]) || null;
  return row ? normalizeProfile(row) : null;
}

export async function fetchProfile(): Promise<StyleProfile | null> {
  const profile = await fetchStructuredProfile();
  if (!profile) return null;

  // A local structured edit is authoritative until it has been mirrored into
  // the rubric. Reading the older rubric during that window would revert it.
  if (profileWritesPending > 0) return profile;

  try {
    const { data: rubricRows } = await db().from('style_rubric').orderBy('created_at', 'asc').limit(1).get();
    const rubric = rubricRows?.[0];
    const current = Array.isArray(profile.archetypes) ? profile.archetypes : [];
    const reconciled = parseRubricArchetypes(rubric?.aesthetic, current);
    if (JSON.stringify(reconciled) !== JSON.stringify(current)) {
      await db().from('style_profile').update(profile.id, { archetypes: JSON.stringify(reconciled) });
      profile.archetypes = reconciled;
    }
  } catch (e) {
    console.warn('[Ethaion] rubric-to-profile reconciliation failed (non-fatal):', e);
  }
  return profile;
}

/**
 * Insert-or-update the visitor's single style_profile row, then sync the
 * result into style_rubric so Beau's get_rubric sees it. Returns the fresh
 * profile.
 */
export function saveProfile(patch: Record<string, unknown>): Promise<StyleProfile | null> {
  profileWritesPending += 1;
  const write = enqueueProfile(async () => {
    const serialized: Record<string, unknown> = { ...patch };
    for (const key of ['archetypes', 'occasions', 'lifestyle']) {
      if (key in serialized && typeof serialized[key] !== 'string' && serialized[key] != null) {
        serialized[key] = JSON.stringify(serialized[key]);
      }
    }

    const existing = await fetchStructuredProfile();
    if (existing) {
      await db().from('style_profile').update(existing.id, serialized);
    } else {
      await db().from('style_profile').insert(serialized);
    }

    // Read back only the row just written. WorkspaceDB can be briefly
    // read-after-write stale on a brand-new guest session, so retry before
    // handing onboarding a null profile (which would strand the user on the
    // final step instead of opening the Wardrobe).
    let fresh = await fetchStructuredProfile();
    for (let attempt = 0; !fresh && attempt < 3; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 80 * (attempt + 1)));
      fresh = await fetchStructuredProfile();
    }
    if (fresh) {
      try {
        await syncRubric(fresh);
      } catch (e) {
        console.warn('[Ethaion] rubric sync failed (non-fatal):', e);
      }
      try {
        window.dispatchEvent(new CustomEvent('ethaion:profile', { detail: { profile: fresh } }));
      } catch { /* non-fatal */ }
    }
    return fresh;
  });
  return write.finally(() => {
    profileWritesPending -= 1;
  });
}

// ---------------------------------------------------------------------------
// Style prefs — secondhand openness, display currency, free-text context
// ---------------------------------------------------------------------------

export function secondhandAllowed(prefs: StylePrefs | null | undefined): boolean {
  return prefs?.secondhand === 'yes' || prefs?.secondhand === 'sometimes';
}

export async function fetchPrefs(): Promise<StylePrefs | null> {
  const { data } = await db().from('style_prefs').orderBy('created_at', 'asc').limit(1).get();
  const row = ((data && data[0]) || null) as StylePrefs | null;
  if (row) setActiveCurrency(row.currency);
  return row;
}

/** Upsert the visitor's single style_prefs row; syncs the rubric + broadcasts. */
export function savePrefs(patch: Partial<Omit<StylePrefs, 'id'>>): Promise<StylePrefs | null> {
  return enqueuePrefs(async () => {
    const { data } = await db().from('style_prefs').orderBy('created_at', 'asc').limit(1).get();
    const existing = ((data && data[0]) || null) as StylePrefs | null;
    if (existing) {
      await db().from('style_prefs').update(existing.id, patch);
    } else {
      await db().from('style_prefs').insert(patch);
    }
    const { data: freshData } = await db().from('style_prefs').orderBy('created_at', 'asc').limit(1).get();
    const fresh = ((freshData && freshData[0]) || null) as StylePrefs | null;
    if (fresh) {
      setActiveCurrency(fresh.currency);
      try {
        await syncRubricPrefs(fresh);
      } catch (e) {
        console.warn('[Ethaion] prefs rubric sync failed (non-fatal):', e);
      }
      try {
        window.dispatchEvent(new CustomEvent('ethaion:prefs', { detail: { prefs: fresh } }));
      } catch { /* non-fatal */ }
    }
    return fresh;
  });
}

// ---------------------------------------------------------------------------
// Measurements — sizing + body measurements (style_measurements table)
// ---------------------------------------------------------------------------

const enqueueMeasurements = makeQueue();

export async function fetchStyleMeasurements(): Promise<StyleMeasurements | null> {
  try {
    const { data } = await db().from('style_measurements').orderBy('created_at', 'asc').limit(1).get();
    return ((data && data[0]) || null) as StyleMeasurements | null;
  } catch (e) {
    console.warn('[Ethaion] measurements fetch failed (non-fatal):', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extended measurements (measurement_extras) — the deeper optional fields
// The Dossier collects on top of style_measurements. Onboarding never asks
// for these; they are strictly "for those who want to go deeper".
// ---------------------------------------------------------------------------

export interface MeasurementExtras {
  id: number;
  /** Arm length / sleeve, free text (cm or inches). */
  arm_length: string | null;
}

const enqueueExtras = makeQueue();

export async function fetchMeasurementExtras(): Promise<MeasurementExtras | null> {
  try {
    const { data } = await db().from('measurement_extras').orderBy('created_at', 'asc').limit(1).get();
    return ((data && data[0]) || null) as MeasurementExtras | null;
  } catch (e) {
    console.warn('[Ethaion] extended measurements fetch failed (non-fatal):', e);
    return null;
  }
}

export function saveMeasurementExtras(patch: Partial<Omit<MeasurementExtras, 'id'>>): Promise<MeasurementExtras | null> {
  return enqueueExtras(async () => {
    const existing = await fetchMeasurementExtras();
    if (existing) {
      await db().from('measurement_extras').update(existing.id, patch);
    } else {
      await db().from('measurement_extras').insert(patch);
    }
    return fetchMeasurementExtras();
  });
}

/** One readable line for the rubric, e.g. "usually an M (Zara M); shoes UK 9; chest 102cm". */
export function measurementsSummary(m: StyleMeasurements | null, extras?: MeasurementExtras | null): string {
  if (!m && !extras?.arm_length) return '';
  if (!m) return `arm length ${extras?.arm_length}`;
  const bits: string[] = [];
  if (m.clothing_size) bits.push(`usually a ${m.clothing_size}${m.brand_sizes ? ` (${m.brand_sizes})` : ''}`);
  else if (m.brand_sizes) bits.push(`clothing sizes: ${m.brand_sizes}`);
  if (m.shoe_size) bits.push(`shoes ${m.shoe_size_system || 'UK'} ${m.shoe_size}${m.shoe_brand_sizes ? ` (${m.shoe_brand_sizes})` : ''}`);
  else if (m.shoe_brand_sizes) bits.push(`shoe sizes: ${m.shoe_brand_sizes}`);
  const body: string[] = [];
  if (m.chest_cm) body.push(`chest ${m.chest_cm}`);
  if (m.waist_cm) body.push(`waist ${m.waist_cm}`);
  if (m.hips_cm) body.push(`hips ${m.hips_cm}`);
  if (m.inseam_cm) body.push(`inseam ${m.inseam_cm}`);
  if (m.shoulder_cm) body.push(`shoulders ${m.shoulder_cm}`);
  if (extras?.arm_length) body.push(`arm length ${extras.arm_length}`);
  if (body.length > 0) bits.push(body.join(', '));
  return bits.join('; ');
}

/**
 * Upsert the visitor's single style_measurements row, then refresh the
 * rubric's height_build field so Beau's verdicts see the sizes immediately.
 * Broadcasts 'ethaion:measurements' for any mounted screens.
 */
export function saveMeasurements(patch: Partial<Omit<StyleMeasurements, 'id'>>): Promise<StyleMeasurements | null> {
  return enqueueMeasurements(async () => {
    const existing = await fetchStyleMeasurements();
    if (existing) {
      await db().from('style_measurements').update(existing.id, patch);
    } else {
      await db().from('style_measurements').insert(patch);
    }
    const fresh = await fetchStyleMeasurements();
    try {
      const profile = await fetchProfile();
      if (profile) await syncRubric(profile);
    } catch (e) {
      console.warn('[Ethaion] measurements rubric sync failed (non-fatal):', e);
    }
    try {
      window.dispatchEvent(new CustomEvent('ethaion:measurements', { detail: { measurements: fresh } }));
    } catch { /* non-fatal */ }
    return fresh;
  });
}

const PREFS_NOTES_MARKER = '[From his profile]';

/**
 * Brand-loyalty and post-purchase-feedback lines for the rubric notes block:
 * trusted makers Beau should check first, and real outcomes from pieces the
 * user actually bought (Loved it / It was fine / Disappointed).
 */
async function appendLoyaltyAndFeedbackBits(bits: string[]): Promise<void> {
  try {
    const brands = await fetchTrustedBrands();
    if (brands.length > 0) {
      bits.push(
        `Trusted brands he already knows and loves: ${brands.map((b) => b.brand).join(', ')} — check their range first when hunting his gaps, but still offer alternatives where they don't cover a category.`,
      );
    }
  } catch { /* non-fatal */ }
  try {
    const feedback = await fetchPurchaseFeedback();
    const rows = Object.values(feedback).slice(-6);
    const lines: string[] = [];
    for (const f of rows) {
      const meta = feedbackRatingMeta(f.rating);
      const outcome = meta ? meta.line : f.rating;
      const brandBit = f.brand ? ' (' + f.brand + ')' : '';
      let line = (f.piece_name || 'a piece') + brandBit + ': ' + outcome;
      if (f.comment) line = line + ' — “' + f.comment + '”';
      lines.push(line);
    }
    if (lines.length > 0) bits.push('Purchase feedback on pieces he bought — ' + lines.join('; ') + '.');
  } catch { /* non-fatal */ }
}

/**
 * Merge the prefs into the rubric's notes field — under a marker so Beau's
 * own conversational notes above it survive — so chat verdicts respect the
 * secondhand preference, currency, and free-text context.
 */
export async function syncRubricPrefs(prefs: StylePrefs): Promise<void> {
  const bits: string[] = [];
  if (prefs.secondhand === 'yes') {
    bits.push('Open to vintage and secondhand pieces (eBay, Vestiaire Collective) — include them, always labelled as secondhand or vintage.');
  } else if (prefs.secondhand === 'sometimes') {
    bits.push('Sometimes open to vintage/secondhand for the right piece — show sparingly, always clearly labelled.');
  } else if (prefs.secondhand === 'no') {
    bits.push('New pieces only — never recommend secondhand or vintage.');
  }
  if (prefs.currency && prefs.currency !== 'GBP') bits.push(`Quote prices in ${prefs.currency}.`);
  if (prefs.free_text && prefs.free_text.trim()) bits.push(`In his own words: \u201c${prefs.free_text.trim()}\u201d`);
  await appendLoyaltyAndFeedbackBits(bits);

  const { data } = await db().from('style_rubric').orderBy('created_at', 'asc').limit(1).get();
  const existing = (data && data[0]) || null;
  const currentNotes: string = typeof existing?.notes === 'string' ? existing.notes : '';
  const kept = currentNotes.split(PREFS_NOTES_MARKER)[0].trim();
  const composed = bits.length > 0
    ? `${kept ? kept + '\n\n' : ''}${PREFS_NOTES_MARKER} ${bits.join(' ')}`
    : kept;
  if (existing) {
    await db().from('style_rubric').update(existing.id, { notes: composed || null });
  } else if (composed) {
    await db().from('style_rubric').insert({ notes: composed });
  }
}

// ---------------------------------------------------------------------------
// Category budgets — per-category price filters (home screen)
// ---------------------------------------------------------------------------

export async function fetchCategoryBudgets(): Promise<Record<string, CategoryBudget>> {
  const { data } = await db().from('category_budgets').orderBy('created_at', 'asc').limit(50).get();
  const map: Record<string, CategoryBudget> = {};
  for (const row of data || []) map[row.category] = row as CategoryBudget;
  return map;
}

/** Upsert one category's budget row; null min+max clears the filter. */
export function saveCategoryBudget(
  category: string,
  min_price: number | null,
  max_price: number | null,
): Promise<Record<string, CategoryBudget>> {
  return enqueue(async () => {
    const existing = await fetchCategoryBudgets();
    const row = existing[category];
    if (row) {
      if (min_price == null && max_price == null) {
        await db().from('category_budgets').delete(row.id);
      } else {
        await db().from('category_budgets').update(row.id, { min_price, max_price });
      }
    } else if (min_price != null || max_price != null) {
      await db().from('category_budgets').insert({ category, min_price, max_price });
    }
    const fresh = await fetchCategoryBudgets();
    try {
      await syncRubricBudgets(fresh);
    } catch (e) {
      console.warn('[Ethaion] budget rubric sync failed (non-fatal):', e);
    }
    return fresh;
  });
}

async function upsertRubricFields(fields: Record<string, string>): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const { data } = await db().from('style_rubric').orderBy('created_at', 'asc').limit(1).get();
  const existing = (data && data[0]) || null;
  if (existing) {
    await db().from('style_rubric').update(existing.id, fields);
  } else {
    await db().from('style_rubric').insert(fields);
  }
}

/** Push the per-category budgets into the rubric's budget field for Beau. */
export async function syncRubricBudgets(budgets: Record<string, CategoryBudget>): Promise<void> {
  const lines = WARDROBE_CATEGORIES
    .map((c) => ({ c, b: budgets[c.id] }))
    .filter(({ b }) => b && (b.min_price != null || b.max_price != null))
    .map(({ c, b }) => `${c.label} ${formatBudget(b)}`);
  const budgetText = lines.length > 0
    ? `Per-category budget guide: ${lines.join('; ')}. A guide, not a hard ceiling; will stretch when quality-to-price is exceptional.`
    : 'No per-category budgets set yet.';
  await upsertRubricFields({ budget: budgetText });
}

/**
 * Compose readable rubric text from the structured profile and upsert it into
 * the style_rubric row Beau reads via get_rubric. Only fields the profile
 * actually has are written, so Beau's own conversational notes survive.
 */
export async function syncRubric(profile: StyleProfile): Promise<void> {
  const fields: Record<string, string> = {};

  // Measurements ride along in height_build so Beau sizes his verdicts.
  let measurements: StyleMeasurements | null = null;
  let extras: MeasurementExtras | null = null;
  try {
    measurements = await fetchStyleMeasurements();
    extras = await fetchMeasurementExtras();
  } catch { /* non-fatal */ }
  const sizesLine = measurementsSummary(measurements, extras);
  if (profile.height_range || profile.build || profile.fit_notes || sizesLine) {
    const bits: string[] = [];
    if (profile.height_range) bits.push(label.height(profile.height_range));
    if (profile.build) bits.push(`${label.build(profile.build).toLowerCase()} build`);
    if (profile.fit_notes) bits.push(profile.fit_notes);
    if (sizesLine) bits.push(sizesLine);
    fields.height_build = bits.join(', ');
  }

  if (profile.skin_tone) {
    const tone = SKIN_TONES.find((t) => t.id === profile.skin_tone);
    fields.skin_tone = tone ? `${tone.label} skin, ${tone.undertone}` : profile.skin_tone;
  }

  if (profile.materials) {
    const m = MATERIAL_OPTIONS.find((o) => o.id === profile.materials);
    fields.materials = m ? `${m.label} — ${m.sub || ''}`.trim() : profile.materials;
  }

  const aestheticBits: string[] = [];
  if (profile.intent) aestheticBits.push(`Goal: ${label.intent(profile.intent).toLowerCase()}.`);
  if (Array.isArray(profile.archetypes) && profile.archetypes.length > 0) {
    aestheticBits.push(`Style archetypes: ${profile.archetypes.map((a) => label.archetype(a)).join(', ')}.`);
  }
  if (Array.isArray(profile.occasions) && profile.occasions.length > 0) {
    aestheticBits.push(`Dresses for: ${profile.occasions.map((o) => label.occasion(o)).join(', ')}.`);
  }
  const life = profile.lifestyle || {};
  if (life.setting || life.travel || life.city) {
    const lifeBits: string[] = [];
    if (life.city) lifeBits.push(`based in ${life.city}`);
    if (life.setting) lifeBits.push(`${label.setting(life.setting).toLowerCase()} life`);
    if (life.travel) lifeBits.push(label.travel(life.travel).toLowerCase());
    aestheticBits.push(`Lifestyle: ${lifeBits.join(', ')}.`);
  }
  aestheticBits.push('Classic/timeless over trend-led — must still feel right at 45.');
  fields.aesthetic = aestheticBits.join(' ');

  await upsertRubricFields(fields);
}

/** Clear all profile dimensions so onboarding runs again (keeps the row). */
export function resetProfile(): Promise<void> {
  return enqueue(async () => {
    const existing = await fetchProfile();
    if (!existing) return;
    await db().from('style_profile').update(existing.id, {
      intent: null,
      archetypes: null,
      occasions: null,
      lifestyle: null,
      height_range: null,
      build: null,
      fit_notes: null,
      skin_tone: null,
      materials: null,
      budget_range: null,
      onboarding_step: 0,
      onboarding_complete: false,
    });
  });
}

// ---------------------------------------------------------------------------
// Wardrobe pieces — inserts, deletes, legacy migration
// ---------------------------------------------------------------------------

export interface NewPiece {
  name: string;
  category: string;
  slot: string | null;
  brand?: string | null;
  colors?: string[];
  seasons?: string[];
  occasions?: string[];
  photo_url?: string | null;
  /** Material(s) display string, e.g. 'Cotton', 'Waxed cotton'. Stored in the piece_materials companion table. */
  material?: string | null;
  /** Size label, e.g. 'M', '32', 'UK 9'. Stored in the piece_details companion table. */
  size?: string | null;
  /** Free-form fit/provenance note. Stored in the piece_details companion table. */
  notes?: string | null;
  /** Structured pattern id from PATTERN_OPTIONS. Stored in the piece_attributes companion table. */
  pattern?: string | null;
  /** True when the user overrode the machine-generated name. Stored in piece_attributes. */
  name_is_custom?: boolean;
  /** Photo provenance for the product-photo pipeline, Pass Fifteen: pipeline / generated / custom. Stored in piece_photo_meta. */
  photo_source?: string | null;
  /** Product-page URL the piece was logged from (Search/URL flow, Pass Forty-Six B). Stored in piece_sources. */
  source_url?: string | null;
}

// ---------------------------------------------------------------------------
// Materials — companion table (wardrobe_pieces cannot gain a column)
// ---------------------------------------------------------------------------

/** Sensible default material per canonical slot (fallback when the AI doesn't supply one). */
const SLOT_MATERIALS: Record<string, string> = {
  ocbd: 'Cotton oxford', 'dress-shirt': 'Cotton poplin', 'casual-shirt': 'Cotton', polo: 'Cotton piqué', tee: 'Cotton jersey',
  chinos: 'Cotton twill', jeans: 'Denim', 'high-rise-trousers': 'Wool', trousers: 'Wool', shorts: 'Cotton',
  loafers: 'Leather', 'deck-shoes': 'Leather', derbies: 'Leather', boots: 'Leather', sneakers: 'Canvas & rubber',
  'field-jacket': 'Cotton sateen', 'waxed-jacket': 'Waxed cotton', blazer: 'Wool', harrington: 'Cotton',
  'leather-jacket': 'Leather', 'formal-overcoat': 'Wool', 'casual-rain-jacket': 'Waxed cotton', 'structured-trench': 'Cotton gabardine', overcoat: 'Wool', raincoat: 'Bonded cotton',
  crewneck: 'Wool', cardigan: 'Wool', sweatshirt: 'Loopback cotton',
  suit: 'Wool', 'dinner-suit': 'Wool', tie: 'Silk',
  belt: 'Leather', scarf: 'Wool', gloves: 'Leather',
  thermal: 'Cotton waffle', 'long-johns': 'Cotton', undershirt: 'Cotton',
  bag: 'Canvas & leather', briefcase: 'Leather', backpack: 'Canvas',
  'flat-cap': 'Wool tweed', beanie: 'Wool', 'brimmed-hat': 'Wool felt',
};

export function defaultMaterial(slot: string | null): string {
  return (slot && SLOT_MATERIALS[slot]) || '';
}

/** Fetch the visitor's piece-id → material map from the companion table. */
export async function fetchMaterials(): Promise<Record<number, string>> {
  try {
    const { data } = await db().from('piece_materials').orderBy('created_at', 'asc').limit(200).get();
    const map: Record<number, string> = {};
    for (const row of data || []) {
      if (row.piece_id != null && typeof row.material === 'string') map[row.piece_id] = row.material;
    }
    return map;
  } catch (e) {
    console.warn('[Ethaion] materials fetch failed (non-fatal):', e);
    return {};
  }
}

/** Upsert one piece's material row; empty string / null clears it. */
export async function setPieceMaterial(pieceId: number, material: string | null): Promise<void> {
  const clean = formatMaterialName((material || '').trim());
  const { data } = await db().from('piece_materials').eq('piece_id', pieceId).limit(5).get();
  const existing = (data && data[0]) || null;
  if (existing) {
    if (clean) await db().from('piece_materials').update(existing.id, { material: clean });
    else await db().from('piece_materials').delete(existing.id);
  } else if (clean) {
    await db().from('piece_materials').insert({ piece_id: pieceId, material: clean });
  }
}

/** Display material for a piece: explicit row first, slot default as fallback. */
export function materialFor(piece: WardrobePiece, materials: Record<number, string>): string {
  return materials[piece.id] || defaultMaterial(piece.slot);
}

/** A light-touch explainer for technical fabric terms shown throughout the UI. */
const FABRIC_EXPLAINERS: Array<[RegExp, string]> = [
  [/cotton jersey/i, 'Soft knitted cotton — the standard fabric for T-shirts.'],
  [/oxford(?: cloth)?/i, 'A structured basket-weave cotton traditionally used for button-down shirts.'],
  [/piqu[eé]/i, 'A breathable cotton knit with a subtle raised texture, common in polo shirts.'],
  [/poplin/i, 'A smooth, tightly woven shirting fabric with a crisp, light hand.'],
  [/twill/i, 'A durable diagonal weave that drapes well and resists creasing.'],
  [/sateen|satin/i, 'A smooth-faced weave with a subtle lustre.'],
  [/hopsack/i, 'An airy basket-weave wool often used for versatile blazers.'],
  [/flannel/i, 'A softly brushed fabric that traps warmth without looking bulky.'],
  [/shetland/i, 'Springy, textured wool prized for warmth and long wear.'],
  [/lambswool/i, 'Soft first-shearing wool: warm, light and less coarse than standard wool.'],
  [/worsted/i, 'Smooth, tightly spun wool that wears cleanly and holds a crease.'],
  [/selvedge/i, 'Denim woven on narrow looms with a finished self-edge for durability.'],
  [/ventile/i, 'Densely woven cotton that swells when wet to resist wind and rain.'],
  [/waxed cotton/i, 'Cotton treated with wax for weather resistance; it can be rewaxed for years.'],
  [/gabardine/i, 'A tightly woven, weather-resistant twill developed for outerwear.'],
  [/loopback/i, 'Cotton knit with soft loops inside for breathable sweatshirt warmth.'],
  [/grenadine/i, 'An open, textured silk weave used for understated ties.'],
];

export function fabricExplanation(material: string): string | null {
  return FABRIC_EXPLAINERS.find(([pattern]) => pattern.test(material))?.[1] || null;
}

/** Material-first care advice, with a category fallback when material is unknown. */
export function careInstructions(piece: Pick<WardrobePiece, 'category' | 'slot'>, material: string): string[] {
  const m = material.toLowerCase();
  if (/waxed cotton/.test(m)) return ['Brush off surface dirt when dry.', 'Spot clean only — never machine wash or dry clean.', 'Reproof with garment wax when the finish looks dry.'];
  if (/leather|suede/.test(m)) return ['Brush or wipe clean after wear.', 'Condition smooth leather sparingly; use a suede brush on suede.', 'Keep away from direct heat and let damp pieces dry naturally.'];
  if (/wool|cashmere|shetland|lambswool|flannel/.test(m)) return ['Air between wears and brush gently.', 'Hand wash cold or use a specialist wool cycle only when needed.', 'Reshape and lay flat to dry; store folded with cedar.'];
  if (/linen/.test(m)) return ['Wash cool on a gentle cycle.', 'Air dry and press while slightly damp.', 'Expect natural creasing — it is part of linen’s character.'];
  if (/silk/.test(m)) return ['Spot clean carefully or use a trusted specialist cleaner.', 'Keep away from perfume, moisture and prolonged sunlight.', 'Store loosely rolled or hanging without a tight knot.'];
  if (/cotton|denim|canvas|jersey|twill|oxford|poplin/.test(m)) return ['Machine wash cold with similar colours.', 'Avoid high heat to limit shrinkage and fibre damage.', 'Air dry where possible; press or steam on a medium setting.'];
  if (piece.category === 'shoes') return ['Brush after wear and let them rest for a day.', 'Use cedar shoe trees once dry.', 'Clean, condition and polish regularly; resole before the welt is damaged.'];
  if (piece.category === 'outerwear') return ['Air and brush after wear.', 'Spot clean first; use a specialist cleaner only when necessary.', 'Store on a broad hanger away from heat and direct sun.'];
  if (piece.category === 'hats') return ['Brush gently after wear.', 'Keep its shape while stored and avoid crushing.', 'Let it dry naturally away from direct heat.'];
  return ['Check the maker’s care label before cleaning.', 'Air between wears and spot clean first.', 'Store clean, dry and out of direct sunlight.'];
}

export function careReminderSuggestion(piece: Pick<WardrobePiece, 'category' | 'slot'>, material: string): { text: string; days: number } {
  const m = material.toLowerCase();
  if (piece.category === 'shoes' || /leather|suede/.test(m)) return { text: 'Clean, condition or polish this piece', days: 42 };
  if (/wool|cashmere|shetland|lambswool/.test(m)) return { text: 'Air, brush and check the cedar protection', days: 90 };
  if (/waxed cotton/.test(m)) return { text: 'Check whether the wax finish needs reproofing', days: 180 };
  if (piece.category === 'outerwear') return { text: 'Brush, spot clean and inspect before storage', days: 90 };
  return { text: 'Give this piece its routine care check', days: 60 };
}

/** Pattern + name-provenance companion rows (piece_attributes table, Pass Fourteen). */
export interface PieceAttributes {
  id: number;
  piece_id: number;
  /** Structured pattern id from PATTERN_OPTIONS, e.g. 'striped'. */
  pattern: string | null;
  /** True when the user manually overrode the machine-generated name. */
  name_is_custom: boolean | null;
}

export async function fetchPieceAttributes(): Promise<Record<number, PieceAttributes>> {
  try {
    const { data } = await db().from('piece_attributes').orderBy('created_at', 'asc').limit(200).get();
    const out: Record<number, PieceAttributes> = {};
    for (const row of data || []) if (row.piece_id != null) out[Number(row.piece_id)] = row as PieceAttributes;
    return out;
  } catch (e) {
    console.warn('[Ethaion] piece attributes fetch failed (non-fatal):', e);
    return {};
  }
}

export async function setPieceAttributes(
  pieceId: number,
  patch: { pattern?: string | null; name_is_custom?: boolean },
): Promise<void> {
  const { data } = await db().from('piece_attributes').eq('piece_id', pieceId).limit(2).get();
  const existing = data?.[0];
  const clean = {
    ...(patch.pattern !== undefined ? { pattern: patch.pattern || null } : {}),
    ...(patch.name_is_custom !== undefined ? { name_is_custom: !!patch.name_is_custom } : {}),
  };
  if (Object.keys(clean).length === 0) return;
  if (existing) await db().from('piece_attributes').update(existing.id, clean);
  else await db().from('piece_attributes').insert({ piece_id: pieceId, ...clean });
}

export async function fetchPieceDetails(): Promise<Record<number, PieceDetails>> {
  try {
    const { data } = await db().from('piece_details').orderBy('created_at', 'asc').limit(200).get();
    const out: Record<number, PieceDetails> = {};
    for (const row of data || []) if (row.piece_id != null) out[Number(row.piece_id)] = row as PieceDetails;
    return out;
  } catch (e) {
    console.warn('[Ethaion] piece details fetch failed (non-fatal):', e);
    return {};
  }
}

export async function setPieceDetails(pieceId: number, patch: { size?: string | null; notes?: string | null }): Promise<void> {
  const { data } = await db().from('piece_details').eq('piece_id', pieceId).limit(2).get();
  const existing = data?.[0];
  const clean = {
    ...(patch.size !== undefined ? { size: patch.size?.trim() || null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
  };
  if (existing) await db().from('piece_details').update(existing.id, clean);
  else await db().from('piece_details').insert({ piece_id: pieceId, ...clean });
}

// ---------------------------------------------------------------------------
// Source links (piece_sources, Pass Forty-Six B) — pieces logged via the
// Search/URL flow keep the product page they came from, shown in the piece
// detail view as a styled "View source" / "See on {retailer}" link with a
// "Change" affordance. Photo-logged pieces have no row here.
// ---------------------------------------------------------------------------

export interface PieceSource {
  id: number;
  piece_id: number;
  source_url: string;
  /** Display label — the retailer/brand name when detectable, else null. */
  label: string | null;
}

/** Well-known menswear retailer domains → proper display names. */
const RETAILER_NAMES: Record<string, string> = {
  jcrew: 'J.Crew', mrporter: 'Mr Porter', endclothing: 'End Clothing', drakes: "Drake's",
  trunkclothiers: 'Trunk Clothiers', nomanwalksalone: 'No Man Walks Alone', therake: 'The Rake',
  permanentstyle: 'Permanent Style', barbour: 'Barbour', brooksbrothers: 'Brooks Brothers',
  ralphlauren: 'Ralph Lauren', uniqlo: 'Uniqlo', sunspel: 'Sunspel', johnsimons: 'John Simons',
  oipolloi: 'Oi Polloi', beams: 'Beams', ebay: 'eBay', vestiairecollective: 'Vestiaire Collective',
  selfedge: 'Self Edge', unionmadegoods: 'Unionmade', clutchcafe: 'Clutch Cafe', farfetch: 'Farfetch',
  matchesfashion: 'Matches', yoox: 'YOOX', asos: 'ASOS', grailed: 'Grailed',
};

/**
 * Derive a human label for a source link: a known retailer name, the piece's
 * own brand when the domain clearly belongs to it, else the title-cased
 * domain base ("anglo-italian.com" becomes "Anglo-Italian"). '' when
 * unreadable — the caller falls back to the plain "View source" label.
 */
export function sourceLinkLabel(url: string, brand?: string | null): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    const base = host.split('.')[0] || '';
    const slug = base.replace(/[^a-z0-9]/g, '');
    if (RETAILER_NAMES[slug]) return RETAILER_NAMES[slug];
    const brandClean = (brand || '').trim();
    if (brandClean) {
      const brandSlug = brandClean.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (brandSlug.length >= 3 && slug.includes(brandSlug)) return formatBrandName(brandClean);
    }
    if (!base) return '';
    return base
      .split('-')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join('-');
  } catch {
    return '';
  }
}

/** piece_id → source link row, for the piece detail views. */
export async function fetchPieceSources(): Promise<Record<number, PieceSource>> {
  try {
    const { data } = await db().from('piece_sources').orderBy('created_at', 'asc').limit(200).get();
    const out: Record<number, PieceSource> = {};
    for (const row of data || []) if (row.piece_id != null) out[Number(row.piece_id)] = row as PieceSource;
    return out;
  } catch (e) {
    console.warn('[Ethaion] piece sources fetch failed (non-fatal):', e);
    return {};
  }
}

/** Upsert one piece's source link; an empty URL clears the row entirely. */
export async function setPieceSource(pieceId: number, url: string | null, brand?: string | null): Promise<PieceSource | null> {
  const clean = (url || '').trim();
  const { data } = await db().from('piece_sources').eq('piece_id', pieceId).limit(5).get();
  const existing = data?.[0] || null;
  if (!clean) {
    for (const row of data || []) await db().from('piece_sources').delete(row.id);
    return null;
  }
  const fields = { source_url: clean, label: sourceLinkLabel(clean, brand) || null };
  if (existing) await db().from('piece_sources').update(existing.id, fields);
  else await db().from('piece_sources').insert({ piece_id: pieceId, ...fields });
  const { data: fresh } = await db().from('piece_sources').eq('piece_id', pieceId).limit(1).get();
  return (fresh?.[0] as PieceSource) || null;
}

export async function fetchCareReminder(pieceId: number): Promise<CareReminder | null> {
  const { data } = await db().from('care_reminders').eq('piece_id', pieceId).limit(1).get();
  return (data?.[0] as CareReminder) || null;
}

export async function saveCareReminder(piece: WardrobePiece, material: string, enabled: boolean, frequencyDays: number, text?: string): Promise<CareReminder | null> {
  const existing = await fetchCareReminder(piece.id);
  const suggestion = careReminderSuggestion(piece, material);
  const days = Math.max(1, Math.round(frequencyDays || suggestion.days));
  const patch = {
    enabled,
    frequency_days: days,
    reminder_text: text?.trim() || suggestion.text,
    next_due_at: new Date(Date.now() + days * 86400000).toISOString(),
  };
  if (existing) await db().from('care_reminders').update(existing.id, patch);
  else await db().from('care_reminders').insert({ piece_id: piece.id, ...patch });
  return fetchCareReminder(piece.id);
}

export async function completeCareReminder(reminder: CareReminder): Promise<void> {
  const now = new Date();
  await db().from('care_reminders').update(reminder.id, {
    last_completed_at: now.toISOString(),
    next_due_at: new Date(now.getTime() + Math.max(1, reminder.frequency_days) * 86400000).toISOString(),
  });
}

export function insertPieces(pieces: NewPiece[]): Promise<void> {
  return enqueue(async () => {
    for (const p of pieces) {
      // Resolved once and reused: the row and the warmth band it drives must
      // read the SAME seasons, or an AW-only piece logged without tags gets a
      // year-round temperature band.
      const seasons = p.seasons && p.seasons.length > 0 ? p.seasons : defaultSeasons(p.slot ?? null);
      await db().from('wardrobe_pieces').insert({
        name: p.name,
        category: p.category,
        slot: p.slot ?? null,
        brand: p.brand ? formatBrandName(p.brand) : null,
        colors: JSON.stringify((p.colors ?? []).map(formatColorName)),
        seasons: JSON.stringify(seasons),
        occasions: JSON.stringify(p.occasions && p.occasions.length > 0 ? p.occasions : defaultOccasions(p.slot ?? null)),
        photo_url: p.photo_url ?? null,
      });
      // Companion material row + brand-intelligence log (both non-fatal).
      try {
        const { data } = await db().from('wardrobe_pieces').orderBy('created_at', 'desc').limit(1).get();
        const id = data?.[0]?.id;
        const material = formatMaterialName((p.material || '').trim() || defaultMaterial(p.slot ?? null));
        if (id != null && material) {
          await db().from('piece_materials').insert({ piece_id: id, material });
        }
        // Size + notes captured before saving (Pass Twelve) live in piece_details.
        if (id != null && ((p.size || '').trim() || (p.notes || '').trim())) {
          await db().from('piece_details').insert({
            piece_id: id,
            size: (p.size || '').trim() || null,
            notes: (p.notes || '').trim() || null,
          });
        }
        // Pattern + name provenance (Pass Fourteen) live in piece_attributes.
        if (id != null && ((p.pattern || '').trim() || p.name_is_custom !== undefined)) {
          await db().from('piece_attributes').insert({
            piece_id: id,
            pattern: (p.pattern || '').trim() || null,
            name_is_custom: !!p.name_is_custom,
          });
        }
        // Photo provenance (Pass Nineteen): a fresh insert carries the RAW
        // upload ('original') until settleProductPhoto lands the cleaned
        // canonical image — so an interrupted clean-up is retried by the
        // retroactive sweep instead of being skipped.
        if (id != null && p.photo_url) {
          await db().from('piece_photo_meta').insert({ piece_id: id, source: p.photo_source || 'original' });
        }
        // Source link (Pass Forty-Six B): a piece logged via the Search/URL
        // flow keeps its product-page link; photo-logged pieces have none.
        if (id != null && (p.source_url || '').trim()) {
          await db().from('piece_sources').insert({
            piece_id: id,
            source_url: (p.source_url || '').trim(),
            label: sourceLinkLabel((p.source_url || '').trim(), p.brand || null) || null,
          });
        }
        // LAYER 1 (Beau intelligence overhaul): fire the silent semantic
        // classification in the background — the user never sees it and the
        // save never waits on it. Tags land in piece_semantics; the piece's
        // own name is never touched.
        if (id != null) {
          tagPieceInBackground(Number(id), {
            name: p.name,
            brand: p.brand || null,
            category: p.category,
            slot: p.slot ?? null,
            material: material || null,
            colors: p.colors ?? [],
          });
          // WARMTH METADATA at ingestion (Today weather-reasoning fix): the
          // piece's warmth level and comfortable temperature band, inferred
          // from its category, slot, fabric and construction — never asked of
          // the user. It is what the daily candidate filter reads.
          recordWarmthInBackground(
            Number(id),
            {
              category: p.category,
              slot: p.slot ?? null,
              name: p.name,
              seasons,
            },
            material || null,
          );
        }
      } catch (e) {
        console.warn('[Ethaion] material row failed (non-fatal):', e);
      }
      if (p.brand) logBrand({ brand: p.brand, source: 'wardrobe', item_name: p.name, category: p.category });
    }
  });
}

export async function deletePiece(id: number): Promise<void> {
  await db().from('wardrobe_pieces').delete(id);
  for (const table of ['piece_materials', 'piece_details', 'piece_attributes', 'care_reminders', 'piece_value', 'piece_photo_meta', 'piece_photo_originals', 'piece_sources', 'piece_semantics', 'piece_warmth']) {
    try {
      const { data } = await db().from(table).eq('piece_id', id).limit(10).get();
      for (const row of data || []) await db().from(table).delete(row.id);
    } catch { /* non-fatal companion cleanup */ }
  }
}

/** Patch a logged piece — rename for specificity, recategorise, or retag. */
export async function updatePiece(
  id: number,
  patch: Partial<Pick<NewPiece, 'name' | 'brand' | 'category' | 'slot'>> & {
    colors?: string[];
    seasons?: string[];
    occasions?: string[];
    material?: string | null;
    pattern?: string | null;
    name_is_custom?: boolean;
  },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.brand !== undefined) fields.brand = patch.brand ? formatBrandName(patch.brand) : null;
  if (patch.category !== undefined) fields.category = patch.category;
  if (patch.slot !== undefined) fields.slot = patch.slot ?? null;
  if (patch.colors !== undefined) fields.colors = JSON.stringify(patch.colors.map(formatColorName));
  if (patch.seasons !== undefined) fields.seasons = JSON.stringify(patch.seasons);
  if (patch.occasions !== undefined) fields.occasions = JSON.stringify(patch.occasions);
  if (Object.keys(fields).length > 0) {
    await db().from('wardrobe_pieces').update(id, fields);
  }
  if (patch.material !== undefined) {
    try {
      await setPieceMaterial(id, patch.material);
    } catch (e) {
      console.warn('[Ethaion] material update failed (non-fatal):', e);
    }
  }
  if (patch.pattern !== undefined || patch.name_is_custom !== undefined) {
    try {
      await setPieceAttributes(id, { pattern: patch.pattern, name_is_custom: patch.name_is_custom });
    } catch (e) {
      console.warn('[Ethaion] attributes update failed (non-fatal):', e);
    }
  }
  // LAYER 1 re-tag: an edit that changes the piece's MEANING (name, category,
  // type, colours or material) refreshes its semantic tags in the background.
  if (
    patch.name !== undefined ||
    patch.category !== undefined ||
    patch.slot !== undefined ||
    patch.material !== undefined ||
    patch.colors !== undefined ||
    patch.seasons !== undefined
  ) {
    // The warmth band is derived from the same fields, so it is re-derived
    // alongside the semantic tags.
    void refreshPieceWarmth(id);
  }
  if (
    patch.name !== undefined ||
    patch.category !== undefined ||
    patch.slot !== undefined ||
    patch.material !== undefined ||
    patch.colors !== undefined
  ) {
    void retagPiece(id);
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection — gentle, not aggressive (shared by every add flow)
// ---------------------------------------------------------------------------

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length > 1),
  );
}

/** Best-effort match: same slot/category with shared colour or similar name. */
export function findLikelyDuplicate(
  candidate: { name: string; category: string; slot?: string | null; colors?: string[] | null },
  owned: WardrobePiece[],
): WardrobePiece | null {
  const candTokens = nameTokens(candidate.name);
  const candColors = new Set((candidate.colors || []).map((c) => c.toLowerCase()));
  for (const piece of owned) {
    const sameSlot = candidate.slot && piece.slot && candidate.slot === piece.slot;
    const sameCategory = candidate.category === piece.category;
    if (!sameSlot && !sameCategory) continue;
    const pieceColors = (piece.colors || []).map((c) => c.toLowerCase());
    const colorOverlap = pieceColors.some((c) => candColors.has(c));
    const pieceTokens = nameTokens(piece.name);
    let shared = 0;
    for (const t of candTokens) if (pieceTokens.has(t)) shared += 1;
    const tokenSimilarity = shared / Math.max(1, Math.min(candTokens.size, pieceTokens.size));
    if (sameSlot && (colorOverlap || tokenSimilarity >= 0.5)) return piece;
    if (sameCategory && tokenSimilarity >= 0.75) return piece;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Duplicate merging — for entries ALREADY logged (the add-flow prompt only
// catches new pieces). Exact-name copies auto-merge on load (the "m43 field
// jacket twice with conflicting tags" bug); near-matches surface in the
// wardrobe's side-by-side duplicate review card.
// ---------------------------------------------------------------------------

export interface DuplicatePair {
  a: WardrobePiece;
  b: WardrobePiece;
}

/** Stable key for a pair — used to persist "they're different" dismissals. */
export function dupePairKey(a: WardrobePiece, b: WardrobePiece): string {
  return `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
}

/**
 * Likely-duplicate pairs among EXISTING pieces: same canonical slot, and
 * either a shared colour with similar names, or near-identical names.
 * Deliberately stricter than the add-flow check so two different-coloured
 * OCBDs never get flagged against each other.
 */
export function findExistingDuplicatePairs(pieces: WardrobePiece[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = pieces[i];
      const b = pieces[j];
      if (!a.slot || a.slot !== b.slot) continue;
      const aColors = (a.colors || []).map((c) => c.toLowerCase());
      const bColors = new Set((b.colors || []).map((c) => c.toLowerCase()));
      const colorOverlap = aColors.some((c) => bColors.has(c));
      const at = nameTokens(a.name);
      const bt = nameTokens(b.name);
      let shared = 0;
      for (const t of at) if (bt.has(t)) shared += 1;
      const sim = shared / Math.max(1, Math.min(at.size, bt.size));
      const bothColoured = aColors.length > 0 && bColors.size > 0;
      // Two different colourways of the same garment are NOT duplicates.
      if (bothColoured && !colorOverlap) continue;
      if ((colorOverlap && sim >= 0.5) || sim >= 0.85) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

/**
 * Merge two wardrobe entries into one: the survivor keeps its name and gains
 * the other's brand (when missing), the union of colours and occasion tags,
 * a photo if it lacked one, and corrected seasons for AW-only outerwear.
 * The duplicate row (and its material row) is deleted; the survivor inherits
 * the duplicate's material when it has none of its own.
 */
export async function mergePieces(
  keep: WardrobePiece,
  remove: WardrobePiece,
  materials: Record<number, string> = {},
): Promise<void> {
  const colors = Array.from(
    new Set([...(keep.colors || []), ...(remove.colors || [])].map((c) => c.toLowerCase())),
  ).map(formatColorName);
  const occasions = Array.from(new Set([...(keep.occasions || []), ...(remove.occasions || [])]));
  let seasons = (keep.seasons && keep.seasons.length > 0 ? keep.seasons : remove.seasons) || [];
  if (keep.slot && AW_OUTERWEAR_SLOTS.has(keep.slot)) seasons = ['aw'];
  await db().from('wardrobe_pieces').update(keep.id, {
    brand: keep.brand || remove.brand || null,
    colors: JSON.stringify(colors),
    seasons: JSON.stringify(seasons),
    occasions: JSON.stringify(occasions),
    photo_url: keep.photo_url || remove.photo_url || null,
  });
  if (!materials[keep.id] && materials[remove.id]) {
    try {
      await setPieceMaterial(keep.id, materials[remove.id]);
    } catch { /* non-fatal */ }
  }
  await deletePiece(remove.id);
}

/**
 * One-off audit: auto-merge EXACT duplicates — same slot, same name (case-
 * insensitive) — keeping the copy with a brand (else the oldest) and folding
 * the other's tags in. Fixes the "M-43 Field Jacket logged twice with
 * conflicting season tags" bug. Idempotent; near-matches with different
 * names are NOT touched here — they go through the user-confirmed review.
 */
export async function auditDuplicatePieces(): Promise<boolean> {
  try {
    const { data } = await db().from('wardrobe_pieces').limit(100).get();
    const pieces = ((data || []) as any[]).map(normalizePiece);
    const byKey = new Map<string, WardrobePiece[]>();
    for (const p of pieces) {
      const key = `${p.slot || p.category}|${p.name.trim().toLowerCase()}`;
      const list = byKey.get(key) || [];
      list.push(p);
      byKey.set(key, list);
    }
    let changed = false;
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''));
      const keep = sorted.find((p) => p.brand) || sorted[0];
      const materials = await fetchMaterials();
      for (const extra of sorted) {
        if (extra.id === keep.id) continue;
        await mergePieces(keep, extra, materials);
        changed = true;
      }
    }
    return changed;
  } catch (e) {
    console.warn('[Ethaion] duplicate audit failed (non-fatal):', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Seasonal-logic audit — one-off fixer for mis-tagged AW outerwear
// ---------------------------------------------------------------------------

/** Outerwear slots that are AW pieces, never year-round (e.g. the M-43). */
const AW_OUTERWEAR_SLOTS = new Set(['field-jacket', 'waxed-jacket', 'overcoat', 'leather-jacket']);

/**
 * Fix legacy rows tagged year-round on AW-specific outerwear (the m43 field
 * jacket bug). Idempotent: only touches rows whose seasons still include
 * 'year-round' on an AW-only slot. Returns true when anything changed.
 */
export async function auditSeasonTags(): Promise<boolean> {
  try {
    const { data } = await db().from('wardrobe_pieces').limit(100).get();
    let changed = false;
    for (const row of data || []) {
      const piece = normalizePiece(row);
      if (!piece.slot || !AW_OUTERWEAR_SLOTS.has(piece.slot)) continue;
      const seasons = piece.seasons || [];
      if (seasons.length === 0 || seasons.includes('year-round')) {
        await db().from('wardrobe_pieces').update(piece.id, { seasons: JSON.stringify(['aw']) });
        // The warmth band reads the season tags, so re-derive it here too —
        // otherwise a piece the audit has just called AW-only keeps the
        // year-round temperature band the candidate filter judges it on.
        void refreshPieceWarmth(piece.id);
        changed = true;
      }
    }
    return changed;
  } catch (e) {
    console.warn('[Ethaion] season audit failed (non-fatal):', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pattern-label audit (Pass Twenty-One) — one-off fixer for pieces labelled
// "Patterned …" whose structured pattern field is blank or 'solid'
// ---------------------------------------------------------------------------

/**
 * Fix machine-generated names that claim a pattern the structured data does
 * not have (the "Patterned Button-Down" bug): the label is only allowed to
 * say "Patterned" when piece_attributes.pattern is explicitly set to a
 * non-solid value. User-typed names (name_is_custom) are never touched.
 * Idempotent; returns true when anything changed.
 */
export async function auditPatternLabels(): Promise<boolean> {
  try {
    const attributes = await fetchPieceAttributes();
    const { data } = await db().from('wardrobe_pieces').limit(100).get();
    let changed = false;
    for (const row of data || []) {
      const piece = normalizePiece(row);
      if (!/\bpatterned\b/i.test(piece.name)) continue;
      const attr = attributes[piece.id];
      if (attr?.name_is_custom === true) continue;
      const next = reconcilePatternedName(piece.name, attr?.pattern || null);
      if (next !== piece.name) {
        await db().from('wardrobe_pieces').update(piece.id, { name: next });
        changed = true;
      }
    }
    return changed;
  } catch (e) {
    console.warn('[Ethaion] pattern-label audit failed (non-fatal):', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// On the Radar — the pipeline stage between Scout (research) and Wardrobe (owned)
// ---------------------------------------------------------------------------

export interface RadarItem {
  id: number;
  name: string;
  brand: string | null;
  category: string | null;
  slot: string | null;
  color: string | null;
  size: string | null;
  notes: string | null;
  price_seen: string | null;
  product_url: string | null;
  watch_price: boolean | null;
  watch_restock: boolean | null;
  last_checked_at: string | null;
  last_check_note: string | null;
  source: string | null;
  created_at?: string;
}

export interface NewRadarItem {
  name: string;
  brand?: string | null;
  category?: string | null;
  slot?: string | null;
  color?: string | null;
  size?: string | null;
  notes?: string | null;
  price_seen?: string | null;
  product_url?: string | null;
  watch_price?: boolean;
  watch_restock?: boolean;
  source?: string | null;
}

/** Fired after any Reserve (radar_items) mutation — the Reserve tab's and
 * the Fitting shelf's data caches listen and refresh, so "refresh only when
 * stale" never hides a change the user just made. */
export const RESERVE_CHANGED_EVENT = 'ethaion:reserve-changed';

function notifyReserveChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(RESERVE_CHANGED_EVENT));
  } catch { /* non-fatal */ }
}

export function insertRadarItem(item: NewRadarItem): Promise<void> {
  return enqueue(async () => {
    const guess = categorizeItem(`${item.name} ${item.notes || ''}`);
    await db().from('radar_items').insert({
      name: item.name,
      brand: item.brand ? formatBrandName(item.brand) : null,
      category: item.category ?? guess.category ?? null,
      slot: item.slot ?? (item.category == null || item.category === guess.category ? guess.slot : null),
      color: item.color ? formatColorName(item.color) : null,
      size: item.size ?? null,
      notes: item.notes ?? null,
      price_seen: item.price_seen ?? null,
      product_url: item.product_url ?? null,
      watch_price: item.watch_price ?? false,
      watch_restock: item.watch_restock ?? false,
      source: item.source ?? 'manual',
    });
    if (item.brand) logBrand({ brand: item.brand, source: 'radar', item_name: item.name, category: item.category ?? null, url: item.product_url ?? null });
    notifyReserveChanged();
  });
}

export async function updateRadarItem(id: number, patch: Partial<Omit<RadarItem, 'id' | 'created_at'>>): Promise<void> {
  await db().from('radar_items').update(id, patch);
  notifyReserveChanged();
}

export async function deleteRadarItem(id: number): Promise<void> {
  await db().from('radar_items').delete(id);
  notifyReserveChanged();
}

/**
 * Radar → Wardrobe: mark as owned. Inserts a wardrobe piece, removes the
 * radar row, and returns the freshly created piece (best-effort) so the UI
 * can run the purchase close-the-loop prompt against it.
 */
export async function radarToWardrobe(item: RadarItem): Promise<WardrobePiece | null> {
  const colors = item.color ? [item.color.toLowerCase()] : extractColors(item.name);
  await insertPieces([
    {
      name: item.name,
      brand: item.brand,
      category: item.category || categorizeItem(item.name).category || 'other',
      slot: item.slot ?? categorizeItem(item.name).slot,
      colors,
      size: item.size,
    },
  ]);
  await db().from('radar_items').delete(item.id);
  notifyReserveChanged();
  try {
    const { data } = await db().from('wardrobe_pieces').orderBy('created_at', 'desc').limit(1).get();
    const row = data?.[0] || null;
    return row ? normalizePiece(row) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Trusted brands — the brand-loyalty path ("I always buy Sunspel")
// ---------------------------------------------------------------------------

export interface TrustedBrand {
  id: number;
  brand: string;
  note: string | null;
  source: string | null;
  created_at?: string;
}

export async function fetchTrustedBrands(): Promise<TrustedBrand[]> {
  try {
    const { data } = await db().from('trusted_brands').orderBy('created_at', 'asc').limit(50).get();
    return (data || []) as TrustedBrand[];
  } catch (e) {
    console.warn('[Ethaion] trusted brands fetch failed (non-fatal):', e);
    return [];
  }
}

/** Add a brand-loyalty signal (deduped, case-insensitive) and resync the rubric. */
export function addTrustedBrand(brand: string, source = 'your-style', note: string | null = null): Promise<TrustedBrand[]> {
  return enqueue(async () => {
    const clean = brand.trim();
    if (clean.length >= 2) {
      const existing = await fetchTrustedBrands();
      if (!existing.some((b) => b.brand.toLowerCase() === clean.toLowerCase())) {
        await db().from('trusted_brands').insert({ brand: clean, source, note });
        logBrand({ brand: clean, source: 'trusted', context: 'Marked as a trusted brand' });
      }
    }
    const fresh = await fetchTrustedBrands();
    await resyncProfileNotes();
    return fresh;
  });
}

export function removeTrustedBrand(id: number): Promise<TrustedBrand[]> {
  return enqueue(async () => {
    await db().from('trusted_brands').delete(id);
    const fresh = await fetchTrustedBrands();
    await resyncProfileNotes();
    return fresh;
  });
}

// ---------------------------------------------------------------------------
// Taste references — style inspiration shared with Beau in chat (Pass Six).
// Beau extracts the aesthetic signal underneath (silhouette, shoulder,
// collar, break, colour register, formality, materials) — never the brand or
// influencer identity — and logs it via his log_taste_reference chat tool.
// The log renders in Your Style → Taste References; Beau reads it live on
// every get_rubric call, so removing an entry recalibrates him immediately.
// ---------------------------------------------------------------------------

export interface TasteReference {
  id: number;
  /** How it was shared: 'photo' | 'link' | 'text' | 'voice'. */
  source_type: string;
  /** The shared link, when the input was a URL. */
  source_url: string | null;
  /** Uploaded image/screenshot URL, when the input was a photo. */
  image_url: string | null;
  /** Short preview of the original input — his words, or a one-line description. */
  raw_input: string | null;
  /** The aesthetic signal Beau extracted, e.g. 'soft shoulder, mid-grey flannel, no break'. */
  extracted_signal: string;
  created_at?: string;
}

/** Newest first — the Taste References sub-screen order. */
export async function fetchTasteReferences(): Promise<TasteReference[]> {
  try {
    const { data } = await db().from('taste_references').orderBy('created_at', 'desc').limit(100).get();
    return (data || []) as TasteReference[];
  } catch (e) {
    console.warn('[Ethaion] taste references fetch failed (non-fatal):', e);
    return [];
  }
}

/**
 * Remove one shared reference. Beau reads the log live (his get_rubric tool
 * returns the current rows), so deletion IS the recalibration — the next
 * conversation simply no longer sees that signal.
 */
export function removeTasteReference(id: number): Promise<TasteReference[]> {
  return enqueue(async () => {
    await db().from('taste_references').delete(id);
    return fetchTasteReferences();
  });
}

// ---------------------------------------------------------------------------
// Purchase feedback — close the loop when a Radar piece becomes owned
// ---------------------------------------------------------------------------

export interface PurchaseFeedback {
  id: number;
  piece_id: number | null;
  piece_name: string | null;
  brand: string | null;
  rating: string;
  comment: string | null;
  created_at?: string;
}

export const FEEDBACK_RATINGS: Array<{ id: string; label: string; line: string }> = [
  { id: 'loved', label: 'Loved it', line: 'quality exceeded expectations' },
  { id: 'fine', label: 'It was fine', line: 'did the job, nothing more' },
  { id: 'disappointed', label: 'Disappointed', line: 'fell short of expectations' },
];

export function feedbackRatingMeta(id: string | null | undefined) {
  return FEEDBACK_RATINGS.find((r) => r.id === id) || null;
}

/** piece_id → feedback row, for the wardrobe detail views. */
export async function fetchPurchaseFeedback(): Promise<Record<number, PurchaseFeedback>> {
  try {
    const { data } = await db().from('purchase_feedback').orderBy('created_at', 'asc').limit(200).get();
    const map: Record<number, PurchaseFeedback> = {};
    for (const row of data || []) if (row.piece_id != null) map[Number(row.piece_id)] = row as PurchaseFeedback;
    return map;
  } catch (e) {
    console.warn('[Ethaion] purchase feedback fetch failed (non-fatal):', e);
    return {};
  }
}

/** Upsert one piece's post-purchase rating; feeds the preference profile. */
export function savePurchaseFeedback(
  piece: { id: number; name: string; brand?: string | null },
  rating: string,
  comment: string | null = null,
): Promise<void> {
  return enqueue(async () => {
    const { data } = await db().from('purchase_feedback').eq('piece_id', piece.id).limit(2).get();
    const existing = data?.[0] || null;
    const fields = {
      piece_id: piece.id,
      piece_name: piece.name,
      brand: piece.brand ?? null,
      rating,
      comment: comment?.trim() || null,
    };
    if (existing) await db().from('purchase_feedback').update(existing.id, fields);
    else await db().from('purchase_feedback').insert(fields);
    await resyncProfileNotes();
  });
}

/** Re-compose the rubric's [From his profile] notes from prefs + brands + feedback. */
async function resyncProfileNotes(): Promise<void> {
  try {
    const { data } = await db().from('style_prefs').orderBy('created_at', 'asc').limit(1).get();
    await syncRubricPrefs(((data && data[0]) || {}) as StylePrefs);
  } catch (e) {
    console.warn('[Ethaion] profile notes rubric sync failed (non-fatal):', e);
  }
}

// ---------------------------------------------------------------------------
// Brand intelligence — cumulative, complementary to Beau's live search
// ---------------------------------------------------------------------------

const brandLogSeen = new Set<string>();

/**
 * Log a brand mention into the brand_log table (fire-and-forget, deduped per
 * page load and best-effort against existing rows). Never blocks the UI and
 * never throws — this is background intelligence, not a user-facing feature.
 */
export function logBrand(entry: {
  brand: string;
  source: string;
  item_name?: string | null;
  category?: string | null;
  url?: string | null;
  context?: string | null;
}): void {
  const brand = (entry.brand || '').trim();
  if (brand.length < 2) return;
  const key = `${brand.toLowerCase()}|${entry.source}|${(entry.item_name || '').toLowerCase()}`;
  if (brandLogSeen.has(key)) return;
  brandLogSeen.add(key);
  void (async () => {
    try {
      const { data } = await db().from('brand_log').eq('brand', brand).eq('source', entry.source).limit(10).get();
      const dupe = (data || []).some((r: any) => (r.item_name || '') === (entry.item_name || ''));
      if (dupe) return;
      await db().from('brand_log').insert({
        brand,
        source: entry.source,
        item_name: entry.item_name ?? null,
        category: entry.category ?? null,
        url: entry.url ?? null,
        context: entry.context ?? null,
      });
    } catch (e) {
      console.warn('[Ethaion] brand log failed (non-fatal):', e);
    }
  })();
}

// ---------------------------------------------------------------------------
// Outfit layering — anatomical stacking order for Mix & match
// ---------------------------------------------------------------------------

/**
 * Anatomical layer for a piece: 0 hat → 1 outerwear/suit → 2 knitwear →
 * 3 shirt/top → 3.5 base layer → 4 trousers → 5 shoes → 6 extras.
 * The half-step keeps base layers in the torso zone while rendering them
 * underneath shirts when the visual stack is reversed from skin to shell.
 */
export function outfitLayer(piece: { category: string; slot?: string | null }): number {
  switch (piece.category) {
    case 'hats': return 0;
    case 'outerwear': return 1;
    case 'formalwear': return piece.slot === 'tie' ? 3 : 1;
    case 'knitwear': return 2;
    case 'tops': return 3;
    case 'base-layers': return 3.5;
    case 'bottoms': return 4;
    case 'shoes': return 5;
    default: return 6;
  }
}

export const OUTFIT_LAYER_LABELS: Record<number, string> = {
  0: 'Headwear',
  1: 'Outerwear',
  2: 'Knitwear',
  3: 'Shirt / top',
  3.5: 'Base layer',
  4: 'Trousers',
  5: 'Shoes',
  6: 'Extras',
};

/** Legacy category → v2 category (layers split into knitwear/accessories). */
function migrateCategory(category: string, slot: string | null): { category: string; slot: string | null } {
  if (slot === 'espadrilles') return { category: 'shoes', slot };
  if (category === 'layers') {
    if (slot === 'scarf') return { category: 'accessories', slot: 'scarf' };
    return { category: 'knitwear', slot };
  }
  const known = WARDROBE_CATEGORIES.some((c) => c.id === category);
  return { category: known ? category : 'other', slot };
}

/**
 * One-time client-side migration: copy rows from the legacy `wardrobe_items`
 * table into `wardrobe_pieces` (re-capitalised, colours extracted), then
 * delete the legacy rows so it never re-runs.
 */
export async function migrateLegacyItems(): Promise<boolean> {
  try {
    const { data: existing } = await db().from('wardrobe_pieces').limit(1).get();
    if (existing && existing.length > 0) return false;
    const { data: legacy } = await db().from('wardrobe_items').orderBy('created_at', 'asc').limit(100).get();
    if (!legacy || legacy.length === 0) return false;

    for (const row of legacy) {
      const mapped = migrateCategory(row.category, row.slot ?? null);
      await db().from('wardrobe_pieces').insert({
        name: formatItemName(row.name || ''),
        category: mapped.category,
        slot: mapped.slot,
        brand: null,
        colors: JSON.stringify(extractColors(row.name || '')),
        seasons: JSON.stringify(defaultSeasons(mapped.slot)),
        occasions: JSON.stringify(defaultOccasions(mapped.slot)),
        photo_url: null,
      });
    }
    for (const row of legacy) {
      try {
        await db().from('wardrobe_items').delete(row.id);
      } catch (e) {
        console.warn('[Ethaion] legacy row cleanup failed (non-fatal):', e);
      }
    }
    return true;
  } catch (e) {
    console.warn('[Ethaion] legacy wardrobe migration failed (non-fatal):', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

/** Open the in-space Beau chat from anywhere in an app. */
export function openBeauChat(): void {
  window.dispatchEvent(new CustomEvent('closeApp'));
}

/** Deep-link to another app (e.g. the Wardrobe home to retake onboarding). */
export function openApp(appId: string): void {
  window.dispatchEvent(new CustomEvent('openApp', { detail: { appId } }));
}

/**
 * Switch the Ethaion home app to one of its top-level tabs
 * (wardrobe | curated | scout | radar | saved | your-style). Also opens the
 * home app so it works from anywhere in the shell (chat deep links,
 * standalone screens).
 */
export function goToTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: 'home' } }));
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab } }));
}

// ---------------------------------------------------------------------------
// Funnel analytics (Pass Nine) — lightweight event logging to the platform's
// per-space tracking endpoint. Used for onboarding step completions
// (step_1_complete … step_N_complete) and "Save your profile" taps
// (save_profile_tapped) so drop-off can be reviewed later. Fire-and-forget:
// analytics must never block or break the experience.
// ---------------------------------------------------------------------------

export function trackFunnelEvent(eventType: string, metadata: Record<string, unknown> = {}): void {
  try {
    const spaceId = (window as any).__SPACE_ID__;
    if (!spaceId) return;
    let sessionId: string | null = null;
    try {
      const key = `space_session_${spaceId}`;
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (raw) {
        const session = JSON.parse(raw);
        sessionId = session.workspaceSessionId || session.sessionId || session.id || null;
      }
      if (!sessionId) sessionId = sessionStorage.getItem('space_session_id');
    } catch { /* storage unavailable — skip silently */ }
    if (!sessionId) return;
    let visitorId: string | null = null;
    try { visitorId = localStorage.getItem('audos_visitor_id'); } catch { /* optional */ }
    void fetch(`/api/space/${spaceId}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, visitorId, eventType, metadata }),
    }).catch(() => undefined);
  } catch { /* never throw from analytics */ }
}

// ---------------------------------------------------------------------------
// Scout prefill handoff — lets the Saved tab "promote" an entry into Scout
// even though the Scout tab mounts after the navigation event has fired.
// ---------------------------------------------------------------------------

let pendingScoutPrefill: string | null = null;

/** Queue text for the Scout "find" entry card, then navigate to Scout. */
export function promoteToScout(text: string): void {
  pendingScoutPrefill = text;
  goToTab('scout');
  window.dispatchEvent(new CustomEvent('ethaion:scout-prefill', { detail: { text } }));
}

/** Read-and-clear the queued Scout prefill (called by ScoutTab on mount). */
export function consumeScoutPrefill(): string | null {
  const text = pendingScoutPrefill;
  pendingScoutPrefill = null;
  return text;
}

// ---------------------------------------------------------------------------
// Cost-per-wear (Pass Fifteen, Track G) — the piece_value companion table:
// optional price paid + a times-worn counter. Cost-per-wear = price / wears.
// On-brand for the conviction thesis: £200 over 100 wears = £2 per wear.
// ---------------------------------------------------------------------------

export interface PieceValue {
  id: number;
  piece_id: number;
  price_paid: number | null;
  times_worn: number;
  last_worn_at: string | null;
}

function normalizePieceValue(row: any): PieceValue {
  return {
    id: Number(row.id),
    piece_id: Number(row.piece_id),
    price_paid: row.price_paid != null && row.price_paid !== '' ? Number(row.price_paid) : null,
    times_worn: Number(row.times_worn) || 0,
    last_worn_at: row.last_worn_at || null,
  };
}

/** piece id to value record (price paid + wear counter). */
export async function fetchPieceValues(): Promise<Record<number, PieceValue>> {
  try {
    const { data } = await db().from('piece_value').orderBy('created_at', 'asc').limit(200).get();
    const out: Record<number, PieceValue> = {};
    for (const row of data || []) if (row.piece_id != null) out[Number(row.piece_id)] = normalizePieceValue(row);
    return out;
  } catch (e) {
    console.warn('[Ethaion] piece value fetch failed (non-fatal):', e);
    return {};
  }
}

/** Upsert one piece's value record; returns the fresh row. */
export async function setPieceValue(
  pieceId: number,
  patch: { price_paid?: number | null; times_worn?: number; last_worn_at?: string | null },
): Promise<PieceValue | null> {
  const { data } = await db().from('piece_value').eq('piece_id', pieceId).limit(2).get();
  const existing = data?.[0];
  const clean: Record<string, unknown> = {};
  if (patch.price_paid !== undefined) clean.price_paid = patch.price_paid;
  if (patch.times_worn !== undefined) clean.times_worn = Math.max(0, Math.round(patch.times_worn));
  if (patch.last_worn_at !== undefined) clean.last_worn_at = patch.last_worn_at;
  if (existing) {
    await db().from('piece_value').update(existing.id, clean);
  } else {
    await db().from('piece_value').insert({ piece_id: pieceId, times_worn: 0, ...clean });
  }
  const { data: fresh } = await db().from('piece_value').eq('piece_id', pieceId).limit(1).get();
  return fresh?.[0] ? normalizePieceValue(fresh[0]) : null;
}

/** The +1 wear tap: increments the counter and stamps last_worn_at. */
export async function incrementWear(pieceId: number, current?: PieceValue | null): Promise<PieceValue | null> {
  const worn = (current?.times_worn ?? 0) + 1;
  return setPieceValue(pieceId, { times_worn: worn, last_worn_at: new Date().toISOString() });
}

/**
 * Cost-per-wear display line for cards and detail views. With a price and
 * wears it reads like “£2.10 per wear”; with a price but no wears it reads
 * “Not worn yet”; without a price it returns null (cards stay quiet and the
 * detail view shows the log-price nudge instead).
 */
export function costPerWearLabel(value: PieceValue | null | undefined): string | null {
  if (!value || value.price_paid == null || value.price_paid <= 0) return null;
  if (!value.times_worn || value.times_worn <= 0) return 'Not worn yet';
  const per = value.price_paid / value.times_worn;
  const amount = per >= 10 ? String(Math.round(per)) : per.toFixed(2);
  return `${currencySymbol()}${amount} per wear`;
}
