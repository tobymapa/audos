/**
 * THE WARMTH MODEL — warmth/weather suitability per piece, and the HARD
 * PRE-FILTER that runs BEFORE any outfit reasoning (Today weather-reasoning
 * fix).
 *
 * The bug this closes: Beau fetched and displayed the weather ("Pamplona ·
 * 30°C · Clear") and then recommended a waxed cotton field jacket. The
 * weather was context, not a constraint. weather-rules.ts already filtered
 * the model's OUTPUT by name regex; that is a backstop, and a backstop is
 * not a filter — a piece that should never have been an option was still an
 * option.
 *
 * Four things live here:
 *
 *  1. WARMTH METADATA (`inferWarmth`) — every piece gets a warmth level and
 *     a comfortable temperature band, inferred from category + slot + fabric
 *     + construction. Nothing is entered by hand. A waxed cotton field
 *     jacket reads heavy (−10…16°C, suited to cold and wet) wherever the
 *     owner lives.
 *       · light   (linen shirts, cotton tees, espadrilles, swim shorts): 18…45°C
 *       · medium  (cotton chinos, knitwear, unlined blazers, loafers):   10…28°C
 *       · heavy   (waxed jackets, wool coats, down, insulated outerwear): −10…16°C
 *     Those are the STARTING bands; a handful of pieces move within them
 *     (heavy knits sit cooler, shorts sit hotter), and belts, watches and
 *     bags are weather-neutral so they are never filtered on temperature.
 *
 *  2. FEELS-LIKE (`feelsLikeC`, `heatIndexC`) — 30°C at 80% humidity in
 *     Manila is not 30°C in Madrid. The filtering temperature is the
 *     weather API's apparent temperature when it gives one, otherwise the
 *     heat index computed from temperature + relative humidity (Steadman /
 *     Rothfusz), otherwise wind chill in the cold, otherwise the raw digit.
 *
 *  3. THE PRE-FILTER (`filterForWeather`) — candidates are cut against the
 *     feels-like temperature BEFORE the model is asked anything. On a 30°C
 *     day the waxed jacket is not "offered and rejected": it is not in the
 *     candidate set at all. The hot side is strict (+3°C of slack, because
 *     heat cannot be taken off a wool coat); the cold side is loose for
 *     anything worn UNDER something, because layering is what cold weather
 *     is for — see LAYERABLE_COLD_TOLERANCE_C.
 *
 *  4. GAP HONESTY (`gapNote` on the result) — if the filter leaves a core
 *     slot uncovered, Beau says so and offers the closest thing owned
 *     rather than quietly reaching for a wrong-season piece: "Nothing in
 *     your Ledger is rated for today's heat — here's the lightest option you
 *     own, but this is a gap worth closing."
 *
 * Persistence: the inferred read is written to the `piece_warmth` companion
 * table at ingestion time (wardrobe_pieces cannot gain a column), so it is
 * stored WITH the piece and can be inspected or overridden. Inference stays
 * the authority on read, so a piece whose row hasn't landed yet — or a
 * wardrobe logged long before this pass — is still filtered correctly.
 */
import type { WardrobePiece } from './profile-data';

// ---------------------------------------------------------------------------
// Types + the reference bands
// ---------------------------------------------------------------------------

export type WarmthLevel = 'light' | 'medium' | 'heavy' | 'all-weather';

export type WeatherSuit = 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'wet' | 'windy';

export interface PieceWarmth {
  warmth_level: WarmthLevel;
  weather_suited: WeatherSuit[];
  min_comfortable_temp_c: number;
  max_comfortable_temp_c: number;
}

/** Bump when the inference rules change — lower-versioned stored rows are
 * re-derived by the retroactive sweep.
 *  v2 — wool mid-layers and wool trousers read cool-leaning (so the
 *       pre-filter agrees with the output gate instead of offering a wool
 *       cardigan at 30°C for the gate to drop), and an unlined cotton
 *       blazer or overshirt keeps the medium band's full 28°C ceiling. */
export const WARMTH_VERSION = 2;

/** The tolerance either side of a band, for feel-like and humidity slack. */
export const WARMTH_TOLERANCE_C = 3;

