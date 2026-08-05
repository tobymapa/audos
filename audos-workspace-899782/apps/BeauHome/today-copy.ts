/**
 * BEAU'S DAILY COPY — the What-to-Wear-Today headline and body, generated
 * from LIVE data (founder's copy contract). Nothing here is hard-coded per
 * day: the copy is produced from today's weather curve and the pieces Beau
 * actually chose, and it travels WITH the board (today-board.ts caches them
 * as one unit — “Ask for another” re-runs the pick and the copy together).
 *
 * The three slots:
 *   [headline]  the weather-driven judgement call — 3–8 words, never a
 *               question, states a CONDITION AND ITS CONSEQUENCE (the
 *               temperature itself lives in the meta line). Driven by the
 *               largest delta in the day: rain arriving, the biggest
 *               temperature swing, real cold, wind. When the day is flat,
 *               it falls back on occasion/wardrobe — never empty.
 *   [body]      12–24 words naming at least two of the displayed pieces in
 *               plain language, second clause answering WHY the outfit
 *               holds up all day. No hedging, and never mechanism copy
 *               (“pulled from your wardrobe”, “checked against the
 *               forecast” are banned).
 *   [meta]      City · Temp°C · Condition + “Change location” — that is
 *               the existing WeatherLine (weather-context.tsx), untouched.
 *
 * Tone: certain, brief, unbothered — a valet who has already laid it out.
 * DETERMINISTIC by design: same weather + same pieces = same copy, so the
 * card never flickers between phrasings on re-render.
 */
import { bodyOrderRank } from './body-order';
import type { SharedWeather } from './weather-context';

export interface TodayCopyPiece {
  name: string;
  category?: string | null;
  slot?: string | null;
  material?: string | null;
}

export interface TodayCopy {
  headline: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Small language helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[a-z0-9à-ÿ]/i.test(w)).length;
}

/** 14 → 'two', 18 → 'six' — the spoken hour for “Rain by six”. */
function hourWord(hour: number): string {
  const words = [
    'midnight', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  ];
  const h = ((Math.round(hour) % 24) + 24) % 24;
  if (h === 12) return 'noon';
  return words[h % 12];
}

/** The piece's plain display name for a sentence: lowercased, and when the
 * full name runs long, its last three words — “Navy Wool Overcoat” stays
 * whole, a long retailer title keeps its garment end. */
function plainName(name: string): string {
  const clean = (name || '').trim().replace(/[.…]+$/, '');
  if (!clean) return '';
  const words = clean.split(/\s+/);
  return (words.length > 3 ? words.slice(-3) : words).join(' ').toLowerCase();
}

function capFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** 3–8 words and no question mark — the headline gate. */
function headlineOk(text: string): boolean {
  const n = wordCount(text);
  return n >= 3 && n <= 8 && !text.includes('?');
}

/** The first candidate that passes the gate; the LAST entry must always
 * pass by construction. */
function firstHeadline(...candidates: Array<string | null>): string {
  for (const c of candidates) {
    if (c && headlineOk(c)) return c;
  }
  return 'Pulled from your rail.';
}

// ---------------------------------------------------------------------------
// The day's dominant driver — the largest delta decides the headline.
// ---------------------------------------------------------------------------

type Driver = 'rain' | 'swing-up' | 'swing-down' | 'cold' | 'wind' | 'hot' | 'grey' | 'mild' | 'none';

function driverFor(w: SharedWeather | null): Driver {
  if (!w) return 'none';
  const feels = w.feelsLike ?? w.tempC;
  const wet = w.precipProb >= 50 || /rain|shower|snow|thunder/i.test(w.label);
  if (wet) return 'rain';
  const swing = w.maxC - w.minC;
  if (swing >= 8) {
    const falling = w.morningC != null && w.eveningC != null && w.morningC > w.eveningC + 3;
    return falling ? 'swing-down' : 'swing-up';
  }
  if (feels <= 5) return 'cold';
  if (w.windKmh >= 29 && feels <= 20) return 'wind';
  if (feels >= 28) return 'hot';
  if (/cloud|fog|mixed/i.test(w.label) && w.windKmh < 14) return 'grey';
  if (swing <= 6 && feels >= 13 && feels <= 23) return 'mild';
  return 'none';
}

// ---------------------------------------------------------------------------
// The pieces, by role — body order keeps the naming natural (torso first).
// ---------------------------------------------------------------------------

interface Cast {
  /** Two names to lead the body with — torso piece then legs, by preference. */
  a: string;
  b: string;
  outer: string;
  knit: string;
  shoes: string;
  count: number;
}

