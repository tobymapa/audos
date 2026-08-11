/**
 * Style me today — the daily outfit surface.
 *
 * Weather-aware (device location → Open-Meteo, no key needed), occasion-aware
 * (preset chips + free text + voice), and strictly OWNED-WARDROBE-ONLY: every
 * outfit is composed from pieces the user has actually logged. Two looks per
 * run — one for the day, one for the evening — each rendered as clean,
 * equal side-by-side garment tiles, with a short
 * rationale. Refresh deals a different valid combination from the same
 * wardrobe. If the wardrobe is sparse, Beau says what's missing instead of
 * inventing clothes.
 *
 * WEATHER IS A HARD FILTER, NOT CONTEXT (Today weather-reasoning fix). The
 * wardrobe is cut down to the pieces rated for today's FEELS-LIKE temperature
 * (warmth-model.ts) BEFORE either look is composed, so a waxed jacket on a
 * 30°C day is never one of the options. When that cut cannot cover a core
 * slot, the closest piece owned is used and the gap is stated plainly.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CloudRain,
  CloudSun,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinOff,
  Moon,
  RefreshCw,
  Snowflake,
  Sparkles,
  Sun,
  Wind,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { VoiceButton } from '../../lib/voice';
import { callClaude, CLAUDE_SONNET } from './claude';
import {
  goToTab,
  homeCity,
  materialFor,
  outfitLayer,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { OutfitStack } from './store';
import { Skeleton } from './skeleton';
import { PieceEditSheet } from './piece-edit';
import { TryOnButton } from './tryon';
import { adoptSharedWeather } from './weather-context';
import { isHeavyCoat } from './body-order';
import { HOT_C, weatherExclusionReason, weatherHardRulesPrompt } from './weather-rules';
import {
  feelsLikeC,
  fetchPieceWarmth,
  filterForWeather,
  logExclusions,
  warmthFor,
  warmthPromptSuffix,
  type PieceWarmth,
} from './warmth-model';

// ---------------------------------------------------------------------------
// Weather — Open-Meteo free API, no key, CORS-friendly
// ---------------------------------------------------------------------------

interface Weather {
  tempC: number;
  eveningTempC: number | null;
  locationLabel: string;
  minC: number;
  maxC: number;
  precipProb: number;
  windKmh: number;
  /** Relative humidity %, when the API returns it. */
  humidity: number | null;
  /** The API's apparent temperature, when it returns one. */
  apparentC: number | null;
  /** THE gating temperature: apparent temp, else heat index / wind chill,
   * else the raw reading. 30°C at 80% humidity is not 30°C in dry air. */
  feelsLike: number | null;
  /** The same read for the evening estimate. */
  eveningFeelsLike: number | null;
  label: string;
  icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'wind';
}

function describeCode(code: number): { label: string; icon: Weather['icon'] } {
  if (code === 0) return { label: 'Clear', icon: 'sun' };
  if (code <= 3) return { label: 'Partly cloudy', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Foggy', icon: 'cloud' };
  if (code >= 51 && code <= 67) return { label: 'Rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain' };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'rain' };
  return { label: 'Mixed', icon: 'cloud' };
}

async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      // relative_humidity_2m + apparent_temperature are what let the gate
      // reason about how the day FEELS rather than the raw digit.
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '1',
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const code = Number(data?.current?.weather_code ?? 1);
    const { label, icon } = describeCode(code);
    // Evening estimate: the 20:00 hourly reading when present.
    let eveningTempC: number | null = null;
    let eveningApparentC: number | null = null;
    let eveningHumidity: number | null = null;
    const hours: string[] = data?.hourly?.time || [];
    const temps: number[] = data?.hourly?.temperature_2m || [];
    const apparents: number[] = data?.hourly?.apparent_temperature || [];
    const humidities: number[] = data?.hourly?.relative_humidity_2m || [];
    const eveningIdx = hours.findIndex((t) => typeof t === 'string' && t.endsWith('T20:00'));
    if (eveningIdx >= 0 && typeof temps[eveningIdx] === 'number') eveningTempC = temps[eveningIdx];
    if (eveningIdx >= 0 && typeof apparents[eveningIdx] === 'number') eveningApparentC = apparents[eveningIdx];
    if (eveningIdx >= 0 && typeof humidities[eveningIdx] === 'number') eveningHumidity = humidities[eveningIdx];
    const timezoneCity = typeof data?.timezone === 'string'
      ? data.timezone.split('/').pop()?.replace(/_/g, ' ')
      : null;
    const numberOrNull = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const tempC = Math.round(Number(data?.current?.temperature_2m ?? 0));
    const humidity = numberOrNull(data?.current?.relative_humidity_2m);
    const apparentC = numberOrNull(data?.current?.apparent_temperature);
    const windKmh = Math.round(Number(data?.current?.wind_speed_10m ?? 0));
    return {
      tempC,
      eveningTempC: eveningTempC != null ? Math.round(eveningTempC) : null,
      locationLabel: timezoneCity || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      minC: Math.round(Number(data?.daily?.temperature_2m_min?.[0] ?? 0)),
      maxC: Math.round(Number(data?.daily?.temperature_2m_max?.[0] ?? 0)),
      precipProb: Math.round(Number(data?.daily?.precipitation_probability_max?.[0] ?? 0)),
      windKmh,
      humidity,
      apparentC,
      feelsLike: feelsLikeC({ tempC, apparentC, humidity, windKmh }),
      eveningFeelsLike:
        eveningTempC != null
          ? feelsLikeC({ tempC: eveningTempC, apparentC: eveningApparentC, humidity: eveningHumidity, windKmh })
          : null,
      label,
      icon,
    };
  } catch {
    return null;
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 600000 });
  });
}