/**
 * The cold side is deliberately looser than the hot side for everything that
 * gets worn UNDER something. Heat cannot be taken off a wool coat, so the
 * upper bound is strict — but a cotton shirt, chinos and a merino knit at
 * 2°C are exactly right beneath an overcoat, and filtering them out on a
 * cold morning would trade one wrong answer for another. Only OUTERWEAR
 * keeps the tight lower bound, because the outer layer is the one piece that
 * has to be rated for the day on its own.
 */
export const LAYERABLE_COLD_TOLERANCE_C = 10;

/** Reference bands by warmth level (the brief's starting ranges). */
export const WARMTH_BANDS: Record<WarmthLevel, { min: number; max: number }> = {
  light: { min: 18, max: 45 },
  medium: { min: 10, max: 28 },
  heavy: { min: -10, max: 16 },
  // Belts, watches, bags, ties: worn in any weather, so never gated on it.
  'all-weather': { min: -30, max: 50 },
};

/** Above this, heavy outerwear is only back in play for real rain or wind. */
export const WET_OVERRIDE_CEILING_C = 22;

// ---------------------------------------------------------------------------
// Inference — category + slot + fabric + construction, no manual entry
// ---------------------------------------------------------------------------

export interface WarmthPieceLike {
  category?: string | null;
  slot?: string | null;
  name?: string | null;
  material?: string | null;
  pattern?: string | null;
  seasons?: string[] | null;
}

/**
 * ACTIVE INSULATION — unambiguous cold-weather construction. This beats a
 * summer fabric reading: a waxed or quilted anything is a cold/wet piece.
 */
// `(^|[^-\w])down\b` rather than `\bdown\b` on purpose: a button-DOWN shirt
// is not a down jacket, and the hyphen is a word boundary.
const INSULATION_SIGNAL =
  /wax(ed)?|barbour|bedale|beaufort|melton|loden|shearling|sherpa|fleece|quilt|padded|insulat|puffer|(^|[^-\w])down\b|thinsulate|oilskin|teddy|borg|thermal|long[- ]?john|balaclava|snow|winter boot|moon boot|\bski\b/i;

/** Garment TYPES that read heavy on their own — checked after the summer
 * fabric override, so a linen version of one is read on its fabric. */
const HEAVY_TYPE_SIGNAL =
  /parka|pea\s?coat|peacoat|duffle|duffel|overcoat|greatcoat|topcoat|polo coat|camel coat|wool coat|ulster|covert coat|aran|shetland|guernsey|fisherman|cable[- ]?knit|chunky|donegal|lopi|mohair|alpaca|scarf|muffler|glove|mitten|beanie|watch cap|earflap/i;

/** Summer-weight fabric — overrides a heavy garment TYPE but never active
 * insulation. */
const SUMMER_FABRIC_SIGNAL =
  /linen|seersucker|madras|voile|batiste|gauze|mesh|open[- ]?weave|crochet|fresco|tropical wool|panama|straw|raffia/i;

/** Cuts that are summer-only whatever the fabric. */
const SUMMER_CUT_SIGNAL =
  /espadrille|huarache|sandal|slide|flip[- ]?flop|swim|trunks|board short|tank top|singlet|bucket hat/i;

/** Outer layers that are not insulating — unlined tailoring, shirt jackets,
 * rain shells. They belong in the medium band, not the heavy one. */
const MID_OUTER_SIGNAL =
  /blazer|sport ?coat|sports jacket|sport jacket|teba|unlined|unstructured|overshirt|shacket|harrington|bomber|blouson|chore|trucker|denim jacket|jean jacket|windbreaker|deck jacket|safari|trench|mackintosh|\bmac\b|raincoat|rain jacket|cagoule|anorak|shell|gabardine/i;

/** Mid-weight but definitely not hot-weather: the top of the medium band
 * comes down for these. Plain wool belongs here rather than in the heavy
 * band: a merino cardigan is a mid-layer, not a coat — but it is also not a
 * 30°C garment, and the output gate already refuses knitwear in that heat,
 * so the pre-filter has to reach the same verdict or the two layers
 * disagree and the model composes a look the gate then dismantles. */
const COOL_LEANING_SIGNAL =
  /corduroy|\bcord\b|moleskin|flannel|brushed cotton|tweed|harris|\bwool(?:l?en)?\b|cashmere|lambswool|merino|heavy denim|selvedge|raw denim|loden|waffle|shawl collar/i;

