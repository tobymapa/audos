/**
 * HARD WEATHER RULES — the non-negotiable temperature gates every outfit
 * recommendation must pass (AI Weather Intelligence fix).
 *
 * The bug this closes: Beau fetched the weather but did not USE it — at
 * 29°C in Muntinlupa he still recommended a wax jacket. Three layers fix it:
 *
 *  0. THE PRE-FILTER (warmth-model.ts) — the REAL fix, and the one that runs
 *     first: every piece carries a warmth level and a comfortable
 *     temperature band, and the candidate set is cut against today's
 *     feels-like temperature BEFORE the model is asked anything. A waxed
 *     jacket at 30°C is never an option to reject, because it was never an
 *     option. The two layers below are the belt and braces on top of it.
 *
 *  1. PROMPT RULES — `weatherHardRulesPrompt()` renders the rules as
 *     explicit, non-negotiable instructions appended to every outfit
 *     composition system prompt (style-today, the Fitting board, trips).
 *     They also require every rationale to cite the real conditions
 *     ("At 29°C in Manila, I've kept it light — linen shirt, tailored
 *     shorts, loafers"), never a generic line.
 *  2. OUTPUT ENFORCEMENT — `enforceWeatherRules()` filters the model's
 *     RESPONSE: any layer that violates the gates for the actual
 *     temperature is dropped even if the model ignored the prompt.
 *     Enforcement only ever removes LAYERS (outerwear / knitwear) — it
 *     never strips a look's only top, bottoms or shoes, because dropping
 *     those without a substitute would break the outfit; the prompt owns
 *     fabric choices on the core slots.
 *
 * The gates:
 *   · Above 22°C — no heavy outerwear (wax jackets, wool coats, parkas,
 *     peacoats, duffle coats, puffers). Max outer layer: a light linen or
 *     cotton jacket, or an unlined blazer. Rain and wind protection is the
 *     one exception, and only while the day is cool enough for it to help
 *     (WET_OVERRIDE_CEILING_C in warmth-model.ts, the same 22°C).
 *   · Above 28°C — also no knitwear, heavy denim, corduroy or flannel.
 *     Breathable naturals — cotton, linen, chambray — stay in play: what
 *     goes in the heat is wax coatings, heavy wool, down and insulating
 *     synthetics, not every fabric that isn't linen.
 *   · Below 15°C — layer actively: knitwear + appropriate outerwear.
 *   · Below 5°C — a heavy coat is REQUIRED.
 */

/** The heavy-outerwear ceiling. 22°C, not 25°C: it is the temperature above
 * which a waxed jacket or wool coat is simply wrong, and it matches
 * WET_OVERRIDE_CEILING_C so the pre-filter and this gate never disagree
 * about a wet-weather layer. */
export const HOT_C = 22;
export const VERY_HOT_C = 28;
export const LAYERING_C = 15;
export const FREEZING_C = 5;

/** Wording (name / slot / material) that reads as HEAVY outerwear — the
 * pieces banned outright above HOT_C. */
const HEAVY_OUTERWEAR_WORDS =
  /\b(wax(ed)?|wool|woolen|woollen|melton|loden|tweed|parka|pea\s?coat|peacoat|duffle|duffel|overcoat|greatcoat|topcoat|puffer|down|shearling|sherpa|fleece|quilted|padded|insulated|field jacket|m-?\d{2,3})\b/i;

/** Wording that qualifies an outer layer as summer-weight — the ONLY
 * outerwear allowed above VERY_HOT_C.
 *
 * Plain `cotton` counts. The heavy check above runs FIRST and already claims
 * waxed cotton, wool, tweed and everything insulated, so what is left when a
 * layer merely says "cotton" is a breathable natural one — and the rule is
 * that wax coatings, heavy wool, down and insulating synthetics go in the
 * heat, not every fabric that is not linen. */
const LIGHT_OUTER_WORDS =
  /\b(linen|seersucker|chambray|cotton|unlined|unstructured|light(weight)?|summer|mesh|ripstop|poplin|overshirt|shacket)\b/i;

/** Fabrics excluded above 28°C wherever they appear in a LAYER. */
const HOT_BANNED_FABRICS = /\b(denim|corduroy|cord|flannel|moleskin|cashmere|lambswool|merino)\b/i;

export interface WeatherRulePiece {
  category?: string | null;
  slot?: string | null;
  name?: string | null;
  /** Resolved material string when the caller has one — sharpens the read. */
  material?: string | null;
}

function textOf(piece: WeatherRulePiece): string {
  return `${piece.name || ''} ${piece.slot || ''} ${piece.material || ''}`.toLowerCase();
}

/**
 * The reason a piece is EXCLUDED at `tempC`, or null when it passes. Only
 * layers (outerwear / knitwear) ever return a reason — core slots are the
 * prompt's job, because dropping them leaves a broken look.
 */
