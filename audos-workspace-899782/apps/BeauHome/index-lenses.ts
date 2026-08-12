/**
 * THE INDEX · LENSES (design screen 26a, “Lo · the root, with rows you can
 * judge”) — the data model behind the READ IT control: BY CATEGORY · BY
 * TEMPERATURE · BY OCCASION · BY PLACE.
 *
 * Three registers, exactly as the reference's model note divides them:
 *
 *  · FIXED · WRITTEN ONCE — each type's temperature band and register set.
 *    Identical for every user: a wool overcoat is 4–12°C whoever is reading.
 *    The bands are a rule set (`typeBandFor`), seeded with the reference's
 *    own hand-set outerwear bands and falling back to the same warmth
 *    inference the outfit gates use, so the two layers never disagree.
 *  · FITTED · COMPUTED PER USER — the verdict column (`verdictFor`), read
 *    from the user's city climate curve (the shared weather module) against
 *    each band. Owned marks and swatches come from the ledger; gap flags
 *    from the board. Nothing here calls a model.
 *  · WRITTEN PER USER · GENERATED — nothing, deliberately. The verdicts are
 *    one rule applied 380 times, not 380 sentences.
 */
import { inferWarmth } from './warmth-model';
import type { SharedWeather } from './weather-context';

// ---------------------------------------------------------------------------
// The temperature band — fixed, written once.
// ---------------------------------------------------------------------------

export interface TempBand {
  lo: number;
  hi: number;
}

/** The reference's own hand-set bands (26a shows outerwear) plus the common
 * types every category leans on. First match wins — order matters. */