/** Genuinely hot-weather cuts even in ordinary cotton. */
const HOT_LEANING_SIGNAL = /\bshorts?\b|\btee\b|t-?shirt|polo|piqu|camp collar|cuban collar|chambray|poplin|deck shoe|boat shoe/i;

/** Weather-neutral: worn the same at −5°C and 35°C. */
const NEUTRAL_SIGNAL = /belt|braces|suspender|watch|timepiece|chronograph|cufflink|\btie\b(?![-\w])|bow tie|pocket square|wallet|card holder|sunglasses|\bbag\b|holdall|weekender|briefcase|tote|satchel|messenger|backpack|rucksack|luggage|suitcase|umbrella/i;

/** Rain and wind protection — the one thing that brings a heavy layer back
 * above the hot threshold. */
const WET_SIGNAL = /wax(ed)?|rain|mackintosh|\bmac\b|anorak|cagoule|gore.?tex|ventile|oilskin|weatherproof|water(?:proof|-resistant)|gabardine|parka|shell/i;
const WIND_SIGNAL = /wind|shell|anorak|harrington|blouson|bomber|gabardine|parka|\bmac\b/i;

/** Categories whose default is a layer, so their default is heavy. */
const LAYER_CATEGORIES = new Set(['outerwear']);
const NEUTRAL_CATEGORIES = new Set(['bags']);