function castFrom(pieces: TodayCopyPiece[]): Cast {
  const ranked = pieces
    .filter((p) => (p.name || '').trim())
    .map((p) => ({ name: plainName(p.name), rank: bodyOrderRank({ category: p.category, slot: p.slot, name: p.name }) }))
    .sort((x, y) => x.rank - y.rank);
  const byRank = (...ranks: number[]) => ranked.find((p) => ranks.includes(p.rank))?.name || '';
  const outer = byRank(1, 2);
  const knit = byRank(3);
  const top = byRank(4) || knit || outer;
  const bottom = byRank(5);
  const shoes = byRank(6);
  // The two lead names: the main torso piece and the trousers when both
  // exist; otherwise the first two distinct pieces in body order.
  let a = top;
  let b = bottom;
  if (!a || !b) {
    const names = ranked.map((p) => p.name).filter((n, i, all) => n && all.indexOf(n) === i);
    a = a || names[0] || '';
    b = b || names.find((n) => n !== a) || '';
  }
  return { a, b, outer, knit, shoes, count: ranked.length };
}

// ---------------------------------------------------------------------------
// Slot 1 — the headline
// ---------------------------------------------------------------------------

function headlineFor(w: SharedWeather | null, driver: Driver, cast: Cast): string {
  if (!w || driver === 'none') {
    return firstHeadline(cast.count >= 2 ? 'Nothing on the calendar. Keep it easy.' : null, 'Pulled from your rail.');
  }
  const snow = /snow/i.test(w.label);
  switch (driver) {
    case 'rain': {
      if (snow) return firstHeadline('Snow on the way — dress for it.');
      if (w.rainStartHour != null && w.rainStartHour >= 11) {
        const when = hourWord(w.rainStartHour);
        return firstHeadline(
          cast.outer ? `Rain by ${when} — take the ${cast.outer}.` : null,
          `Rain by ${when} — plan around it.`,
        );
      }
      return firstHeadline(
        cast.outer ? `Wet all day — the ${cast.outer} earns it.` : null,
        'Rain on and off all day.',
      );
    }
    case 'swing-up':
      return firstHeadline(`Cool morning, warm by ${hourWord(w.warmestHour ?? 14)}.`);
    case 'swing-down':
      return firstHeadline('Mild now, colder by evening.');
    case 'cold':
      return firstHeadline(
        cast.outer ? `Cold enough for the ${cast.outer}, finally.` : null,
        'Properly cold from the off.',
      );
    case 'wind':
      return firstHeadline('Wind, not cold. Something that holds its shape.');
    case 'hot':
      return firstHeadline('Hot from the start. Keep it light.');
    case 'grey':
      return firstHeadline(
        cast.knit ? `Grey and still. Bring the ${cast.knit}.` : null,
        'Grey and still. Keep it simple.',
      );
    case 'mild':
    default:
      return firstHeadline('Mild all day. No layers needed.');
  }
}

// ---------------------------------------------------------------------------
// Slot 2 — the body
// ---------------------------------------------------------------------------

function bodyFor(driver: Driver, cast: Cast): string {
  // No composed outfit on show yet (first compose still out, or a sparse
  // wardrobe): the naming rule has nothing to name, so one certain line
  // holds the slot — never mechanism copy, never a question.
  if (!cast.a || !cast.b) {
    return 'One easy look for the day ahead — comfortable this morning and still right this evening.';
  }
  const lead = `The ${cast.a} and the ${cast.b}`;
  let body: string;
  switch (driver) {
    case 'rain':
      body = `${lead} — both stand up to a wet day without fuss.`;
      break;
    case 'swing-up':
      body = `${lead} — nothing you’ll need to shed later.`;
      break;
    case 'swing-down':
      body = `${lead} — warm enough when the evening turns.`;
      break;
    case 'cold':
      body = cast.outer && cast.outer !== cast.a
        ? `The ${cast.outer} over the ${cast.a} — warm enough to see the whole day out.`
        : `${lead} — warm enough to see the whole day out.`;
      break;
    case 'wind':
      body = `${lead} — cut close enough to take the wind.`;
      break;
    case 'hot':
      body = `${lead} — light enough to stay right through the afternoon.`;
      break;
    case 'grey':
    case 'mild':
    case 'none':
    default:
      body = `${lead} — right at nine and still right at six.`;
      break;
  }
  // The finishing clause — the shoes, named the same plain way — lands only
  // while it keeps the whole body inside the 12–24-word budget.
  if (cast.shoes && cast.shoes !== cast.a && cast.shoes !== cast.b) {
    const close = ` ${capFirst(`the ${cast.shoes}`)} keep it easy.`;
    if (wordCount(body + close) <= 24) body += close;
  }
  if (wordCount(body) < 12) {
    const filler = ' Neither needs a second thought.';
    if (wordCount(body + filler) <= 24) body += filler;
  }
  return body;
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

export function composeTodayCopy({
  weather,
  pieces,
}: {
  weather: SharedWeather | null;
  pieces: TodayCopyPiece[];
}): TodayCopy {
  const cast = castFrom(pieces);
  const driver = driverFor(weather);
  return {
    headline: headlineFor(weather, driver, cast),
    body: bodyFor(driver, cast),
  };
}