const BAND_RULES: Array<[RegExp, TempBand]> = [
  // Outerwear — the 26a plate, transcribed.
  [/\bski\b|snow boot|snorkel/i, { lo: -10, hi: 5 }],
  [/parka|down jacket|puffer|shearling|\bb-3\b/i, { lo: -5, hi: 8 }],
  [/duffle coat|duffel coat|ulster|inverness/i, { lo: 0, hi: 10 }],
  [/polo coat|british warm|guards coat/i, { lo: 2, hi: 10 }],
  [/loden coat|tyrolean|donkey jacket|mackinaw|greatcoat/i, { lo: 2, hi: 12 }],
  [/peacoat|pea coat|reefer/i, { lo: 2, hi: 12 }],
  [/overcoat|chesterfield|crombie|frock/i, { lo: 4, hi: 12 }],
  [/car coat|cape\b/i, { lo: 4, hi: 14 }],
  [/wax(ed)? jacket|oilskin/i, { lo: 5, hi: 14 }],
  [/boiled wool|zamarra/i, { lo: 5, hi: 14 }],
  [/raglan coat|balmacaan/i, { lo: 6, hi: 14 }],
  [/quilted jacket|gilet|down vest|shooting vest/i, { lo: 6, hi: 14 }],
  [/covert coat/i, { lo: 6, hi: 14 }],
  [/norfolk|shooting jacket|hacking jacket|loden janker/i, { lo: 6, hi: 16 }],
  [/field jacket|m-43|m-65|m-51|tanker|deck jacket|ike jacket/i, { lo: 8, hi: 16 }],
  [/barn coat|ranch jacket|fisherman'?s smock/i, { lo: 8, hi: 16 }],
  [/trench coat|mackintosh|raincoat|\bmac\b/i, { lo: 8, hi: 18 }],
  [/donegal|tweed jacket/i, { lo: 10, hi: 18 }],
  [/café racer|cafe racer|double rider|leather trucker|leather bomber|flight jacket|souvenir/i, { lo: 10, hi: 18 }],
  [/bomber|blouson|varsity/i, { lo: 10, hi: 18 }],
  [/anorak|cagoule|windbreaker|coach jacket/i, { lo: 10, hi: 20 }],
  [/teba/i, { lo: 12, hi: 22 }],
  [/denim trucker|jean jacket|noragi/i, { lo: 12, hi: 20 }],
  [/chore coat|chore blazer|bleu de travail/i, { lo: 14, hi: 20 }],
  [/overshirt|shirt jacket|shacket/i, { lo: 14, hi: 22 }],
  [/harrington/i, { lo: 14, hi: 22 }],
  [/unstructured/i, { lo: 16, hi: 24 }],
  [/sahariana|safari jacket|saharienne/i, { lo: 18, hi: 28 }],
  [/linen blazer|linen suit|linen jacket/i, { lo: 20, hi: 30 }],
  // The rest of the wardrobe — the common runs.
  [/aran|guernsey|cowichan|shetland|fair isle|fisherman|shaker|cable/i, { lo: 0, hi: 12 }],
  [/roll neck|turtleneck|mock neck/i, { lo: 2, hi: 14 }],
  [/lambswool|cashmere crew|marled|waffle/i, { lo: 4, hi: 16 }],
  [/crew neck jumper|v-neck jumper|zip neck|half-zip|quarter-zip|cardigan|slipover|sweater vest|argyle|boat neck|saddle/i, { lo: 6, hi: 18 }],
  [/fleece|sherpa/i, { lo: 4, hi: 14 }],
  [/sweatshirt|hoodie|track top/i, { lo: 8, hi: 18 }],
  [/flannel (shirt|trousers)|brushed cotton|chamois|moleskin|corduroy|cords|whipcord|cavalry twill|tweed (trousers|waistcoat|cap)/i, { lo: 4, hi: 16 }],
  [/thermal|long john|merino base|long-sleeve base|union suit/i, { lo: -5, hi: 10 }],
  [/linen|seersucker|madras|fresco/i, { lo: 20, hi: 32 }],
  [/shorts|swim|board short/i, { lo: 22, hi: 35 }],
  [/camp collar|guayabera|breton|polo\b|piqué|pique|espadrille|sandal|huarache|panama|boater|sun hat|bucket hat/i, { lo: 18, hi: 30 }],
  [/t-shirt|pocket tee|tank|sleeveless|henley/i, { lo: 16, hi: 32 }],
  [/wellington|duck boot|hiking boot|work boot|engineer|service boot|snow/i, { lo: -2, hi: 14 }],
  [/chelsea|chukka|desert boot|jodhpur boot|balmoral boot|monk boot|country brogue|moc-toe|crepe-sole|cowboy|roper|riding boot/i, { lo: 2, hi: 18 }],
  [/beanie|watch cap|trapper|ushanka|deerstalker|balaclava|glove|mitten|scarf|muffler|snood|earflap/i, { lo: -5, hi: 10 }],
];

/** Weather-neutral rows — worn the same at −5°C and 35°C: no band drawn,
 * the range column reads ANY. */
const NEUTRAL_ROW =
  /belt|braces|\bwatch\b(?! cap)|watch strap|pocket watch|cufflink|tie bar|collar (stay|pin)|signet|bracelet|wallet|card holder|coin purse|key case|lapel pin|boutonnière|hat pin|pocket square|handkerchief|umbrella|sunglasses|briefcase|attaché|gladstone|doctor'?s bag|portfolio|messenger|musette|tote|holdall|barrel bag|rucksack|duffle\b(?! coat)|garment bag|belt bag|camera bag|dopp kit|document tube|sock garters|\btie\b|bow tie|cravat|ascot|dress belt/i;

/**
 * The fixed band for one type — the rule table first, the shared warmth
 * inference as the floor, so every one of the 380 rows has a reading and
 * none of them was typed per user.
 */
export function typeBandFor(name: string, categoryId: string, group: string): TempBand | null {
  const text = `${name} ${group}`.toLowerCase();
  if (NEUTRAL_ROW.test(text)) return null;
  for (const [rx, band] of BAND_RULES) if (rx.test(text)) return band;
  const read = inferWarmth({ name, category: categoryId, slot: group });
  if (read.warmth_level === 'all-weather') return null;
  // The inference bands are gate-wide on purpose; the index draws them
  // tighter so a band reads against its neighbours.
  if (read.warmth_level === 'heavy') return { lo: 0, hi: 12 };
  if (read.warmth_level === 'light') return { lo: 18, hi: 30 };
  return { lo: 10, hi: 24 };
}

export function bandLabel(band: TempBand | null): string {
  return band ? `${band.lo}-${band.hi}°` : 'ANY';
}

// ---------------------------------------------------------------------------
// The city curve — fitted, computed per user.
// ---------------------------------------------------------------------------

export interface CityCurve {
  /** null when no location is set — the verdicts fall back to a temperate
   * year and the rail says so. */
  city: string | null;
  lo: number;
  hi: number;
}

/**
 * A coarse annual envelope from today's reading: today's min/max stretched
 * by where the calendar sits (a January reading is near the year's floor, a
 * July one near its ceiling). Deterministic, no extra fetch.
 */
export function cityCurveFrom(weather: SharedWeather | null): CityCurve {
  if (!weather) return { city: null, lo: 2, hi: 28 };
  const month = new Date().getMonth();
  const winter = month === 11 || month <= 1;
  const summer = month >= 5 && month <= 7;
  const lo = winter ? weather.minC : summer ? weather.minC - 16 : weather.minC - 8;
  const hi = winter ? weather.maxC + 16 : summer ? weather.maxC : weather.maxC + 8;
  return { city: weather.city || null, lo: Math.round(lo), hi: Math.round(hi) };
}

// ---------------------------------------------------------------------------
// The verdict — one rule applied 380 times.
// ---------------------------------------------------------------------------

export type Verdict = 'essential' | 'works' | 'wrong tool';

const WET_ARMOUR = /wax(ed)?|oilskin|mackintosh|raincoat|\bmac\b|anorak|cagoule|wellington|duck boot|fishtail|snorkel/i;
const EXTREME_COLD = /ushanka|trapper|balaclava|snow|\bski\b|moon boot|\bb-3\b|long john|union suit/i;

export function verdictFor(
  band: TempBand | null,
  curve: CityCurve,
  opts: { name: string; core?: boolean; gap?: boolean },
): Verdict {
  const text = opts.name.toLowerCase();
  // Weather-armour a mild or hot-summer city never calls for reads as the
  // wrong tool however wearable its band is.
  if (EXTREME_COLD.test(text) && curve.lo > 2) return 'wrong tool';
  if (WET_ARMOUR.test(text) && curve.hi >= 27) return 'wrong tool';
  if (!band) return opts.core ? 'essential' : 'works';
  const width = Math.max(1, band.hi - band.lo);
  const overlap = Math.max(0, Math.min(band.hi, curve.hi) - Math.max(band.lo, curve.lo)) / width;
  if (overlap < 0.25) return 'wrong tool';
  // A gap the board names is by definition something the city asks for.
  if (opts.gap) return 'essential';
  if (overlap >= 0.65) return 'essential';
  if (opts.core && overlap >= 0.4) return 'essential';
  return 'works';
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  essential: 'ESSENTIAL',
  works: 'WORKS',
  'wrong tool': 'WRONG TOOL',
};

// ---------------------------------------------------------------------------
// The place registers — fixed, written once (the BY PLACE lens).
// ---------------------------------------------------------------------------

export const PLACE_REGISTERS = ['In town', 'In the country', 'On the coast', 'In the mountains', 'In transit'] as const;
export type PlaceRegister = (typeof PLACE_REGISTERS)[number];

const PLACE_RULES: Array<[PlaceRegister, RegExp]> = [
  ['In the mountains', /parka|down |puffer|hiking|snow|\bski\b|thermal|balaclava|trapper|ushanka|fleece|long john|merino base|mountain/i],
  ['On the coast', /linen|espadrille|camp collar|guayabera|swim|board short|breton|deck shoe|boat shoe|panama|seersucker|sahariana|safari|sun hat|boater|madras|riviera/i],
  ['In the country', /tweed|wax|barn|norfolk|shooting|hacking|wellington|flat cap|newsboy|brogue boot|gilet|moleskin|cord|donegal|loden|country|field jacket|chore|guernsey|aran|fair isle|deerstalker|estate/i],
  ['In transit', /car coat|weekender|holdall|travel|rucksack|backpack|messenger|dopp|garment bag|driving|luggage|duffle\b|document tube|camera bag/i],
  ['In town', /suit|blazer|oxford|derby|loafer|monk|dress|tie\b|overcoat|chesterfield|crombie|covert|trench|mackintosh|briefcase|attaché|polo coat|wholecut|brogue|smoking|dinner|opera|cap-toe|wool trouser|flannel trouser|homburg|fedora|trilby|umbrella|cufflink|pocket square/i],
];

/** The one place a type most belongs to — first rule wins, town is the
 * default register the rest of a wardrobe reads in. */
export function placeFor(name: string, group: string): PlaceRegister {
  const text = `${name} ${group}`.toLowerCase();
  for (const [place, rx] of PLACE_RULES) if (rx.test(text)) return place;
  return 'In town';
}