function signalOf(piece: WarmthPieceLike, material?: string | null): string {
  return [piece.slot, piece.name, material ?? piece.material, piece.pattern]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function clampBand(min: number, max: number): { min: number; max: number } {
  return { min: Math.round(min), max: Math.round(Math.max(max, min + 4)) };
}

/**
 * The warmth read for one piece. Deterministic — the same piece always
 * infers the same band, so the pre-filter never depends on a model call
 * having landed.
 */
export function inferWarmth(piece: WarmthPieceLike, material?: string | null): PieceWarmth {
  const category = (piece.category || '').trim().toLowerCase();
  const signal = signalOf(piece, material);

  // 1. Weather-neutral pieces first — a belt is never the reason an outfit
  //    fails a temperature gate.
  if (NEUTRAL_CATEGORIES.has(category) || (NEUTRAL_SIGNAL.test(signal) && category !== 'outerwear')) {
    return {
      warmth_level: 'all-weather',
      weather_suited: ['hot', 'warm', 'mild', 'cool', 'cold'],
      ...bandFields('all-weather'),
    };
  }

  // 2. The level. Active insulation wins outright; a summer fabric or cut
  //    then overrides a heavy garment type; the category default is last.
  let level: WarmthLevel;
  const summer = SUMMER_FABRIC_SIGNAL.test(signal) || SUMMER_CUT_SIGNAL.test(signal);
  if (INSULATION_SIGNAL.test(signal)) level = 'heavy';
  else if (summer) level = 'light';
  else if (HEAVY_TYPE_SIGNAL.test(signal)) level = 'heavy';
  else if (category === 'knitwear') level = 'medium';
  else if (LAYER_CATEGORIES.has(category)) level = MID_OUTER_SIGNAL.test(signal) ? 'medium' : 'heavy';
  else if (category === 'base-layers') level = /undershirt|\bvest\b/i.test(signal) ? 'light' : 'heavy';
  else if (HOT_LEANING_SIGNAL.test(signal)) level = 'light';
  else level = 'medium';

  let { min, max } = WARMTH_BANDS[level];

  // 3. Band adjustments where the level alone is too blunt.
  if (level === 'medium' && COOL_LEANING_SIGNAL.test(signal)) max -= 6; // cord trousers, flannel shirts
  if (level === 'medium' && HOT_LEANING_SIGNAL.test(signal)) max += 6; // a piqué polo, a poplin shirt
  if (level === 'heavy' && category === 'knitwear') max = 14;
  if (level === 'light' && /\bshorts?\b|swim|trunks|sandal|flip|espadrille/i.test(signal)) min += 2;
  // An unlined blazer, an overshirt or a rain shell is an extra layer, so it
  // does not inherit a hot-weather ceiling — but a breathable natural one is
  // genuinely wearable to the top of the medium band. Cotton is NOT excluded
  // in the heat: an unlined cotton blazer at 29°C is a real answer, and the
  // pieces that must go above ~24°C are the wax coatings, heavy wools, down
  // and insulating synthetics, which read heavy long before this line.
  if (LAYER_CATEGORIES.has(category) && level === 'medium') max = Math.min(max, WARMTH_BANDS.medium.max);
  // Shoes carry a whole look: a medium pair stays wearable to the top of the
  // hot band rather than leaving a man barefoot at 31°C.
  if (category === 'shoes' && level === 'medium') max = Math.max(max, 32);
  // Tailoring is occasion-driven, not weather-driven: a wool suit is the only
  // formal answer a man owns, so it stays available in the heat.
  if (category === 'formalwear' && level !== 'light') max = Math.max(max, 30);

  // Season tags the user (or the ingestion flow) already set are a real
  // signal: an AW-only piece should not read as summer-capable.
  const seasons = (piece.seasons || []).map((s) => (s || '').toLowerCase());
  if (seasons.includes('aw') && !seasons.includes('ss') && !seasons.includes('year-round')) {
    max = Math.min(max, 20);
  }
  if (seasons.includes('ss') && !seasons.includes('aw') && !seasons.includes('year-round')) {
    min = Math.max(min, 14);
  }

  const band = clampBand(min, max);
  return {
    warmth_level: level,
    weather_suited: suitabilityFor(level, band, signal),
    min_comfortable_temp_c: band.min,
    max_comfortable_temp_c: band.max,
  };
}

function bandFields(level: WarmthLevel): { min_comfortable_temp_c: number; max_comfortable_temp_c: number } {
  return {
    min_comfortable_temp_c: WARMTH_BANDS[level].min,
    max_comfortable_temp_c: WARMTH_BANDS[level].max,
  };
}

function suitabilityFor(level: WarmthLevel, band: { min: number; max: number }, signal: string): WeatherSuit[] {
  const out: WeatherSuit[] = [];
  if (band.max >= 28) out.push('hot');
  if (band.max >= 22) out.push('warm');
  if (band.min <= 18 && band.max >= 14) out.push('mild');
  if (band.min <= 12) out.push('cool');
  if (band.min <= 5) out.push('cold');
  if (WET_SIGNAL.test(signal)) out.push('wet');
  if (WIND_SIGNAL.test(signal) || level === 'heavy') out.push('windy');
  return Array.from(new Set(out));
}

/** One compact line for the model's wardrobe block, so the surviving
 * candidates carry their own reason for being there. */
export function warmthPromptSuffix(warmth: PieceWarmth): string {
  if (warmth.warmth_level === 'all-weather') return 'warmth: any weather';
  const suited = warmth.weather_suited.length > 0 ? `, suits ${warmth.weather_suited.join('/')}` : '';
  return `warmth: ${warmth.warmth_level} (${warmth.min_comfortable_temp_c}–${warmth.max_comfortable_temp_c}°C${suited})`;
}

// ---------------------------------------------------------------------------
// Feels-like — humidity and wind, not just the raw digit
// ---------------------------------------------------------------------------

/**
 * Heat index in °C from air temperature and relative humidity (the Rothfusz
 * regression on the Steadman apparent-temperature table, with the NWS low-
 * and high-humidity adjustments). Below 27°C or 40% RH the index is not
 * meaningful, so the air temperature is returned unchanged.
 */
export function heatIndexC(tempC: number, humidityPercent: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(humidityPercent)) return tempC;
  if (tempC < 26.7 || humidityPercent < 40) return tempC;
  const T = tempC * 1.8 + 32;
  const R = Math.min(100, Math.max(0, humidityPercent));
  let hiF =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) {
    hiF -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  } else if (R > 85 && T >= 80 && T <= 87) {
    hiF += ((R - 85) / 10) * ((87 - T) / 5);
  }
  return (hiF - 32) / 1.8;
}