/** Free-text city → coordinates via Open-Meteo's geocoding API (no key). */
async function geocodeCity(city: string): Promise<{ lat: number; lon: number; label: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    if (!res.ok) return null;
    const hit = (await res.json())?.results?.[0];
    if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
    return {
      lat: hit.latitude,
      lon: hit.longitude,
      label: [hit.name, hit.country].filter(Boolean).join(', '),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Location (Pass Twenty-Eight) — GPS-detected city, editable, persisted
// ---------------------------------------------------------------------------

/** localStorage key for the last-used location — pre-fills the next visit
 * without asking for GPS permission again. */
const LAST_LOCATION_KEY = 'brummell_last_location';

function readStoredLocation(): string | null {
  try {
    const v = localStorage.getItem(LAST_LOCATION_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function storeLocation(label: string) {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, label);
  } catch { /* storage unavailable */ }
}

function clearStoredLocation() {
  try {
    localStorage.removeItem(LAST_LOCATION_KEY);
  } catch { /* storage unavailable */ }
}

/** Coordinates → city name via OpenStreetMap's Nominatim (free, no key). */
async function reverseGeocodeCity(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=en`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || null;
    return typeof city === 'string' && city.trim() ? city.trim() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outfit generation — owned pieces only, AI-picked with a local fallback
// ---------------------------------------------------------------------------

export interface OutfitPlan {
  day: { pieces: WardrobePiece[]; rationale: string };
  evening: { pieces: WardrobePiece[]; rationale: string };
  missing: string | null;
}

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
      } catch {
        return null;
      }
    }
    return null;
  }
}

const STYLE_SYSTEM = `You are Beau, Ethaion's menswear valet, dressing a man for TODAY from his real wardrobe. You are given his owned pieces (each with an id), today's weather, and the occasion. You may ONLY use the ids provided — never invent clothes he doesn't own.

Respond ONLY with strict JSON (no markdown):
{
  "day": { "pieceIds": number[], "rationale": string },     // daytime look — one bottoms, one pair of shoes, one shirt/top; add knitwear and/or outerwear as the weather demands; optional accessories
  "evening": { "pieceIds": number[], "rationale": string },  // evening look — usually a register up or warmer; vary at least one piece from the day look when the wardrobe allows
  "missing": string | null // if the wardrobe is too sparse to dress this brief properly, ONE short sentence naming the most useful gap to fill — else null
}

Rules: respect the weather (rain → weatherproof outer layer if he owns one; below 12°C → layer knitwear; above 20°C → keep it light); respect the occasion's formality; A SUIT IS ONE GARMENT — jacket and trousers together: if you pick a suit, do NOT add separate trousers, a blazer, or another jacket alongside it (a shirt, tie, knitwear and shoes are fine); each rationale is 1–2 short sentences in Beau's warm, direct voice that cite the day's actual conditions; never repeat a full outfit from the AVOID list; JSON only.

` + weatherHardRulesPrompt();

function pieceLine(p: WardrobePiece, material: string, warmth?: PieceWarmth): string {
  const bits = [
    `id ${p.id}: ${p.name}`,
    p.brand ? `by ${p.brand}` : null,
    `[${p.category}${p.slot ? `/${p.slot}` : ''}]`,
    material ? `material: ${material}` : null,
    // Each candidate carries the temperature band that got it onto the list.
    warmth ? warmthPromptSuffix(warmth) : null,
    (p.seasons || []).length > 0 ? `seasons: ${(p.seasons || []).join(',')}` : null,
    (p.occasions || []).length > 0 ? `occasions: ${(p.occasions || []).join(',')}` : null,
  ].filter(Boolean);
  return bits.join(' ');
}

/** Deterministic fallback: one piece per layer, weather- and occasion-aware. */
function composeLocally(
  pieces: WardrobePiece[],
  weather: Weather | null,
  occasion: string,
  seed: number,
): { pieces: WardrobePiece[]; rationale: string } {
  // Every gate below reads the FEELS-LIKE figure, not the raw digit — the
  // same temperature the candidate filter used.
  const tempC = weather?.feelsLike ?? weather?.tempC ?? null;
  const cold = (tempC ?? 14) < 12;
  const warm = (tempC ?? 14) > 20;
  // The hard temperature gates (weather-rules.ts): above the heavy-outerwear
  // ceiling no outer layer at all; below 5°C a heavy coat is required.
  const hot = tempC != null && tempC > HOT_C;
  const freezing = tempC != null && tempC < 5;
  const wet = (weather?.precipProb ?? 0) >= 50 || weather?.icon === 'rain';
  const formalish = /work|dinner|wedding|formal|date|smart/i.test(occasion);

  const seasonOk = (p: WardrobePiece) => {
    const s = p.seasons || [];
    if (s.length === 0 || s.includes('year-round')) return true;
    if (warm) return s.includes('ss');
    if (cold) return s.includes('aw');
    return true;
  };
  const occasionScore = (p: WardrobePiece) => {
    const o = p.occasions || [];
    if (formalish) return (o.includes('business') || o.includes('smart-casual') || o.includes('formal')) ? 1 : 0;
    return o.includes('casual') || o.includes('smart-casual') ? 1 : 0;
  };
  const pick = (filter: (p: WardrobePiece) => boolean, offset: number): WardrobePiece | null => {
    const pool = pieces.filter((p) => filter(p) && seasonOk(p)).sort((a, b) => occasionScore(b) - occasionScore(a));
    if (pool.length === 0) return null;
    const strong = pool.filter((p) => occasionScore(p) === occasionScore(pool[0]));
    return strong[(seed + offset) % strong.length];
  };

  const outfit: WardrobePiece[] = [];
  const top = pick((p) => p.category === 'tops', 0);
  // A suit is one garment: when it anchors a formal look it REPLACES separate
  // trousers and any jacket — never suit trousers or suit jacket on their own.
  const suit = formalish ? pick((p) => p.category === 'formalwear' && (p.slot === 'suit' || p.slot === 'dinner-suit'), 1) : null;
  const bottoms = suit ? null : pick((p) => p.category === 'bottoms', 1);
  const shoes = pick((p) => p.category === 'shoes', 2);
  const knit = cold && !suit ? pick((p) => p.category === 'knitwear', 3) : null;
  const outer = suit
    ? null
    : hot
      ? null // past the ceiling the look is composed WITHOUT an outer layer
      : freezing
        ? pick((p) => p.category === 'outerwear' && isHeavyCoat(p), 4) || pick((p) => p.category === 'outerwear', 5)
        : (cold || wet)
          ? pick((p) => p.category === 'outerwear' && (!wet || /rain|wax|ventile/i.test(p.name + (p.slot || ''))), 4) ||
            (cold ? pick((p) => p.category === 'outerwear', 5) : null)
          : null;
  for (const p of [top, knit, outer, suit, bottoms, shoes]) {
    // Belt and braces: nothing that violates the hard temperature gates
    // (a wool coat at 29°C, knitwear at 30°C) ever reaches the look.
    if (p && !weatherExclusionReason({ category: p.category, slot: p.slot, name: p.name }, tempC)) outfit.push(p);
  }

  const bits: string[] = [];
  if (weather) {
    const felt =
      weather.feelsLike != null && Math.abs(weather.feelsLike - weather.tempC) >= 2
        ? ` (feels like ${weather.feelsLike}°C)`
        : '';
    bits.push(
      `${weather.tempC}°C${felt}${weather.locationLabel ? ` in ${weather.locationLabel}` : ''} and ${weather.label.toLowerCase()}`,
    );
  }
  if (occasion) bits.push(occasion.toLowerCase());
  return {
    pieces: outfit,
    rationale: outfit.length > 0
      ? `Built for ${bits.join(', ') || 'today'} from what you own — ${outfit.map((p) => p.name).join(', ')}.`
      : 'Not enough logged pieces to build this yet.',
  };
}

async function generateOutfits(
  pieces: WardrobePiece[],
  materials: Record<number, string>,
  weather: Weather | null,
  occasion: string,
  avoidIds: number[][],
  profile: StyleProfile | null,
  locationLabel: string | null = null,
  warmth: Record<number, PieceWarmth> = {},
): Promise<OutfitPlan> {
  const byId = new Map(pieces.map((p) => [p.id, p]));

  // THE PRE-FILTER — the fix. Cut the wardrobe to what today's feels-like
  // temperature allows BEFORE either look is reasoned about. A waxed jacket
  // at 30°C is not an option that gets rejected; it is not an option.
  const gateTempC = weather?.feelsLike ?? weather?.tempC ?? null;
  const wet = (weather?.precipProb ?? 0) >= 50 || weather?.icon === 'rain';
  const filtered = filterForWeather({ pieces, materials, warmth, filterTempC: gateTempC, wet });
  logExclusions('style-today', filtered, gateTempC);
  // No "and if the cut left nothing, use the whole wardrobe" escape hatch:
  // filterForWeather already guarantees a non-empty set whenever anything is
  // logged, admitting the closest pieces owned as flagged compromises. Falling
  // back to `pieces` here would hand the waxed jacket straight back.
  const dayCandidates = filtered.candidates;

  // The EVENING is a different day: a 30°C afternoon that drops to 19°C wants
  // a knit after dark. It gets its own cut, and the block the model reasons
  // over is the UNION of the two — the output gate below then holds each look
  // to its own temperature, so a day piece cannot drift into the evening or
  // the other way round.
  const eveningTempC = weather?.eveningFeelsLike ?? weather?.eveningTempC ?? gateTempC;
  const eveningFiltered =
    eveningTempC === gateTempC
      ? filtered
      : filterForWeather({ pieces, materials, warmth, filterTempC: eveningTempC, wet });
  const eveningCandidates = eveningFiltered.candidates;
  const seenCandidate = new Set<number>();
  const candidates = [...dayCandidates, ...eveningCandidates].filter((p) => {
    if (seenCandidate.has(p.id)) return false;
    seenCandidate.add(p.id);
    return true;
  });
  const isSuit = (p: WardrobePiece) => p.slot === 'suit' || p.slot === 'dinner-suit';
  const sanitize = (ids: unknown): WardrobePiece[] => {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<number>();
    const seenCategories = new Set<string>();
    const out: WardrobePiece[] = [];
    for (const raw of ids) {
      const id = Number(raw);
      const piece = byId.get(id);
      // A look gets one piece per category. This prevents an AI response from
      // stacking two shirts or two jackets instead of swapping the choice.
      if (piece && !seen.has(id) && !seenCategories.has(piece.category)) {
        seen.add(id);
        seenCategories.add(piece.category);
        out.push(piece);
      }
    }
    // A suit is ONE garment (jacket + trousers). If a look contains one,
    // separate bottoms and outerwear are dropped — never suit + chinos or
    // suit + second jacket.
    if (out.some(isSuit)) {
      return out.filter((p) => isSuit(p) || (p.category !== 'bottoms' && p.category !== 'outerwear'));
    }
    return out;
  };

  const feelsBit =
    weather && weather.feelsLike != null && Math.abs(weather.feelsLike - weather.tempC) >= 2
      ? ` — FEELS LIKE ${weather.feelsLike}°C${weather.humidity != null ? ` at ${weather.humidity}% humidity` : ''}`
      : weather && weather.humidity != null
        ? `, ${weather.humidity}% humidity`
        : '';
  const weatherLine = weather
    ? `WEATHER TODAY: ${weather.tempC}°C now (${weather.minC}–${weather.maxC}°C)${feelsBit}, ${weather.label}, ${weather.precipProb}% chance of rain, wind ${weather.windKmh} km/h.${weather.eveningTempC != null ? ` Evening around ${weather.eveningTempC}°C.` : ''}`
    : 'WEATHER TODAY: unknown — assume mild and changeable.';

  // Stable context (direction + wardrobe) travels as a cached system block
  // (prompt caching, Part 3.3); the volatile bits (weather, occasion, the
  // shuffle history) stay in the user message.
  const wardrobeBlock = [
    // AI AUDIT (profile fields read): today's look is steered by the user's
    // own profile.archetypes (his chosen directions) alongside the live
    // weather and the wardrobe itself — never a fixed house style.
    profile && Array.isArray(profile.archetypes) && profile.archetypes.length > 0
      ? `HIS DIRECTION: ${profile.archetypes.join(', ')}`
      : null,
    `HIS WARDROBE, ALREADY FILTERED TO WHAT TODAY ALLOWS (only these ids):\n${candidates
      .map((p) => pieceLine(p, materialFor(p, materials), warmthFor(p, materials, warmth)))
      .join('\n')}`,
  ].filter(Boolean).join('\n\n');
  const userMessage = [
    weatherLine,
    filtered.gapNote
      ? `WARDROBE GAP FOR TODAY: ${filtered.gapNote} Say this plainly in the rationale \u2014 never pretend the piece is right for the conditions.`
      : null,
    locationLabel
      ? `LOCATION: The user is currently in ${locationLabel}. Factor in the typical climate and weather for this location when suggesting the outfit.`
      : null,
    `OCCASION: ${occasion || 'an ordinary day'}`,
    avoidIds.length > 0
      ? `AVOID repeating these exact outfits: ${avoidIds.map((ids) => `[${ids.join(',')}]`).join(' ')}`
      : null,
  ].filter(Boolean).join('\n\n');

  try {
    // Full outfit generation — Claude Sonnet (model tiering, Part 3.4),
    // with the OpenAI proxy as the never-dead-end fallback transport.
    let text = await callClaude({
      model: CLAUDE_SONNET,
      system: [
        { text: STYLE_SYSTEM, cache: true },
        { text: wardrobeBlock, cache: true },
      ],
      user: userMessage,
      maxTokens: 700,
      temperature: 0.8,
    });
    if (!text) {
      const res = await fetch('/proxy/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: STYLE_SYSTEM },
            { role: 'user', content: `${wardrobeBlock}\n\n${userMessage}` },
          ],
          max_tokens: 700,
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error('style call failed');
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      text = typeof content === 'string' ? content : null;
    }
    if (!text) throw new Error('style call failed');
    const parsed = extractJson(text);
    // OUTPUT ENFORCEMENT (AI Weather Intelligence fix): even if the model
    // ignores the hard rules, a violating layer never reaches the screen —
    // the day look is gated on the current temperature, the evening look on
    // the evening estimate when there is one.
    const weatherGate = (list: WardrobePiece[], tempC: number | null): WardrobePiece[] =>
      list.filter((p) => {
        const reason = weatherExclusionReason(
          { category: p.category, slot: p.slot, name: p.name, material: materialFor(p, materials) },
          tempC,
        );
        if (reason) console.warn(`[Ethaion] style-today dropped "${p.name}" — ${reason}.`);
        return !reason;
      });
    const day = weatherGate(sanitize(parsed?.day?.pieceIds), gateTempC);
    const evening = weatherGate(sanitize(parsed?.evening?.pieceIds), eveningTempC);
    if (day.length === 0 && evening.length === 0) throw new Error('no outfit returned');
    const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
    return {
      day: { pieces: day, rationale: str(parsed?.day?.rationale, 'A clean, weather-right daytime look from what you own.') },
      evening: { pieces: evening, rationale: str(parsed?.evening?.rationale, 'A register up for the evening.') },
      // A weather gap is the more urgent truth than a general wardrobe gap:
      // it names a hole today's conditions have just exposed.
      missing:
        filtered.gapNote ||
        (typeof parsed?.missing === 'string' && parsed.missing.trim() ? parsed.missing.trim() : null),
    };
  } catch (e) {
    console.warn('[Ethaion] style-today AI failed, composing locally:', e);
    const seed = avoidIds.length + Math.floor(Math.random() * 7);
    // The local fallback composes from the FILTERED set too — a dead model
    // call must never be the route by which a wax jacket reaches a 30°C look.
    const day = composeLocally(dayCandidates, weather, occasion || 'casual', seed);
    const evening = composeLocally(eveningCandidates, weather, occasion ? `${occasion} evening` : 'dinner', seed + 3);
    return {
      day,
      evening,
      missing:
        filtered.gapNote ||
        (pieces.length < 6
          ? 'A fuller wardrobe log gives Beau more to work with — a proper shirt, trousers and shoes are the fastest wins.'
          : null),
    };
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

// One-tap occasion selector (Pass Fifteen, Track I).
const OCCASIONS = ['Casual', 'Smart Casual', 'Business', 'Formal', 'Active'];

const WEATHER_ICONS: Record<Weather['icon'], React.ComponentType<{ className?: string }>> = {
  sun: Sun,
  cloud: CloudSun,
  rain: CloudRain,
  snow: Snowflake,
  wind: Wind,
};

function OutfitPanel({
  title,
  Icon,
  look,
  refreshing,
  onRefresh,
  onSelectPiece,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  look: { pieces: WardrobePiece[]; rationale: string };
  refreshing: boolean;
  onRefresh: () => void;
  onSelectPiece?: (piece: WardrobePiece) => void;
}) {
  const ordered = useMemo(() => [...look.pieces].sort((a, b) => outfitLayer(a) - outfitLayer(b)), [look.pieces]);
  return (
    <div className={`${tw.card.default} rounded-2xl p-4`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-1.5`}>
          <Icon className="w-4 h-4 text-[var(--space-text-brand)]" />
          {title}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.secondary} disabled:opacity-50`}
          title={`Generate a different ${title.toLowerCase()} combination from the same wardrobe`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Different look
        </button>
      </div>
      {ordered.length > 0 ? (
        <>
          <div className="mt-3 flex justify-center">
            {/* DRAGGABLE PIECES on the Beau Today canvas — keyed to this
                exact look (title + piece ids), so "Different look" starts
                from the default layout while a remembered look keeps the
                user's arrangement across sessions. */}
            <OutfitStack
              pieces={ordered}
              onSelect={onSelectPiece}
              dragKey={`today-look-${title.toLowerCase().replace(/\s+/g, '-')}-${ordered.map((p) => p.id).join('-')}`}
            />
          </div>
          <p className={`${typography.size.xs} ${typography.color.secondary} mt-3 leading-relaxed`}>
            <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
            {look.rationale}
          </p>
          {/* Try any suggested piece on YOU — opens the Fitting Room with the
              render already started. Secondary action, never the dominant one. */}
          <div className="mt-3 divide-y divide-[var(--space-border-default)] border-t border-[var(--space-border-default)]">
            {ordered.filter((piece) => (piece.photo_url || '').trim()).map((piece) => (
              <div key={piece.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className={`${typography.size.xs} ${typography.color.secondary} truncate min-w-0`}>{piece.name}</span>
                <TryOnButton
                  piece={{
                    name: piece.name,
                    brand: piece.brand,
                    category: piece.category,
                    garmentImageUrl: piece.photo_url,
                  }}
                  plain
                  className="flex-shrink-0"
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-2`}>
          Not enough logged pieces for this look yet.
        </p>
      )}
    </div>
  );
}