export function weatherExclusionReason(piece: WeatherRulePiece, tempC: number | null | undefined): string | null {
  if (tempC == null || !Number.isFinite(tempC)) return null;
  const cat = (piece.category || '').trim().toLowerCase();
  const text = textOf(piece);
  if (tempC > HOT_C && cat === 'outerwear') {
    if (HEAVY_OUTERWEAR_WORDS.test(text)) return `heavy outerwear above ${HOT_C}°C`;
    if (tempC > VERY_HOT_C && !LIGHT_OUTER_WORDS.test(text)) {
      return `outer layer above ${VERY_HOT_C}°C that doesn't read summer-weight`;
    }
  }
  if (tempC > VERY_HOT_C) {
    if (cat === 'knitwear') return `knitwear above ${VERY_HOT_C}°C`;
    if ((cat === 'outerwear' || cat === 'formalwear') && HOT_BANNED_FABRICS.test(text)) {
      return `a heavy fabric above ${VERY_HOT_C}°C`;
    }
  }
  return null;
}

/**
 * Filter a composed look against the hard rules — the belt-and-braces pass
 * over the MODEL'S OUTPUT. Drops only violating layers; everything else
 * passes through untouched, in order.
 */
export function enforceWeatherRules<T extends WeatherRulePiece>(pieces: T[], tempC: number | null | undefined): T[] {
  if (tempC == null || !Number.isFinite(tempC)) return pieces;
  return pieces.filter((piece) => {
    const reason = weatherExclusionReason(piece, tempC);
    if (reason) {
      console.warn(`[Ethaion] weather rules dropped "${piece.name || 'a piece'}" — ${reason} (${tempC}°C).`);
      return false;
    }
    return true;
  });
}

/**
 * The rules as prompt text — appended to every outfit-composition system
 * prompt. Static wording, so cached system blocks stay cache-stable.
 */
export function weatherHardRulesPrompt(): string {
  return `HARD WEATHER RULES — NON-NEGOTIABLE. Apply them to the temperature you are given (for trips, to the destination's typical temperature for the dates):
· Above ${HOT_C}°C: NEVER include heavy outerwear — no wax jackets, wool coats, parkas, peacoats, duffle coats or puffers — unless the conditions specifically call for rain or wind protection. The heaviest permissible outer layer is a light linen/cotton jacket or an unlined blazer, and usually the right call is no outer layer at all.
· Above ${VERY_HOT_C}°C: ALSO exclude knitwear, heavy denim, corduroy and flannel. Reach for breathable naturals — linen, light cotton, chambray.
· BREATHABLE NATURALS ARE NOT THE PROBLEM. Cotton, linen and chambray are appropriate across a wide range — do NOT exclude them at warm temperatures. A cotton Oxford shirt, cotton chinos and an unlined cotton blazer are all correct answers at 28–30°C. What goes in the heat is specifically wax coatings, heavy wool, down and insulating synthetic layers — not all outerwear, and not every fabric that isn't linen.
· Below ${LAYERING_C}°C: actively recommend layering — knitwear plus weather-appropriate outerwear.
· Below ${FREEZING_C}°C: a heavy coat is REQUIRED, not optional.
· WARMTH LEVELS. Each piece you are given carries its warmth level and the temperature band it is comfortable in. Only recommend items whose warmth level is appropriate for the stated temperature and humidity. Do NOT recommend heavy outerwear (waxed jackets, wool coats, insulated jackets, down) when the temperature or feels-like is above 22°C unless conditions specifically require rain or wind protection. Do NOT recommend heavy wool or synthetic insulating layers above 20°C.
· FEELS-LIKE OVER THE RAW DIGIT. When you are given a feels-like figure or a humidity reading, reason against THAT: 30°C at 80% humidity is a materially heavier day than 30°C in dry air, and the outfit should be lighter for it.
· The wardrobe you are given has ALREADY been filtered to pieces rated for today. If something you would reach for is absent, it is because it is wrong for the conditions — do not ask for it and do not invent it. Work with what is in front of you, and if the list cannot dress the day properly, say so plainly in one sentence rather than reaching for a wrong-season piece.
· Every rationale MUST cite the actual conditions (the temperature, and the city when known) and explain the choices against them — e.g. "At 29°C in Manila, I've kept it light — linen shirt, tailored shorts, loafers." Never a generic line that ignores the weather.`;
}

/**
 * Best-effort temperature read from a weather prompt line like
 * "WEATHER TODAY in Manila: 29°C now (26–31°C), …" — null when unreadable.
 *
 * A FEELS-LIKE figure in the line wins over the raw reading: it is the
 * temperature the candidate filter gated on, and the two layers must agree.
 */
export function tempFromWeatherLine(line: string | null | undefined): number | null {
  if (!line) return null;
  const feels = line.match(/feels\s*like\s*(-?\d+(?:\.\d+)?)\s*°\s*C/i);
  if (feels) {
    const felt = Number(feels[1]);
    if (Number.isFinite(felt)) return felt;
  }
  const match = line.match(/(-?\d+(?:\.\d+)?)\s*°\s*C/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