/** Wind chill in °C (the JAG/TI formula) — the cold half of feels-like. */
export function windChillC(tempC: number, windKmh: number): number {
  if (!Number.isFinite(tempC) || !Number.isFinite(windKmh)) return tempC;
  if (tempC > 10 || windKmh < 5) return tempC;
  const v = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

export interface FeelsLikeInput {
  tempC?: number | null;
  /** The weather API's own apparent temperature, when it returns one. */
  apparentC?: number | null;
  humidity?: number | null;
  windKmh?: number | null;
}

/**
 * The ONE temperature every weather gate should use: the API's apparent
 * temperature when available, otherwise heat index in the heat, wind chill
 * in the cold, and the raw reading when neither applies.
 */
export function feelsLikeC(input: FeelsLikeInput): number | null {
  const apparent = input.apparentC;
  if (apparent != null && Number.isFinite(apparent)) return Math.round(apparent);
  const temp = input.tempC;
  if (temp == null || !Number.isFinite(temp)) return null;
  const humidity = input.humidity;
  if (humidity != null && Number.isFinite(humidity)) {
    const hi = heatIndexC(temp, humidity);
    if (hi > temp + 0.5) return Math.round(hi);
  }
  const wind = input.windKmh;
  if (wind != null && Number.isFinite(wind)) {
    const wc = windChillC(temp, wind);
    if (wc < temp - 0.5) return Math.round(wc);
  }
  return Math.round(temp);
}

// ---------------------------------------------------------------------------
// The pre-filter — candidates are cut BEFORE the model reasons
// ---------------------------------------------------------------------------

/** The slots a complete look cannot do without. Layers are not here: on a
 * hot day the right number of layers is none. */
type CoreSlot = 'top' | 'bottom' | 'shoes';

const CORE_SLOT_LABEL: Record<CoreSlot, string> = {
  top: 'top',
  bottom: 'trousers or shorts',
  shoes: 'pair of shoes',
};

function coreSlotOf(piece: WardrobePiece): CoreSlot | null {
  const category = (piece.category || '').toLowerCase();
  if (category === 'tops') return 'top';
  if (category === 'bottoms') return 'bottom';
  if (category === 'shoes') return 'shoes';
  return null;
}

export interface WeatherFilterInput {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
  /** Stored warmth rows, when the caller has loaded them. */
  warmth?: Record<number, PieceWarmth>;
  /** The temperature to filter against — feels-like, not the raw digit. */
  filterTempC: number | null;
  /** Rain or heavy showers: brings weatherproof heavy layers back, but only
   * below WET_OVERRIDE_CEILING_C. */
  wet?: boolean;
  /** Ids that must survive the cut regardless (the board being adjusted). */
  keepIds?: number[];
}

export interface WeatherFilterResult {
  /** The ONLY pieces the model may reason over. */
  candidates: WardrobePiece[];
  /** What was removed, and why — logged, and useful for debugging. */
  excluded: Array<{ piece: WardrobePiece; reason: string }>;
  /** Pieces admitted only because the slot would otherwise be empty. */
  compromises: WardrobePiece[];
  /** One honest sentence when the wardrobe cannot dress today properly. */
  gapNote: string | null;
}

/** The warmth read for a piece: a stored row wins, inference is the floor. */
export function warmthFor(
  piece: WardrobePiece,
  materials: Record<number, string> = {},
  stored: Record<number, PieceWarmth> = {},
): PieceWarmth {
  return stored[piece.id] || inferWarmth(piece, materials[piece.id] ?? null);
}

/** The effective band a piece is judged against: strict on the hot side,
 * layering-aware on the cold side for everything but the outer layer. */
function effectiveBand(warmth: PieceWarmth, category?: string | null): { low: number; high: number } {
  const isOuter = (category || '').trim().toLowerCase() === 'outerwear';
  const coldSlack = isOuter ? WARMTH_TOLERANCE_C : LAYERABLE_COLD_TOLERANCE_C;
  return {
    low: warmth.min_comfortable_temp_c - coldSlack,
    high: warmth.max_comfortable_temp_c + WARMTH_TOLERANCE_C,
  };
}

function fits(warmth: PieceWarmth, tempC: number, wet: boolean, category?: string | null): boolean {
  const { low, high } = effectiveBand(warmth, category);
  if (tempC >= low && tempC <= high) return true;
  // Rain or wind protection is the documented exception — and only while the
  // day is cool enough for it to be a kindness rather than a punishment.
  if (wet && tempC <= WET_OVERRIDE_CEILING_C && warmth.weather_suited.includes('wet') && tempC >= low) {
    return true;
  }
  return false;
}

function exclusionReason(warmth: PieceWarmth, tempC: number): string {
  return tempC > warmth.max_comfortable_temp_c
    ? `${warmth.warmth_level} warmth, comfortable to ${warmth.max_comfortable_temp_c}°C — too warm for ${Math.round(tempC)}°C`
    : `${warmth.warmth_level} warmth, comfortable from ${warmth.min_comfortable_temp_c}°C — too light for ${Math.round(tempC)}°C`;
}

function listNames(pieces: WardrobePiece[]): string {
  const names = pieces.map((p) => p.name).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * THE FIX. Cut the wardrobe down to what today's feels-like temperature
 * actually allows, before a single token of reasoning is spent. On a 30°C
 * day the waxed jacket does not appear as an option and get rejected — it is
 * genuinely gone.
 *
 * Core slots (top / bottoms / shoes) are never left empty: when nothing in a
 * slot is properly rated, the CLOSEST piece owned is admitted and named in
 * the gap note, so Beau is honest instead of silently reaching for a
 * wrong-season piece.
 */
export function filterForWeather({
  pieces,
  materials = {},
  warmth = {},
  filterTempC,
  wet = false,
  keepIds = [],
}: WeatherFilterInput): WeatherFilterResult {
  if (filterTempC == null || !Number.isFinite(filterTempC)) {
    return { candidates: pieces, excluded: [], compromises: [], gapNote: null };
  }
  const keep = new Set(keepIds);
  const candidates: WardrobePiece[] = [];
  const excluded: Array<{ piece: WardrobePiece; reason: string }> = [];

  for (const piece of pieces) {
    const read = warmthFor(piece, materials, warmth);
    if (keep.has(piece.id) || fits(read, filterTempC, wet, piece.category)) {
      candidates.push(piece);
    } else {
      excluded.push({ piece, reason: exclusionReason(read, filterTempC) });
    }
  }

  // How far outside its band a piece sits today: the lightest thing owned
  // when it is hot and the warmest when it is cold are both simply the
  // smallest miss, so one measure serves the rescue passes below.
  const missBy = (read: PieceWarmth, category?: string | null): number => {
    const { low, high } = effectiveBand(read, category);
    if (filterTempC > high) return filterTempC - high;
    if (filterTempC < low) return low - filterTempC;
    return 0;
  };
  const closestOf = (from: Array<{ piece: WardrobePiece; reason: string }>): WardrobePiece | null =>
    from
      .map((e) => ({ piece: e.piece, read: warmthFor(e.piece, materials, warmth) }))
      .sort((a, b) => missBy(a.read, a.piece.category) - missBy(b.read, b.piece.category))[0]?.piece ?? null;

  // Core-slot rescue: a slot the wardrobe COULD fill but has nothing
  // properly rated for keeps its closest option, flagged as a gap.
  const compromises: WardrobePiece[] = [];
  const gapSlots: CoreSlot[] = [];
  const covered = new Set(candidates.map((p) => coreSlotOf(p)).filter(Boolean) as CoreSlot[]);
  const hot = filterTempC > 22;
  for (const slot of ['top', 'bottom', 'shoes'] as CoreSlot[]) {
    if (covered.has(slot)) continue;
    const owned = excluded.filter((e) => coreSlotOf(e.piece) === slot);
    if (owned.length === 0) continue; // nothing owned at all — the empty-wardrobe copy owns that
    const best = closestOf(owned);
    if (!best) continue;
    candidates.push(best);
    compromises.push(best);
    gapSlots.push(slot);
  }

  // THE ESCAPE HATCH, CLOSED. A wardrobe of nothing but winter outerwear cuts
  // to nothing on a 30°C day, and every caller used to answer an empty
  // candidate set by handing the model the FULL wardrobe again — which is
  // exactly the route by which a waxed jacket reached a 30°C board. Admit the
  // single closest piece per category instead, marked as a compromise so the
  // gap note says so out loud, and the set is never empty while the wardrobe
  // is not.
  if (candidates.length === 0 && excluded.length > 0) {
    const byCategory = new Map<string, Array<{ piece: WardrobePiece; reason: string }>>();
    for (const entry of excluded) {
      const key = (entry.piece.category || 'other').toLowerCase();
      const list = byCategory.get(key);
      if (list) list.push(entry);
      else byCategory.set(key, [entry]);
    }
    for (const list of byCategory.values()) {
      const best = closestOf(list);
      if (!best) continue;
      candidates.push(best);
      compromises.push(best);
    }
  }

  return {
    candidates,
    excluded: excluded.filter((e) => !compromises.some((c) => c.id === e.piece.id)),
    compromises,
    gapNote: buildGapNote({ compromises, gapSlots, filterTempC, hot, candidates }),
  };
}

function buildGapNote({
  compromises,
  gapSlots,
  filterTempC,
  hot,
  candidates,
}: {
  compromises: WardrobePiece[];
  gapSlots: CoreSlot[];
  filterTempC: number;
  hot: boolean;
  candidates: WardrobePiece[];
}): string | null {
  const end = hot ? 'lightest' : 'warmest';
  // The last-resort pass admitted pieces without naming a core slot: nothing
  // in the wardrobe is rated for today at all, which is the bluntest version
  // of the same truth.
  if (compromises.length > 0 && gapSlots.length === 0) {
    return `Nothing in your Ledger is rated for ${Math.round(filterTempC)}°C — ${listNames(compromises)} is the ${end} you own, so that is what I have worked with. Your whole wardrobe is a gap at this temperature, and it is worth closing.`;
  }
  if (compromises.length > 0) {
    const slots = Array.from(new Set(gapSlots)).map((s) => CORE_SLOT_LABEL[s]);
    if (slots.length === 1) {
      return `Nothing in your Ledger is rated for ${Math.round(filterTempC)}°C — ${listNames(compromises)} is the ${end} ${slots[0]} you own, so that is what I have used. It is a gap worth closing.`;
    }
    const which = `${slots.slice(0, -1).join(', ')} and ${slots[slots.length - 1]}`;
    return `Nothing in your Ledger is rated for ${Math.round(filterTempC)}°C — I have used the ${end} you own (${listNames(compromises)}), but your ${which} are a real gap worth closing.`;
  }
  if (candidates.length > 0 && candidates.length < 4) {
    return hot
      ? `Only ${candidates.length} of your pieces are rated for ${Math.round(filterTempC)}°C — the hot-weather end of your wardrobe is thin, and it shows in how little I have to work with.`
      : `Only ${candidates.length} of your pieces are rated for ${Math.round(filterTempC)}°C — the cold-weather end of your wardrobe is thin, and it shows in how little I have to work with.`;
  }
  return null;
}

/** Console trace for the excluded set — the same shape weather-rules uses,
 * so the two layers read consistently in the log. */
export function logExclusions(surface: string, result: WeatherFilterResult, filterTempC: number | null): void {
  if (result.excluded.length === 0) return;
  for (const { piece, reason } of result.excluded) {
    console.warn(`[Ethaion] ${surface} pre-filtered "${piece.name}" — ${reason} (filtering at ${filterTempC}°C).`);
  }
}

// ---------------------------------------------------------------------------
// Persistence — the piece_warmth companion table
// ---------------------------------------------------------------------------

// The literal `window.__workspaceDb` token is what makes the platform
// compiler inject the WorkspaceDB SDK into this module.
function ws(): any {
  return (window as any).__workspaceDb;
}

function rowToWarmth(row: any): PieceWarmth | null {
  const level = typeof row?.warmth_level === 'string' ? (row.warmth_level as WarmthLevel) : null;
  const min = Number(row?.min_comfortable_temp_c);
  const max = Number(row?.max_comfortable_temp_c);
  if (!level || !WARMTH_BANDS[level] || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  let suited: WeatherSuit[] = [];
  const raw = row.weather_suited;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) suited = parsed.filter((s: unknown) => typeof s === 'string') as WeatherSuit[];
  } catch { /* malformed json — inference covers it */ }
  return {
    warmth_level: level,
    weather_suited: suited,
    min_comfortable_temp_c: min,
    max_comfortable_temp_c: max,
  };
}

/** Stored warmth rows for this visitor, keyed by piece id. Non-fatal: an
 * empty map simply means every read falls back to inference. */
export async function fetchPieceWarmth(): Promise<Record<number, PieceWarmth>> {
  try {
    const { data } = await ws().from('piece_warmth').limit(200).get();
    const map: Record<number, PieceWarmth> = {};
    for (const row of data || []) {
      const read = rowToWarmth(row);
      if (row?.piece_id != null && read) map[Number(row.piece_id)] = read;
    }
    return map;
  } catch (e) {
    console.warn('[Ethaion] warmth fetch failed (non-fatal, inference covers it):', e);
    return {};
  }
}

function warmthFields(read: PieceWarmth, source: 'inferred' | 'user') {
  return {
    warmth_level: read.warmth_level,
    weather_suited: JSON.stringify(read.weather_suited),
    min_comfortable_temp_c: read.min_comfortable_temp_c,
    max_comfortable_temp_c: read.max_comfortable_temp_c,
    source,
    warmth_version: WARMTH_VERSION,
  };
}

/** Write (or refresh) one piece's warmth row. Silent and non-fatal. */
export async function savePieceWarmth(
  pieceId: number,
  read: PieceWarmth,
  source: 'inferred' | 'user' = 'inferred',
): Promise<void> {
  if (!pieceId || pieceId <= 0) return;
  try {
    const fields = warmthFields(read, source);
    const { data } = await ws().from('piece_warmth').eq('piece_id', pieceId).limit(5).get();
    const existing = data?.[0] || null;
    if (existing) {
      await ws().from('piece_warmth').update(existing.id, fields);
      for (const extra of (data || []).slice(1)) {
        try {
          await ws().from('piece_warmth').delete(extra.id);
        } catch { /* duplicate cleanup is non-fatal */ }
      }
    } else {
      await ws().from('piece_warmth').insert({ piece_id: pieceId, ...fields });
    }
  } catch (e) {
    console.warn('[Ethaion] warmth save failed (non-fatal):', e);
  }
}

/** Infer and store in one step — the ingestion-time entry point. */
export function recordWarmthInBackground(pieceId: number, piece: WarmthPieceLike, material?: string | null): void {
  void savePieceWarmth(pieceId, inferWarmth(piece, material ?? null));
}

/**
 * Re-derive one piece's warmth after an edit that changes its meaning — a
 * rename, a recategorisation, a new material. Reads the current row so the
 * band always reflects what the user can see.
 */
export async function refreshPieceWarmth(pieceId: number): Promise<void> {
  try {
    const { data } = await ws().from('wardrobe_pieces').eq('id', pieceId).limit(1).get();
    const piece = data?.[0];
    if (!piece) return;
    let material: string | null = null;
    try {
      const { data: mats } = await ws().from('piece_materials').eq('piece_id', pieceId).limit(1).get();
      material = mats?.[0]?.material || null;
    } catch { /* material optional */ }
    let seasons: string[] = [];
    try {
      seasons = typeof piece.seasons === 'string' ? JSON.parse(piece.seasons) : Array.isArray(piece.seasons) ? piece.seasons : [];
    } catch { /* seasons optional */ }
    await savePieceWarmth(
      pieceId,
      inferWarmth({ category: piece.category, slot: piece.slot, name: piece.name, seasons }, material),
    );
  } catch (e) {
    console.warn('[Ethaion] warmth refresh failed (non-fatal):', e);
  }
}

/** Remove a deleted piece's warmth row(s). */
export async function deletePieceWarmth(pieceId: number): Promise<void> {
  try {
    const { data } = await ws().from('piece_warmth').eq('piece_id', pieceId).limit(10).get();
    for (const row of data || []) await ws().from('piece_warmth').delete(row.id);
  } catch { /* non-fatal companion cleanup */ }
}

let sweepRunning = false;

/**
 * Catch-up sweep: pieces logged before this pass — or through chat tools
 * that write straight to wardrobe_pieces — get a stored warmth row a moment
 * after load. Repeat sweeps are cheap no-ops, and a piece with no row is
 * never mis-filtered in the meantime because inference is the read path.
 */
export async function sweepPieceWarmth(
  pieces: WardrobePiece[],
  materials: Record<number, string> = {},
): Promise<number> {
  if (sweepRunning || pieces.length === 0) return 0;
  sweepRunning = true;
  try {
    const current = new Set<number>();
    try {
      const { data } = await ws().from('piece_warmth').limit(200).get();
      for (const row of data || []) {
        if (row?.piece_id != null && Number(row.warmth_version || 0) >= WARMTH_VERSION) {
          current.add(Number(row.piece_id));
        }
      }
    } catch { /* unreadable — re-derive below */ }
    const pending = pieces.filter((p) => p.id > 0 && !current.has(p.id));
    let written = 0;
    for (const piece of pending) {
      await savePieceWarmth(piece.id, inferWarmth(piece, materials[piece.id] ?? null));
      written += 1;
    }
    return written;
  } finally {
    sweepRunning = false;
  }
}