export function StyleMeToday({
  pieces,
  materials = {},
  profile,
  onBack,
  onChanged,
}: {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
  profile: StyleProfile | null;
  onBack: () => void;
  /** Called after a piece is edited from a look's detail sheet. */
  onChanged?: () => void;
}) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherState, setWeatherState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  // Stored warmth/weather-suitability rows (warmth-model.ts). The candidate
  // filter infers a band for anything without a row, so this only sharpens
  // the read — it is never what makes the filter work.
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  const [occasion, setOccasion] = useState<string>('');
  const [freeText, setFreeText] = useState('');
  const [busy, setBusy] = useState<'all' | 'day' | 'evening' | null>(null);
  const [plan, setPlan] = useState<OutfitPlan | null>(null);
  // Tapping a suggested piece opens its detail view (Pass Twenty-Seven) —
  // the ONE shared editor with price paid, wear count and cost per wear.
  const [detailPieceId, setDetailPieceId] = useState<number | null>(null);
  const detailPiece = detailPieceId != null ? pieces.find((p) => p.id === detailPieceId) || null : null;
  const [history, setHistory] = useState<number[][]>([]);
  // "Your location" (Pass Twenty-Eight) — detected from the device GPS on
  // first use (browser permission prompt), reverse-geocoded to a city name,
  // shown as "Your location: [city] · change", freely editable, and
  // persisted in localStorage so the next visit pre-fills without asking
  // for GPS permission again.
  const [cityDraft, setCityDraft] = useState<string>(() => readStoredLocation() || homeCity(profile) || '');
  const [locationLabel, setLocationLabel] = useState<string>(() => readStoredLocation() || '');
  const [editingLocation, setEditingLocation] = useState(false);
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  // A resolved location collapses the field back to the one-line display
  // and is remembered for next time.
  const rememberLocation = (label: string) => {
    setLocationLabel(label);
    setCityDraft(label);
    setEditingLocation(false);
    storeLocation(label);
  };

  const loadWeatherFromDevice = async (): Promise<boolean> => {
    try {
      const pos = await getPosition();
      // Weather (Open-Meteo) and city name (Nominatim reverse geocode) from
      // the same coordinates, in parallel.
      const [w, city] = await Promise.all([
        fetchWeather(pos.coords.latitude, pos.coords.longitude),
        reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude),
      ]);
      if (w) {
        const label = city || w.locationLabel;
        setWeather({ ...w, locationLabel: label });
        setWeatherState('ready');
        rememberLocation(label);
        // Keep the shared What-to-Wear / Fitting weather state in step.
        adoptSharedWeather({
          city: label,
          tempC: w.tempC,
          minC: w.minC,
          maxC: w.maxC,
          precipProb: w.precipProb,
          windKmh: w.windKmh,
          humidity: w.humidity,
          apparentC: w.apparentC,
          feelsLike: w.feelsLike,
          label: w.label,
        });
        return true;
      }
      if (city) rememberLocation(city);
    } catch { /* permission denied or unavailable — fall through */ }
    setWeatherState('unavailable');
    return false;
  };

  const loadWeatherForCity = async (city: string): Promise<boolean> => {
    const geo = await geocodeCity(city);
    if (!geo) return false;
    const w = await fetchWeather(geo.lat, geo.lon);
    if (!w) return false;
    setWeather({ ...w, locationLabel: geo.label });
    setWeatherState('ready');
    const shortLabel = geo.label.split(',')[0].trim() || city.trim();
    rememberLocation(shortLabel);
    // Keep the shared What-to-Wear / Fitting weather state in step.
    adoptSharedWeather({
      city: shortLabel,
      tempC: w.tempC,
      minC: w.minC,
      maxC: w.maxC,
      precipProb: w.precipProb,
      windKmh: w.windKmh,
      humidity: w.humidity,
      apparentC: w.apparentC,
      feelsLike: w.feelsLike,
      label: w.label,
    });
    return true;
  };

  // The stored warmth rows, loaded once — inference covers anything missing.
  useEffect(() => {
    let cancelled = false;
    void fetchPieceWarmth()
      .then((rows) => {
        if (!cancelled) setWarmth(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pieces.length]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 1. Last-used location (persisted) — no GPS permission prompt needed.
      const stored = readStoredLocation();
      if (stored) {
        const ok = await loadWeatherForCity(stored);
        if (cancelled || ok) return;
      }
      // 2. Device GPS — the first use triggers the browser's permission
      //    request; granted → the reverse-geocoded city pre-fills the line.
      const deviceOk = await loadWeatherFromDevice();
      if (cancelled || deviceOk) return;
      // 3. Home city from the style profile, when set.
      const home = homeCity(profile);
      if (home) {
        setWeatherState('loading');
        const ok = await loadWeatherForCity(home);
        if (cancelled || ok) return;
      }
      // Denied / nothing resolvable: the location field stays an empty
      // optional input and Beau dresses for the occasion only.
      if (!cancelled) setWeatherState('unavailable');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCity = async (useDevice = false) => {
    if (cityBusy) return;
    setCityBusy(true);
    setCityError(null);
    try {
      let ok: boolean;
      if (useDevice) {
        setWeatherState('loading');
        ok = await loadWeatherFromDevice();
        if (!ok) setCityError('Couldn\u2019t read your device location — type a city instead.');
      } else {
        const q = cityDraft.trim();
        if (!q) {
          // Blank = no location context: Beau uses the occasion only.
          setLocationLabel('');
          setEditingLocation(false);
          clearStoredLocation();
          return;
        }
        ok = await loadWeatherForCity(q);
        if (!ok) setCityError(`Couldn\u2019t find \u201c${q}\u201d — check the spelling and try again.`);
      }
      // New place → the looks should reflect its weather.
      if (ok && plan && pieces.length > 0) void generate(true);
    } finally {
      setCityBusy(false);
    }
  };

  const generate = async (
    refresh = false,
    occasionOverride?: string,
    target?: 'day' | 'evening',
  ) => {
    if (busy || pieces.length === 0) return;
    setBusy(target || 'all');
    try {
      const avoid = refresh && plan
        ? [...history, plan.day.pieces.map((p) => p.id), plan.evening.pieces.map((p) => p.id)].slice(-6)
        : [];
      const requestedOccasion = [occasionOverride ?? occasion, freeText.trim()].filter(Boolean).join(' — ');
      let next = await generateOutfits(
        pieces,
        materials,
        weather,
        requestedOccasion,
        avoid,
        profile,
        locationLabel.trim() || null,
        warmth,
      );
      // If the model ignores AVOID, deal locally until a genuinely different
      // combination is found (when the wardrobe contains one).
      if (target && plan) {
        const previousIds = plan[target].pieces.map((piece) => piece.id).sort((a, b) => a - b).join(',');
        let candidate = next[target];
        // Re-deals come from the weather-filtered set as well: "a different
        // look" must never mean "a wrong-season look" — and the evening card
        // deals against the evening's own temperature.
        const dayTempC = weather?.feelsLike ?? weather?.tempC ?? null;
        const gateTempC =
          target === 'evening' ? weather?.eveningFeelsLike ?? weather?.eveningTempC ?? dayTempC : dayTempC;
        const dealable = filterForWeather({
          pieces,
          materials,
          warmth,
          filterTempC: gateTempC,
          wet: (weather?.precipProb ?? 0) >= 50 || weather?.icon === 'rain',
        }).candidates;
        for (let attempt = 1; attempt <= 12; attempt += 1) {
          const candidateIds = candidate.pieces.map((piece) => piece.id).sort((a, b) => a - b).join(',');
          if (candidateIds !== previousIds) break;
          candidate = composeLocally(
            dealable,
            weather,
            target === 'evening' ? `${requestedOccasion || 'dinner'} evening` : requestedOccasion || 'daytime',
            history.length + attempt,
          );
        }
        next = { ...next, [target]: candidate };
      }
      if (plan) {
        setHistory((h) => [...h, plan.day.pieces.map((p) => p.id), plan.evening.pieces.map((p) => p.id)].slice(-6));
      }
      // Each card refreshes independently: keep the other look untouched.
      setPlan((current) => {
        if (!current || !target) return next;
        return target === 'day'
          ? { ...current, day: next.day, missing: next.missing }
          : { ...current, evening: next.evening, missing: next.missing };
      });
    } finally {
      setBusy(null);
    }
  };

  // Once weather resolves (or location is unavailable), put two complete
  // suggestions on screen without making the user press a second button.
  useEffect(() => {
    if (weatherState !== 'loading' && pieces.length > 0 && !plan && !busy) {
      void generate(false);
    }
  }, [weatherState, pieces.length]);

  const WeatherIcon = weather ? WEATHER_ICONS[weather.icon] : CloudSun;

  return (
    <div className="px-6 py-8 space-y-6 max-w-4xl mx-auto w-full pb-28">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Wardrobe
        </button>
        <h3 className={`hab-section-head ${typography.color.primary} mt-2`}>
          What do I wear today?
        </h3>
        <p className={`${typography.size.sm} ${typography.color.secondary} mt-1.5 max-w-lg`}>
          Today’s weather, your occasion, and ONLY the pieces you actually own — a day look and an evening look, shown piece by piece.
        </p>
      </div>

      {/* Your location — GPS-detected city (Nominatim reverse geocode),
          shown as "Your location: [city] · change", editable, persisted. */}
      <div className={`${tw.card.default} rounded-2xl p-4`}>
        {locationLabel && !editingLocation ? (
          <p className={`${typography.size.sm} ${typography.color.primary} flex items-center gap-1.5 flex-wrap`}>
            <MapPin className="w-3.5 h-3.5 text-[var(--space-text-brand)] flex-shrink-0" />
            <span className={typography.color.secondary}>Your location:</span>
            <span className={typography.weight.semibold}>{locationLabel}</span>
            <button
              type="button"
              onClick={() => {
                setEditingLocation(true);
                setCityError(null);
              }}
              className={`${typography.color.brand} hover:underline`}
              aria-label="Change your location"
            >
              · change
            </button>
          </p>
        ) : (
          <>
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2 flex items-center gap-1.5`}>
              <MapPin className="w-3.5 h-3.5 text-[var(--space-text-brand)]" />
              Your location (optional)
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={cityDraft}
                onChange={(e) => setCityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void applyCity(false);
                }}
                placeholder="e.g. Barcelona"
                className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 min-w-[10rem]`}
                aria-label="Your location"
              />
              <button
                type="button"
                onClick={() => void applyCity(false)}
                disabled={cityBusy}
                className={`px-3.5 py-2 rounded-lg ${typography.size.xs} ${tw.button.secondary} disabled:opacity-50 inline-flex items-center gap-1.5`}
              >
                {cityBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                Use this city
              </button>
              <button
                type="button"
                onClick={() => void applyCity(true)}
                disabled={cityBusy}
                className={`px-3.5 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] disabled:opacity-50 inline-flex items-center gap-1.5`}
                title="Detect my location"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                Detect
              </button>
            </div>
            {cityError && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-1.5`}>{cityError}</p>}
            <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5 italic`}>
              Beau factors your city's typical climate and weather into the looks — leave it blank and he dresses for the occasion only.
            </p>
          </>
        )}
      </div>

      {/* Weather strip */}
      <div className={`${tw.card.default} rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap`}>
        {weatherState === 'loading' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-muted)]" />
            <span className={`${typography.size.xs} ${typography.color.muted}`}>Reading today’s weather for your location…</span>
          </>
        )}
        {weatherState === 'ready' && weather && (
          <>
            <span className="w-9 h-9 rounded-xl bg-[var(--space-surface-accent-soft)] flex items-center justify-center">
              <WeatherIcon className="w-5 h-5 text-[var(--space-text-brand)]" />
            </span>
            <span className="min-w-0">
              <span className={`block ${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>
                {weather.tempC}°C · {weather.label} · {weather.locationLabel}
                {weather.feelsLike != null && Math.abs(weather.feelsLike - weather.tempC) >= 2
                  ? ` · feels like ${weather.feelsLike}°C`
                  : ''}
              </span>
              <span className={`block ${typography.size.xs} ${typography.color.muted}`}>
                {weather.minC}–{weather.maxC}°C today · {weather.precipProb}% rain · wind {weather.windKmh} km/h
                {weather.humidity != null ? ` · ${weather.humidity}% humidity` : ''}
                {weather.eveningTempC != null ? ` · ~${weather.eveningTempC}°C this evening` : ''}
              </span>
            </span>
          </>
        )}
        {weatherState === 'unavailable' && (
          <>
            <MapPinOff className="w-4 h-4 text-[var(--space-text-muted)]" />
            <span className={`${typography.size.xs} ${typography.color.muted}`}>
              No location — Beau will assume mild and changeable. Allow location access for weather-tuned looks.
            </span>
          </>
        )}
      </div>

      {/* Occasion — chips, free text, and voice */}
      <div className={`${tw.card.default} rounded-2xl p-4`}>
        <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
          What’s the day for?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {OCCASIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                const nextOccasion = occasion === o ? '' : o;
                setOccasion(nextOccasion);
                if (pieces.length > 0) void generate(true, nextOccasion);
              }}
              aria-pressed={occasion === o}
              disabled={busy !== null}
              className={`px-3 py-1.5 rounded-full border ${typography.size.xs} transition-colors disabled:opacity-50 ${
                occasion === o
                  ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                  : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Any context for Beau?"
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1`}
            aria-label="Occasion details"
          />
          <VoiceButton
            onTranscript={(text) => setFreeText((cur) => (cur ? `${cur} ${text}` : text))}
            title="Hold to describe the occasion by voice"
          />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            type="button"
            onClick={() => void generate(false)}
            disabled={busy !== null || pieces.length === 0}
            className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
          >
            {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {plan ? 'Style me again' : 'Style me today'}
          </button>
          {plan && (
            <button
              type="button"
              onClick={() => void generate(true)}
              disabled={busy !== null}
              className={`px-3.5 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-50`}
              title="Same weather, same occasion — a different valid combination"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh the combo
            </button>
          )}
        </div>
      </div>

      {/* Sparse wardrobe — be honest instead of inventing clothes */}
      {pieces.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--space-border-strong)] p-4 text-center">
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>Nothing logged yet</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-sm mx-auto`}>
            Style me today dresses you from YOUR wardrobe only — log a few pieces first and come back.
          </p>
          <button
            type="button"
            onClick={onBack}
            className={`mt-2.5 px-3.5 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.primary}`}
          >
            Log what you own
          </button>
        </div>
      )}
      {pieces.length > 0 && pieces.length < 5 && (
        <div className="rounded-2xl border border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)] p-4">
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>
            Your wardrobe is still building — add a few more pieces and I’ll start putting together outfits for you.
          </p>
          <p className={`${typography.size.xs} ${typography.color.secondary} mt-1 leading-relaxed`}>
            Only {pieces.length} piece{pieces.length === 1 ? ' is' : 's are'} logged so far — a full look needs at least a shirt or top,
            trousers, and shoes. Beau will do what he can with what's here, and name the most useful gap to fill.
          </p>
          <button
            type="button"
            onClick={() => goToTab('curated')}
            className={`mt-2 ${typography.size.xs} ${typography.color.brand} hover:underline`}
          >
            See The Rail — Beau's picks for exactly these gaps →
          </button>
        </div>
      )}

      {/* Skeletons while the first pair of looks composes (Track J): ghost
          outlines of the outfit cards that are coming, not a spinner. */}
      {!plan && busy === 'all' && pieces.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3 items-start">
          {[0, 1].map((i) => (
            <div key={i} className={`${tw.card.default} rounded-2xl p-4`}>
              <Skeleton className="h-3.5 w-24 rounded" />
              <div className="mt-4 flex justify-center gap-3">
                <Skeleton className="w-24 h-32 rounded-2xl" />
                <Skeleton className="w-24 h-32 rounded-2xl" />
                <Skeleton className="w-24 h-32 rounded-2xl hidden sm:block" />
              </div>
              <Skeleton className="h-2.5 w-3/4 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* The two looks */}
      {plan && (
        <div className="grid md:grid-cols-2 gap-3 items-start">
          <OutfitPanel
            title="Day"
            Icon={Sun}
            look={plan.day}
            refreshing={busy !== null}
            onRefresh={() => void generate(true, undefined, 'day')}
            onSelectPiece={(piece) => setDetailPieceId(piece.id)}
          />
          <OutfitPanel
            title="Evening"
            Icon={Moon}
            look={plan.evening}
            refreshing={busy !== null}
            onRefresh={() => void generate(true, undefined, 'evening')}
            onSelectPiece={(piece) => setDetailPieceId(piece.id)}
          />
        </div>
      )}
      {/* Tapped piece — the shared detail/edit sheet (name, photo, price
          paid, wear count, cost per wear). */}
      {detailPiece && (
        <PieceEditSheet
          piece={detailPiece}
          material={materialFor(detailPiece, materials)}
          onClose={() => setDetailPieceId(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      {plan?.missing && (
        <div className="rounded-2xl border border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)] p-3.5">
          <p className={`${typography.size.xs} ${typography.color.secondary}`}>
            <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
            {plan.missing}
          </p>
          <button
            type="button"
            onClick={() => goToTab('curated')}
            className={`mt-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
          >
            See The Rail’s picks for this gap →
          </button>
        </div>
      )}
    </div>
  );
}
